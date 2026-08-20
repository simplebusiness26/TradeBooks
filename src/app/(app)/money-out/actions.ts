'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { transactions } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate, todayIso } from '@/lib/dates';
import {
  applyCategorisation,
  autoProcessTransaction,
  createTransaction,
  linkTransaction,
  markReviewed,
  unlinkTransaction,
} from '@/domain/transactions';
import { createBill, refreshBillStatus, voidBill, type BillLineInput } from '@/domain/bills';
import { importStatement } from '@/domain/import';
import { recordPayment } from '@/domain/invoices';
import { createRule } from '@/domain/rules';
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { recordAudit } from '@/domain/audit';
import { flagMissingReceipts } from '@/domain/documents';

const VAT_TREATMENTS = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'no_vat'] as const;

const categoriseSchema = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid().nullish(),
  supplierId: z.string().uuid().nullish(),
  jobId: z.string().uuid().nullish(),
  vatTreatment: z.enum(VAT_TREATMENTS).nullish(),
  isPersonal: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  createRule: z.boolean().default(false),
});

export async function categoriseTransactionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('transactions.categorise');
    const parsed = categoriseSchema.safeParse({
      transactionId: formData.get('transactionId'),
      categoryId: emptyToNull(formData.get('categoryId')),
      supplierId: emptyToNull(formData.get('supplierId')),
      jobId: emptyToNull(formData.get('jobId')),
      vatTreatment: emptyToNull(formData.get('vatTreatment')),
      isPersonal: formData.get('isPersonal') === 'yes',
      notes: emptyToUndefined(formData.get('notes')),
      createRule: formData.get('createRule') === 'yes',
    });
    if (!parsed.success) return failure('Please check the details.');

    const updated = await applyCategorisation(db, context.company.id, parsed.data.transactionId, {
      categoryId: parsed.data.categoryId ?? null,
      supplierId: parsed.data.supplierId ?? null,
      jobId: parsed.data.jobId ?? null,
      vatTreatment: parsed.data.vatTreatment ?? undefined,
      isPersonal: parsed.data.isPersonal,
      notes: parsed.data.notes,
      source: 'user',
      confidence: 100,
      reason: 'Set by hand.',
      confirmedByUserId: context.user.userId,
    });

    let ruleCreated = false;
    if (parsed.data.createRule && updated.counterparty && parsed.data.categoryId) {
      await createRule(db, {
        companyId: context.company.id,
        name: `${updated.counterparty} → category`,
        matchType: 'description_contains',
        matchValue: updated.counterparty,
        appliesToDirection: updated.direction,
        setCategoryId: parsed.data.categoryId,
        setSupplierId: parsed.data.supplierId ?? null,
        userId: context.user.userId,
      }).then(() => {
        ruleCreated = true;
      });
    }

    revalidatePath('/money-out');
    revalidatePath(`/money-out/${parsed.data.transactionId}`);
    return success(ruleCreated ? 'Saved. We will sort the next one like this automatically.' : 'Saved.');
  });
}

export async function markReviewedAction(formData: FormData): Promise<void> {
  const context = await requirePermission('transactions.reconcile');
  const transactionId = String(formData.get('transactionId') ?? '');
  await markReviewed(db, context.company.id, transactionId, context.user.userId);
  revalidatePath(`/money-out/${transactionId}`);
  revalidatePath('/money-out');
}

export async function excludeTransactionAction(formData: FormData): Promise<void> {
  const context = await requirePermission('transactions.categorise');
  const transactionId = String(formData.get('transactionId') ?? '');
  await db
    .update(transactions)
    .set({ status: 'excluded', needsReceipt: false, updatedAt: new Date() })
    .where(and(eq(transactions.companyId, context.company.id), eq(transactions.id, transactionId)));
  await recordAudit(db, {
    companyId: context.company.id,
    action: 'transaction.excluded',
    entityType: 'transaction',
    entityId: transactionId,
    summary: 'Payment excluded from the books (duplicate or not a real movement).',
    actorUserId: context.user.userId,
  });
  revalidatePath(`/money-out/${transactionId}`);
}

const manualTransactionSchema = z.object({
  bankAccountId: z.string().uuid('Choose an account.'),
  transactionDate: z.string().refine(isIsoDate, 'Enter a valid date.'),
  direction: z.enum(['money_in', 'money_out']),
  amount: z.string().min(1, 'Enter the amount.'),
  description: z.string().trim().min(2, 'Say what it was.').max(400),
  reference: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().nullish(),
  jobId: z.string().uuid().nullish(),
});

