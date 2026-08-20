import { splitGross, vatFromNet, type Pence } from '@/lib/money';

export type VatTreatment =
  | 'standard'
  | 'reduced'
  | 'zero'
  | 'exempt'
  | 'outside_scope'
  | 'reverse_charge'
  | 'no_vat';

/**
 * UK VAT rates in basis points. Rates are configuration, not hard-coded law:
 * the value stored on each line is what was used at the time, so historic
 * records stay correct if a rate ever changes.
 */
export const VAT_RATES: Record<VatTreatment, number> = {
  standard: 2000,
  reduced: 500,
  zero: 0,
  exempt: 0,
  outside_scope: 0,
  reverse_charge: 0,
  no_vat: 0,
};

export const VAT_TREATMENT_LABELS: Record<VatTreatment, string> = {
  standard: 'Standard 20%',
  reduced: 'Reduced 5%',
  zero: 'Zero rated',
  exempt: 'Exempt',
  outside_scope: 'Outside the scope of VAT',
  reverse_charge: 'Reverse charge (CIS construction)',
  no_vat: 'No VAT / not registered',
};

/** Plain-English help shown next to the choice in the owner UI. */
export const VAT_TREATMENT_HELP: Record<VatTreatment, string> = {
  standard: 'Most goods and services.',
  reduced: 'Some energy-saving and residential conversion work.',
  zero: 'Certain new-build construction work.',
  exempt: 'Insurance, some finance, some property.',
  outside_scope: 'Not a VAT supply at all, such as wages or a bank transfer.',
  reverse_charge:
    'Construction work for another VAT and CIS registered business — they account for the VAT, not you.',
  no_vat: 'The supplier did not charge VAT, or the business is not VAT registered.',
};

export function rateFor(treatment: VatTreatment): number {
  return VAT_RATES[treatment];
}

/** True when the treatment produces VAT that appears on the VAT return. */
export function contributesToVatReturn(treatment: VatTreatment): boolean {
  return treatment !== 'outside_scope' && treatment !== 'no_vat';
}

export type LineAmounts = { net: Pence; vat: Pence; gross: Pence };

/** Calculates a line's amounts from a VAT-exclusive net figure. */
export function fromNet(net: Pence, treatment: VatTreatment, rateOverride?: number): LineAmounts {
  const rate = rateOverride ?? rateFor(treatment);
  const vat = vatFromNet(net, rate);
  return { net, vat, gross: net + vat };
}

/** Calculates a line's amounts from a VAT-inclusive gross figure. */
export function fromGross(gross: Pence, treatment: VatTreatment, rateOverride?: number): LineAmounts {
  const rate = rateOverride ?? rateFor(treatment);
  return splitGross(gross, rate);
}

/**
 * VAT treatment for a transaction when nothing better is known. A company
 * that is not VAT registered records no VAT at all.
 */
export function defaultTreatment(vatRegistered: boolean): VatTreatment {
  return vatRegistered ? 'standard' : 'no_vat';
}
