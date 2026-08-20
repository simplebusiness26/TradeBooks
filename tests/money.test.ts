import { describe, expect, it } from 'vitest';
import {
  addPence,
  allocatePence,
  formatMoney,
  MoneyError,
  multiplyByMilliQuantity,
  parseMoneyInput,
  penceToDecimalString,
  roundHalfUpDiv,
  splitGross,
  vatFromNet,
} from '@/lib/money';

describe('parseMoneyInput', () => {
  it('reads plain and formatted amounts as exact pence', () => {
    expect(parseMoneyInput('12.34')).toBe(1234);
    expect(parseMoneyInput('£1,234.56')).toBe(123456);
    expect(parseMoneyInput('1234')).toBe(123400);
    expect(parseMoneyInput('0.01')).toBe(1);
    expect(parseMoneyInput('-45')).toBe(-4500);
    expect(parseMoneyInput('(45.00)')).toBe(-4500);
    expect(parseMoneyInput(' 99.9 ')).toBe(9990);
  });

  it('avoids floating point drift on values that cannot be represented exactly', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; these must still be exact.
    expect(parseMoneyInput('0.10') + parseMoneyInput('0.20')).toBe(parseMoneyInput('0.30'));
    expect(parseMoneyInput('1234.55')).toBe(123455);
    expect(parseMoneyInput('8.30')).toBe(830);
    expect(parseMoneyInput('1.005')).toBe(101);
  });

  it('rejects anything that is not an amount', () => {
    expect(() => parseMoneyInput('abc')).toThrow(MoneyError);
    expect(() => parseMoneyInput('')).toThrow(MoneyError);
    expect(() => parseMoneyInput('12.3.4')).toThrow(MoneyError);
    expect(() => parseMoneyInput(null)).toThrow(MoneyError);
  });
});

describe('arithmetic', () => {
  it('refuses non-integer pence', () => {
    expect(() => addPence(10.5, 1)).toThrow(MoneyError);
  });

  it('rounds half up symmetrically', () => {
    expect(roundHalfUpDiv(5, 2)).toBe(3);
    expect(roundHalfUpDiv(-5, 2)).toBe(-3);
    expect(roundHalfUpDiv(4, 2)).toBe(2);
    expect(roundHalfUpDiv(1, 3)).toBe(0);
  });

  it('multiplies by fractional quantities without drift', () => {
    expect(multiplyByMilliQuantity(1000, 2500)).toBe(2500);
    expect(multiplyByMilliQuantity(333, 3000)).toBe(999);
    expect(multiplyByMilliQuantity(100, 333)).toBe(33);
  });
});

describe('VAT', () => {
  it('calculates VAT from a net amount', () => {
    expect(vatFromNet(10_000, 2000)).toBe(2000);
    expect(vatFromNet(999, 2000)).toBe(200);
    expect(vatFromNet(10_000, 500)).toBe(500);
    expect(vatFromNet(12_345, 0)).toBe(0);
  });

  it('splits a gross amount so net plus VAT always equals gross', () => {
    for (const gross of [1, 99, 100, 1234, 14862, 999_999, 1_000_001]) {
      const split = splitGross(gross, 2000);
      expect(split.net + split.vat).toBe(gross);
    }
    expect(splitGross(12_000, 2000)).toEqual({ net: 10_000, vat: 2000, gross: 12_000 });
    expect(splitGross(1000, 0)).toEqual({ net: 1000, vat: 0, gross: 1000 });
  });
});

describe('allocatePence', () => {
  it('never creates or loses a penny', () => {
    expect(allocatePence(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(allocatePence(1000, [3, 7]).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(allocatePence(-101, [1, 1]).reduce((a, b) => a + b, 0)).toBe(-101);
    expect(allocatePence(7, [0, 0, 0]).reduce((a, b) => a + b, 0)).toBe(7);
  });
});

describe('formatting', () => {
  it('formats for display and for machine output', () => {
    expect(formatMoney(123456)).toBe('£1,234.56');
    expect(formatMoney(-500)).toBe('−£5.00');
    expect(formatMoney(0)).toBe('£0.00');
    expect(penceToDecimalString(-1234)).toBe('-12.34');
    expect(penceToDecimalString(5)).toBe('0.05');
  });
});
