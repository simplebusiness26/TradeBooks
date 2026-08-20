import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { documents, suppliers } from '@/db/schema';
import { createTransaction } from '@/domain/transactions';
import {
  detectContentType,
  getDocument,
  processDocument,
  uploadReceipt,
  validateUpload,
} from '@/domain/documents';
import { extractFromText } from '@/adapters/ocr';
import { buildTextReceipt } from '@/db/demo/statement';
import { ValidationError } from '@/lib/errors';
import { listOpenExceptions } from '@/domain/exceptions';
import { resolveException } from '@/domain/ask-me';
import { LocalStorageAdapter } from '@/adapters/storage';
import { flagMissingReceipts } from '@/domain/documents';
import { applyCategorisation } from '@/domain/transactions';
import { categoryIdByCode } from './helpers/db';
import { resolutionSchema } from '@/domain/ask-me';

let db: Database;
let fixture: Fixture;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
});

const receipt = (date: string, netPence: number, supplier = 'Travis Perkins') =>
  buildTextReceipt({
    supplier,
    address: 'Gelderd Road, Leeds LS12 6BX',
    date,
    vatNumber: 'GB408216160',
    items: [{ description: 'Roofing battens', amountPence: netPence }],
  });

describe('file validation', () => {
  it('accepts real images and text and rejects anything else', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
    expect(detectContentType(jpeg, 'image/jpeg')).toBe('image/jpeg');
    expect(detectContentType(png, 'image/png')).toBe('image/png');
    expect(validateUpload(Buffer.from('Total: 12.00\n'), 'text/plain', 'r.txt')).toBe('text/plain');
  });

  it('refuses an executable renamed as a receipt', () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(128, 0)]);
    expect(() => validateUpload(elf, 'image/jpeg', 'receipt.jpg')).toThrow(ValidationError);
  });

  it('refuses empty and oversized files', () => {
    expect(() => validateUpload(Buffer.alloc(0), 'text/plain', 'r.txt')).toThrow(ValidationError);
    expect(() => validateUpload(Buffer.alloc(11 * 1024 * 1024, 65), 'text/plain', 'r.txt')).toThrow(
      ValidationError,
    );
  });

  it('keeps storage keys inside the storage root', () => {
    const adapter = new LocalStorageAdapter('./storage/test');
    expect(() => adapter.get('../../etc/passwd')).rejects.toThrow();
    const key = LocalStorageAdapter.keyFor('company', 'abcd1234', '../../evil.txt');
    expect(key).not.toContain('..');
  });
});

describe('reading a text receipt', () => {
  it('reads supplier, date, net, VAT and total', () => {
    const extraction = extractFromText(receipt('2026-05-04', 123_850), 'test');
    expect(extraction.supplierName?.value).toBe('Travis Perkins');
    expect(extraction.documentDate?.value).toBe('2026-05-04');
    expect(extraction.netPence?.value).toBe(123_850);
    expect(extraction.vatPence?.value).toBe(24_770);
    expect(extraction.grossPence?.value).toBe(148_620);
    expect(extraction.vatNumber?.value).toBe('GB408216160');
    expect(extraction.confidence).toBeGreaterThan(70);
  });

  it('does not invent values it cannot see', () => {
    const extraction = extractFromText('Just a note with no numbers at all', 'test');
    expect(extraction.grossPence).toBeUndefined();
    expect(extraction.confidence).toBeLessThan(40);
  });

  it('lowers confidence when the figures do not add up', () => {
    const broken = ['Some Merchant', 'Date: 04/05/2026', 'Subtotal: 100.00', 'VAT: 20.00', 'Total: 500.00'].join(
      '\n',
    );
    const extraction = extractFromText(broken, 'test');
    expect(extraction.confidence).toBeLessThan(60);
  });
});

describe('chasing a missing receipt', () => {
  it('asks about a purchase with no receipt, and every offered answer is one the system accepts', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const created = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-04',
      direction: 'money_out',
      amountPence: 45_000,
      description: 'CARD PURCHASE BUILDERS MERCHANT',
    });
    await applyCategorisation(db, fixture.companyId, created.id, {
      categoryId: materialsId,
      source: 'user',
    });

    const raised = await flagMissingReceipts(db, fixture.companyId, { thresholdPence: 10_000 });
    expect(raised).toBe(1);

    const open = await listOpenExceptions(db, fixture.companyId);
    const question = open.find((e) => e.type === 'missing_receipt');
    expect(question).toBeDefined();
    expect(question!.question).toContain('£450.00');

    // "Take a photo" navigates to the camera; every other answer must be one
    // the resolver understands, or the owner taps a button that does nothing.
    for (const candidate of question!.candidates) {
      if (candidate.action.kind === 'upload_receipt') continue;
      expect(resolutionSchema.safeParse(candidate.action).success).toBe(true);
    }
  });

  it('accepts "there is no receipt" and stops asking', async () => {
    const created = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-04',
      direction: 'money_out',
      amountPence: 45_000,
      description: 'CARD PURCHASE BUILDERS MERCHANT',
    });
    expect(created.created).toBe(true);

    await flagMissingReceipts(db, fixture.companyId, { thresholdPence: 10_000 });
    const [question] = (await listOpenExceptions(db, fixture.companyId)).filter(
      (e) => e.type === 'missing_receipt',
    );

    const result = await resolveException(
      db,
      fixture.companyId,
      question!.id,
      { kind: 'no_receipt' },
      fixture.ownerId,
    );
    expect(result.message).toContain('no receipt');

    const remaining = await listOpenExceptions(db, fixture.companyId);
    expect(remaining.some((e) => e.id === question!.id)).toBe(false);
  });
});

