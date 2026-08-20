/**
 * Money handling for TradeBooks.
 *
 * Every monetary value in the system is stored and manipulated as an integer
 * number of minor units (pence for GBP). Binary floating point is never used
 * to hold or accumulate a monetary value. Parsing from user input and
 * external files goes through `parseMoneyInput`, which works on the decimal
 * string representation so that values such as "1234.55" cannot drift.
 */

export type Pence = number;

export const MAX_PENCE = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {}

function assertSafe(value: number): Pence {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`Monetary value must be an integer number of pence, received ${value}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError('Monetary value is outside the safe integer range');
  }
  return value;
}

/** Adds any number of pence amounts, guarding against overflow. */
export function addPence(...values: Pence[]): Pence {
  return assertSafe(values.reduce((sum, v) => sum + assertSafe(v), 0));
}

export function subPence(a: Pence, b: Pence): Pence {
  return assertSafe(assertSafe(a) - assertSafe(b));
}

export function negate(a: Pence): Pence {
  return assertSafe(-assertSafe(a));
}

export function absPence(a: Pence): Pence {
  return Math.abs(assertSafe(a));
}

export function sumPence(values: readonly Pence[]): Pence {
  return addPence(...values);
}

/**
 * Multiplies a pence amount by a quantity expressed in thousandths
 * (e.g. quantity 2.5 -> 2500). Half-up rounding on the absolute value keeps
 * results symmetric for credits and debits.
 */
export function multiplyByMilliQuantity(amount: Pence, milliQuantity: number): Pence {
  assertSafe(amount);
  if (!Number.isInteger(milliQuantity)) {
    throw new MoneyError('Quantity must be expressed in integer thousandths');
  }
  const product = amount * milliQuantity;
  if (!Number.isSafeInteger(product)) {
    throw new MoneyError('Monetary multiplication overflowed the safe integer range');
  }
  return roundHalfUpDiv(product, 1000);
}

/** Half-up division of integers, symmetric around zero. */
export function roundHalfUpDiv(numerator: number, denominator: number): Pence {
  if (denominator === 0) throw new MoneyError('Division by zero');
  const sign = Math.sign(numerator) * Math.sign(denominator) < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const quotient = Math.floor(n / d);
  const remainder = n - quotient * d;
  const rounded = remainder * 2 >= d ? quotient + 1 : quotient;
  return assertSafe(sign * rounded);
}

/**
 * Applies a VAT rate expressed in basis points (20% -> 2000) to a net amount.
 * Returns the VAT element, rounded half-up to the nearest penny.
 */
export function vatFromNet(netPence: Pence, rateBasisPoints: number): Pence {
  assertSafe(netPence);
  assertRate(rateBasisPoints);
  return roundHalfUpDiv(netPence * rateBasisPoints, 10_000);
}

/**
 * Splits a VAT-inclusive gross amount into net and VAT elements. The net is
 * derived first and VAT is the remainder so that net + vat === gross exactly.
 */
export function splitGross(
  grossPence: Pence,
  rateBasisPoints: number,
): { net: Pence; vat: Pence; gross: Pence } {
  assertSafe(grossPence);
  assertRate(rateBasisPoints);
  const net = roundHalfUpDiv(grossPence * 10_000, 10_000 + rateBasisPoints);
  return { net, vat: subPence(grossPence, net), gross: grossPence };
}

function assertRate(rateBasisPoints: number): void {
  if (!Number.isInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > 100_000) {
    throw new MoneyError(`Invalid VAT rate in basis points: ${rateBasisPoints}`);
  }
}

/**
 * Parses user/CSV input into pence without using floating point arithmetic on
 * the decimal portion. Accepts "1,234.56", "£12.30", "(45.00)" (negative),
 * "-45", "45.5". Rejects anything else.
 */
export function parseMoneyInput(raw: string | number | null | undefined): Pence {
  if (raw === null || raw === undefined || raw === '') {
    throw new MoneyError('Amount is required');
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new MoneyError('Amount is not a finite number');
    return parseMoneyInput(raw.toFixed(4));
  }

  let text = raw.trim();
  let negative = false;

  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  text = text.replace(/[£$€\s]/g, '').replace(/,/g, '');

  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new MoneyError(`Could not read "${raw}" as an amount`);
  }

  const [whole = '0', fractionRaw = ''] = text.split('.');
  // Round half-up at the penny using string digits only.
  const fraction = fractionRaw.padEnd(3, '0');
  const pencePart = Number(fraction.slice(0, 2));
  const nextDigit = Number(fraction[2] ?? '0');
  let pence = Number(whole) * 100 + pencePart;
  if (nextDigit >= 5) pence += 1;

  if (!Number.isSafeInteger(pence)) {
    throw new MoneyError('Amount is too large');
  }
  return negative ? -pence : pence;
}

/** Formats pence as a plain decimal string, e.g. -1234 -> "-12.34". */
export function penceToDecimalString(pence: Pence): string {
  assertSafe(pence);
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const whole = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${rest}`;
}

/** Formats pence for display, e.g. 123456 -> "£1,234.56". */
export function formatMoney(pence: Pence, options: { showSign?: boolean; currency?: string } = {}): string {
  assertSafe(pence);
  const { showSign = false, currency = '£' } = options;
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const whole = Math.floor(abs / 100).toLocaleString('en-GB');
  const rest = String(abs % 100).padStart(2, '0');
  const sign = negative ? '−' : showSign ? '+' : '';
  return `${sign}${currency}${whole}.${rest}`;
}

/** Distributes a total across weights without losing or inventing pennies. */
export function allocatePence(total: Pence, weights: readonly number[]): Pence[] {
  assertSafe(total);
  if (weights.length === 0) return [];
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  if (weightTotal <= 0) {
    const even = Math.trunc(total / weights.length);
    const result = weights.map(() => even);
    let remainder = total - even * weights.length;
    for (let i = 0; remainder !== 0; i = (i + 1) % result.length) {
      const step = remainder > 0 ? 1 : -1;
      result[i] = (result[i] ?? 0) + step;
      remainder -= step;
    }
    return result;
  }
  const raw = weights.map((w) => roundHalfUpDiv(total * w, weightTotal));
  const allocated = raw.reduce((a, b) => a + b, 0);
  let drift = total - allocated;
  for (let i = 0; drift !== 0; i = (i + 1) % raw.length) {
    const step = drift > 0 ? 1 : -1;
    raw[i] = (raw[i] ?? 0) + step;
    drift -= step;
  }
  return raw;
}
