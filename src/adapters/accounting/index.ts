import { env } from '@/lib/env';
import { FreeAgentAdapter } from './freeagent';
import { QuickBooksAdapter } from './quickbooks';
import { XeroAdapter } from './xero';
import type { AccountingAdapter } from './types';

export * from './types';
export { XeroAdapter } from './xero';
export { QuickBooksAdapter } from './quickbooks';
export { FreeAgentAdapter } from './freeagent';

export type AccountingProvider = 'xero' | 'quickbooks' | 'freeagent';

export function getAccountingAdapter(provider: AccountingProvider): AccountingAdapter {
  const config = env();
  switch (provider) {
    case 'xero':
      return new XeroAdapter({
        clientId: config.XERO_CLIENT_ID,
        clientSecret: config.XERO_CLIENT_SECRET,
        redirectUri: config.XERO_REDIRECT_URI,
      });
    case 'quickbooks':
      return new QuickBooksAdapter({
        clientId: config.QUICKBOOKS_CLIENT_ID,
        clientSecret: config.QUICKBOOKS_CLIENT_SECRET,
        redirectUri: config.QUICKBOOKS_REDIRECT_URI,
      });
    case 'freeagent':
      return new FreeAgentAdapter({
        clientId: config.FREEAGENT_CLIENT_ID,
        clientSecret: config.FREEAGENT_CLIENT_SECRET,
        redirectUri: config.FREEAGENT_REDIRECT_URI,
      });
  }
}

export function allAccountingAdapters(): AccountingAdapter[] {
  return (['xero', 'quickbooks', 'freeagent'] as const).map(getAccountingAdapter);
}
