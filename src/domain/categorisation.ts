import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { categories, rules, suppliers, transactions } from '@/db/schema';
import { getAi } from '@/adapters/ai';
import { normaliseDescription, similarity } from './normalise';
import type { VatTreatment } from './vat';

export type DecisionSource = 'rule' | 'history' | 'heuristic' | 'ai_suggestion' | 'user' | 'system' | 'import';

export type CategorisationInput = {
  companyId: string;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  date: string;
};

export type CategorisationResult = {
  categoryId: string | null;
  supplierId: string | null;
  jobId: string | null;
  vatTreatment: VatTreatment | null;
  isPersonal: boolean | null;
  source: DecisionSource;
  /** 0–100 */
  confidence: number;
  reason: string;
  ruleId: string | null;
};

/**
 * Confidence at or above this is applied automatically. Anything below goes
 * to the Ask Me queue instead — TradeBooks never quietly guesses.
 */
export const AUTO_APPLY_THRESHOLD = 80;

const NOT_FOUND: CategorisationResult = {
  categoryId: null,
  supplierId: null,
  jobId: null,
  vatTreatment: null,
  isPersonal: null,
  source: 'system',
  confidence: 0,
  reason: 'No rule, history or match found.',
  ruleId: null,
};

/**
 * The confidence ladder from ARCHITECTURE §7, in order:
 *   1. an exact reusable rule
 *   2. supplier history for the same counterparty
 *   3. supplier name matching
 *   4. an optional AI suggestion
 *   5. nothing — the caller raises an Ask Me question
 *
 * Steps 1–3 are deterministic and cost nothing. The AI provider is only
 * consulted when the deterministic steps have all failed.
 */
export async function categorise(
  db: Database,
  input: CategorisationInput,
  options: { allowAi?: boolean } = {},
): Promise<CategorisationResult> {
  const byRule = await matchRule(db, input);
  if (byRule) return byRule;

  const byHistory = await matchHistory(db, input);
  if (byHistory) return byHistory;

  const bySupplier = await matchSupplierName(db, input);
  if (bySupplier) return bySupplier;

  if (options.allowAi !== false) {
    const byAi = await matchAi(db, input);
    if (byAi) return byAi;
  }

  return NOT_FOUND;
}

export async function matchRule(
  db: Database,
  input: CategorisationInput,
): Promise<CategorisationResult | null> {
  const active = await db
    .select()
    .from(rules)
    .where(and(eq(rules.companyId, input.companyId), eq(rules.isActive, true)))
    .orderBy(rules.priority, desc(rules.timesApplied));

  const normalised = normaliseDescription(input.description);
  const counterparty = (input.counterparty ?? '').toLowerCase().trim();
  const reference = (input.reference ?? '').toLowerCase().trim();

  for (const rule of active) {
    if (rule.appliesToDirection !== 'any' && rule.appliesToDirection !== input.direction) continue;
    if (rule.minAmountPence !== null && input.amountPence < rule.minAmountPence) continue;
    if (rule.maxAmountPence !== null && input.amountPence > rule.maxAmountPence) continue;

    const value = rule.matchValue;
    let matched = false;
    switch (rule.matchType) {
      case 'description_contains':
        matched = normalised.includes(value);
        break;
      case 'description_equals':
        matched = normalised === value;
        break;
      case 'counterparty_equals':
        matched = counterparty === value;
        break;
      case 'reference_contains':
        matched = reference.length > 0 && reference.includes(value);
        break;
    }
    if (!matched) continue;

    return {
      categoryId: rule.setCategoryId,
      supplierId: rule.setSupplierId,
      jobId: rule.setJobId,
      vatTreatment: rule.setVatTreatment,
      isPersonal: rule.setIsPersonal,
      source: 'rule',
      confidence: 100,
      reason: `Matched your rule "${rule.name}".`,
      ruleId: rule.id,
    };
  }
  return null;
}

/**
 * Looks for previous transactions with the same normalised description that a
 * person has already confirmed, and reuses that answer.
 */
