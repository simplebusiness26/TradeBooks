import type {
  BankFeedAdapter,
  CreateConnectionInput,
  CreatedConnection,
  FeedAccount,
  FeedTransaction,
} from './index';

type GoCardlessConfig = {
  secretId?: string;
  secretKey?: string;
  institutionId?: string;
};

type TokenCache = {
  access: string;
  accessExpiresAt: number;
  refresh: string;
  refreshExpiresAt: number;
};

const API_BASE = 'https://bankaccountdata.gocardless.com/api/v2';
const SANDBOX_INSTITUTION_ID = 'SANDBOXFINANCE_SFIN0000';

/** GoCardless Bank Account Data (Account Information API v2) adapter. */
export class GoCardlessBankFeedAdapter implements BankFeedAdapter {
  readonly name = 'gocardless';
  private token: TokenCache | null = null;

  constructor(private readonly config: GoCardlessConfig) {}

  get available(): boolean {
    return Boolean(this.config.secretId && this.config.secretKey);
  }

  async createConnection(input: CreateConnectionInput): Promise<CreatedConnection> {
    if (!this.available) throw new Error('The GoCardless bank feed is not configured.');
    const institutionId = this.config.institutionId || SANDBOX_INSTITUTION_ID;

    const response = await fetch(`${API_BASE}/requisitions/`, {
      method: 'POST',
      headers: { ...(await this.headers()), 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect: input.returnUri,
        institution_id: institutionId,
        reference: `${input.companyId}-${Date.now()}`,
        user_language: 'EN',
      }),
      cache: 'no-store',
    });
    const payload = await readJsonValue(response);
    if (!response.ok) throw providerFailure('GoCardless connection request failed', response.status, payload);
    const object = asRecord(payload) ?? {};
    const connectionId = asString(object.id);
    const hostedPageUri = asString(object.link);
    const status = asString(object.status) ?? 'authorization_required';
    if (!connectionId || !hostedPageUri) {
      throw new Error('GoCardless did not return a requisition ID and bank authorisation link.');
    }
    return { connectionId, status, hostedPageUri };
  }

  async listAccounts(connectionId: string): Promise<FeedAccount[]> {
    const requisitionResponse = await fetch(`${API_BASE}/requisitions/${encodeURIComponent(connectionId)}/`, {
      headers: await this.headers(),
      cache: 'no-store',
    });
    const requisitionPayload = await readJsonValue(requisitionResponse);
    if (!requisitionResponse.ok) {
      throw providerFailure('GoCardless requisition request failed', requisitionResponse.status, requisitionPayload);
    }
    const requisition = asRecord(requisitionPayload) ?? {};
    const accountIds = asArray(requisition.accounts).map(asString).filter((value): value is string => Boolean(value));

    const accounts: FeedAccount[] = [];
    for (const accountId of accountIds) {
      const [detailsResponse, balancesResponse] = await Promise.all([
        fetch(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/details/`, { headers: await this.headers(), cache: 'no-store' }),
        fetch(`${API_BASE}/accounts/${encodeURIComponent(accountId)}/balances/`, { headers: await this.headers(), cache: 'no-store' }),
      ]);
      const detailsPayload = await readJsonValue(detailsResponse);
      const balancesPayload = await readJsonValue(balancesResponse);
      if (!detailsResponse.ok) throw providerFailure('GoCardless account details request failed', detailsResponse.status, detailsPayload);
      if (!balancesResponse.ok) throw providerFailure('GoCardless balance request failed', balancesResponse.status, balancesPayload);

      const detailsRoot = asRecord(detailsPayload) ?? {};
      const details = asRecord(detailsRoot.account) ?? detailsRoot;
      const balancesRoot = asRecord(balancesPayload) ?? {};
      const balanceItems = asArray(balancesRoot.balances).map(asRecord).filter(Boolean) as Record<string, unknown>[];
      const preferredBalance = balanceItems.find((item) => asString(item.balanceType)?.toLowerCase().includes('interim')) ?? balanceItems[0];
      const balanceAmount = asRecord(preferredBalance?.balanceAmount);
      const iban = asString(details.iban);
      const accountNumber = asString(details.bban) ?? asString(details.resourceId);

      accounts.push({
        externalId: accountId,
        name: asString(details.name) ?? asString(details.product) ?? asString(details.ownerName) ?? 'Connected bank account',
        accountType: normaliseAccountType(asString(details.cashAccountType) ?? asString(details.product)),
        currency: asString(details.currency) ?? asString(balanceAmount?.currency) ?? 'GBP',
        sortCode: extractSortCode(accountNumber),
        accountNumberLast4: extractLast4(accountNumber ?? iban),
        balancePence: decimalToPence(asString(balanceAmount?.amount)),
        raw: { details: detailsRoot, balances: balancesRoot },
      });
    }
    return accounts;
  }

  async listTransactions(
    _connectionId: string,
    accountExternalId: string,
    from: string,
    to: string,
  ): Promise<FeedTransaction[]> {
    const url = new URL(`${API_BASE}/accounts/${encodeURIComponent(accountExternalId)}/transactions/`);
    url.searchParams.set('date_from', from);
    url.searchParams.set('date_to', to);
    const response = await fetch(url, { headers: await this.headers(), cache: 'no-store' });
    const payload = await readJsonValue(response);
    if (!response.ok) throw providerFailure('GoCardless transaction request failed', response.status, payload);
    const root = asRecord(payload) ?? {};
    const transactions = asRecord(root.transactions) ?? {};
    const booked = asArray(transactions.booked).map(asRecord).filter(Boolean) as Record<string, unknown>[];

    return booked.flatMap((item, index) => {
      const amount = decimalToPence(asString(asRecord(item.transactionAmount)?.amount));
      const date = asString(item.bookingDate) ?? asString(item.valueDate);
      if (amount === null || !date) return [];
      const externalId = asString(item.transactionId) ?? asString(item.internalTransactionId) ?? `${accountExternalId}:${date}:${amount}:${index}`;
      const counterparty = asString(item.creditorName) ?? asString(item.debtorName);
      const description = asString(item.remittanceInformationUnstructured) ?? asString(item.additionalInformation) ?? counterparty ?? 'Bank transaction';
      const balanceAmount = asRecord(asRecord(item.balanceAfterTransaction)?.balanceAmount);
      return [{
        externalId,
        date: date.slice(0, 10),
        amountPence: amount,
        description,
        counterparty,
        reference: asString(item.endToEndId) ?? asString(item.remittanceInformationUnstructured),
        balanceAfterPence: decimalToPence(asString(balanceAmount?.amount)),
        raw: item,
      } satisfies FeedTransaction];
    });
  }

  private async headers(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.accessToken()}`, accept: 'application/json' };
  }

  private async accessToken(): Promise<string> {
    if (!this.available) throw new Error('The GoCardless bank feed is not configured.');
    if (this.token?.access && this.token.accessExpiresAt > Date.now() + 60_000) return this.token.access;

    if (this.token?.refresh && this.token.refreshExpiresAt > Date.now() + 60_000) {
      const refreshed = await refreshAccess(this.token.refresh);
      if (refreshed) {
        this.token.access = refreshed.access;
        this.token.accessExpiresAt = Date.now() + refreshed.expiresIn * 1000;
        return refreshed.access;
      }
    }

    const response = await fetch(`${API_BASE}/token/new/`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ secret_id: this.config.secretId, secret_key: this.config.secretKey }),
      cache: 'no-store',
    });
    const payload = await readJsonValue(response);
    if (!response.ok) throw providerFailure('GoCardless token request failed', response.status, payload);
    const object = asRecord(payload) ?? {};
    const refresh = asString(object.refresh);
    if (!refresh) throw new Error('GoCardless did not return a refresh token.');
    const refreshed = await refreshAccess(refresh);
    if (!refreshed) throw new Error('GoCardless did not return an access token.');

    this.token = {
      access: refreshed.access,
      accessExpiresAt: Date.now() + refreshed.expiresIn * 1000,
      refresh,
      refreshExpiresAt: Date.now() + (asInteger(object.refresh_expires) ?? 2_592_000) * 1000,
    };
    return refreshed.access;
  }
}

