import { parseMoneyInput } from '@/lib/money';
import { isIsoDate, makeIso } from '@/lib/dates';
import type { OcrAdapter, ReceiptExtraction } from './types';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Deterministic extractor for text-based receipts and invoices (plain text,
 * CSV, and the text receipts a supplier emails). It reads real content — it
 * never guesses values it cannot see.
 *
 * Photographs and scanned PDFs need an OCR provider; for those this adapter
 * reports `unsupported` so the document is routed to Ask Me for the owner to
 * confirm the few details we need, rather than inventing them.
 */
export class BuiltinOcrAdapter implements OcrAdapter {
  readonly name = 'builtin-text';
  readonly supportsImages = false;

  async extract(input: {
    buffer: Buffer;
    contentType: string;
    filename: string;
  }): Promise<ReceiptExtraction> {
    if (!isTextLike(input.contentType, input.filename)) {
      return {
        provider: this.name,
        confidence: 0,
        unsupported: true,
        message:
          'This file is a photo or scan. TradeBooks needs a few details confirmed, or connect a receipt-reading provider.',
        raw: { contentType: input.contentType },
      };
    }

    const text = input.buffer.toString('utf8').slice(0, 20_000);
    return extractFromText(text, this.name);
  }
}

export function isTextLike(contentType: string, filename: string): boolean {
  if (contentType.startsWith('text/')) return true;
  if (contentType === 'application/json') return true;
  return /\.(txt|csv|md|json|eml)$/i.test(filename);
}

/** Exported so tests and other providers can reuse the same parsing rules. */
export function extractFromText(text: string, provider: string): ReceiptExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const result: ReceiptExtraction = { provider, confidence: 0, raw: { text: text.slice(0, 4000) } };
  let signals = 0;

  const supplier = findSupplier(lines);
  if (supplier) {
    result.supplierName = supplier;
    signals += 1;
  }

  const date = findDate(text);
  if (date) {
    result.documentDate = date;
    signals += 1;
  }

  const gross = findAmount(text, [
    /\btotal\b\s*(?:due|to\s*pay|amount)?\s*(?:\(inc[^)]*\))?\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
    /amount\s*(?:due|paid)\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
    /balance\s*due\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
  ]);
  const vat = findAmount(text, [
    /vat\s*(?:@\s*\d+(?:\.\d+)?%)?\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
    /v\.a\.t\.?\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
  ]);
  const net = findAmount(text, [
    /(?:sub\s*total|subtotal|net\s*(?:total|amount)?|goods)\s*[:£]?\s*([£]?-?[\d,]+\.?\d*)/i,
  ]);

  if (gross) {
    result.grossPence = gross;
    signals += 1;
  }
  if (vat) {
    result.vatPence = vat;
    signals += 1;
  }
  if (net) {
    result.netPence = net;
    signals += 1;
  }

  // Fill in the missing leg of net/VAT/gross when two of three are known.
  if (result.grossPence && result.vatPence && !result.netPence) {
    result.netPence = {
      value: result.grossPence.value - result.vatPence.value,
      confidence: Math.min(result.grossPence.confidence, result.vatPence.confidence),
      sourceText: 'derived: gross − VAT',
    };
  } else if (result.netPence && result.vatPence && !result.grossPence) {
    result.grossPence = {
      value: result.netPence.value + result.vatPence.value,
      confidence: Math.min(result.netPence.confidence, result.vatPence.confidence),
      sourceText: 'derived: net + VAT',
    };
  }

  const vatNumber = /\b(?:vat\s*(?:reg(?:istration)?)?\s*(?:no|number|#)?\s*[:.]?\s*)(GB\s?\d[\d\s]{7,})/i.exec(
    text,
  );
  if (vatNumber?.[1]) {
    result.vatNumber = {
      value: vatNumber[1].replace(/\s+/g, ''),
      confidence: 85,
      sourceText: vatNumber[0],
    };
    signals += 1;
  }

  // Consistency check: if net + VAT does not equal gross, drop confidence.
  let penalty = 0;
  if (result.netPence && result.vatPence && result.grossPence) {
    const diff = Math.abs(result.netPence.value + result.vatPence.value - result.grossPence.value);
    // Net + VAT must reconcile to the total; if they do not, something was
    // misread and the values must not be trusted enough to auto-apply.
    if (diff > 2) penalty = 45;
  }

  result.confidence = Math.max(0, Math.min(95, signals * 18) - penalty);
  return result;
}

function findSupplier(lines: string[]): { value: string; confidence: number; sourceText: string } | undefined {
  const labelled = lines.find((l) => /^(supplier|from|sold\s*by|merchant|company)\s*[:\-]/i.test(l));
  if (labelled) {
    const value = labelled.split(/[:\-]/).slice(1).join(':').trim();
    if (value) return { value: cleanName(value), confidence: 90, sourceText: labelled };
  }
  // Otherwise the first substantial line of a receipt is almost always the trading name.
  const candidate = lines.find(
    (l) => l.length >= 3 && l.length <= 60 && !/^[\d\s£.,\-/]+$/.test(l) && !/receipt|invoice|vat/i.test(l),
  );
  if (candidate) return { value: cleanName(candidate), confidence: 55, sourceText: candidate };
  return undefined;
}

function cleanName(value: string): string {
  return value.replace(/\s{2,}/g, ' ').replace(/[*]+/g, '').trim().slice(0, 120);
}

function findDate(text: string): { value: string; confidence: number; sourceText: string } | undefined {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso?.[1] && iso[2] && iso[3]) {
    const value = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (isIsoDate(value)) return { value, confidence: 92, sourceText: iso[0] };
  }

  const dmy = /\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/.exec(text);
  if (dmy?.[1] && dmy[2] && dmy[3]) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    if (day <= 31 && month <= 12) {
      return { value: makeIso(year, month, day), confidence: 85, sourceText: dmy[0] };
    }
  }

  const named = /\b(\d{1,2})\s*(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b/.exec(text);
  if (named?.[1] && named[2] && named[3]) {
    const month = MONTHS[named[2].slice(0, 4).toLowerCase()] ?? MONTHS[named[2].slice(0, 3).toLowerCase()];
    if (month) {
      return { value: makeIso(Number(named[3]), month, Number(named[1])), confidence: 88, sourceText: named[0] };
    }
  }
  return undefined;
}

function findAmount(
  text: string,
  patterns: RegExp[],
): { value: number; confidence: number; sourceText: string } | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      try {
        return { value: parseMoneyInput(match[1]), confidence: 88, sourceText: match[0].trim() };
      } catch {
        continue;
      }
    }
  }
  return undefined;
}
