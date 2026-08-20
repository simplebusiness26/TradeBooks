import { env } from '@/lib/env';

export type FeedAccount = {
  externalId: string;
  name: string;
  accountType: string;
  sortCode?: string | null;
  accountNumberLast4?: string | null;
  balancePence?: number | null;
};

export type FeedTransaction = {
  externalId: string;
  date: string;
  /** Signed: negative is money out. */
  amountPence: number;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
  balanceAfterPence?: number | null;
  raw: Record<string, unknown>;
};

export interface BankFeedAdapter {
  readonly name: string;
  readonly available: boolean;
  /** Where the owner is sent to authorise the connection. */
  authorisationUrl(companyId: string): string | null;
  listAccounts(connectionId: string): Promise<FeedAccount[]>;
  listTransactions(connectionId: string, accountExternalId: string, since: string): Promise<FeedTransaction[]>;
}

export class BankFeedNotConnectedError extends Error {
  constructor(provider: string) {
    super(
      `The ${provider} bank feed is not connected. Import a CSV statement or add transactions by hand instead. See CONNECTIONS_REQUIRED.md section 4.`,
    );
    this.name = 'BankFeedNotConnectedError';
  }
}

/**
 * Default: no bank feed. Manual entry and CSV import cover every workflow, so
 * nothing downstream depends on a feed existing.
 */
class NoBankFeedAdapter implements BankFeedAdapter {
  readonly name = 'none';
  readonly available = false;
  authorisationUrl(): string | null {
    return null;
  }
  async listAccounts(): Promise<FeedAccount[]> {
    throw new BankFeedNotConnectedError('open banking');
  }
  async listTransactions(): Promise<FeedTransaction[]> {
    throw new BankFeedNotConnectedError('open banking');
  }
}

/**
 * TrueLayer open-banking adapter.
 *
 * NOT CONNECTED. Set BANK_FEED_DRIVER=truelayer plus TRUELAYER_CLIENT_ID,
 * TRUELAYER_CLIENT_SECRET and TRUELAYER_REDIRECT_URI, then complete the two
 * request methods below. The response mapping to `FeedTransaction` is the
 * only place provider-specific shapes are allowed to exist.
 * See CONNECTIONS_REQUIRED.md section 4.
 */
class TrueLayerBankFeedAdapter implements BankFeedAdapter {
  readonly name = 'truelayer';
  constructor(
    private readonly config: { clientId?: string; clientSecret?: string; redirectUri?: string },
  ) {}

  get available(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  authorisationUrl(companyId: string): string | null {
    if (!this.available) return null;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId ?? '',
      redirect_uri: this.config.redirectUri ?? '',
      scope: 'info accounts balance transactions offline_access',
      providers: 'uk-ob-all uk-oauth-all',
      state: companyId,
    });
    return `https://auth.truelayer.com/?${params.toString()}`;
  }

  async listAccounts(): Promise<FeedAccount[]> {
    throw new BankFeedNotConnectedError('TrueLayer');
  }

  async listTransactions(): Promise<FeedTransaction[]> {
    throw new BankFeedNotConnectedError('TrueLayer');
  }
}

let cached: BankFeedAdapter | null = null;

export function getBankFeed(): BankFeedAdapter {
  if (cached) return cached;
  const config = env();
  cached =
    config.BANK_FEED_DRIVER === 'truelayer'
      ? new TrueLayerBankFeedAdapter({
          clientId: config.TRUELAYER_CLIENT_ID,
          clientSecret: config.TRUELAYER_CLIENT_SECRET,
          redirectUri: config.TRUELAYER_REDIRECT_URI,
        })
      : new NoBankFeedAdapter();
  return cached;
}

export function resetBankFeedCache(): void {
  cached = null;
}
