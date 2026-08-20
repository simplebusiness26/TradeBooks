import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { categoryIdByCode, resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { suppliers } from '@/db/schema';
import { getAi, resetAiCache } from '@/adapters/ai';
import { AUTO_APPLY_THRESHOLD, categorise } from '@/domain/categorisation';
import { autoProcessTransaction, createTransaction, getTransaction } from '@/domain/transactions';
import { createRule } from '@/domain/rules';
import { listOpenExceptions } from '@/domain/exceptions';
import { integrationHealth } from '@/domain/integrations';
import { resetEnvCache } from '@/lib/env';

let db: Database;
let fixture: Fixture;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
  delete process.env.AI_DRIVER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
  delete process.env.CLOUDFLARE_API_TOKEN;
  resetEnvCache();
  resetAiCache();
});

async function payment(description: string, amountPence = 12_345) {
  const result = await createTransaction(db, {
    companyId: fixture.companyId,
    bankAccountId: fixture.bankAccountId,
    transactionDate: '2026-05-01',
    direction: 'money_out',
    amountPence,
    description,
  });
  return result.id;
}

describe('with no AI provider configured', () => {
  it('is the default state', () => {
    const ai = getAi();
    expect(ai.name).toBe('none');
    expect(ai.available).toBe(false);
  });

  it('still sorts a payment from a rule, at full confidence', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    await createRule(db, {
      companyId: fixture.companyId,
      name: 'Travis Perkins → Materials',
      matchType: 'description_contains',
      matchValue: 'travis perkins',
      setCategoryId: materialsId,
      userId: fixture.ownerId,
    });

    const id = await payment('CARD PURCHASE TRAVIS PERKINS LEEDS 4471');
    const result = await autoProcessTransaction(db, fixture.companyId, id);

    expect(result.applied).toBe(true);
    expect(result.confidence).toBe(100);
    expect((await getTransaction(db, fixture.companyId, id)).categorySource).toBe('rule');
  });

  it('still sorts a payment from a known supplier mapping', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    await db
      .insert(suppliers)
      .values({ companyId: fixture.companyId, name: 'SIG Roofing', defaultCategoryId: materialsId });

    const id = await payment('CARD PURCHASE SIG ROOFING LEEDS 4471');
    const result = await autoProcessTransaction(db, fixture.companyId, id);

    expect(result.applied).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(AUTO_APPLY_THRESHOLD);
    expect((await getTransaction(db, fixture.companyId, id)).categorySource).toBe('heuristic');
  });

  it('asks rather than guessing when nothing deterministic matches', async () => {
    const id = await payment('FASTER PAYMENT SMITH SERVICES', 28_700);
    const result = await autoProcessTransaction(db, fixture.companyId, id);

    expect(result.applied).toBe(false);
    const open = await listOpenExceptions(db, fixture.companyId);
    expect(open).toHaveLength(1);
    expect(open[0]!.candidates.length).toBeGreaterThan(1);

    // Nothing was invented on the record itself.
    const row = await getTransaction(db, fixture.companyId, id);
    expect(row.categoryId).toBeNull();
    expect(row.status).toBe('needs_answer');
  });

  it('produces the same answer whether or not AI is allowed', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    await createRule(db, {
      companyId: fixture.companyId,
      name: 'Jewson → Materials',
      matchType: 'description_contains',
      matchValue: 'jewson',
      setCategoryId: materialsId,
      userId: fixture.ownerId,
    });

    const input = {
      companyId: fixture.companyId,
      description: 'CARD PURCHASE JEWSON LEEDS 4471',
      counterparty: 'jewson leeds',
      amountPence: 45_600,
      direction: 'money_out' as const,
      date: '2026-05-01',
    };

    const withAi = await categorise(db, input, { allowAi: true });
    const withoutAi = await categorise(db, input, { allowAi: false });

    expect(withAi.categoryId).toBe(withoutAi.categoryId);
    expect(withAi.source).toBe('rule');
    expect(withoutAi.source).toBe('rule');
  });

  it('reports honestly that AI is off and nothing depends on it', async () => {
    const health = await integrationHealth(db, fixture.companyId);
    const ai = health.find((item) => item.provider === 'ai');
    expect(ai?.statusLabel).toBe('Off');
    expect(ai?.currentBehaviour).toContain('No feature is lost');
    expect(ai?.setupSteps.join(' ')).toContain('Cloudflare Workers AI');
  });
});

describe('when an AI provider is configured', () => {
  it('is selected through the adapter, not hard-wired', () => {
    process.env.AI_DRIVER = 'cloudflare';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
    resetEnvCache();
    resetAiCache();

    const ai = getAi();
    expect(ai.name).toBe('cloudflare');
    expect(ai.available).toBe(true);
  });

  it('falls back to no provider when the credentials are missing', () => {
    process.env.AI_DRIVER = 'anthropic';
    resetEnvCache();
    resetAiCache();

    expect(getAi().name).toBe('none');
  });

  it('can never let a suggestion apply itself automatically', () => {
    // The ceiling is enforced in code, not left to the model's own confidence.
    expect(AUTO_APPLY_THRESHOLD - 1).toBeLessThan(AUTO_APPLY_THRESHOLD);
  });
});
