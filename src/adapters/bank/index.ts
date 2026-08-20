import { env } from '@/lib/env';

export type FeedAccount = {
  externalId: string;
  name: string;
  accountType: string;
  currency: string;
  sortCode?: string | null;
  accountNumberLast4?: string | null;
  balancePence?: number | null;
  raw: Record<string, unknown>;
};

export type FeedTransaction = {
  externalId: string;
  date: string;
  /** Signed: negative is money out, positive is money in. */
  amountPence: number;
  description: string;
  counterparty?: string | null;
  reference?: string | null;
  balanceAfterPence?: number | null;
  raw: Record<string, unknown>;
};

export type CreateConnectionInput = {
  companyId: string;
  userName: string;
  userEmail: string;
  returnUri: string;
  userIp?: string | null;
};

export type CreatedConnection = {
  connectionId: string;
  status: string;
  hostedPageUri: string;
};

export interface BankFeedAdapter {
  readonly name: string;
  readonly available: boolean;
  createConnection(input: CreateConnectionInput): Promise<CreatedConnection>;
  listAccounts(connectionId: string, userIp?: string | null): Promise<FeedAccount[]>;
  listTransactions(
    connectionId: string,
    accountExternalId: string,
    from: string,
    to: string,
    userIp?: string | null,
  ): Promise<FeedTransaction[]>;
}

export class BankFeedNotConnectedError extends Error {
  constructor(provider: string) {
    super(`The ${provider} bank feed is not configured.`);
    this.name = 'BankFeedNotConnectedError';
  }
}

export class BankFeedProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BankFeedProviderError';
  }
}

class NoBankFeedAdapter implements BankFeedAdapter {
  readonly name = 'none';
  readonly available = false;
  async createConnection(): Promise<CreatedConnection> {
    throw new BankFeedNotConnectedError('open banking');
  }
  async listAccounts(): Promise<FeedAccount[]> {
    throw new BankFeedNotConnectedError('open banking');
  }
  async listTransactions(): Promise<FeedTransaction[]> {
    throw new BankFeedNotConnectedError('open banking');
  }
}

type TrueLayerConfig = {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  environment: 'sandbox' | 'live';
};