async function refreshAccess(refresh: string): Promise<{ access: string; expiresIn: number } | null> {
  const response = await fetch(`${API_BASE}/token/refresh/`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ refresh }),
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const object = asRecord(await readJsonValue(response)) ?? {};
  const access = asString(object.access);
  return access ? { access, expiresIn: asInteger(object.access_expires) ?? 86_400 } : null;
}

function normaliseAccountType(value: string | null): string {
  const type = (value ?? '').toLowerCase();
  if (type.includes('saving')) return 'savings';
  if (type.includes('card')) return 'credit_card';
  return 'current';
}

function decimalToPence(value: string | null): number | null {
  if (!value || !/^-?\d+(?:\.\d+)?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const pence = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return negative ? -pence : pence;
}
function extractSortCode(value: string | null): string | null {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (digits.length < 14) return null;
  const sort = digits.slice(-14, -8);
  return `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4, 6)}`;
}
function extractLast4(value: string | null): string | null {
  const clean = value?.replace(/[^a-zA-Z0-9]/g, '') ?? '';
  return clean.length >= 4 ? clean.slice(-4) : null;
}
function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function asString(value: unknown): string | null { return typeof value === 'string' && value.length > 0 ? value : null; }
function asInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return null;
}
async function readJsonValue(response: Response): Promise<unknown> { return response.json().catch(() => ({})); }
function providerFailure(prefix: string, status: number, payload: unknown): Error {
  const object = asRecord(payload) ?? {};
  const detail = asString(object.detail) ?? asString(object.summary) ?? asString(object.message);
  return new Error(`${prefix} (${status})${detail ? `: ${detail}` : ''}`);
}
