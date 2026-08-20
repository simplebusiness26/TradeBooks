import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { rules } from '@/db/schema';
import { normaliseDescription } from './normalise';
import { recordAudit } from './audit';
import { NotFoundError } from '@/lib/errors';

export type CreateRuleInput = {
  companyId: string;
  name: string;
  matchType: 'description_contains' | 'description_equals' | 'counterparty_equals' | 'reference_contains';
  matchValue: string;
  appliesToDirection?: 'money_in' | 'money_out' | 'any';
  setCategoryId?: string | null;
  setSupplierId?: string | null;
  setJobId?: string | null;
  setVatTreatment?: string | null;
  setIsPersonal?: boolean | null;
  priority?: number;
  createdFromExceptionId?: string | null;
  userId: string;
};

/**
 * Creates a reusable rule from an answer. The match value is normalised the
 * same way transaction descriptions are, so a rule learned from one bank
 * description keeps matching when the noise around it changes.
 */
export async function createRule(db: Database, input: CreateRuleInput): Promise<string> {
  const matchValue =
    input.matchType === 'reference_contains'
      ? input.matchValue.toLowerCase().trim()
      : normaliseDescription(input.matchValue);

  if (matchValue.length < 3) {
    throw new NotFoundError('That is too short to make a reliable rule.');
  }

  const existing = await db
    .select({ id: rules.id })
    .from(rules)
    .where(
      and(
        eq(rules.companyId, input.companyId),
        eq(rules.matchType, input.matchType),
        eq(rules.matchValue, matchValue),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(rules)
      .set({
        setCategoryId: input.setCategoryId ?? null,
        setSupplierId: input.setSupplierId ?? null,
        setJobId: input.setJobId ?? null,
        setVatTreatment: (input.setVatTreatment as never) ?? null,
        setIsPersonal: input.setIsPersonal ?? null,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(rules.id, existing[0].id));
    return existing[0].id;
  }

  const [row] = await db
    .insert(rules)
    .values({
      companyId: input.companyId,
      name: input.name,
      matchType: input.matchType,
      matchValue,
      appliesToDirection: input.appliesToDirection ?? 'any',
      setCategoryId: input.setCategoryId ?? null,
      setSupplierId: input.setSupplierId ?? null,
      setJobId: input.setJobId ?? null,
      setVatTreatment: (input.setVatTreatment as never) ?? null,
      setIsPersonal: input.setIsPersonal ?? null,
      priority: input.priority ?? 100,
      createdFromExceptionId: input.createdFromExceptionId ?? null,
      source: 'user',
      createdByUserId: input.userId,
    })
    .returning({ id: rules.id });

  if (!row) throw new Error('Could not create that rule');

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'rule.created',
    entityType: 'rule',
    entityId: row.id,
    summary: `Rule "${input.name}" created — future payments matching "${matchValue}" will be sorted automatically.`,
    actorUserId: input.userId,
  });

  return row.id;
}

export async function listRules(db: Database, companyId: string) {
  return db
    .select()
    .from(rules)
    .where(eq(rules.companyId, companyId))
    .orderBy(rules.priority, rules.name);
}

export async function setRuleActive(
  db: Database,
  companyId: string,
  ruleId: string,
  isActive: boolean,
  userId: string,
): Promise<void> {
  const [row] = await db
    .update(rules)
    .set({ isActive, updatedAt: new Date() })
    .where(and(eq(rules.companyId, companyId), eq(rules.id, ruleId)))
    .returning({ name: rules.name });
  if (!row) throw new NotFoundError('That rule could not be found.');

  await recordAudit(db, {
    companyId,
    action: isActive ? 'rule.enabled' : 'rule.disabled',
    entityType: 'rule',
    entityId: ruleId,
    summary: `Rule "${row.name}" ${isActive ? 'switched on' : 'switched off'}.`,
    actorUserId: userId,
  });
}

export async function deleteRule(db: Database, companyId: string, ruleId: string, userId: string): Promise<void> {
  const [row] = await db
    .delete(rules)
    .where(and(eq(rules.companyId, companyId), eq(rules.id, ruleId)))
    .returning({ name: rules.name });
  if (!row) throw new NotFoundError('That rule could not be found.');

  await recordAudit(db, {
    companyId,
    action: 'rule.deleted',
    entityType: 'rule',
    entityId: ruleId,
    summary: `Rule "${row.name}" deleted.`,
    actorUserId: userId,
  });
}
