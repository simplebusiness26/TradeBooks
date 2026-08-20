/**
 * Bank descriptions are noisy: card numbers, dates, reference codes and
 * payment-processor prefixes all vary between otherwise identical
 * transactions. Normalising them is what lets a single learned rule keep
 * working for every future purchase from the same merchant.
 */
const NOISE_PATTERNS: RegExp[] = [
  /\bcard\s*\d{2,4}\b/gi,
  /\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g,
  /\bref[:\s]*[a-z0-9-]{4,}\b/gi,
  /\bon\s+\d{1,2}\s+\w{3}\b/gi,
  /\b\d{2}:\d{2}\b/g,
  /\bgbp\b/gi,
  /\b(?:visa|mastercard|maestro|contactless|chip\s*&?\s*pin|cp|cnp)\b/gi,
  /\*+/g,
];

const PREFIXES = [
  'card purchase',
  'card payment to',
  'card payment',
  'payment to',
  'payment from',
  'direct debit',
  'standing order',
  'bank credit',
  'faster payment',
  'fp',
  'bacs',
  'sq *',
  'sumup *',
  'izettle *',
  'paypal *',
  'zettle',
];

export function normaliseDescription(value: string): string {
  let text = ` ${value.toLowerCase()} `;
  for (const pattern of NOISE_PATTERNS) text = text.replace(pattern, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  for (const prefix of PREFIXES) {
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  return text.replace(/[^a-z0-9&' .-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Derives the counterparty (merchant/payer) from a bank description. Keeps
 * the leading words that are not numeric noise or a location suffix.
 */
export function deriveCounterparty(description: string): string {
  const normalised = normaliseDescription(description);
  if (!normalised) return '';
  const words = normalised.split(' ').filter(Boolean);
  const kept: string[] = [];
  for (const word of words) {
    if (/^\d+$/.test(word)) break;
    kept.push(word);
    if (kept.length >= 4) break;
  }
  return kept.join(' ').trim();
}

/** Comparison key for supplier/customer names: case, punctuation and suffix insensitive. */
export function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|llp|uk|co|company|and|&|the)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when two names refer to the same business for matching purposes. */
export function namesMatch(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  return ka.length >= 4 && kb.length >= 4 && (ka.includes(kb) || kb.includes(ka));
}

/**
 * Similarity between 0 and 1 using token overlap. Deliberately simple and
 * deterministic — matching decisions must be explainable to the owner.
 */
export function similarity(a: string, b: string): number {
  const ta = new Set(nameKey(a).split(' ').filter((w) => w.length > 1));
  const tb = new Set(nameKey(b).split(' ').filter((w) => w.length > 1));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const token of ta) if (tb.has(token)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}
