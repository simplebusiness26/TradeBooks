import { toCsv } from '@/lib/csv';
import { penceToDecimalString } from '@/lib/money';
import { addDays, type IsoDate } from '@/lib/dates';

export type DemoStatementLine = {
  date: IsoDate;
  description: string;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  reference?: string;
};

/**
 * Builds a realistic bank statement CSV for the demo business, in the
 * "Date, Description, Paid in, Paid out, Balance" layout most UK banks use.
 */
export function buildStatementCsv(lines: DemoStatementLine[], openingBalancePence: number): string {
  let balance = openingBalancePence;
  const rows = [...lines]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((line) => {
      balance += line.direction === 'money_in' ? line.amountPence : -line.amountPence;
      return [
        formatUkDate(line.date),
        line.description,
        line.reference ?? '',
        line.direction === 'money_in' ? penceToDecimalString(line.amountPence) : '',
        line.direction === 'money_out' ? penceToDecimalString(line.amountPence) : '',
        penceToDecimalString(balance),
      ];
    });

  return toCsv(['Date', 'Description', 'Reference', 'Paid in', 'Paid out', 'Balance'], rows);
}

function formatUkDate(date: IsoDate): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * A text receipt of the kind builders' merchants email out. The built-in
 * extractor reads these for real — nothing is pre-filled.
 */
export function buildTextReceipt(input: {
  supplier: string;
  address?: string;
  date: IsoDate;
  vatNumber?: string;
  items: { description: string; amountPence: number }[];
  vatRateBasisPoints?: number;
}): string {
  const net = input.items.reduce((sum, item) => sum + item.amountPence, 0);
  const rate = input.vatRateBasisPoints ?? 2000;
  const vat = Math.round((net * rate) / 10_000);
  const gross = net + vat;
  const [year, month, day] = input.date.split('-');

  return [
    input.supplier,
    input.address ?? '',
    '',
    `Date: ${day}/${month}/${year}`,
    input.vatNumber ? `VAT Reg No: ${input.vatNumber}` : '',
    '',
    'Description                              Amount',
    '------------------------------------------------',
    ...input.items.map(
      (item) => `${item.description.padEnd(40).slice(0, 40)} ${penceToDecimalString(item.amountPence).padStart(8)}`,
    ),
    '------------------------------------------------',
    `Subtotal: ${penceToDecimalString(net)}`,
    `VAT @ ${(rate / 100).toFixed(1)}%: ${penceToDecimalString(vat)}`,
    `Total: ${penceToDecimalString(gross)}`,
    '',
    'Thank you for your custom.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function grossFor(itemsPence: number[], rateBasisPoints = 2000): number {
  const net = itemsPence.reduce((a, b) => a + b, 0);
  return net + Math.round((net * rateBasisPoints) / 10_000);
}

export function spread(start: IsoDate, dayOffsets: number[]): IsoDate[] {
  return dayOffsets.map((offset) => addDays(start, offset));
}
