import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { bankAccounts, categories, documents, transactions } from '@/db/schema';
import { AppError, NotFoundError } from '@/lib/errors';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import { getException, markResolved } from './exceptions';
import { recordAudit } from './audit';
import { createRule } from './rules';
import {
  applyCategorisation,
  createTransaction,
  getTransaction,
  linkTransaction,
} from './transactions';
import { getDocument, matchDocumentToTransaction } from './documents';
import { recordPayment, refreshInvoiceStatus } from './invoices';

/** Every answer the owner can give, validated before anything is changed. */
export const resolutionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('set_category'),
    categoryId: z.string().uuid(),
    supplierId: z.string().uuid().nullish(),
    jobId: z.string().uuid().nullish(),
    createRule: z.boolean().optional(),
  }),
  z.object({ kind: z.literal('mark_personal'), createRule: z.boolean().optional() }),
  z.object({ kind: z.literal('set_job'), jobId: z.string().uuid() }),
  z.object({ kind: z.literal('match_transaction'), transactionId: z.string().uuid() }),
  z.object({ kind: z.literal('match_document'), documentId: z.string().uuid() }),
  z.object({ kind: z.literal('allocate_invoice'), invoiceId: z.string().uuid() }),
  z.object({ kind: z.literal('no_receipt') }),
  z.object({ kind: z.literal('no_match') }),
  z.object({ kind: z.literal('record_cash_expense') }),
  z.object({ kind: z.literal('wait_for_transaction') }),
  z.object({ kind: z.literal('not_duplicate') }),
  z.object({ kind: z.literal('other_income') }),
  z.object({ kind: z.literal('dismiss'), note: z.string().max(400).optional() }),
]);

export type Resolution = z.infer<typeof resolutionSchema>;

export type ResolveResult = { message: string; ruleCreated: boolean };

/**
 * Applies an answer from the Ask Me queue.
 *
 * Answering always does three things: change the underlying record, record an
 * audit event, and close the question. Where the answer is safely reusable it
 * also creates a deterministic rule so the same question is never asked again.
 */
