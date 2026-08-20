'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate } from '@/lib/dates';
import {
  MAX_UPLOAD_BYTES,
  matchDocumentToTransaction,
  processDocument,
  unmatchDocument,
  updateDocumentDetails,
  uploadReceipt,
} from '@/domain/documents';

export async function uploadReceiptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('documents.upload');
    checkRateLimit(`upload:${context.company.id}`, RATE_LIMITS.upload);

    const files = formData.getAll('file').filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return failure('Choose a photo or file to upload.');

    const jobId = asUuidOrNull(formData.get('jobId'));
    const transactionId = asUuidOrNull(formData.get('transactionId'));

    const results = [] as { documentId: string; message: string; duplicate: boolean }[];

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return failure(`“${file.name}” is too big. Photos need to be under 10MB.`);
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadReceipt(db, {
        companyId: context.company.id,
        userId: context.user.userId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        buffer,
        jobId,
      });

      // Uploaded from a specific payment: file it there straight away.
      if (transactionId && !result.duplicate) {
        await matchDocumentToTransaction(db, context.company.id, result.documentId, transactionId, {
          source: 'user',
          confidence: 100,
          reason: 'Uploaded from the payment.',
          userId: context.user.userId,
        });
        results.push({ documentId: result.documentId, message: 'Receipt filed against the payment.', duplicate: false });
      } else {
        results.push({ documentId: result.documentId, message: result.message, duplicate: result.duplicate });
      }
    }

    revalidatePath('/receipts');
    revalidatePath('/home');
    revalidatePath('/ask');

    if (results.length === 1) {
      const only = results[0]!;
      if (transactionId) redirect(`/money-out/${transactionId}`);
      redirect(`/receipts/${only.documentId}?msg=${encodeURIComponent(only.message)}`);
    }

    return success(`${results.length} receipts saved.`);
  });
}

const detailsSchema = z.object({
  documentId: z.string().uuid(),
  supplierNameText: z.string().trim().max(160).optional(),
  supplierId: z.string().uuid().nullish(),
  documentDate: z.string().refine((v) => v === '' || isIsoDate(v), 'Enter a valid date.').optional(),
  gross: z.string().trim().optional(),
  vat: z.string().trim().optional(),
  categoryId: z.string().uuid().nullish(),
  jobId: z.string().uuid().nullish(),
  notes: z.string().trim().max(1000).optional(),
});

export async function updateReceiptAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('documents.upload');
    const parsed = detailsSchema.safeParse({
      documentId: formData.get('documentId'),
      supplierNameText: emptyToUndefined(formData.get('supplierNameText')),
      supplierId: asUuidOrNull(formData.get('supplierId')),
      documentDate: emptyToUndefined(formData.get('documentDate')),
      gross: emptyToUndefined(formData.get('gross')),
      vat: emptyToUndefined(formData.get('vat')),
      categoryId: asUuidOrNull(formData.get('categoryId')),
      jobId: asUuidOrNull(formData.get('jobId')),
      notes: emptyToUndefined(formData.get('notes')),
    });
    if (!parsed.success) return failure('Please check the details.');

    const grossPence = parsed.data.gross ? parseMoneyInput(parsed.data.gross) : undefined;
    const vatPence = parsed.data.vat ? parseMoneyInput(parsed.data.vat) : undefined;

    await updateDocumentDetails(
      db,
      context.company.id,
      parsed.data.documentId,
      {
        supplierNameText: parsed.data.supplierNameText ?? null,
        supplierId: parsed.data.supplierId ?? null,
        documentDate: parsed.data.documentDate ?? null,
        grossPence: grossPence ?? null,
        vatPence: vatPence ?? null,
        netPence: grossPence !== undefined && vatPence !== undefined ? grossPence - vatPence : null,
        categoryId: parsed.data.categoryId ?? null,
        jobId: parsed.data.jobId ?? null,
        notes: parsed.data.notes ?? null,
      },
      context.user.userId,
    );

    revalidatePath(`/receipts/${parsed.data.documentId}`);
    return success('Receipt updated.');
  });
}

export async function findMatchesAction(formData: FormData): Promise<void> {
  const context = await requirePermission('documents.upload');
  const documentId = String(formData.get('documentId') ?? '');
  await processDocument(db, context.company.id, documentId, { userId: context.user.userId });
  revalidatePath(`/receipts/${documentId}`);
  revalidatePath('/ask');
}

export async function matchReceiptAction(formData: FormData): Promise<void> {
  const context = await requirePermission('documents.upload');
  const documentId = String(formData.get('documentId') ?? '');
  const transactionId = String(formData.get('transactionId') ?? '');
  await matchDocumentToTransaction(db, context.company.id, documentId, transactionId, {
    source: 'user',
    confidence: 100,
    reason: 'Chosen by hand.',
    userId: context.user.userId,
  });
  revalidatePath(`/receipts/${documentId}`);
  revalidatePath('/receipts');
}

export async function unmatchReceiptAction(formData: FormData): Promise<void> {
  const context = await requirePermission('documents.upload');
  const documentId = String(formData.get('documentId') ?? '');
  await unmatchDocument(db, context.company.id, documentId, context.user.userId);
  revalidatePath(`/receipts/${documentId}`);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? undefined : text;
}

function asUuidOrNull(value: FormDataEntryValue | null): string | null {
  const text = value === null ? '' : String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : null;
}
