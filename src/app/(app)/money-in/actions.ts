'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, invoices } from '@/db/schema';
import { requirePermissionStrict } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate, todayIso } from '@/lib/dates';
import {
  allocatePayment,
  createInvoice,
  getInvoice,
  recordPayment,
  refreshInvoiceStatus,
  replaceInvoiceLines,
  sendInvoice,
  voidInvoice,
  type InvoiceLineInput,
} from '@/domain/invoices';
import { deliver } from '@/adapters/email';
import { recordAudit } from '@/domain/audit';
import { AppError } from '@/lib/errors';
import { renderInvoiceEmail } from '@/domain/invoice-document';

const VAT_TREATMENTS = ['standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'no_vat'] as const;

const lineSchema = z.object({
  description: z.string().trim().min(1, 'Describe the work.').max(400),
  quantity: z.string().trim().default('1'),
  unitPrice: z.string().trim().min(1, 'Enter a price.'),
  vatTreatment: z.enum(VAT_TREATMENTS).default('standard'),
  isLabour: z.boolean().default(false),
});

const invoiceSchema = z.object({
  customerId: z.string().uuid('Choose a customer.'),
  jobId: z.string().uuid().nullish(),
  issueDate: z.string().refine(isIsoDate, 'Enter a valid date.'),
  dueDate: z.string().refine(isIsoDate, 'Enter a valid date.').optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  applyCis: z.boolean().default(false),
  lines: z.array(lineSchema).min(1, 'Add at least one line.'),
});

/** Reads the repeated line fields a plain HTML form submits. */
function readLines(formData: FormData): unknown[] {
  const descriptions = formData.getAll('lineDescription').map(String);
  const quantities = formData.getAll('lineQuantity').map(String);
  const prices = formData.getAll('lineUnitPrice').map(String);
  const treatments = formData.getAll('lineVatTreatment').map(String);
  const labourFlags = formData.getAll('lineIsLabour').map(String);

  return descriptions
    .map((description, index) => ({
      description,
      quantity: quantities[index] ?? '1',
      unitPrice: prices[index] ?? '',
      vatTreatment: treatments[index] ?? 'standard',
      isLabour: labourFlags[index] === 'yes',
    }))
    .filter((line) => line.description.trim() !== '' || line.unitPrice.trim() !== '');
}

function toDomainLines(
  lines: z.infer<typeof lineSchema>[],
  categoryId: string | null,
  jobId: string | null,
): InvoiceLineInput[] {
  return lines.map((line) => ({
    description: line.description,
    quantityMilli: Math.round(Number(line.quantity || '1') * 1000),
    unitPricePence: parseMoneyInput(line.unitPrice),
    vatTreatment: line.vatTreatment,
    categoryId,
    jobId,
    isLabour: line.isLabour,
  }));
}

export async function createInvoiceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('records.write');

    const parsed = invoiceSchema.safeParse({
      customerId: formData.get('customerId'),
      jobId: emptyToNull(formData.get('jobId')),
      issueDate: formData.get('issueDate'),
      dueDate: emptyToUndefined(formData.get('dueDate')),
      reference: emptyToUndefined(formData.get('reference')),
      notes: emptyToUndefined(formData.get('notes')),
      applyCis: formData.get('applyCis') === 'yes',
      lines: readLines(formData),
    });

    if (!parsed.success) return failure('Please check the invoice.', fieldErrorsOf(parsed.error));

    const { categories } = await import('@/db/schema');
    const salesCategory = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.companyId, context.company.id), eq(categories.code, 'sales_roofing')))
      .limit(1);

    const invoice = await createInvoice(db, {
      companyId: context.company.id,
      customerId: parsed.data.customerId,
      jobId: parsed.data.jobId ?? null,
      issueDate: parsed.data.issueDate,
      dueDate: parsed.data.dueDate,
      reference: parsed.data.reference ?? null,
      notes: parsed.data.notes ?? null,
      lines: toDomainLines(parsed.data.lines, salesCategory[0]?.id ?? null, parsed.data.jobId ?? null),
      cisDeductionRateBasisPoints: parsed.data.applyCis ? 2000 : null,
      createdByUserId: context.user.userId,
    });

    revalidatePath('/money-in');
    redirect(`/money-in/${invoice.id}`);
  });
}

export async function updateInvoiceLinesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('records.write');
    const invoiceId = String(formData.get('invoiceId') ?? '');
    const parsed = z.array(lineSchema).min(1).safeParse(readLines(formData));
    if (!parsed.success) return failure('Please check the invoice lines.');

    const invoice = await getInvoice(db, context.company.id, invoiceId);
    await replaceInvoiceLines(
      db,
      context.company.id,
      invoiceId,
      toDomainLines(parsed.data, null, invoice.jobId),
      context.user.userId,
    );

    revalidatePath(`/money-in/${invoiceId}`);
    return success('Invoice updated.');
  });
}

