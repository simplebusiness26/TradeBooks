import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { categories, customers, suppliers } from '@/db/schema';
import { parseCsv, pickColumn } from '@/lib/csv';
import { parseMoneyInput } from '@/lib/money';
import { ValidationError } from '@/lib/errors';
import { recordAudit } from './audit';
import { CIS_RATES } from './bills';

export type ContactImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const NAME_COLUMNS = ['name', 'customername', 'suppliername', 'company', 'organisation', 'business'];
const CONTACT_COLUMNS = ['contact', 'contactname', 'person'];
const EMAIL_COLUMNS = ['email', 'emailaddress'];
const PHONE_COLUMNS = ['phone', 'telephone', 'mobile', 'phonenumber'];
const ADDRESS_COLUMNS = ['address', 'addressline1', 'address1', 'street'];
const CITY_COLUMNS = ['city', 'town'];
const POSTCODE_COLUMNS = ['postcode', 'postalcode', 'zip'];
const TERMS_COLUMNS = ['paymentterms', 'terms', 'paymenttermsdays', 'days'];
const VAT_COLUMNS = ['vatnumber', 'vatno', 'vatregistration'];
const UTR_COLUMNS = ['utr', 'taxreference', 'uniquetaxpayerreference'];
const CIS_COLUMNS = ['cisstatus', 'cis', 'deductionrate'];

/**
 * Imports a list of customers from CSV so a business can bring its existing
 * contacts across without retyping them. Matching is by name: an existing
 * record is updated rather than duplicated.
 */
export async function importCustomersCsv(
  db: Database,
  companyId: string,
  content: string,
  userId: string,
): Promise<ContactImportResult> {
  const { headers, rows } = parseCsv(content);
  const nameColumn = pickColumn(headers, NAME_COLUMNS);
  if (!nameColumn) {
    throw new ValidationError(
      `Could not find a name column. Columns found: ${headers.join(', ') || '(none)'}.`,
    );
  }

  const result: ContactImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const columns = {
    contact: pickColumn(headers, CONTACT_COLUMNS),
    email: pickColumn(headers, EMAIL_COLUMNS),
    phone: pickColumn(headers, PHONE_COLUMNS),
    address: pickColumn(headers, ADDRESS_COLUMNS),
    city: pickColumn(headers, CITY_COLUMNS),
    postcode: pickColumn(headers, POSTCODE_COLUMNS),
    terms: pickColumn(headers, TERMS_COLUMNS),
  };

  for (const [index, row] of rows.entries()) {
    const name = (row[nameColumn] ?? '').trim();
    if (!name) {
      result.skipped += 1;
      continue;
    }

    const values = {
      contactName: pick(row, columns.contact),
      email: pick(row, columns.email),
      phone: pick(row, columns.phone),
      addressLine1: pick(row, columns.address),
      city: pick(row, columns.city),
      postcode: pick(row, columns.postcode),
      paymentTermsDays: parseDays(pick(row, columns.terms)) ?? 14,
    };

    try {
      const existing = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.companyId, companyId), eq(customers.name, name)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(customers)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(customers.id, existing[0].id));
        result.updated += 1;
      } else {
        await db.insert(customers).values({ companyId, name, ...values });
        result.created += 1;
      }
    } catch (error) {
      result.errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : 'Could not import this row.',
      });
    }
  }

  await recordAudit(db, {
    companyId,
    action: 'import.customers',
    entityType: 'customer',
    summary: `Imported customers from CSV: ${result.created} added, ${result.updated} updated, ${result.errors.length} could not be read.`,
    source: 'import',
    actorUserId: userId,
  });

  return result;
}

