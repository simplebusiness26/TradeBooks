/**
 * Date handling for TradeBooks.
 *
 * All business dates are calendar dates in the Europe/London business
 * context and are stored as `YYYY-MM-DD` strings. Working with plain strings
 * removes an entire class of timezone bugs (a receipt dated 1 April must not
 * become 31 March because the server runs in UTC-1).
 */

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= daysInMonth(y, m);
}

export function assertIsoDate(value: string): IsoDate {
  if (!isIsoDate(value)) throw new Error(`Invalid date: ${value}`);
  return value;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function parseIso(date: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = assertIsoDate(date).split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function makeIso(year: number, month: number, day: number): IsoDate {
  const clampedDay = Math.min(day, daysInMonth(year, month));
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIso(date);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIso(date);
  const total = (year * 12 + (month - 1)) + months;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  return makeIso(newYear, newMonth, day);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return a > b;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIso(from);
  const b = parseIso(to);
  const ms = Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIso(date);
  return makeIso(year, month, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIso(date);
  return makeIso(year, month, daysInMonth(year, month));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats as "5 Jun 2026" — the shortest unambiguous UK form. */
export function formatDate(date: IsoDate | null | undefined): string {
  if (!date || !isIsoDate(date)) return '—';
  const { year, month, day } = parseIso(date);
  return `${day} ${MONTH_SHORT[month - 1]} ${year}`;
}

export function formatLongDate(date: IsoDate): string {
  const { year, month, day } = parseIso(date);
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatMonthYear(date: IsoDate): string {
  const { year, month } = parseIso(date);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return '—';
  const iso = toIsoDate(value);
  const time = value.toISOString().slice(11, 16);
  return `${formatDate(iso)}, ${time}`;
}

/** Human phrase used throughout the owner UI: "3 days ago", "due in 5 days". */
export function relativeDays(target: IsoDate, from: IsoDate = todayIso()): string {
  const diff = daysBetween(from, target);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

/**
 * CIS tax months run from the 6th of one month to the 5th of the next.
 * Returns the period containing `date`.
 */
export function cisPeriodFor(date: IsoDate): { start: IsoDate; end: IsoDate; label: string; due: IsoDate } {
  const { year, month, day } = parseIso(date);
  const startMonth = day >= 6 ? month : month === 1 ? 12 : month - 1;
  const startYear = day >= 6 ? year : month === 1 ? year - 1 : year;
  const start = makeIso(startYear, startMonth, 6);
  const end = addDays(addMonths(start, 1), -1);
  const label = `6 ${MONTH_SHORT[startMonth - 1]} – 5 ${MONTH_SHORT[parseIso(end).month - 1]} ${parseIso(end).year}`;
  // HMRC CIS returns are due by the 19th of the month in which the period ends.
  const endParts = parseIso(end);
  return { start, end, label, due: makeIso(endParts.year, endParts.month, 19) };
}

/**
 * Returns the VAT period of `periodMonths` length containing `date`, anchored
 * so that periods align to the company's first period end month.
 */
export function vatPeriodFor(
  date: IsoDate,
  periodMonths: number,
  anchorEnd?: IsoDate | null,
): { start: IsoDate; end: IsoDate; label: string; due: IsoDate } {
  const months = periodMonths > 0 ? periodMonths : 3;
  const { year, month } = parseIso(date);
  const anchorMonthIndex = anchorEnd && isIsoDate(anchorEnd) ? parseIso(anchorEnd).month : months;
  const absolute = year * 12 + (month - 1);
  const anchorAbsolute = anchorMonthIndex - 1;
  // Period ends fall on months where (month − anchor) is a whole number of
  // periods. Walk forward to the first such month on or after `date`.
  const offset = (((absolute - anchorAbsolute) % months) + months) % months;
  const endAbsolute = absolute + ((months - offset) % months);
  const endYear = Math.floor(endAbsolute / 12);
  const endMonth = (endAbsolute % 12) + 1;
  const end = makeIso(endYear, endMonth, daysInMonth(endYear, endMonth));
  const start = startOfMonth(addMonths(end, -(months - 1)));
  const startParts = parseIso(start);
  const label = `${MONTH_SHORT[startParts.month - 1]}–${MONTH_SHORT[endMonth - 1]} ${endYear}`;
  // Standard VAT: the return and payment are due one calendar month and 7
  // days after the period ends — for a quarter ending 30 June, 7 August.
  const due = addDays(endOfMonth(addMonths(end, 1)), 7);
  return { start, end, label, due };
}

/** Inclusive range check. */
export function withinRange(date: IsoDate, start: IsoDate, end: IsoDate): boolean {
  return date >= start && date <= end;
}