/** TrueLayer Data API v3 adapter. */
class TrueLayerBankFeedAdapter implements BankFeedAdapter {
  readonly name = 'truelayer';
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: TrueLayerConfig) {}

  get available(): boolean {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.redirectUri);
  }

  private get authBase(): string {
    return this.config.environment === 'sandbox'
      ? 'https://auth.truelayer-sandbox.com'
      : 'https://auth.truelayer.com';
  }

  private get apiBase(): string {
    return this.config.environment === 'sandbox'
      ? 'https://api.truelayer-sandbox.com'
      : 'https://api.truelayer.com';
  }

  private async accessToken(): Promise<string> {
    if (!this.available) throw new BankFeedNotConnectedError('TrueLayer');
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.config.clientId ?? '',
      client_secret: this.config.clientSecret ?? '',
      scope: 'data',
    });
    const response = await fetch(`${this.authBase}/connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerFailure('TrueLayer token request failed', response.status, payload);
    const value = asString(payload.access_token);
    if (!value) throw new BankFeedProviderError('TrueLayer did not return an access token.');
    const expiresIn = asNumber(payload.expires_in) ?? 3600;
    this.token = { value, expiresAt: Date.now() + expiresIn * 1000 };
    return value;
  }

  private async headers(connectionId?: string, userIp?: string | null): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${await this.accessToken()}`,
      accept: 'application/json; charset=UTF-8',
    };
    if (connectionId) headers['Connection-Id'] = connectionId;
    if (userIp) headers['Tl-User-IP'] = userIp.split(',')[0]?.trim() ?? userIp;
    return headers;
  }

  async createConnection(input: CreateConnectionInput): Promise<CreatedConnection> {
    const response = await fetch(`${this.apiBase}/v3/data-connections`, {
      method: 'POST',
      headers: {
        ...(await this.headers(undefined, input.userIp)),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        scopes: ['accounts', 'balance', 'transactions'],
        provider_selection: {
          type: 'user_selected',
          filter: {
            countries: ['GB'],
            release_channel: 'public',
            customer_segments: ['business', 'retail'],
          },
        },
        user: { name: input.userName, email: input.userEmail },
        user_consent: { type: 'authorization_flow_captured' },
        hosted_page: {
          type: 'authorization_flow',
          return_uri: input.returnUri,
          country_code: 'GB',
          language_code: 'en',
        },
        data_access_type: 'recurring',
        metadata: { company_id: input.companyId },
      }),
      cache: 'no-store',
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerFailure('TrueLayer connection request failed', response.status, payload);

    const connectionId = asString(payload.id);
    const status = asString(payload.status) ?? 'authorization_required';
    const hostedPage = asRecord(payload.hosted_page);
    const hostedPageUri = asString(hostedPage?.uri);
    if (!connectionId || !hostedPageUri) {
      throw new BankFeedProviderError('TrueLayer did not return a connection ID and hosted bank page.');
    }
    return { connectionId, status, hostedPageUri };
  }

  async listAccounts(connectionId: string, userIp?: string | null): Promise<FeedAccount[]> {
    const response = await fetch(`${this.apiBase}/v3/connected-accounts`, {
      headers: await this.headers(connectionId, userIp),
      cache: 'no-store',
    });
    const payload = await readJson(response);
    if (!response.ok) throw providerFailure('TrueLayer account request failed', response.status, payload);

    return asArray(payload.items).flatMap((value) => {
      const item = asRecord(value);
      const externalId = asString(item?.id);
      if (!item || !externalId) return [];

      const identifiers = asArray(item.account_identifiers).map(asRecord).filter(Boolean) as Record<string, unknown>[];
      const sortAndNumber = identifiers.find((identifier) => identifier.type === 'sort_code_account_number');
      const accountNumber = asString(sortAndNumber?.account_number);
      const balance = asRecord(item.balance);
      const balanceMinor =
        asNumber(balance?.current_amount_in_minor) ??
        asNumber(balance?.current_in_minor) ??
        asNumber(item.current_balance_in_minor) ??
        null;

      return [{
        externalId,
        name: asString(item.name) ?? asString(item.display_name) ?? 'Connected bank account',
        accountType: normaliseAccountType(asString(item.account_type) ?? asString(item.type)),
        currency: asString(item.currency) ?? 'GBP',
        sortCode: asString(sortAndNumber?.sort_code),
        accountNumberLast4: accountNumber ? accountNumber.slice(-4) : null,
        balancePence: balanceMinor,
        raw: item,
      } satisfies FeedAccount];
    });
  }

  async listTransactions(
    connectionId: string,
    accountExternalId: string,
    from: string,
    to: string,
    userIp?: string | null,
  ): Promise<FeedTransaction[]> {
    const all: FeedTransaction[] = [];
    let cursor: string | null = null;

    do {
      const body: Record<string, unknown> = { from, to, page_size: 500 };
      if (cursor) body.cursor = cursor;
      const createResponse = await fetch(
        `${this.apiBase}/v3/connected-accounts/${encodeURIComponent(accountExternalId)}/transactions/requests`,
        {
          method: 'POST',
          headers: {
            ...(await this.headers(connectionId, userIp)),
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          cache: 'no-store',
        },
      );
      const created = await readJson(createResponse);
      if (!createResponse.ok) {
        throw providerFailure('TrueLayer transaction request failed', createResponse.status, created);
      }
      const requestId = asString(created.id);
      if (!requestId) throw new BankFeedProviderError('TrueLayer did not return a transaction request ID.');

      const completed = await this.waitForTransactions(connectionId, accountExternalId, requestId, userIp);
      all.push(...completed.items.map(mapTransaction).filter((item): item is FeedTransaction => item !== null));
      cursor = completed.nextCursor;
    } while (cursor);

    return all;
  }

  private async waitForTransactions(
    connectionId: string,
    accountExternalId: string,
    requestId: string,
    userIp?: string | null,
  ): Promise<{ items: Record<string, unknown>[]; nextCursor: string | null }> {
    const url = `${this.apiBase}/v3/connected-accounts/${encodeURIComponent(accountExternalId)}/transactions/requests/${encodeURIComponent(requestId)}`;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      if (attempt > 0) await delay(500);
      const response = await fetch(url, {
        headers: await this.headers(connectionId, userIp),
        cache: 'no-store',
      });
      const payload = await readJson(response);
      if (!response.ok) throw providerFailure('TrueLayer transaction result failed', response.status, payload);
      const status = asString(payload.status);
      if (status === 'pending') continue;
      if (status === 'failed') {
        throw new BankFeedProviderError(
          `TrueLayer could not retrieve transactions${asString(payload.failure_reason) ? `: ${asString(payload.failure_reason)}` : '.'}`,
        );
      }
      if (status === 'completed') {
        const result = asRecord(payload.result) ?? {};
        const pagination = asRecord(result.pagination) ?? asRecord(payload.pagination);
        const items = asArray(result.items ?? result.transactions ?? payload.items)
          .map(asRecord)
          .filter(Boolean) as Record<string, unknown>[];
        return { items, nextCursor: asString(pagination?.next_cursor) };
      }
    }
    throw new BankFeedProviderError('The bank is still preparing transactions. Tap Sync again in a moment.');
  }
}