export async function sendInvoiceAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('records.write');
  const invoiceId = String(formData.get('invoiceId') ?? '');
  await sendInvoice(db, context.company.id, invoiceId, context.user.userId);
  revalidatePath(`/money-in/${invoiceId}`);
  revalidatePath('/money-in');
}

export async function voidInvoiceAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('records.write');
  const invoiceId = String(formData.get('invoiceId') ?? '');
  const reason = String(formData.get('reason') ?? 'Cancelled by the owner');
  await voidInvoice(db, context.company.id, invoiceId, context.user.userId, reason);
  revalidatePath(`/money-in/${invoiceId}`);
  revalidatePath('/money-in');
}

const paymentSchema = z.object({
  invoiceId: z.string().uuid(),
  amount: z.string().min(1, 'Enter the amount received.'),
  paymentDate: z.string().refine(isIsoDate, 'Enter a valid date.'),
  method: z.string().trim().max(60).default('bank_transfer'),
  reference: z.string().trim().max(120).optional(),
});

export async function recordInvoicePaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('records.write');
    const parsed = paymentSchema.safeParse({
      invoiceId: formData.get('invoiceId'),
      amount: formData.get('amount'),
      paymentDate: formData.get('paymentDate') || todayIso(),
      method: formData.get('method') || 'bank_transfer',
      reference: emptyToUndefined(formData.get('reference')),
    });
    if (!parsed.success) return failure('Please check the payment.', fieldErrorsOf(parsed.error));

    const amountPence = parseMoneyInput(parsed.data.amount);
    if (amountPence <= 0) return failure('The amount must be more than zero.');

    const invoice = await getInvoice(db, context.company.id, parsed.data.invoiceId);
    if (invoice.status === 'draft') {
      return failure('Send the invoice before recording a payment against it.');
    }

    await recordPayment(db, {
      companyId: context.company.id,
      direction: 'customer_receipt',
      customerId: invoice.customerId,
      paymentDate: parsed.data.paymentDate,
      amountPence,
      method: parsed.data.method,
      reference: parsed.data.reference ?? null,
      allocations: [{ invoiceId: invoice.id, amountPence }],
      userId: context.user.userId,
    });

    revalidatePath(`/money-in/${invoice.id}`);
    revalidatePath('/money-in');
    return success('Payment recorded.');
  });
}

export async function sendReminderAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('records.write');
  const invoiceId = String(formData.get('invoiceId') ?? '');
  const invoice = await getInvoice(db, context.company.id, invoiceId);

  const customerRows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, context.company.id), eq(customers.id, invoice.customerId)))
    .limit(1);
  const customer = customerRows[0];
  if (!customer?.email) {
    throw new AppError('Add an email address for this customer before sending a reminder.');
  }

  const message = renderInvoiceEmail({
    companyName: context.company.tradingName ?? context.company.name,
    customerName: customer.name,
    invoiceNumber: invoice.number,
    dueDate: invoice.dueDate,
    outstandingPence: invoice.grossPence - invoice.cisDeductionPence - invoice.paidPence,
    isReminder: true,
  });

  await deliver(db, {
    companyId: context.company.id,
    to: customer.email,
    subject: message.subject,
    body: message.body,
    purpose: 'invoice_reminder',
    relatedType: 'invoice',
    relatedId: invoice.id,
  });

  await db
    .update(invoices)
    .set({ lastReminderAt: new Date(), reminderCount: invoice.reminderCount + 1, updatedAt: new Date() })
    .where(eq(invoices.id, invoice.id));

  await recordAudit(db, {
    companyId: context.company.id,
    action: 'invoice.reminder_sent',
    entityType: 'invoice',
    entityId: invoice.id,
    summary: `Reminder for invoice ${invoice.number} queued to ${customer.email}.`,
    actorUserId: context.user.userId,
  });

  revalidatePath(`/money-in/${invoice.id}`);
}

export async function markOverdueAction(): Promise<void> {
  const context = await requirePermissionStrict('records.write');
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.companyId, context.company.id)));
  for (const row of rows) {
    await refreshInvoiceStatus(db, context.company.id, row.id);
  }
  revalidatePath('/money-in');
}

export async function allocateToInvoiceAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('records.write');
  const paymentId = String(formData.get('paymentId') ?? '');
  const invoiceId = String(formData.get('invoiceId') ?? '');
  const amountPence = parseMoneyInput(String(formData.get('amount') ?? '0'));
  await allocatePayment(
    db,
    context.company.id,
    paymentId,
    [{ invoiceId, amountPence }],
    context.user.userId,
  );
  revalidatePath(`/money-in/${invoiceId}`);
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