describe('the receipt pipeline', () => {
  async function addPayment(amountPence: number, date: string, description = 'CARD PURCHASE TRAVIS PERKINS 4471') {
    const result = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: date,
      direction: 'money_out',
      amountPence,
      description,
    });
    return result.id;
  }

  it('matches a receipt to the payment automatically when it is unambiguous', async () => {
    const transactionId = await addPayment(148_620, '2026-05-04');
    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });

    expect(result.autoMatchedTransactionId).toBe(transactionId);
    const document = await getDocument(db, fixture.companyId, result.documentId);
    expect(document.status).toBe('matched');
    expect(document.matchSource).toBe('heuristic');
    expect(document.matchReason).toContain('amount matches exactly');
  });

  it('asks which payment when two are equally likely', async () => {
    await addPayment(148_620, '2026-05-04', 'CARD PURCHASE TRAVIS PERKINS 4471');
    await addPayment(148_620, '2026-05-05', 'CARD PURCHASE TRAVIS PERKINS 8802');

    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });

    expect(result.autoMatchedTransactionId).toBeNull();
    const open = await listOpenExceptions(db, fixture.companyId);
    const question = open.find((e) => e.type === 'ambiguous_receipt_match');
    expect(question).toBeDefined();
    expect(question!.candidates.length).toBeGreaterThanOrEqual(3);
    expect(question!.question).toContain('£1,486.20');
  });

  it('lets the owner pick the right payment and files the receipt', async () => {
    const first = await addPayment(148_620, '2026-05-04', 'CARD PURCHASE TRAVIS PERKINS 4471');
    await addPayment(148_620, '2026-05-05', 'CARD PURCHASE TRAVIS PERKINS 8802');
    const upload = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });

    const open = await listOpenExceptions(db, fixture.companyId);
    const question = open.find((e) => e.type === 'ambiguous_receipt_match')!;
    await resolveException(
      db,
      fixture.companyId,
      question.id,
      { kind: 'match_transaction', transactionId: first },
      fixture.ownerId,
    );

    const document = await getDocument(db, fixture.companyId, upload.documentId);
    expect(document.matchedTransactionId).toBe(first);
    expect(document.matchSource).toBe('user');
    const remaining = await listOpenExceptions(db, fixture.companyId);
    expect(remaining.find((e) => e.id === question.id)).toBeUndefined();
  });

  it('asks for details when nothing matches', async () => {
    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });
    expect(result.autoMatchedTransactionId).toBeNull();
    const open = await listOpenExceptions(db, fixture.companyId);
    expect(open.some((e) => e.type === 'unmatched_receipt')).toBe(true);
  });

  it('keeps the original file and refuses to store it twice', async () => {
    const buffer = Buffer.from(receipt('2026-05-04', 123_850));
    const first = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer,
    });
    const second = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis-again.txt',
      contentType: 'text/plain',
      buffer,
    });

    expect(second.duplicate).toBe(true);
    expect(second.documentId).toBe(first.documentId);
    const rows = await db.select().from(documents).where(eq(documents.companyId, fixture.companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.checksumSha256).toHaveLength(64);
  });

  it('reports honestly when it cannot read a photo', async () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(256, 7)]);
    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      buffer: jpeg,
    });

    const document = await getDocument(db, fixture.companyId, result.documentId);
    expect(document.extractionConfidence).toBe(0);
    expect(document.status).toBe('needs_answer');
    expect(document.extractionError).toContain('photo or scan');
    const open = await listOpenExceptions(db, fixture.companyId);
    expect(open.some((e) => e.question.includes('What is on this receipt?'))).toBe(true);
  });

  it('links the receipt to a known supplier record', async () => {
    await db.insert(suppliers).values({ companyId: fixture.companyId, name: 'Travis Perkins Ltd' });
    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });
    const document = await getDocument(db, fixture.companyId, result.documentId);
    expect(document.supplierId).not.toBeNull();
  });

  it('does not overwrite values a person has already corrected', async () => {
    const result = await uploadReceipt(db, {
      companyId: fixture.companyId,
      userId: fixture.ownerId,
      filename: 'travis.txt',
      contentType: 'text/plain',
      buffer: Buffer.from(receipt('2026-05-04', 123_850)),
    });
    await db
      .update(documents)
      .set({ supplierNameText: 'Corrected Supplier Name' })
      .where(eq(documents.id, result.documentId));

    await processDocument(db, fixture.companyId, result.documentId, { userId: fixture.ownerId });
    const document = await getDocument(db, fixture.companyId, result.documentId);
    expect(document.supplierNameText).toBe('Corrected Supplier Name');
  });
});
