import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { categoryIdByCode, resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { exceptions, suppliers, transactions } from '@/db/schema';
import {
  applyCategorisation,
  autoProcessTransaction,
  createTransaction,
  dedupeHashFor,
  getTransaction,
} from '@/domain/transactions';
import { AUTO_APPLY_THRESHOLD, categorise } from '@/domain/categorisation';
import { createRule } from '@/domain/rules';
import { deriveCounterparty, namesMatch, normaliseDescription, similarity } from '@/domain/normalise';
import { resolveException } from '@/domain/ask-me';
import { listOpenExceptions } from '@/domain/exceptions';

let db: Database;
let fixture: Fixture;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
});

async function addTransaction(description: string, amountPence = 12_345, date = '2026-05-01') {
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

describe('description normalisation', () => {
  it('strips card numbers, dates and payment prefixes', () => {
    expect(normaliseDescription('CARD PURCHASE TRAVIS PERKINS LEEDS 4471')).toBe('travis perkins leeds');
    expect(normaliseDescription('FASTER PAYMENT M DOYLE ROOFING SERVICES')).toBe('m doyle roofing services');
    expect(normaliseDescription('DIRECT DEBIT VODAFONE BUSINESS')).toBe('vodafone business');
  });

  it('produces the same key for the same merchant across statements', () => {
    const a = normaliseDescription('CARD PURCHASE SIG ROOFING LEEDS 4471 ON 04 MAY');
    const b = normaliseDescription('CARD PAYMENT TO SIG ROOFING LEEDS 8802');
    expect(deriveCounterparty(a)).toBe(deriveCounterparty(b));
  });

  it('matches business names regardless of suffix and punctuation', () => {
    expect(namesMatch('Travis Perkins Ltd', 'TRAVIS PERKINS')).toBe(true);
    expect(namesMatch('K & S Leadwork', 'K and S Leadwork')).toBe(true);
    expect(namesMatch('SIG Roofing', 'Burton Roofing')).toBe(false);
    expect(similarity('sig roofing leeds', 'SIG Roofing')).toBeGreaterThan(0.5);
  });
});

describe('import de-duplication', () => {
  it('gives the same hash to the same statement line', () => {
    const base = {
      bankAccountId: fixture?.bankAccountId ?? 'a',
      transactionDate: '2026-05-01',
      amountPence: 1000,
      direction: 'money_out' as const,
      description: 'CARD PURCHASE SHELL 4471',
    };
    expect(dedupeHashFor(base)).toBe(dedupeHashFor({ ...base, description: 'CARD PURCHASE SHELL 8802' }));
    expect(dedupeHashFor(base)).not.toBe(dedupeHashFor({ ...base, amountPence: 1001 }));
    expect(dedupeHashFor(base)).not.toBe(dedupeHashFor({ ...base, occurrence: 1 }));
  });

  it('does not create the same transaction twice', async () => {
    const first = await addTransaction('CARD PURCHASE SHELL 4471', 5_000);
    const second = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-01',
      direction: 'money_out',
      amountPence: 5_000,
      description: 'CARD PURCHASE SHELL 4471',
    });
    expect(second.created).toBe(false);
    expect(second.id).toBe(first);
  });
});

describe('the confidence ladder', () => {
  it('applies a rule with full confidence and does not ask', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    await createRule(db, {
      companyId: fixture.companyId,
      name: 'Travis Perkins → Materials',
      matchType: 'description_contains',
      matchValue: 'travis perkins',
      setCategoryId: materialsId,
      userId: fixture.ownerId,
    });

    const id = await addTransaction('CARD PURCHASE TRAVIS PERKINS LEEDS 4471');
    const result = await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });

    expect(result.applied).toBe(true);
    expect(result.confidence).toBe(100);
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.categoryId).toBe(materialsId);
    expect(row.categorySource).toBe('rule');
    expect(await listOpenExceptions(db, fixture.companyId)).toHaveLength(0);
  });

  it('uses a known supplier default before asking', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    await db.insert(suppliers).values({
      companyId: fixture.companyId,
      name: 'SIG Roofing',
      defaultCategoryId: materialsId,
    });

    const id = await addTransaction('CARD PURCHASE SIG ROOFING LEEDS 4471');
    const result = await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });

    expect(result.applied).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(AUTO_APPLY_THRESHOLD);
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.categorySource).toBe('heuristic');
    expect(row.supplierId).not.toBeNull();
  });

  it('reuses a confirmed answer for the same counterparty', async () => {
    const fuelId = await categoryIdByCode(db, fixture.companyId, 'fuel');
    const first = await addTransaction('CARD PURCHASE ESSO WETHERBY 4471', 9_000, '2026-05-01');
    await applyCategorisation(db, fixture.companyId, first, {
      categoryId: fuelId,
      source: 'user',
      confirmedByUserId: fixture.ownerId,
    });

    const second = await addTransaction('CARD PURCHASE ESSO WETHERBY 8802', 11_000, '2026-05-09');
    const decision = await categorise(
      db,
      {
        companyId: fixture.companyId,
        description: 'CARD PURCHASE ESSO WETHERBY 8802',
        counterparty: deriveCounterparty('CARD PURCHASE ESSO WETHERBY 8802'),
        amountPence: 11_000,
        direction: 'money_out',
        date: '2026-05-09',
      },
      { allowAi: false },
    );

    expect(decision.source).toBe('history');
    expect(decision.categoryId).toBe(fuelId);
    expect(second).toBeTruthy();
  });

  it('asks a plain-English question when nothing matches', async () => {
    const id = await addTransaction('FASTER PAYMENT SMITH SERVICES', 28_700);
    const result = await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });

    expect(result.applied).toBe(false);
    const open = await listOpenExceptions(db, fixture.companyId);
    expect(open).toHaveLength(1);
    expect(open[0]!.question).toContain('£287.00');
    expect(open[0]!.type).toBe('uncategorised_transaction');
    expect(open[0]!.candidates.length).toBeGreaterThan(1);
  });

  it('does not ask the same question twice', async () => {
    const id = await addTransaction('FASTER PAYMENT SMITH SERVICES', 28_700);
    await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    const open = await db.select().from(exceptions).where(eq(exceptions.companyId, fixture.companyId));
    expect(open).toHaveLength(1);
  });

  it('never re-categorises something a person has confirmed', async () => {
    const fuelId = await categoryIdByCode(db, fixture.companyId, 'fuel');
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const id = await addTransaction('CARD PURCHASE TRAVIS PERKINS 4471');
    await applyCategorisation(db, fixture.companyId, id, {
      categoryId: fuelId,
      source: 'user',
      confirmedByUserId: fixture.ownerId,
    });
    await createRule(db, {
      companyId: fixture.companyId,
      name: 'Travis Perkins → Materials',
      matchType: 'description_contains',
      matchValue: 'travis perkins',
      setCategoryId: materialsId,
      userId: fixture.ownerId,
    });

    const result = await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    expect(result.applied).toBe(false);
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.categoryId).toBe(fuelId);
  });
});