export async function addTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const parsed = manualTransactionSchema.safeParse({
      bankAccountId: formData.get('bankAccountId'),
      transactionDate: formData.get('transactionDate') || todayIso(),
      direction: formData.get('direction'),
      amount: formData.get('amount'),
      description: formData.get('description'),
      reference: emptyToUndefined(formData.get('reference')),
      categoryId: emptyToNull(formData.get('categoryId')),
      jobId: emptyToNull(formData.get('jobId')),
    });
    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));

    const amountPence = Math.abs(parseMoneyInput(parsed.data.amount));
    const result = await createTransaction(db, {
      companyId: context.company.id,
      bankAccountId: parsed.data.bankAccountId,
      transactionDate: parsed.data.transactionDate,
      direction: parsed.data.direction,
      amountPence,
      description: parsed.data.description,
      reference: parsed.data.reference ?? null,
      source: 'user',
    });

    if (!result.created) return failure('That looks like a payment you have already recorded.');

    if (parsed.data.categoryId) {
      await applyCategorisation(db, context.company.id, result.id, {
        categoryId: parsed.data.categoryId,
        jobId: parsed.data.jobId ?? null,
        source: 'user',
        confidence: 100,
        reason: 'Entered by hand.',
        confirmedByUserId: context.user.userId,
      });
    } else {
      await autoProcessTransaction(db, context.company.id, result.id);
    }

    revalidatePath('/money-out');
    redirect(`/money-out/${result.id}`);
  });
}

export async function importStatementAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('imports.run');
    checkRateLimit(`import:${context.company.id}`, RATE_LIMITS.import);

    const bankAccountId = String(formData.get('bankAccountId') ?? '');
    if (!bankAccountId) return failure('Choose which account the statement is for.');

    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return failure('Choose a CSV file to import.');
    if (file.size > 8 * 1024 * 1024) return failure('That file is too big. Split it into smaller periods.');

    const content = Buffer.from(await file.arrayBuffer()).toString('utf8');
    const result = await importStatement(db, {
      companyId: context.company.id,
      bankAccountId,
      filename: file.name,
      content,
      userId: context.user.userId,
    });

    await flagMissingReceipts(db, context.company.id, { thresholdPence: 15_000 });

    revalidatePath('/money-out');
    revalidatePath('/home');

    if (result.alreadyImported) {
      return success(`That file has already been imported — ${result.imported} transactions came from it.`);
    }

    const parts = [`Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}`];
    if (result.duplicates > 0) parts.push(`${result.duplicates} were already here`);
    if (result.errors.length > 0) parts.push(`${result.errors.length} rows could not be read`);

    return success(`${parts.join(', ')}.`, {
      imported: result.imported,
      duplicates: result.duplicates,
      errors: result.errors.slice(0, 10),
    });
  });
}

const billSchema = z.object({
  supplierId: z.string().uuid('Choose a supplier.'),
  billDate: z.string().refine(isIsoDate, 'Enter a valid date.'),
  dueDate: z.string().refine(isIsoDate, 'Enter a valid date.').optional(),
  reference: z.string().trim().max(120).optional(),
  description: z.string().trim().max(400).optional(),
  jobId: z.string().uuid().nullish(),
  isSubcontractorPayment: z.boolean().default(false),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe the item.').max(400),
        unitPrice: z.string().trim().min(1, 'Enter an amount.'),
        vatTreatment: z.enum(VAT_TREATMENTS).default('standard'),
        categoryId: z.string().uuid().nullish(),
        isLabour: z.boolean().default(false),
      }),
    )
    .min(1, 'Add at least one line.'),
});