export async function matchHistory(
  db: Database,
  input: CategorisationInput,
): Promise<CategorisationResult | null> {
  const counterparty = input.counterparty ?? null;
  if (!counterparty) return null;

  const history = await db
    .select({
      categoryId: transactions.categoryId,
      supplierId: transactions.supplierId,
      vatTreatment: transactions.vatTreatment,
      isPersonal: transactions.isPersonal,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, input.companyId),
        eq(transactions.counterparty, counterparty),
        eq(transactions.direction, input.direction),
        isNotNull(transactions.categoryId),
        isNotNull(transactions.confirmedAt),
      ),
    )
    .groupBy(
      transactions.categoryId,
      transactions.supplierId,
      transactions.vatTreatment,
      transactions.isPersonal,
    )
    .orderBy(desc(sql`count(*)`))
    .limit(2);

  const best = history[0];
  if (!best || !best.categoryId) return null;

  const total = history.reduce((sum, row) => sum + row.count, 0);
  const share = total > 0 ? best.count / total : 1;
  // One confirmed example is enough to be useful, but not enough to be certain.
  const confidence = Math.min(96, Math.round(60 + share * 30 + Math.min(best.count, 5) * 2));

  return {
    categoryId: best.categoryId,
    supplierId: best.supplierId,
    jobId: null,
    vatTreatment: best.vatTreatment,
    isPersonal: best.isPersonal,
    source: 'history',
    confidence,
    reason: `You have categorised ${best.count} previous payment${best.count === 1 ? '' : 's'} from "${counterparty}" the same way.`,
    ruleId: null,
  };
}

/** Matches the description against known supplier names and their defaults. */
export async function matchSupplierName(
  db: Database,
  input: CategorisationInput,
): Promise<CategorisationResult | null> {
  if (input.direction !== 'money_out') return null;

  const known = await db
    .select({
      id: suppliers.id,
      name: suppliers.name,
      defaultCategoryId: suppliers.defaultCategoryId,
      isSubcontractor: suppliers.isSubcontractor,
    })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, input.companyId), eq(suppliers.isArchived, false)));

  const haystack = normaliseDescription(input.description);
  let best: { id: string; name: string; categoryId: string | null; score: number } | null = null;

  for (const supplier of known) {
    const key = supplier.name.toLowerCase();
    const contained = key.length >= 4 && haystack.includes(key);
    const score = contained ? 1 : similarity(haystack, supplier.name);
    if (score < 0.6) continue;
    if (!best || score > best.score) {
      best = { id: supplier.id, name: supplier.name, categoryId: supplier.defaultCategoryId, score };
    }
  }

  if (!best) return null;

  const confidence = best.score >= 1 ? 88 : Math.round(60 + best.score * 25);
  if (!best.categoryId) {
    // We know who it is but not what it is for; still worth recording.
    return {
      categoryId: null,
      supplierId: best.id,
      jobId: null,
      vatTreatment: null,
      isPersonal: null,
      source: 'heuristic',
      confidence: Math.min(confidence, 70),
      reason: `The description looks like ${best.name}, but they have no usual category yet.`,
      ruleId: null,
    };
  }

  return {
    categoryId: best.categoryId,
    supplierId: best.id,
    jobId: null,
    vatTreatment: null,
    isPersonal: null,
    source: 'heuristic',
    confidence,
    reason: `The description matches your supplier ${best.name}.`,
    ruleId: null,
  };
}

async function matchAi(db: Database, input: CategorisationInput): Promise<CategorisationResult | null> {
  const ai = getAi();
  if (!ai.available) return null;

  const [categoryRows, supplierRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, description: categories.description })
      .from(categories)
      .where(and(eq(categories.companyId, input.companyId), eq(categories.isArchived, false))),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.companyId, input.companyId), eq(suppliers.isArchived, false))),
  ]);

  const suggestion = await ai.suggestCategory({
    description: input.description,
    counterparty: input.counterparty,
    amountPence: input.amountPence,
    direction: input.direction,
    date: input.date,
    availableCategories: categoryRows,
    knownSuppliers: supplierRows,
  });

  if (!suggestion?.categoryId) return null;

  return {
    categoryId: suggestion.categoryId,
    supplierId: suggestion.supplierId,
    jobId: null,
    vatTreatment: null,
    isPersonal: null,
    source: 'ai_suggestion',
    // An AI suggestion is never treated as certain, whatever it claims.
    confidence: Math.min(suggestion.confidence, AUTO_APPLY_THRESHOLD - 1),
    reason: `Suggested by ${suggestion.provider}: ${suggestion.reason}`,
    ruleId: null,
  };
}

export function shouldAutoApply(result: CategorisationResult): boolean {
  return result.categoryId !== null && result.confidence >= AUTO_APPLY_THRESHOLD;
}
