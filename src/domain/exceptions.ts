import { and, asc, count, desc, eq, inArray, or, isNull, lte } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { exceptions } from '@/db/schema';
import { recordAudit } from './audit';

export type ExceptionType =
  | 'uncategorised_transaction'
  | 'missing_receipt'
  | 'ambiguous_receipt_match'
  | 'unmatched_receipt'
  | 'business_or_personal'
  | 'which_job'
  | 'unallocated_payment'
  | 'duplicate_suspected'
  | 'vat_treatment_unclear'
  | 'cis_details_missing'
  | 'other';

export type ExceptionCandidate = {
  id: string;
  label: string;
  sublabel?: string;
  action: Record<string, unknown>;
};

export type RaiseExceptionInput = {
  companyId: string;
  type: ExceptionType;
  subjectType: string;
  subjectId: string;
  question: string;
  detail?: string | null;
  candidates?: ExceptionCandidate[];
  /** Defaults to `${type}:${subjectId}` so the same question is never repeated. */
  dedupeKey?: string;
  priority?: number;
};

/** Lower number = asked first. Money-affecting questions come before tidying. */
export const DEFAULT_PRIORITIES: Record<ExceptionType, number> = {
  unallocated_payment: 10,
  duplicate_suspected: 15,
  uncategorised_transaction: 20,
  business_or_personal: 25,
  ambiguous_receipt_match: 30,
  which_job: 40,
  unmatched_receipt: 45,
  vat_treatment_unclear: 50,
  cis_details_missing: 55,
  missing_receipt: 60,
  other: 70,
};

/**
 * Creates an Ask Me question, or refreshes the existing open one. The dedupe
 * key guarantees the owner is never asked the same thing twice.
 */
export async function raiseException(db: Database, input: RaiseExceptionInput): Promise<string> {
  const dedupeKey = input.dedupeKey ?? `${input.type}:${input.subjectId}`;

  const existing = await db
    .select({ id: exceptions.id, status: exceptions.status })
    .from(exceptions)
    .where(and(eq(exceptions.companyId, input.companyId), eq(exceptions.dedupeKey, dedupeKey)))
    .limit(1);

  const found = existing[0];
  if (found) {
    // A resolved question stays resolved; only refresh live ones.
    if (found.status === 'open' || found.status === 'snoozed') {
      await db
        .update(exceptions)
        .set({
          question: input.question,
          detail: input.detail ?? null,
          candidates: input.candidates ?? [],
          updatedAt: new Date(),
        })
        .where(eq(exceptions.id, found.id));
    }
    return found.id;
  }

  const [row] = await db
    .insert(exceptions)
    .values({
      companyId: input.companyId,
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      question: input.question,
      detail: input.detail ?? null,
      candidates: input.candidates ?? [],
      dedupeKey,
      priority: input.priority ?? DEFAULT_PRIORITIES[input.type],
    })
    .returning({ id: exceptions.id });

  if (!row) throw new Error('Failed to create exception');
  return row.id;
}

/** Closes any open question about a record because it was answered elsewhere. */
export async function closeExceptionsFor(
  db: Database,
  companyId: string,
  subjectType: string,
  subjectId: string,
  options: { types?: ExceptionType[]; note?: string; userId?: string | null } = {},
): Promise<number> {
  const conditions = [
    eq(exceptions.companyId, companyId),
    eq(exceptions.subjectType, subjectType),
    eq(exceptions.subjectId, subjectId),
    inArray(exceptions.status, ['open', 'snoozed'] as const),
  ];
  if (options.types?.length) conditions.push(inArray(exceptions.type, options.types));

  const updated = await db
    .update(exceptions)
    .set({
      status: 'resolved',
      resolutionNote: options.note ?? 'Resolved automatically when the record was updated.',
      resolvedAt: new Date(),
      resolvedByUserId: options.userId ?? null,
      updatedAt: new Date(),
    })
    .where(and(...conditions))
    .returning({ id: exceptions.id });

  return updated.length;
}

export async function openExceptionCount(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(exceptions)
    .where(
      and(
        eq(exceptions.companyId, companyId),
        eq(exceptions.status, 'open'),
      ),
    );
  return rows[0]?.value ?? 0;
}

export async function listOpenExceptions(
  db: Database,
  companyId: string,
  options: { limit?: number; offset?: number; types?: ExceptionType[] } = {},
) {
  const now = new Date();
  const conditions = [
    eq(exceptions.companyId, companyId),
    or(
      eq(exceptions.status, 'open'),
      and(eq(exceptions.status, 'snoozed'), lte(exceptions.snoozedUntil, now)),
    )!,
  ];
  if (options.types?.length) conditions.push(inArray(exceptions.type, options.types));

  return db
    .select()
    .from(exceptions)
    .where(and(...conditions))
    .orderBy(asc(exceptions.priority), asc(exceptions.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function listResolvedExceptions(db: Database, companyId: string, limit = 30) {
  return db
    .select()
    .from(exceptions)
    .where(and(eq(exceptions.companyId, companyId), inArray(exceptions.status, ['resolved', 'dismissed'])))
    .orderBy(desc(exceptions.resolvedAt))
    .limit(limit);
}

export async function getException(db: Database, companyId: string, id: string) {
  const rows = await db
    .select()
    .from(exceptions)
    .where(and(eq(exceptions.companyId, companyId), eq(exceptions.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function snoozeException(
  db: Database,
  companyId: string,
  id: string,
  until: Date,
  userId: string,
): Promise<void> {
  await db
    .update(exceptions)
    .set({ status: 'snoozed', snoozedUntil: until, updatedAt: new Date() })
    .where(and(eq(exceptions.companyId, companyId), eq(exceptions.id, id)));

  await recordAudit(db, {
    companyId,
    action: 'exception.snoozed',
    entityType: 'exception',
    entityId: id,
    summary: `Question snoozed until ${until.toISOString().slice(0, 10)}.`,
    actorUserId: userId,
  });
}

/** Marks a question answered and records exactly what was decided. */
export async function markResolved(
  db: Database,
  companyId: string,
  id: string,
  options: {
    action: Record<string, unknown>;
    note: string;
    userId: string;
    createdRuleId?: string | null;
    status?: 'resolved' | 'dismissed';
  },
): Promise<void> {
  await db
    .update(exceptions)
    .set({
      status: options.status ?? 'resolved',
      resolutionAction: options.action,
      resolutionNote: options.note,
      resolvedByUserId: options.userId,
      resolvedAt: new Date(),
      createdRuleId: options.createdRuleId ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(exceptions.companyId, companyId), eq(exceptions.id, id)));
}

export async function countOpenByType(db: Database, companyId: string) {
  const rows = await db
    .select({ type: exceptions.type, value: count() })
    .from(exceptions)
    .where(and(eq(exceptions.companyId, companyId), eq(exceptions.status, 'open')))
    .groupBy(exceptions.type);
  return rows;
}

export { isNull };