describe('answering a question', () => {
  it('sorts the payment, creates a reusable rule and closes the question', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const id = await addTransaction('CARD PURCHASE JEWSON LEEDS 4471', 45_600);
    await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    const [question] = await listOpenExceptions(db, fixture.companyId);

    const result = await resolveException(
      db,
      fixture.companyId,
      question!.id,
      { kind: 'set_category', categoryId: materialsId, createRule: true },
      fixture.ownerId,
    );

    expect(result.ruleCreated).toBe(true);
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.categoryId).toBe(materialsId);
    expect(row.confirmedAt).not.toBeNull();
    expect(await listOpenExceptions(db, fixture.companyId)).toHaveLength(0);

    // The next Jewson purchase sorts itself.
    const next = await addTransaction('CARD PURCHASE JEWSON LEEDS 8802', 12_300, '2026-06-01');
    const auto = await autoProcessTransaction(db, fixture.companyId, next, { allowAi: false });
    expect(auto.applied).toBe(true);
    expect(auto.confidence).toBe(100);
  });

  it('keeps personal spending out of the business figures', async () => {
    const id = await addTransaction('FASTER PAYMENT J WHITAKER', 120_000);
    await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    const [question] = await listOpenExceptions(db, fixture.companyId);

    await resolveException(db, fixture.companyId, question!.id, { kind: 'mark_personal' }, fixture.ownerId);

    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.isPersonal).toBe(true);
    expect(row.vatPence).toBe(0);
  });

  it('will not let one company answer another company question', async () => {
    const id = await addTransaction('FASTER PAYMENT SMITH SERVICES', 28_700);
    await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    const [question] = await listOpenExceptions(db, fixture.companyId);
    const materialsId = await categoryIdByCode(db, fixture.otherCompanyId, 'materials');

    await expect(
      resolveException(
        db,
        fixture.otherCompanyId,
        question!.id,
        { kind: 'set_category', categoryId: materialsId },
        fixture.otherOwnerId,
      ),
    ).rejects.toThrow();
  });
});

describe('VAT on transactions', () => {
  it('splits the gross amount so net plus VAT equals the payment', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const id = await addTransaction('CARD PURCHASE TRAVIS PERKINS 4471', 148_620);
    await applyCategorisation(db, fixture.companyId, id, { categoryId: materialsId, source: 'user' });
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.netPence! + row.vatPence!).toBe(148_620);
    expect(row.vatPence).toBe(24_770);
  });

  it('records no VAT on an exempt category', async () => {
    const insuranceId = await categoryIdByCode(db, fixture.companyId, 'insurance');
    const id = await addTransaction('DIRECT DEBIT TRADE DIRECT INSURANCE', 142_800);
    await applyCategorisation(db, fixture.companyId, id, { categoryId: insuranceId, source: 'user' });
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.vatPence).toBe(0);
    expect(row.netPence).toBe(142_800);
    expect(row.vatTreatment).toBe('exempt');
  });
});

describe('rules stay inside their company', () => {
  it('does not apply another company rule', async () => {
    const otherMaterials = await categoryIdByCode(db, fixture.otherCompanyId, 'materials');
    await createRule(db, {
      companyId: fixture.otherCompanyId,
      name: 'Rival rule',
      matchType: 'description_contains',
      matchValue: 'travis perkins',
      setCategoryId: otherMaterials,
      userId: fixture.otherOwnerId,
    });

    const id = await addTransaction('CARD PURCHASE TRAVIS PERKINS LEEDS 4471');
    const result = await autoProcessTransaction(db, fixture.companyId, id, { allowAi: false });
    expect(result.applied).toBe(false);

    const row = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.companyId, fixture.companyId)))
      .limit(1);
    expect(row[0]!.categoryId).toBeNull();
  });
});
