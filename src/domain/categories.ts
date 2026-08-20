import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { categories } from '@/db/schema';
import { ACCOUNTS } from './ledger';
import type { VatTreatment } from './vat';

export type JobCostGroup = 'materials' | 'labour' | 'other' | 'none';

export type CategorySeed = {
  code: string;
  name: string;
  kind: 'income' | 'expense' | 'both';
  description: string;
  defaultVatTreatment: VatTreatment;
  isJobCost: boolean;
  jobCostGroup: JobCostGroup;
  ledgerAccountCode: string;
  sortOrder: number;
};

/**
 * Default categories for a UK roofing business, in the owner's language.
 * These are seeded per company and can be renamed, archived or added to.
 */
export const DEFAULT_CATEGORIES: readonly CategorySeed[] = [
  // Money in
  {
    code: 'sales_roofing',
    name: 'Roofing work',
    kind: 'income',
    description: 'Money in from roofing jobs.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.SALES.code,
    sortOrder: 10,
  },
  {
    code: 'sales_other',
    name: 'Other income',
    kind: 'income',
    description: 'Anything else the business is paid for.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.SALES.code,
    sortOrder: 20,
  },
  // Job costs
  {
    code: 'materials',
    name: 'Materials',
    kind: 'expense',
    description: 'Tiles, felt, timber, lead, fixings and merchant purchases.',
    defaultVatTreatment: 'standard',
    isJobCost: true,
    jobCostGroup: 'materials',
    ledgerAccountCode: ACCOUNTS.COST_MATERIALS.code,
    sortOrder: 30,
  },
  {
    code: 'subcontractors',
    name: 'Subcontractors',
    kind: 'expense',
    description: 'Labour-only and labour-and-materials subcontractors (CIS).',
    defaultVatTreatment: 'reverse_charge',
    isJobCost: true,
    jobCostGroup: 'labour',
    ledgerAccountCode: ACCOUNTS.COST_LABOUR.code,
    sortOrder: 40,
  },
  {
    code: 'scaffolding',
    name: 'Scaffolding',
    kind: 'expense',
    description: 'Scaffold hire, erection and extensions.',
    defaultVatTreatment: 'standard',
    isJobCost: true,
    jobCostGroup: 'other',
    ledgerAccountCode: ACCOUNTS.COST_OTHER.code,
    sortOrder: 50,
  },
  {
    code: 'plant_hire',
    name: 'Plant and tool hire',
    kind: 'expense',
    description: 'Skips, hoists, cherry pickers, hired tools.',
    defaultVatTreatment: 'standard',
    isJobCost: true,
    jobCostGroup: 'other',
    ledgerAccountCode: ACCOUNTS.COST_OTHER.code,
    sortOrder: 60,
  },
  {
    code: 'waste',
    name: 'Waste and skips',
    kind: 'expense',
    description: 'Tip charges, skip hire and waste transfer.',
    defaultVatTreatment: 'standard',
    isJobCost: true,
    jobCostGroup: 'other',
    ledgerAccountCode: ACCOUNTS.COST_OTHER.code,
    sortOrder: 70,
  },
  // Running costs
  {
    code: 'fuel',
    name: 'Fuel',
    kind: 'expense',
    description: 'Diesel and petrol for the vans.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 80,
  },
  {
    code: 'vehicle',
    name: 'Vehicle costs',
    kind: 'expense',
    description: 'Servicing, repairs, tyres, MOT, parking.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 90,
  },
  {
    code: 'insurance',
    name: 'Insurance',
    kind: 'expense',
    description: 'Public liability, employers liability, van and tool cover.',
    defaultVatTreatment: 'exempt',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 100,
  },
  {
    code: 'tools',
    name: 'Tools and equipment',
    kind: 'expense',
    description: 'Purchased tools, ladders, safety equipment.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 110,
  },
  {
    code: 'workwear',
    name: 'Workwear and PPE',
    kind: 'expense',
    description: 'Boots, hi-vis, harnesses, gloves.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 120,
  },
  {
    code: 'phone_internet',
    name: 'Phone and internet',
    kind: 'expense',
    description: 'Mobile contracts and broadband.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 130,
  },
  {
    code: 'software',
    name: 'Software and subscriptions',
    kind: 'expense',
    description: 'Apps and online services the business pays for.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 140,
  },
  {
    code: 'accountancy',
    name: 'Accountancy and professional fees',
    kind: 'expense',
    description: 'Accountant, bookkeeper and other professional advice.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 150,
  },
  {
    code: 'advertising',
    name: 'Advertising and marketing',
    kind: 'expense',
    description: 'Van signage, leaflets, online listings.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 160,
  },
  {
    code: 'bank_charges',
    name: 'Bank charges',
    kind: 'expense',
    description: 'Account fees and card charges.',
    defaultVatTreatment: 'exempt',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 170,
  },
  {
    code: 'office',
    name: 'Office and admin',
    kind: 'expense',
    description: 'Stationery, postage, small office costs.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 180,
  },
  {
    code: 'wages',
    name: 'Wages',
    kind: 'expense',
    description: 'Employed staff wages and PAYE.',
    defaultVatTreatment: 'outside_scope',
    isJobCost: true,
    jobCostGroup: 'labour',
    ledgerAccountCode: ACCOUNTS.COST_LABOUR.code,
    sortOrder: 190,
  },
  {
    code: 'training',
    name: 'Training and certification',
    kind: 'expense',
    description: 'CSCS cards, working-at-height and other tickets.',
    defaultVatTreatment: 'standard',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.OVERHEADS.code,
    sortOrder: 200,
  },
  {
    code: 'personal',
    name: 'Personal / not business',
    kind: 'both',
    description: 'Money taken out or spent personally. Kept out of business figures.',
    defaultVatTreatment: 'outside_scope',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.DRAWINGS.code,
    sortOrder: 900,
  },
  {
    code: 'transfer',
    name: 'Transfer between accounts',
    kind: 'both',
    description: 'Money moved between the business own accounts.',
    defaultVatTreatment: 'outside_scope',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.BANK.code,
    sortOrder: 910,
  },
  {
    code: 'uncategorised',
    name: 'Not sorted yet',
    kind: 'both',
    description: 'Waiting for an answer before it can be categorised.',
    defaultVatTreatment: 'no_vat',
    isJobCost: false,
    jobCostGroup: 'none',
    ledgerAccountCode: ACCOUNTS.SUSPENSE.code,
    sortOrder: 999,
  },
];

export async function seedDefaultCategories(db: Database, companyId: string): Promise<void> {
  await db
    .insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((c) => ({
        companyId,
        code: c.code,
        name: c.name,
        kind: c.kind,
        description: c.description,
        defaultVatTreatment: c.defaultVatTreatment,
        isJobCost: c.isJobCost,
        jobCostGroup: c.jobCostGroup,
        ledgerAccountCode: c.ledgerAccountCode,
        sortOrder: c.sortOrder,
        isSystem: true,
      })),
    )
    .onConflictDoNothing();
}

export async function categoryMap(db: Database, companyId: string) {
  const rows = await db.select().from(categories).where(eq(categories.companyId, companyId));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return { rows, byCode, byId };
}
