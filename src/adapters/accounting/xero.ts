import { penceToDecimalString } from '@/lib/money';
import {
  AccountingNotConnectedError,
  type AccountingAdapter,
  type ExportBundle,
  type MappedPayload,
} from './types';

/**
 * Xero connector.
 *
 * OPTIONAL. TradeBooks never depends on Xero. The mapping below is real and
 * unit-tested so that connecting Xero later is a credentials-and-transport
 * task only. `push` refuses until OAuth credentials exist.
 * See CONNECTIONS_REQUIRED.md section 5.
 */
const XERO_TAX_TYPES: Record<string, { sales: string; purchases: string }> = {
  standard: { sales: 'OUTPUT2', purchases: 'INPUT2' },
  reduced: { sales: 'SROUTPUT2', purchases: 'SRINPUT2' },
  zero: { sales: 'ZERORATEDOUTPUT', purchases: 'ZERORATEDINPUT' },
  exempt: { sales: 'EXEMPTOUTPUT', purchases: 'EXEMPTINPUT' },
  outside_scope: { sales: 'NONE', purchases: 'NONE' },
  reverse_charge: { sales: 'REVERSECHARGES', purchases: 'REVERSECHARGES' },
  no_vat: { sales: 'NONE', purchases: 'NONE' },
};

export class XeroAdapter implements AccountingAdapter {
  readonly name = 'xero';
  readonly displayName = 'Xero';

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
      scope: 'offline_access accounting.transactions accounting.contacts accounting.settings',
      state: companyId,
    });
    return `https://login.xero.com/identity/connect/authorize?${params.toString()}`;
  }

  map(bundle: ExportBundle): MappedPayload {
    const warnings: string[] = [];

    const contacts = bundle.contacts.map((contact) => ({
      Name: contact.name,
      EmailAddress: contact.email ?? undefined,
      IsCustomer: contact.kind === 'customer',
      IsSupplier: contact.kind === 'supplier',
      Addresses: contact.addressLine1
        ? [
            {
              AddressType: 'STREET',
              AddressLine1: contact.addressLine1,
              City: contact.city ?? undefined,
              PostalCode: contact.postcode ?? undefined,
            },
          ]
        : undefined,
      /** TradeBooks id travels as a mapping, never as Xero's identity. */
      ContactNumber: contact.id,
    }));

    const invoices = [
      ...bundle.invoices.map((invoice) => this.mapInvoice(invoice, 'ACCREC', warnings)),
      ...bundle.bills.map((bill) => this.mapInvoice(bill, 'ACCPAY', warnings)),
    ];

    const bankTransactions = bundle.transactions
      .filter((t) => !t.categoryCode || t.categoryCode !== 'transfer')
      .map((transaction) => ({
        Type: transaction.direction === 'money_in' ? 'RECEIVE' : 'SPEND',
        Date: transaction.date,
        Reference: transaction.description.slice(0, 255),
        LineAmountTypes: 'Inclusive',
        BankAccount: { Name: transaction.bankAccountName },
        LineItems: [
          {
            Description: transaction.description.slice(0, 255),
            UnitAmount: penceToDecimalString(transaction.amountPence),
            AccountCode: transaction.ledgerAccountCode ?? undefined,
            TaxType:
              XERO_TAX_TYPES[transaction.vatTreatment]?.[
                transaction.direction === 'money_in' ? 'sales' : 'purchases'
              ] ?? 'NONE',
            Tracking: transaction.jobReference
              ? [{ Name: 'Job', Option: transaction.jobReference }]
              : undefined,
          },
        ],
        ExternalId: transaction.id,
      }));

    return {
      provider: this.name,
      resources: [
        { resource: 'Contacts', records: contacts },
        { resource: 'Invoices', records: invoices },
        { resource: 'BankTransactions', records: bankTransactions },
      ],
      warnings,
    };
  }

  private mapInvoice(
    invoice: ExportBundle['invoices'][number],
    type: 'ACCREC' | 'ACCPAY',
    warnings: string[],
  ): Record<string, unknown> {
    const direction = type === 'ACCREC' ? 'sales' : 'purchases';
    return {
      Type: type,
      InvoiceNumber: invoice.number,
      Reference: invoice.reference ?? undefined,
      Contact: { Name: invoice.contactName },
      Date: invoice.issueDate,
      DueDate: invoice.dueDate,
      Status: mapStatus(invoice.status, warnings, invoice.number),
      LineAmountTypes: 'Exclusive',
      LineItems: invoice.lines.map((line) => ({
        Description: line.description.slice(0, 4000),
        Quantity: (line.quantityMilli / 1000).toFixed(3),
        UnitAmount: penceToDecimalString(line.unitPricePence),
        LineAmount: penceToDecimalString(line.netPence),
        TaxAmount: penceToDecimalString(line.vatPence),
        AccountCode: line.ledgerAccountCode ?? undefined,
        TaxType: XERO_TAX_TYPES[line.vatTreatment]?.[direction] ?? 'NONE',
        Tracking: line.jobReference ? [{ Name: 'Job', Option: line.jobReference }] : undefined,
      })),
    };
  }

  async push(): Promise<never> {
    throw new AccountingNotConnectedError(this.displayName);
  }
}

function mapStatus(status: string, warnings: string[], number: string): string {
  switch (status) {
    case 'draft':
      return 'DRAFT';
    case 'void':
      return 'VOIDED';
    case 'paid':
    case 'part_paid':
    case 'sent':
    case 'overdue':
    case 'awaiting_payment':
      return 'AUTHORISED';
    default:
      warnings.push(`Invoice ${number}: unmapped status "${status}", exported as AUTHORISED.`);
      return 'AUTHORISED';
  }
}