/** The same for suppliers, including subcontractor and CIS columns. */
export async function importSuppliersCsv(
  db: Database,
  companyId: string,
  content: string,
  userId: string,
): Promise<ContactImportResult> {
  const { headers, rows } = parseCsv(content);
  const nameColumn = pickColumn(headers, NAME_COLUMNS);
  if (!nameColumn) {
    throw new ValidationError(
      `Could not find a name column. Columns found: ${headers.join(', ') || '(none)'}.`,
    );
  }

  const categoryRows = await db
    .select({ id: categories.id, name: categories.name, code: categories.code })
    .from(categories)
    .where(eq(categories.companyId, companyId));
  const categoryByName = new Map(categoryRows.map((c) => [c.name.toLowerCase(), c.id]));
  const categoryByCode = new Map(categoryRows.map((c) => [c.code.toLowerCase(), c.id]));

  const columns = {
    contact: pickColumn(headers, CONTACT_COLUMNS),
    email: pickColumn(headers, EMAIL_COLUMNS),
    phone: pickColumn(headers, PHONE_COLUMNS),
    address: pickColumn(headers, ADDRESS_COLUMNS),
    city: pickColumn(headers, CITY_COLUMNS),
    postcode: pickColumn(headers, POSTCODE_COLUMNS),
    vat: pickColumn(headers, VAT_COLUMNS),
    utr: pickColumn(headers, UTR_COLUMNS),
    cis: pickColumn(headers, CIS_COLUMNS),
    category: pickColumn(headers, ['category', 'defaultcategory', 'type']),
  };

  const result: ContactImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const [index, row] of rows.entries()) {
    const name = (row[nameColumn] ?? '').trim();
    if (!name) {
      result.skipped += 1;
      continue;
    }

    const utr = pick(row, columns.utr);
    const cisStatus = parseCisStatus(pick(row, columns.cis));
    const isSubcontractor = Boolean(utr) || cisStatus !== null;
    const categoryText = (pick(row, columns.category) ?? '').toLowerCase();

    const values = {
      kind: (isSubcontractor ? 'subcontractor' : 'supplier') as 'subcontractor' | 'supplier',
      contactName: pick(row, columns.contact),
      email: pick(row, columns.email),
      phone: pick(row, columns.phone),
      addressLine1: pick(row, columns.address),
      city: pick(row, columns.city),
      postcode: pick(row, columns.postcode),
      vatNumber: pick(row, columns.vat),
      utr,
      isSubcontractor,
      cisStatus: (cisStatus ?? 'unknown') as 'unknown' | 'gross' | 'net_20' | 'net_30',
      defaultCategoryId: categoryByName.get(categoryText) ?? categoryByCode.get(categoryText) ?? null,
    };

    try {
      const existing = await db
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(and(eq(suppliers.companyId, companyId), eq(suppliers.name, name)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(suppliers)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(suppliers.id, existing[0].id));
        result.updated += 1;
      } else {
        await db.insert(suppliers).values({ companyId, name, ...values });
        result.created += 1;
      }
    } catch (error) {
      result.errors.push({
        row: index + 2,
        message: error instanceof Error ? error.message : 'Could not import this row.',
      });
    }
  }

  await recordAudit(db, {
    companyId,
    action: 'import.suppliers',
    entityType: 'supplier',
    summary: `Imported suppliers from CSV: ${result.created} added, ${result.updated} updated, ${result.errors.length} could not be read.`,
    source: 'import',
    actorUserId: userId,
  });

  return result;
}

function pick(row: Record<string, string>, column: string | null): string | null {
  if (!column) return null;
  const value = (row[column] ?? '').trim();
  return value === '' ? null : value;
}

function parseDays(value: string | null): number | null {
  if (!value) return null;
  const digits = /(\d{1,3})/.exec(value);
  if (!digits?.[1]) return null;
  const days = Number(digits[1]);
  return days >= 0 && days <= 180 ? days : null;
}

/** Accepts "20%", "net 20", "gross", "30" and the internal codes. */
function parseCisStatus(value: string | null): 'unknown' | 'gross' | 'net_20' | 'net_30' | null {
  if (!value) return null;
  const text = value.toLowerCase().trim();
  if (text in CIS_RATES) return text as 'gross' | 'net_20' | 'net_30' | 'unknown';
  if (text.includes('gross') || text === '0' || text === '0%') return 'gross';
  if (text.includes('30')) return 'net_30';
  if (text.includes('20')) return 'net_20';
  if (text.includes('unverified') || text.includes('not verified')) return 'unknown';
  return null;
}

export function parseMoneyOrNull(value: string | null): number | null {
  if (!value) return null;
  try {
    return parseMoneyInput(value);
  } catch {
    return null;
  }
}