export async function createBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');

    const descriptions = formData.getAll('lineDescription').map(String);
    const prices = formData.getAll('lineUnitPrice').map(String);
    const treatments = formData.getAll('lineVatTreatment').map(String);
    const categoryIds = formData.getAll('lineCategoryId').map(String);
    const labour = formData.getAll('lineIsLabour').map(String);

    const parsed = billSchema.safeParse({
      supplierId: formData.get('supplierId'),
      billDate: formData.get('billDate') || todayIso(),
      dueDate: emptyToUndefined(formData.get('dueDate')),
      reference: emptyToUndefined(formData.get('reference')),
      description: emptyToUndefined(formData.get('description')),
      jobId: emptyToNull(formData.get('jobId')),
      isSubcontractorPayment: formData.get('isSubcontractorPayment') === 'yes',
      lines: descriptions
        .map((description, index) => ({
          description,
          unitPrice: prices[index] ?? '',
          vatTreatment: treatments[index] ?? 'standard',
          categoryId: categoryIds[index] || null,
          isLabour: labour[index] === 'yes',
        }))
        .filter((line) => line.description.trim() !== '' || line.unitPrice.trim() !== ''),
    });

    if (!parsed.success) return failure('Please check the bill.', fieldErrorsOf(parsed.error));

    const lines: BillLineInput[] = parsed.data.lines.map((line) => ({
      description: line.description,
      quantityMilli: 1000,
      unitPricePence: parseMoneyInput(line.unitPrice),
      vatTreatment: line.vatTreatment,
      categoryId: line.categoryId ?? null,
      jobId: parsed.data.jobId ?? null,
      isLabour: line.isLabour,
    }));

    const bill = await createBill(db, {
      companyId: context.company.id,
      supplierId: parsed.data.supplierId,
      billDate: parsed.data.billDate,
      dueDate: parsed.data.dueDate,
      reference: parsed.data.reference ?? null,
      description: parsed.data.description ?? null,
      jobId: parsed.data.jobId ?? null,
      lines,
      isSubcontractorPayment: parsed.data.isSubcontractorPayment,
      userId: context.user.userId,
    });

    revalidatePath('/money-out/bills');
    redirect(`/money-out/bills/${bill.id}`);
  });
}

export async function payBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const billId = String(formData.get('billId') ?? '');
    const amountPence = parseMoneyInput(String(formData.get('amount') ?? '0'));
    const paymentDate = String(formData.get('paymentDate') ?? todayIso());
    if (!isIsoDate(paymentDate)) return failure('Enter a valid date.');
    if (amountPence <= 0) return failure('Enter how much you paid.');

    const { getBill } = await import('@/domain/bills');
    const bill = await getBill(db, context.company.id, billId);

    await recordPayment(db, {
      companyId: context.company.id,
      direction: 'supplier_payment',
      supplierId: bill.supplierId,
      paymentDate,
      amountPence,
      reference: bill.reference,
      allocations: [{ billId, amountPence }],
      userId: context.user.userId,
    });
    await refreshBillStatus(db, context.company.id, billId);

    revalidatePath(`/money-out/bills/${billId}`);
    revalidatePath('/money-out/bills');
    return success('Payment recorded against the bill.');
  });
}

export async function voidBillAction(formData: FormData): Promise<void> {
  const context = await requirePermission('records.write');
  const billId = String(formData.get('billId') ?? '');
  const reason = String(formData.get('reason') ?? 'Cancelled');
  await voidBill(db, context.company.id, billId, context.user.userId, reason);
  revalidatePath('/money-out/bills');
  redirect('/money-out/bills');
}

export async function linkTransactionToBillAction(formData: FormData): Promise<void> {
  const context = await requirePermission('transactions.reconcile');
  const transactionId = String(formData.get('transactionId') ?? '');
  const billId = String(formData.get('billId') ?? '');
  const { getTransaction } = await import('@/domain/transactions');
  const transaction = await getTransaction(db, context.company.id, transactionId);

  await recordPayment(db, {
    companyId: context.company.id,
    direction: 'supplier_payment',
    paymentDate: transaction.transactionDate,
    amountPence: transaction.amountPence,
    transactionId,
    allocations: [{ billId, amountPence: transaction.amountPence }],
    userId: context.user.userId,
  });
  await linkTransaction(db, context.company.id, {
    transactionId,
    linkedType: 'bill',
    linkedId: billId,
    amountPence: transaction.amountPence,
    source: 'user',
    confidence: 100,
    reason: 'Linked by hand.',
  });
  await refreshBillStatus(db, context.company.id, billId);
  revalidatePath(`/money-out/${transactionId}`);
}

export async function unlinkTransactionAction(formData: FormData): Promise<void> {
  const context = await requirePermission('transactions.reconcile');
  const transactionId = String(formData.get('transactionId') ?? '');
  await unlinkTransaction(
    db,
    context.company.id,
    transactionId,
    String(formData.get('linkedType') ?? ''),
    String(formData.get('linkedId') ?? ''),
  );
  revalidatePath(`/money-out/${transactionId}`);
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? null : text;
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? undefined : text;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