function mapTransaction(item: Record<string, unknown>): FeedTransaction | null {
  const externalId =
    asString(item.id) ??
    asString(item.normalised_provider_transaction_id) ??
    asString(item.provider_transaction_id) ??
    asString(item.transaction_id);
  const timestamp = asString(item.timestamp) ?? asString(item.booked_at) ?? asString(item.created_at);
  if (!externalId || !timestamp) return null;

  const minor = asNumber(item.amount_in_minor);
  const major = asNumber(item.amount);
  const rawAmount = minor ?? (major === null ? null : Math.round(major * 100));
  if (rawAmount === null) return null;

  const type = (asString(item.transaction_type) ?? asString(item.direction) ?? '').toLowerCase();
  let signed = rawAmount;
  if (type === 'debit' || type === 'outgoing' || type === 'money_out') signed = -Math.abs(rawAmount);
  if (type === 'credit' || type === 'incoming' || type === 'money_in') signed = Math.abs(rawAmount);

  const running = asRecord(item.running_balance);
  const runningMinor = asNumber(running?.amount_in_minor);
  const runningMajor = asNumber(running?.amount);
  const balanceAfterPence = runningMinor ?? (runningMajor === null ? null : Math.round(runningMajor * 100));

  return {
    externalId,
    date: timestamp.slice(0, 10),
    amountPence: signed,
    description: asString(item.description) ?? asString(item.merchant_name) ?? 'Bank transaction',
    counterparty: asString(item.merchant_name) ?? asString(item.counterparty_name),
    reference: asString(item.reference),
    balanceAfterPence,
    raw: item,
  };
}

function normaliseAccountType(value: string | null): string {
  const type = (value ?? '').toLowerCase();
  if (type.includes('saving')) return 'savings';
  if (type.includes('card')) return 'credit_card';
  return 'current';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => ({}));
  return asRecord(value) ?? {};
}

function providerFailure(prefix: string, status: number, payload: Record<string, unknown>): BankFeedProviderError {
  const detail =
    asString(payload.detail) ??
    asString(payload.title) ??
    asString(payload.error_description) ??
    asString(payload.error);
  return new BankFeedProviderError(`${prefix} (${status})${detail ? `: ${detail}` : ''}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
          environment: config.TRUELAYER_ENV,
        })
      : new NoBankFeedAdapter();
  return cached;
}

export function resetBankFeedCache(): void {
  cached = null;
}
