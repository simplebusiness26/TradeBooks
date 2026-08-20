import { formatDate, formatLongDate, type IsoDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export type InvoiceDocumentData = {
  company: {
    name: string;
    tradingName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    phone: string | null;
    email: string | null;
    vatNumber: string | null;
    vatRegistered: boolean;
  };
  customer: {
    name: string;
    contactName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
  };
  invoice: {
    number: string;
    issueDate: IsoDate;
    dueDate: IsoDate;
    reference: string | null;
    notes: string | null;
    netPence: number;
    vatPence: number;
    grossPence: number;
    cisDeductionPence: number;
    paidPence: number;
  };
  lines: {
    description: string;
    quantityMilli: number;
    unitPricePence: number;
    netPence: number;
    vatPence: number;
    vatRateBasisPoints: number;
    vatTreatment: string;
  }[];
  jobReference: string | null;
};

/**
 * Renders a printable invoice as self-contained HTML. The browser's own
 * "print to PDF" turns it into a PDF, so no PDF library or paid service is
 * needed for the owner to send a professional-looking invoice.
 */
export function renderInvoiceHtml(data: InvoiceDocumentData): string {
  const { company, customer, invoice, lines } = data;
  const hasReverseCharge = lines.some((line) => line.vatTreatment === 'reverse_charge');
  const outstanding = invoice.grossPence - invoice.cisDeductionPence - invoice.paidPence;

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${escapeHtml(invoice.number)} — ${escapeHtml(company.tradingName ?? company.name)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1e222c; margin: 0; padding: 24px; background: #f6f7f9; }
  .sheet { max-width: 820px; margin: 0 auto; background: #fff; padding: 40px; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  header { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  .muted { color: #667189; font-size: 14px; line-height: 1.5; }
  .meta { text-align: right; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 32px; font-size: 14px; }
  th { text-align: left; border-bottom: 2px solid #d5d9e2; padding: 8px 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: #667189; }
  td { border-bottom: 1px solid #eceef2; padding: 10px 6px; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  tfoot td { border: 0; padding: 6px; }
  tfoot .total td { border-top: 2px solid #1e222c; font-weight: 700; font-size: 16px; }
  .notes { margin-top: 28px; font-size: 14px; color: #42495c; white-space: pre-wrap; }
  .legal { margin-top: 28px; font-size: 12px; color: #667189; border-top: 1px solid #eceef2; padding-top: 14px; }
  .print { margin: 0 auto 16px; max-width: 820px; }
  button { font: inherit; padding: 10px 18px; border-radius: 10px; border: 1px solid #b0b8c8; background: #fff; cursor: pointer; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; padding: 0; } .print { display: none; } }
</style>
</head>
<body>
<div class="print"><button onclick="window.print()">Print or save as PDF</button></div>
<div class="sheet">
  <header>
    <div>
      <h1>${escapeHtml(company.tradingName ?? company.name)}</h1>
      <p class="muted">${[company.addressLine1, company.addressLine2, company.city, company.postcode]
        .filter(Boolean)
        .map(escapeHtml)
        .join('<br>')}</p>
      <p class="muted">${[company.phone, company.email].filter(Boolean).map(escapeHtml).join(' · ')}</p>
      ${company.vatRegistered && company.vatNumber ? `<p class="muted">VAT no. ${escapeHtml(company.vatNumber)}</p>` : ''}
    </div>
    <div class="meta">
      <h2 style="margin:0 0 8px;font-size:20px">Invoice ${escapeHtml(invoice.number)}</h2>
      <p class="muted">Date: ${formatLongDate(invoice.issueDate)}<br>
      Payment due: ${formatLongDate(invoice.dueDate)}${
        invoice.reference ? `<br>Your reference: ${escapeHtml(invoice.reference)}` : ''
      }${data.jobReference ? `<br>Job: ${escapeHtml(data.jobReference)}` : ''}</p>
    </div>
  </header>

  <div style="margin-top:28px">
    <p class="muted" style="text-transform:uppercase;letter-spacing:.04em;font-size:12px;margin-bottom:4px">Invoice to</p>
    <p style="margin:0;font-weight:600">${escapeHtml(customer.name)}</p>
    <p class="muted" style="margin-top:2px">${[
      customer.contactName,
      customer.addressLine1,
      customer.addressLine2,
      customer.city,
      customer.postcode,
    ]
      .filter(Boolean)
      .map(escapeHtml)
      .join('<br>')}</p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">VAT</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${lines
        .map(
          (line) => `<tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${(line.quantityMilli / 1000).toString()}</td>
        <td class="num">${formatMoney(line.unitPricePence)}</td>
        <td class="num">${line.vatTreatment === 'reverse_charge' ? 'RC' : `${(line.vatRateBasisPoints / 100).toFixed(0)}%`}</td>
        <td class="num">${formatMoney(line.netPence)}</td>
      </tr>`,
        )
        .join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="3"></td><td class="num">Subtotal</td><td class="num">${formatMoney(invoice.netPence)}</td></tr>
      <tr><td colspan="3"></td><td class="num">VAT</td><td class="num">${formatMoney(invoice.vatPence)}</td></tr>
      ${
        invoice.cisDeductionPence > 0
          ? `<tr><td colspan="3"></td><td class="num">CIS deduction</td><td class="num">−${formatMoney(invoice.cisDeductionPence)}</td></tr>`
          : ''
      }
      <tr class="total"><td colspan="3"></td><td class="num">Total due</td><td class="num">${formatMoney(
        invoice.grossPence - invoice.cisDeductionPence,
      )}</td></tr>
      ${
        invoice.paidPence > 0
          ? `<tr><td colspan="3"></td><td class="num">Already paid</td><td class="num">${formatMoney(invoice.paidPence)}</td></tr>
             <tr class="total"><td colspan="3"></td><td class="num">Outstanding</td><td class="num">${formatMoney(outstanding)}</td></tr>`
          : ''
      }
    </tfoot>
  </table>

  ${invoice.notes ? `<div class="notes">${escapeHtml(invoice.notes)}</div>` : ''}

  ${
    hasReverseCharge
      ? `<p class="legal">Reverse charge: VAT Act 1994 Section 55A applies. The customer is to account to HMRC for the VAT on the reverse-charge items on this invoice.</p>`
      : ''
  }
  <p class="legal">Prepared with TradeBooks from the business's own records.</p>
</div>
</body>
</html>`;
}

export function renderInvoiceEmail(input: {
  companyName: string;
  customerName: string;
  invoiceNumber: string;
  dueDate: IsoDate;
  outstandingPence: number;
  isReminder: boolean;
}): { subject: string; body: string } {
  const subject = input.isReminder
    ? `Reminder: invoice ${input.invoiceNumber} from ${input.companyName}`
    : `Invoice ${input.invoiceNumber} from ${input.companyName}`;

  const body = [
    `Hello ${input.customerName},`,
    '',
    input.isReminder
      ? `A quick reminder that invoice ${input.invoiceNumber} for ${formatMoney(input.outstandingPence)} was due on ${formatDate(input.dueDate)}.`
      : `Please find invoice ${input.invoiceNumber} for ${formatMoney(input.outstandingPence)}, due ${formatDate(input.dueDate)}.`,
    '',
    'If you have already paid, please ignore this message.',
    '',
    'Many thanks,',
    input.companyName,
  ].join('\n');

  return { subject, body };
}

function escapeHtml(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
