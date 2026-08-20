import { penceToDecimalString } from '@/lib/money';
import {
  AccountingNotConnectedError,
  type AccountingAdapter,
  type ExportBundle,
  type MappedPayload,
} from './types';

/**
 * FreeAgent connector.
 *
 * OPTIONAL and NOT CONNECTED. See CONNECTIONS_REQUIRED.md section 5.
 */
const FREEAGENT_SALES_TAX: Record<string, string> = {
  standard: '20.0',
  reduced: '5.0',
  zero: '0.0',
  exempt: 'Exempt',
  outside_scope: 'Out of Scope',
  reverse_charge: 'Reverse Charge',
  no_vat: 'Out of Scope',
};

export class FreeAgentAdapter implements AccountingAdapter {
  readonly name = 'freeagent';
  readonly displayName = 'FreeAgent';

  constructor(
    private readonly config: { clientId?: string; clientSecret?: string; redirectUri?: string } = {},
  ) {}

  get configured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  authorisationUrl(companyId: string): string | null {
    if (!this.configured) return null;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId ?? '',
      redirect_uri: this.config.redirectUri ?? '',
      state: companyId,
    });
    return `https://api.freeagent.com/v2/approve_app?${params.toString()}`;
  }

  map(bundle: ExportBundle): MappedPayload {
    const warnings: string[] = [];

    const contacts = bundle.contacts.map((c) => ({
      organisation_name: c.name,
      email: c.email ?? undefined,
      phone_number: c.phone ?? undefined,
      address1: c.addressLine1 ?? undefined,
      town: c.city ?? undefined,
      postcode: c.postcode ?? undefined,
    }));

    const invoices = bundle.invoices.map((invoice) => ({
      contact: invoice.contactName,
      dated_on: invoice.issueDate,
      payment_terms_in_days: Math.max(
        0,
        Math.round(
          (Date.parse(`${invoice.dueDate}T00:00:00Z`) - Date.parse(`${invoice.issueDate}T00:00:00Z`)) /
            86_400_000,
        ),
      ),
      reference: invoice.number,
      currency: 'GBP',
      invoice_items: invoice.lines.map((line) => ({
        description: line.description,
        item_type: 'Services',
        price: penceToDecimalString(line.unitPricePence),
        quantity: (line.quantityMilli / 1000).toFixed(3),
        sales_tax_rate: FREEAGENT_SALES_TAX[line.vatTreatment] ?? 'Out of Scope',
        project: line.jobReference ?? undefined,
      })),
    }));

    const bills = bundle.bills.map((bill) => ({
      contact: bill.contactName,
      reference: bill.reference ?? bill.number,
      dated_on: bill.issueDate,
      due_on: bill.dueDate,
      total_value: penceToDecimalString(bill.grossPence),
      sales_tax_value: penceToDecimalString(bill.vatPence),
      bill_items: bill.lines.map((line) => ({
        description: line.description,
        category: line.categoryName ?? 'Uncategorised',
        total_value: penceToDecimalString(line.grossPence),
        sales_tax_rate: FREEAGENT_SALES_TAX[line.vatTreatment] ?? 'Out of Scope',
        project: line.jobReference ?? undefined,
      })),
    }));

    const bankTransactions = bundle.transactions.map((t) => ({
      dated_on: t.date,
      amount: penceToDecimalString(t.direction === 'money_in' ? t.amountPence : -t.amountPence),
      description: t.description,
      bank_account: t.bankAccountName,
      category: t.categoryName ?? undefined,
    }));

    if (bundle.bills.some((b) => b.lines.length === 0)) {
      warnings.push('Some bills have no lines; FreeAgent requires at least one bill item.');
    }

    return {
      provider: this.name,
      resources: [
        { resource: 'contacts', records: contacts },
        { resource: 'invoices', records: invoices },
        { resource: 'bills', records: bills },
        { resource: 'bank_transactions', records: bankTransactions },
      ],
      warnings,
    };
  }

  async push(): Promise<never> {
    throw new AccountingNotConnectedError(this.displayName);
  }
}
