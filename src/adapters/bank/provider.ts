import { env } from '@/lib/env';
import { getBankFeed as getTrueLayerOrNone, type BankFeedAdapter } from './index';
import { GoCardlessBankFeedAdapter } from './gocardless';

let cached: BankFeedAdapter | null = null;

/**
 * Provider switch for Open Banking.
 *
 * OPEN_BANKING_PROVIDER=gocardless makes GoCardless Bank Account Data active.
 * Leaving it unset preserves the existing BANK_FEED_DRIVER=TrueLayer behaviour,
 * so TrueLayer remains available as a one-variable switch-back path.
 */
export function getConfiguredBankFeed(): BankFeedAdapter {
  if (cached) return cached;
  const selected = (process.env.OPEN_BANKING_PROVIDER ?? '').trim().toLowerCase();
  if (selected === 'gocardless') {
    cached = new GoCardlessBankFeedAdapter({
      secretId: process.env.GOCARDLESS_SECRET_ID?.trim(),
      secretKey: process.env.GOCARDLESS_SECRET_KEY?.trim(),
      institutionId: process.env.GOCARDLESS_INSTITUTION_ID?.trim(),
    });
    return cached;
  }
  cached = getTrueLayerOrNone();
  return cached;
}

export function configuredBankProviderName(): string {
  return getConfiguredBankFeed().name;
}

export function configuredBankRedirectUri(): string | null {
  const feed = getConfiguredBankFeed();
  if (feed.name === 'gocardless') {
    return process.env.GOCARDLESS_REDIRECT_URI?.trim() || new URL('/api/bank/callback', env().APP_BASE_URL).toString();
  }
  return env().TRUELAYER_REDIRECT_URI ?? null;
}

export function resetConfiguredBankFeedCache(): void {
  cached = null;
}
