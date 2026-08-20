import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { documents, suppliers, transactions } from '@/db/schema';
import { getOcr } from '@/adapters/ocr';
import { getStorage, LocalStorageAdapter } from '@/adapters/storage';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { formatDate, type IsoDate } from '@/lib/dates';
import { recordAudit, type DecisionSource } from './audit';
import { closeExceptionsFor, raiseException } from './exceptions';
import { describeReasons, findTransactionMatchesForReceipt } from './matching';
import { namesMatch } from './normalise';

export type DocumentRow = typeof documents.$inferSelect;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

/** Magic-byte signatures, so a renamed executable cannot pose as a receipt. */
const SIGNATURES: { type: string; test: (b: Buffer) => boolean }[] = [
  { type: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  { type: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    type: 'image/webp',
    test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    type: 'image/heic',
    test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /hei[cx]|mif1/.test(b.subarray(8, 12).toString('latin1')),
  },
];

export function detectContentType(buffer: Buffer, declared: string): string {
  for (const signature of SIGNATURES) {
    if (buffer.length >= 12 && signature.test(buffer)) return signature.type;
  }
  if (declared === 'text/plain' || declared === 'text/csv') {
    // Accept text only if it really is text.
    const sample = buffer.subarray(0, 512);
    const printable = sample.filter((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127));
    if (printable.length / Math.max(1, sample.length) > 0.9) return declared;
  }
  return 'application/octet-stream';
}

export function validateUpload(buffer: Buffer, declaredType: string, filename: string): string {
  if (buffer.byteLength === 0) throw new ValidationError('That file is empty.');
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`Files must be under ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
  }
  const detected = detectContentType(buffer, declaredType);
  if (!ALLOWED_CONTENT_TYPES.has(detected)) {
    throw new ValidationError(
      `TradeBooks accepts photos, PDFs and text receipts. "${filename}" is not one of those.`,
    );
  }
  return detected;
}

export type UploadReceiptInput = {
  companyId: string;
  userId: string;
  filename: string;
  contentType: string;
  buffer: Buffer;
  kind?: DocumentRow['kind'];
  jobId?: string | null;
  notes?: string | null;
};

export type UploadReceiptResult = {
  documentId: string;
  duplicate: boolean;
  extractionConfidence: number;
  autoMatchedTransactionId: string | null;
  exceptionId: string | null;
  message: string;
};

/**
 * The receipt pipeline from ARCHITECTURE §8:
 *   upload -> validate -> preserve original -> extract -> identify supplier
 *   -> find candidate transactions -> auto-match if safe, otherwise Ask Me.
 *
 * The uploaded bytes are written once and never modified.
 */
export async function uploadReceipt(
  db: Database,
  input: UploadReceiptInput,
): Promise<UploadReceiptResult> {
  const contentType = validateUpload(input.buffer, input.contentType, input.filename);
  const checksum = createHash('sha256').update(input.buffer).digest('hex');

  const existing = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.companyId, input.companyId), eq(documents.checksumSha256, checksum)))
    .limit(1);

  if (existing[0]) {
    return {
      documentId: existing[0].id,
      duplicate: true,
      extractionConfidence: 0,
      autoMatchedTransactionId: null,
      exceptionId: null,
      message: 'You have already uploaded this receipt.',
    };
  }

  const storage = getStorage();
  const key = LocalStorageAdapter.keyFor(input.companyId, checksum, input.filename);
  const stored = await storage.put(key, input.buffer, contentType);

  const [row] = await db
    .insert(documents)
    .values({
      companyId: input.companyId,
      kind: input.kind ?? 'receipt',
      status: 'processing',
      storageKey: stored.key,
      originalFilename: input.filename.slice(0, 240),
      contentType,
      byteSize: stored.byteSize,
      checksumSha256: checksum,
      jobId: input.jobId ?? null,
      notes: input.notes ?? null,
      uploadedByUserId: input.userId,
    })
    .returning();

  if (!row) throw new AppError('Could not save that receipt.');

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'document.uploaded',
    entityType: 'document',
    entityId: row.id,
    summary: `Receipt "${input.filename}" uploaded.`,
    actorUserId: input.userId,
  });

  const processed = await processDocument(db, input.companyId, row.id, { userId: input.userId });
  return { documentId: row.id, duplicate: false, ...processed };
}

/** Runs extraction and matching. Safe to re-run: it never overwrites confirmed values. */
export async function processDocument(
  db: Database,
  companyId: string,
  documentId: string,
  options: { userId?: string | null } = {},
): Promise<{
  extractionConfidence: number;
  autoMatchedTransactionId: string | null;
  exceptionId: string | null;
  message: string;
}> {
  const document = await getDocument(db, companyId, documentId);
  const storage = getStorage();
  const ocr = getOcr();

  let extractionConfidence = 0;
  let supplierId = document.supplierId;
  let supplierNameText = document.supplierNameText;
  let documentDate = document.documentDate;
  let netPence = document.netPence;
  let vatPence = document.vatPence;
  let grossPence = document.grossPence;

  try {
    const buffer = await storage.get(document.storageKey);
    const extraction = await ocr.extract({
      buffer,
      contentType: document.contentType,
      filename: document.originalFilename,
    });
    extractionConfidence = extraction.confidence;

    // Extraction fills gaps only; anything a person entered stays untouched.
    if (!supplierNameText && extraction.supplierName) supplierNameText = extraction.supplierName.value;
    if (!documentDate && extraction.documentDate) documentDate = extraction.documentDate.value;
    if (netPence === null && extraction.netPence) netPence = extraction.netPence.value;
    if (vatPence === null && extraction.vatPence) vatPence = extraction.vatPence.value;
    if (grossPence === null && extraction.grossPence) grossPence = extraction.grossPence.value;

    if (!supplierId && supplierNameText) {
      supplierId = await findSupplierByName(db, companyId, supplierNameText);
    }

    await db
      .update(documents)
      .set({
        supplierId,
        supplierNameText,
        documentDate,
        netPence,
        vatPence,
        grossPence,
        extractionProvider: extraction.provider,
        extractionConfidence: extraction.confidence,
        extractionRaw: extraction.raw,
        extractedAt: new Date(),
        extractionError: extraction.message ?? null,
        status: 'extracted',
        updatedAt: new Date(),
      })
      .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)));
  } catch (error) {
    await db
      .update(documents)
      .set({
        status: 'failed',
        extractionError: error instanceof Error ? error.message : 'Could not read that file.',
        updatedAt: new Date(),
      })
      .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)));
    return {
      extractionConfidence: 0,
      autoMatchedTransactionId: null,
      exceptionId: null,
      message: 'Receipt saved, but it could not be read automatically.',
    };
  }

  // Without an amount there is nothing to match on; ask for the few details.
  if (grossPence === null) {
    const exceptionId = await raiseException(db, {
      companyId,
      type: 'unmatched_receipt',
      subjectType: 'document',
      subjectId: documentId,
      question: 'What is on this receipt?',
      detail: `We saved "${document.originalFilename}" but could not read the total. Add the supplier and amount and we will find the payment.`,
      candidates: [],
    });
    await db
      .update(documents)
      .set({ status: 'needs_answer', updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    return {
      extractionConfidence,
      autoMatchedTransactionId: null,
      exceptionId,
      message: 'Receipt saved. Add the supplier and amount so we can match it.',
    };
  }

  const decision = await findTransactionMatchesForReceipt(db, {
    companyId,
    grossPence,
    documentDate,
    supplierId,
    supplierNameText,
    excludeDocumentId: documentId,
  });

  if (decision.outcome === 'auto' && decision.best) {
    await matchDocumentToTransaction(db, companyId, documentId, decision.best.record.id, {
      source: 'heuristic',
      confidence: Math.min(99, decision.best.score),
      reason: describeReasons(decision.best.reasons),
      userId: options.userId ?? null,
    });
    return {
      extractionConfidence,
      autoMatchedTransactionId: decision.best.record.id,
      exceptionId: null,
      message: `Matched to a ${formatMoney(decision.best.record.amountPence)} payment on ${formatDate(decision.best.record.transactionDate)}.`,
    };
  }

  if (decision.outcome === 'ask' && decision.candidates.length > 0) {
    const exceptionId = await raiseException(db, {
      companyId,
      type: 'ambiguous_receipt_match',
      subjectType: 'document',
      subjectId: documentId,
      question: `Which payment does this ${formatMoney(grossPence)} receipt${supplierNameText ? ` from ${supplierNameText}` : ''} go with?`,
      detail: document.originalFilename,
      candidates: [
        ...decision.candidates.slice(0, 4).map((candidate) => ({
          id: `transaction:${candidate.record.id}`,
          label: `${formatMoney(candidate.record.amountPence)} — ${candidate.record.description.slice(0, 60)}`,
          sublabel: `${formatDate(candidate.record.transactionDate)} · ${describeReasons(candidate.reasons)}`,
          action: { kind: 'match_transaction', transactionId: candidate.record.id },
        })),
        {
          id: 'none',
          label: 'None of these',
          sublabel: 'Keep the receipt on file and match it later',
          action: { kind: 'no_match' },
        },
      ],
    });
    await db
      .update(documents)
      .set({ status: 'needs_answer', updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    return {
      extractionConfidence,
      autoMatchedTransactionId: null,
      exceptionId,
      message: 'Receipt saved. We found more than one possible payment.',
    };
  }

  const exceptionId = await raiseException(db, {
    companyId,
    type: 'unmatched_receipt',
    subjectType: 'document',
    subjectId: documentId,
    question: `We could not find a payment for this ${formatMoney(grossPence)} receipt. What should we do with it?`,
    detail: `${supplierNameText ?? document.originalFilename}${documentDate ? ` · ${formatDate(documentDate)}` : ''}`,
    candidates: [
      {
        id: 'cash',
        label: 'Paid in cash',
        sublabel: 'Record it as a cash expense',
        action: { kind: 'record_cash_expense' },
      },
      {
        id: 'wait',
        label: 'The payment has not come through yet',
        sublabel: 'We will keep looking',
        action: { kind: 'wait_for_transaction' },
      },
    ],
  });
  await db
    .update(documents)
    .set({ status: 'needs_answer', updatedAt: new Date() })
    .where(eq(documents.id, documentId));

  return {
    extractionConfidence,
    autoMatchedTransactionId: null,
    exceptionId,
    message: 'Receipt saved. We could not find a matching payment yet.',
  };
}

export async function getDocument(db: Database, companyId: string, id: string): Promise<DocumentRow> {
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('That receipt could not be found.');
  return row;
}

export async function matchDocumentToTransaction(
  db: Database,
  companyId: string,
  documentId: string,
  transactionId: string,
  options: { source: DecisionSource; confidence?: number; reason?: string; userId?: string | null },
): Promise<void> {
  const document = await getDocument(db, companyId, documentId);
  const transactionRows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)))
    .limit(1);
  const transaction = transactionRows[0];
  if (!transaction) throw new NotFoundError('That payment could not be found.');

  await db
    .update(documents)
    .set({
      matchedTransactionId: transactionId,
      matchSource: options.source,
      matchConfidence: options.confidence ?? null,
      matchReason: options.reason ?? null,
      matchedAt: new Date(),
      status: 'matched',
      supplierId: document.supplierId ?? transaction.supplierId,
      updatedAt: new Date(),
    })
    .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)));

  await db
    .update(transactions)
    .set({
      needsReceipt: false,
      status: transaction.status === 'needs_receipt' ? 'categorised' : transaction.status,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)));

  await closeExceptionsFor(db, companyId, 'document', documentId, {
    types: ['ambiguous_receipt_match', 'unmatched_receipt'],
    note: 'Receipt matched to a payment.',
    userId: options.userId ?? null,
  });
  await closeExceptionsFor(db, companyId, 'transaction', transactionId, {
    types: ['missing_receipt'],
    note: 'Receipt supplied.',
    userId: options.userId ?? null,
  });

  await recordAudit(db, {
    companyId,
    action: 'document.matched',
    entityType: 'document',
    entityId: documentId,
    summary: `Receipt matched to ${formatMoney(transaction.amountPence)} on ${formatDate(transaction.transactionDate)}.`,
    metadata: { transactionId, confidence: options.confidence ?? null, reason: options.reason ?? null },
    source: options.source,
    actorUserId: options.userId ?? null,
  });
}

export async function unmatchDocument(
  db: Database,
  companyId: string,
  documentId: string,
  userId: string,
): Promise<void> {
  const document = await getDocument(db, companyId, documentId);
  if (!document.matchedTransactionId) return;
  await db
    .update(documents)
    .set({
      matchedTransactionId: null,
      matchSource: null,
      matchConfidence: null,
      matchReason: null,
      matchedAt: null,
      status: 'extracted',
      updatedAt: new Date(),
    })
    .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)));

  await recordAudit(db, {
    companyId,
    action: 'document.unmatched',
    entityType: 'document',
    entityId: documentId,
    summary: 'Receipt unlinked from its payment.',
    actorUserId: userId,
  });
}

export async function updateDocumentDetails(
  db: Database,
  companyId: string,
  documentId: string,
  input: {
    supplierId?: string | null;
    supplierNameText?: string | null;
    documentDate?: IsoDate | null;
    netPence?: number | null;
    vatPence?: number | null;
    grossPence?: number | null;
    categoryId?: string | null;
    jobId?: string | null;
    notes?: string | null;
  },
  userId: string,
): Promise<DocumentRow> {
  const before = await getDocument(db, companyId, documentId);
  const [updated] = await db
    .update(documents)
    .set({ ...input, status: before.status === 'needs_answer' ? 'extracted' : before.status, updatedAt: new Date() })
    .where(and(eq(documents.companyId, companyId), eq(documents.id, documentId)))
    .returning();
  if (!updated) throw new NotFoundError('That receipt could not be found.');

  await recordAudit(db, {
    companyId,
    action: 'document.updated',
    entityType: 'document',
    entityId: documentId,
    summary: 'Receipt details updated.',
    changes: {
      grossPence: { from: before.grossPence, to: updated.grossPence },
      supplierNameText: { from: before.supplierNameText, to: updated.supplierNameText },
    },
    actorUserId: userId,
  });
  return updated;
}

async function findSupplierByName(db: Database, companyId: string, name: string): Promise<string | null> {
  const rows = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.isArchived, false)));
  const match = rows.find((row) => namesMatch(row.name, name));
  return match?.id ?? null;
}

/**
 * Flags transactions that ought to have a receipt but do not, and asks for
 * them. Cash-like spend above the threshold is what an inspector asks about.
 */
export async function flagMissingReceipts(
  db: Database,
  companyId: string,
  options: { thresholdPence?: number; limit?: number } = {},
): Promise<number> {
  const threshold = options.thresholdPence ?? 2500;
  const rows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.direction, 'money_out'),
        eq(transactions.isPersonal, false),
        sql`${transactions.status} not in ('excluded')`,
        sql`${transactions.amountPence} >= ${threshold}`,
        sql`not exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
        sql`not exists (select 1 from transaction_links tl where tl.transaction_id = ${transactions.id} and tl.linked_type = 'bill')`,
      ),
    )
    .limit(options.limit ?? 50);

  let raised = 0;
  for (const row of rows) {
    await db
      .update(transactions)
      .set({
        needsReceipt: true,
        receiptRequiredThresholdMet: true,
        status: row.categoryId ? 'needs_receipt' : row.status,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, row.id));

    await raiseException(db, {
      companyId,
      type: 'missing_receipt',
      subjectType: 'transaction',
      subjectId: row.id,
      question: `Do you have the receipt for ${formatMoney(row.amountPence)} on ${formatDate(row.transactionDate)}?`,
      detail: row.description,
      candidates: [
        { id: 'upload', label: 'Take a photo of it now', action: { kind: 'upload_receipt' } },
        { id: 'none', label: 'There is no receipt', action: { kind: 'no_receipt' } },
      ],
    });
    raised += 1;
  }
  return raised;
}

export async function countMissingReceipts(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.needsReceipt, true),
        sql`not exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
      ),
    );
  return rows[0]?.value ?? 0;
}
