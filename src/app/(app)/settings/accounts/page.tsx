import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankAccounts, bankConnections, transactions } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { formatDate } from '@/lib/dates';
import { getBankFeed } from '@/adapters/bank';
import { Badge, ButtonLink, Card, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { archiveAccountAction } from '../actions';
import { AddAccountForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bank accounts — TradeBooks' };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ bank?: string; imported?: string; duplicates?: string }>;
}) {
  const { company } = await requirePermission('company.settings');
  const params = await searchParams;

  const [rows, connections] = await Promise.all([
    db
      .select({
        account: bankAccounts,
        inflow: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_in' then ${transactions.amountPence} else 0 end), 0)::bigint`,
        outflow: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_out' then ${transactions.amountPence} else 0 end), 0)::bigint`,
        count: sql<number>`count(${transactions.id})::int`,
      })
      .from(bankAccounts)
      .leftJoin(transactions, eq(transactions.bankAccountId, bankAccounts.id))
      .where(eq(bankAccounts.companyId, company.id))
      .groupBy(bankAccounts.id)
      .orderBy(bankAccounts.name),
    db
      .select()
      .from(bankConnections)
      .where(eq(bankConnections.companyId, company.id))
      .orderBy(bankConnections.createdAt),
  ]);

  const connected = connections.some((connection) =>
    ['connected', 'connected_with_errors'].includes(connection.status),
  );
  const bankFeedAvailable = getBankFeed().available;
  const latestSync = connections
    .map((connection) => connection.lastSyncedAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Bank accounts"
        description="Connect the business bank once and TradeBooks can keep the transactions up to date."
        action={
          <div className="flex flex-wrap gap-2">
            {!connected ? (
              <ButtonLink href="/api/bank/connect">Connect bank</ButtonLink>
            ) : null}
            <ButtonLink href="/money-out/import" variant="secondary">
              Import a statement
            </ButtonLink>
          </div>
        }
      />

      {params.bank === 'connected' ? (
        <Notice tone="success" title="Bank connected">
          TradeBooks connected the bank and imported {params.imported ?? '0'} new transaction{params.imported === '1' ? '' : 's'}.
        </Notice>
      ) : null}
      {params.bank === 'synced' ? (
        <Notice tone="success" title="Bank up to date">
          Imported {params.imported ?? '0'} new transaction{params.imported === '1' ? '' : 's'}. Existing transactions were safely ignored.
        </Notice>
      ) : null}
      {params.bank === 'sync-warning' || params.bank === 'sync-error' || params.bank === 'connect-error' ? (
        <Notice tone="warning" title="Bank connection needs another try">
          Your existing bookkeeping is safe. Try connecting or syncing again; if it still fails, check the TrueLayer connection settings.
        </Notice>
      ) : null}
      {params.bank === 'not-configured' ? (
        <Notice tone="warning" title="Open Banking is not switched on yet">
          The TrueLayer credentials are present only when the bank-feed driver is enabled on the server.
        </Notice>
      ) : null}
      {params.bank === 'invalid-return' ? (
        <Notice tone="warning" title="That bank return could not be verified">
          Start again with the Connect bank button so TradeBooks can securely match the bank approval to this business.
        </Notice>
      ) : null}

      {connected ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink-900">Automatic bank feed connected</p>
              <p className="mt-1 text-sm text-ink-500">
                {latestSync ? `Last synced ${latestSync.toLocaleString('en-GB')}` : 'Ready for the first sync.'}
              </p>
            </div>
            <form action="/api/bank/sync" method="post">
              <SubmitButton pendingLabel="Syncing…">Sync now</SubmitButton>
            </form>
          </div>
        </Card>
      ) : !bankFeedAvailable ? (
        <Notice tone="info" title="Bank feed ready to enable">
          TradeBooks can still use CSV statements. Once the TrueLayer bank-feed driver is enabled, the Connect bank button will start the secure bank authorisation flow.
        </Notice>
      ) : (
        <Notice tone="info" title="Connect securely through Open Banking">
          Tap Connect bank, choose the bank, approve access on the bank&apos;s secure screen, and you will return here. TradeBooks never receives the bank password.
        </Notice>
      )}

      <div className="space-y-3">
        {rows.map(({ account, inflow, outflow, count }) => {
          const balance = account.openingBalancePence + Number(inflow) - Number(outflow);
          return (
            <Card key={account.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink-900">{account.name}</p>
                  <p className="text-sm text-ink-500">
                    {account.accountType.replace(/_/g, ' ')}
                    {account.accountNumberLast4 ? ` · ending ${account.accountNumberLast4}` : ''}
                    {account.sortCode ? ` · ${account.sortCode}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {count} transaction{count === 1 ? '' : 's'}
                    {account.feedLastSyncedAt
                      ? ` · synced ${account.feedLastSyncedAt.toLocaleString('en-GB')}`
                      : account.openingBalanceDate
                        ? ` · opening balance ${formatDate(account.openingBalanceDate)}`
                        : ''}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    {account.isArchived ? <Badge tone="neutral">Archived</Badge> : null}
                    {account.feedProvider ? (
                      <Badge tone="info">Open Banking connected</Badge>
                    ) : (
                      <Badge tone="neutral">Manual / CSV</Badge>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <Money pence={balance} size="lg" className="block" />
                  <span className="text-xs text-ink-500">recorded balance</span>
                </div>
              </div>

              {!account.isArchived ? (
                <form action={archiveAccountAction} className="mt-4">
                  <input type="hidden" name="accountId" value={account.id} />
                  <SubmitButton variant="ghost" pendingLabel="Archiving…">
                    Archive this account
                  </SubmitButton>
                </form>
              ) : null}
            </Card>
          );
        })}
      </div>

      <AddAccountForm />
    </div>
  );
}
