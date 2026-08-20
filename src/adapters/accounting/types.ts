import type { IsoDate } from '@/lib/dates';

/**
 * The canonical shapes handed to an accounting connector. These are
 * TradeBooks' own models — provider-specific field names and tax codes only
 * ever appear inside an adapter.
 */
export type CanonicalContact = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  postcode?: string | null;
  kind: 'customer' | 'supplier';
};

export type CanonicalLine = {
  description: string;
  quantityMilli: number;
  unitPricePence: number;
  netPence: number;
  vatPence: number;
  grossPence: number;
  vatTreatment: string;
  vatRateBasisPoints: number;
  categoryName?: string | null;
  categoryCode?: string | null;
  ledgerAccountCode?: string | null;
  jobReference?: string | null;
};

export type CanonicalInvoice = {
  id: string;
  number: string;
  contactName: string;
  contactId: string;
  issueDate: IsoDate;
  dueDate: IsoDate;
  reference?: string | null;
  status: string;
  netPence: number;
  vatPence: number;
  grossPence: number;
  paidPence: number;
  lines: CanonicalLine[];
};

export type CanonicalBill = CanonicalInvoice & { supplierId: string };

export type CanonicalTransaction = {
  id: string;
  date: IsoDate;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  description: string;
  categoryName?: string | null;
  categoryCode?: string | null;
  ledgerAccountCode?: string | null;
  vatTreatment: string;
  netPence?: number | null;
  vatPence?: number | null;
  bankAccountName: string;
  jobReference?: string | null;
};

export type ExportBundle = {
  companyName: string;
  generatedAt: string;
  periodStart?: IsoDate;
  periodEnd?: IsoDate;
  contacts: CanonicalContact[];
  invoices: CanonicalInvoice[];
  bills: CanonicalBill[];
  transactions: CanonicalTransaction[];
};

export type MappedPayload = {
  provider: string;
  /** One entry per provider endpoint, e.g. "Contacts", "Invoices". */
  resources: { resource: string; records: Record<string, unknown>[] }[];
  warnings: string[];
};

export interface AccountingAdapter {
  readonly name: string;
  readonly displayName: string;
  /** True only when real credentials are present. */
  readonly configured: boolean;
  /** Where the owner authorises the connection, or null when unavailable. */
  authorisationUrl(companyId: string): string | null;
  /** Pure mapping from canonical records to the provider's shapes. */
  map(bundle: ExportBundle): MappedPayload;
  /** Pushes mapped records. Throws until real credentials are connected. */
  push(payload: MappedPayload): Promise<never>;
}

export class AccountingNotConnectedError extends Error {
  constructor(displayName: string) {
    super(
      `${displayName} is not connected. TradeBooks holds the canonical records; use the export instead, or connect ${displayName} following CONNECTIONS_REQUIRED.md section 5.`,
    );
    this.name = 'AccountingNotConnectedError';
  }
}
