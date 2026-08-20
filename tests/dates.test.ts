import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  cisPeriodFor,
  daysBetween,
  endOfMonth,
  formatDate,
  isIsoDate,
  makeIso,
  vatPeriodFor,
} from '@/lib/dates';

describe('calendar arithmetic', () => {
  it('validates dates', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('26-01-01')).toBe(false);
  });

  it('adds days and months without timezone drift', () => {
    expect(addDays('2026-03-28', 4)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('counts days across a British Summer Time change', () => {
    // BST starts on 29 March 2026; a naive Date subtraction gives 30.958 days.
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
    expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
  });

  it('finds month ends', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(makeIso(2026, 4, 31)).toBe('2026-04-30');
  });

  it('formats dates for the owner', () => {
    expect(formatDate('2026-06-05')).toBe('5 Jun 2026');
    expect(formatDate(null)).toBe('—');
  });
});

describe('CIS tax months', () => {
  it('runs from the 6th to the 5th', () => {
    const period = cisPeriodFor('2026-06-20');
    expect(period.start).toBe('2026-06-06');
    expect(period.end).toBe('2026-07-05');
    expect(period.due).toBe('2026-07-19');
  });

  it('puts early-month dates in the previous period', () => {
    const period = cisPeriodFor('2026-07-03');
    expect(period.start).toBe('2026-06-06');
    expect(period.end).toBe('2026-07-05');
  });

  it('handles the year boundary', () => {
    const period = cisPeriodFor('2026-01-03');
    expect(period.start).toBe('2025-12-06');
    expect(period.end).toBe('2026-01-05');
  });
});

describe('VAT periods', () => {
  it('produces quarters anchored to the company period end', () => {
    const period = vatPeriodFor('2026-05-14', 3, '2026-03-31');
    expect(period.start).toBe('2026-04-01');
    expect(period.end).toBe('2026-06-30');
    // Standard deadline is one month and seven days after the period end.
    expect(period.due).toBe('2026-08-07');
  });

  it('supports monthly and annual periods', () => {
    expect(vatPeriodFor('2026-05-14', 1).start).toBe('2026-05-01');
    expect(vatPeriodFor('2026-05-14', 1).end).toBe('2026-05-31');
    const annual = vatPeriodFor('2026-05-14', 12, '2026-12-31');
    expect(annual.start).toBe('2026-01-01');
    expect(annual.end).toBe('2026-12-31');
  });
});
