import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankAccounts, transactions } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { formatDate } from '@/lib/dates';
import { Badge, ButtonLink, Card, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { archiveAccountAction } from '../actions';
import { AddAccountForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bank accounts — TradeBooks' };

export default async function AccountsPage() {
  const { company } = await requirePermission('company.settings');

  const rows = await db
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
    .orderBy(bankAccounts.name);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Bank accounts"
        description="Every payment belongs to one of these."
        action={<ButtonLink href="/money-out/import" variant="secondary">Import a statement</ButtonLink>}
      />

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
                    {account.openingBalanceDate
                      ? ` · opening balance ${formatDate(account.openingBalanceDate)}`
                      : ''}
                  </p>
                  <p className="mt-2 flex flex-wrap gap-2">
                    {account.isArchived ? <Badge tone="neutral">Archived</Badge> : null}
                    {account.feedProvider ? (
                      <Badge tone="info">Feed: {account.feedProvider}</Badge>
                    ) : (
                      <Badge tone="neutral">Manual / CSV</Badge>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <Money pence={balance} size="lg" className="block" />
                  <span className="text-xs text-ink-500">balance</span>
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

      <Notice tone="info" title="No bank connection required">
        TradeBooks works from CSV statements and payments you add. An automatic feed is optional and can be
        switched on later without changing anything you have recorded.
      </Notice>
    </div>
  );
}
