import { penceToDecimalString } from '@/lib/money';
import {
  AccountingNotConnectedError,
  type AccountingAdapter,
  type ExportBundle,
  type MappedPayload,
} from './types';

/**
 * QuickBooks Online connector.
 *
 * OPTIONAL and NOT CONNECTED. See CONNECTIONS_REQUIRED.md section 5.
 */
const QBO_TAX_CODES: Record<string, string> = {
  standard: '20.0% S',
  reduced: '5.0% R',
  zero: '0.0% Z',
  exempt: 'Exempt',
  outside_scope: 'NoVAT',
  reverse_charge: '20.0% RC SG',
  no_vat: 'NoVAT',
};

export class QuickBooksAdapter implements AccountingAdapter {
  readonly name = 'quickbooks';
  readonly displayName = 'QuickBooks Online';

  constructor(
    private readonly config: { clientId?: string; clientSecret?: string; redirectUri?: string } = {},
  ) {}

  get configured(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  authorisationUrl(companyId: string): string | null {
    if (!this.configured) return null;
    const params = new URLSearchParams({
      client_id: this.config.clientId ?? '',
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: this.config.redirectUri ?? '',
      state: companyId,
    });
    return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
  }

  map(bundle: ExportBundle): MappedPayload {
    const warnings: string[] = [];

    const customers = bundle.contacts
      .filter((c) => c.kind === 'customer')
      .map((c) => ({
        DisplayName: c.name,
        PrimaryEmailAddr: c.email ? { Address: c.email } : undefined,
        PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
        BillAddr: c.addressLine1
          ? { Line1: c.addressLine1, City: c.city ?? undefined, PostalCode: c.postcode ?? undefined }
          : undefined,
      }));

    const vendors = bundle.contacts
      .filter((c) => c.kind === 'supplier')
      .map((c) => ({
        DisplayName: c.name,
        PrimaryEmailAddr: c.email ? { Address: c.email } : undefined,
      }));

    const invoices = bundle.invoices.map((invoice) => ({
      DocNumber: invoice.number,
      TxnDate: invoice.issueDate,
      DueDate: invoice.dueDate,
      CustomerRef: { name: invoice.contactName },
      Line: invoice.lines.map((line, index) => ({
        LineNum: index + 1,
        Description: line.description,
        Amount: Number(penceToDecimalString(line.netPence)),
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          Qty: line.quantityMilli / 1000,
          UnitPrice: Number(penceToDecimalString(line.unitPricePence)),
          TaxCodeRef: { value: QBO_TAX_CODES[line.vatTreatment] ?? 'NoVAT' },
          ClassRef: line.jobReference ? { name: line.jobReference } : undefined,
        },
      })),
      TotalAmt: Number(penceToDecimalString(invoice.grossPence)),
    }));

    const purchases = bundle.bills.map((bill) => ({
      DocNumber: bill.number,
      TxnDate: bill.issueDate,
      DueDate: bill.dueDate,
      VendorRef: { name: bill.contactName },
      Line: bill.lines.map((line, index) => ({
        LineNum: index + 1,
        Description: line.description,
        Amount: Number(penceToDecimalString(line.netPence)),
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { name: line.categoryName ?? 'Uncategorised Expense' },
          TaxCodeRef: { value: QBO_TAX_CODES[line.vatTreatment] ?? 'NoVAT' },
          ClassRef: line.jobReference ? { name: line.jobReference } : undefined,
        },
      })),
      TotalAmt: Number(penceToDecimalString(bill.grossPence)),
    }));

    if (bundle.transactions.some((t) => !t.categoryCode)) {
      warnings.push('Some transactions have no category and were exported to an uncategorised account.');
    }

    return {
      provider: this.name,
      resources: [
        { resource: 'Customer', records: customers },
        { resource: 'Vendor', records: vendors },
        { resource: 'Invoice', records: invoices },
        { resource: 'Bill', records: purchases },
      ],
      warnings,
    };
  }

  async push(): Promise<never> {
    throw new AccountingNotConnectedError(this.displayName);
  }
}