export async function resolveException(
  db: Database,
  companyId: string,
  exceptionId: string,
  resolution: Resolution,
  userId: string,
): Promise<ResolveResult> {
  const exception = await getException(db, companyId, exceptionId);
  if (!exception) throw new NotFoundError('That question could not be found.');
  if (exception.status === 'resolved' || exception.status === 'dismissed') {
    return { message: 'That question has already been answered.', ruleCreated: false };
  }

  let message = 'Thanks — that is sorted.';
  let ruleId: string | null = null;

  switch (resolution.kind) {
    case 'set_category': {
      if (exception.subjectType !== 'transaction') {
        throw new AppError('That answer does not apply to this question.');
      }
      const transaction = await getTransaction(db, companyId, exception.subjectId);
      const category = await requireCategory(db, companyId, resolution.categoryId);

      await applyCategorisation(db, companyId, transaction.id, {
        categoryId: resolution.categoryId,
        supplierId: resolution.supplierId ?? undefined,
        jobId: resolution.jobId ?? undefined,
        isPersonal: false,
        source: 'user',
        confidence: 100,
        reason: 'Answered in Ask Me.',
        confirmedByUserId: userId,
      });

      if (resolution.createRule !== false && transaction.counterparty) {
        ruleId = await createRule(db, {
          companyId,
          name: `${titleise(transaction.counterparty)} → ${category.name}`,
          matchType: 'description_contains',
          matchValue: transaction.counterparty,
          appliesToDirection: transaction.direction,
          setCategoryId: resolution.categoryId,
          setSupplierId: resolution.supplierId ?? null,
          createdFromExceptionId: exceptionId,
          userId,
        }).catch(() => null);
      }

      message = ruleId
        ? `Sorted as ${category.name}. We will do the same next time.`
        : `Sorted as ${category.name}.`;
      break;
    }

    case 'mark_personal': {
      if (exception.subjectType !== 'transaction') {
        throw new AppError('That answer does not apply to this question.');
      }
      const transaction = await getTransaction(db, companyId, exception.subjectId);
      const personalCategory = await categoryByCode(db, companyId, 'personal');

      await applyCategorisation(db, companyId, transaction.id, {
        categoryId: personalCategory?.id ?? null,
        isPersonal: true,
        vatTreatment: 'outside_scope',
        source: 'user',
        confidence: 100,
        reason: 'Marked personal in Ask Me.',
        confirmedByUserId: userId,
      });

      if (resolution.createRule && transaction.counterparty) {
        ruleId = await createRule(db, {
          companyId,
          name: `${titleise(transaction.counterparty)} → Personal`,
          matchType: 'description_contains',
          matchValue: transaction.counterparty,
          setCategoryId: personalCategory?.id ?? null,
          setIsPersonal: true,
          createdFromExceptionId: exceptionId,
          userId,
        }).catch(() => null);
      }

      message = 'Marked as personal and kept out of the business figures.';
      break;
    }

    case 'set_job': {
      if (exception.subjectType === 'transaction') {
        await applyCategorisation(db, companyId, exception.subjectId, {
          jobId: resolution.jobId,
          source: 'user',
          confidence: 100,
          reason: 'Job chosen in Ask Me.',
          confirmedByUserId: userId,
        });
      } else if (exception.subjectType === 'document') {
        await db
          .update(documents)
          .set({ jobId: resolution.jobId, updatedAt: new Date() })
          .where(and(eq(documents.companyId, companyId), eq(documents.id, exception.subjectId)));
      } else {
        throw new AppError('That answer does not apply to this question.');
      }
      message = 'Put against the job.';
      break;
    }

    case 'match_transaction': {
      if (exception.subjectType !== 'document') {
        throw new AppError('That answer does not apply to this question.');
      }
      await matchDocumentToTransaction(db, companyId, exception.subjectId, resolution.transactionId, {
        source: 'user',
        confidence: 100,
        reason: 'Chosen in Ask Me.',
        userId,
      });
      message = 'Receipt filed against that payment.';
      break;
    }

    case 'match_document': {
      if (exception.subjectType !== 'transaction') {
        throw new AppError('That answer does not apply to this question.');
      }
      await matchDocumentToTransaction(db, companyId, resolution.documentId, exception.subjectId, {
        source: 'user',
        confidence: 100,
        reason: 'Chosen in Ask Me.',
        userId,
      });
      message = 'Receipt filed against that payment.';
      break;
    }

    case 'allocate_invoice': {
      if (exception.subjectType !== 'transaction') {
        throw new AppError('That answer does not apply to this question.');
      }
      const transaction = await getTransaction(db, companyId, exception.subjectId);
      const paymentId = await recordPayment(db, {
        companyId,
        direction: 'customer_receipt',
        paymentDate: transaction.transactionDate,
        amountPence: transaction.amountPence,
        reference: transaction.reference,
        transactionId: transaction.id,
        allocations: [{ invoiceId: resolution.invoiceId, amountPence: transaction.amountPence }],
        source: 'user',
        userId,
      });
      await linkTransaction(db, companyId, {
        transactionId: transaction.id,
        linkedType: 'invoice',
        linkedId: resolution.invoiceId,
        amountPence: transaction.amountPence,
        source: 'user',
        confidence: 100,
        reason: 'Chosen in Ask Me.',
      });
      await linkTransaction(db, companyId, {
        transactionId: transaction.id,
        linkedType: 'payment',
        linkedId: paymentId,
        amountPence: transaction.amountPence,
        source: 'user',
      });
      await refreshInvoiceStatus(db, companyId, resolution.invoiceId);
      message = 'Payment matched to the invoice.';
      break;
    }

    case 'no_receipt': {
      if (exception.subjectType === 'transaction') {
        await db
          .update(transactions)
          .set({ needsReceipt: false, notes: appendNote(null, 'No receipt available.'), updatedAt: new Date() })
          .where(and(eq(transactions.companyId, companyId), eq(transactions.id, exception.subjectId)));
      }
      message = 'Noted — no receipt for that one.';
      break;
    }

    case 'no_match': {
      if (exception.subjectType === 'document') {
        await db
          .update(documents)
          .set({ status: 'filed', updatedAt: new Date() })
          .where(and(eq(documents.companyId, companyId), eq(documents.id, exception.subjectId)));
      }
      message = 'Receipt kept on file. We will look again when new payments arrive.';
      break;
    }

    case 'record_cash_expense': {
      if (exception.subjectType !== 'document') {
        throw new AppError('That answer does not apply to this question.');
      }
      const document = await getDocument(db, companyId, exception.subjectId);
      if (!document.grossPence) throw new AppError('Add the amount on the receipt first.');
      const cashAccount = await ensureCashAccount(db, companyId);
      const created = await createTransaction(db, {
        companyId,
        bankAccountId: cashAccount,
        transactionDate: document.documentDate ?? formatDateForDb(document.createdAt),
        direction: 'money_out',
        amountPence: document.grossPence,
        description: `Cash: ${document.supplierNameText ?? document.originalFilename}`,
        source: 'user',
      });
      await matchDocumentToTransaction(db, companyId, exception.subjectId, created.id, {
        source: 'user',
        confidence: 100,
        reason: 'Recorded as a cash expense in Ask Me.',
        userId,
      });
      if (document.categoryId) {
        await applyCategorisation(db, companyId, created.id, {
          categoryId: document.categoryId,
          source: 'user',
          confidence: 100,
          reason: 'From the receipt.',
          confirmedByUserId: userId,
        });
      }
      message = `Recorded ${formatMoney(document.grossPence)} as a cash expense.`;
      break;
    }

    case 'wait_for_transaction': {
      message = 'We will keep looking for the payment.';
      break;
    }

    case 'not_duplicate': {
      message = 'Noted — both are real.';
      break;
    }

    case 'other_income': {
      if (exception.subjectType !== 'transaction') {
        throw new AppError('That answer does not apply to this question.');
      }
      const otherIncome = await categoryByCode(db, companyId, 'sales_other');
      await applyCategorisation(db, companyId, exception.subjectId, {
        categoryId: otherIncome?.id ?? null,
        source: 'user',
        confidence: 100,
        reason: 'Recorded as other income in Ask Me.',
        confirmedByUserId: userId,
      });
      message = 'Recorded as other income.';
      break;
    }

    case 'dismiss': {
      await markResolved(db, companyId, exceptionId, {
        action: resolution,
        note: resolution.note ?? 'Dismissed without action.',
        userId,
        status: 'dismissed',
      });
      await recordAudit(db, {
        companyId,
        action: 'exception.dismissed',
        entityType: 'exception',
        entityId: exceptionId,
        summary: `Question dismissed: "${exception.question}"`,
        actorUserId: userId,
      });
      return { message: 'Question set aside.', ruleCreated: false };
    }
  }

  await markResolved(db, companyId, exceptionId, {
    action: resolution,
    note: message,
    userId,
    createdRuleId: ruleId,
  });

  await recordAudit(db, {
    companyId,
    action: 'exception.resolved',
    entityType: 'exception',
    entityId: exceptionId,
    summary: `Answered: "${exception.question}" — ${message}`,
    metadata: { resolution, ruleCreated: Boolean(ruleId) },
    actorUserId: userId,
  });

  return { message, ruleCreated: Boolean(ruleId) };
}

async function requireCategory(db: Database, companyId: string, categoryId: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.id, categoryId)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('That category could not be found.');
  return row;
}

async function categoryByCode(db: Database, companyId: string, code: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.code, code)))
    .limit(1);
  return rows[0] ?? null;
}

/** Cash spending needs somewhere to live; create the cash account on demand. */
async function ensureCashAccount(db: Database, companyId: string): Promise<string> {
  const existing = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.accountType, 'cash')))
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(bankAccounts)
    .values({ companyId, name: 'Cash', accountType: 'cash' })
    .returning({ id: bankAccounts.id });
  if (!created) throw new AppError('Could not create a cash account.');
  return created.id;
}

function appendNote(existing: string | null, note: string): string {
  return existing ? `${existing}\n${note}` : note;
}

function titleise(value: string): string {
  return value
    .split(' ')
    .map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function formatDateForDb(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export { formatDate };
