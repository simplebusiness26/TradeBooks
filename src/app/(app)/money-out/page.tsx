import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { listTransactions, transactionCounts, type TransactionFilter } from '@/domain/queries';
import { formatDate } from '@/lib/dates';
import { Badge, ButtonLink, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader, Tabs } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Money out — TradeBooks' };

const FILTERS: TransactionFilter[] = ['all', 'needs_answer', 'needs_receipt', 'reviewed', 'money_in', 'money_out'];

export default async function MoneyOutPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { company } = await requireAuth();
  const params = await searchParams;
  const view = (FILTERS as string[]).includes(params.view ?? '')
    ? (params.view as TransactionFilter)
    : 'all';

  const [rows, counts] = await Promise.all([
    listTransactions(db, company.id, { filter: view, search: params.q }),
    transactionCounts(db, company.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Money out"
        description="Everything through the bank, sorted into categories."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/money-out/import" variant="secondary">
              Import statement
            </ButtonLink>
            <ButtonLink href="/money-out/new">
              <Icon name="plus" className="size-5" /> Add
            </ButtonLink>
          </div>
        }
      />

      <Tabs
        current={`/money-out?view=${view}`}
        items={[
          { href: '/money-out?view=all', label: 'Everything', count: counts.all },
          { href: '/money-out?view=needs_answer', label: 'Needs an answer', count: counts.needsAnswer },
          { href: '/money-out?view=needs_receipt', label: 'Needs a receipt', count: counts.needsReceipt },
          { href: '/money-out?view=reviewed', label: 'Reviewed', count: counts.reviewed },
        ]}
      />

      <p className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href="/money-out/bills" className="font-semibold text-brand-700 underline">
          Supplier bills →
        </Link>
      </p>

      {rows.length === 0 ? (
        <EmptyState
          title="No payments here yet"
          description="Import a bank statement or add a payment by hand. TradeBooks sorts what it recognises and asks about the rest."
          action={<ButtonLink href="/money-out/import">Import a statement</ButtonLink>}
        />
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              href={`/money-out/${row.id}`}
              title={friendlyDescription(row.description, row.supplierName, row.customerName)}
              subtitle={`${formatDate(row.transactionDate)} · ${row.accountName}`}
              meta={
                <>
                  {row.isPersonal ? (
                    <Badge tone="neutral">Personal</Badge>
                  ) : row.categoryName ? (
                    <Badge tone="neutral">{row.categoryName}</Badge>
                  ) : (
                    <Badge tone="warn">Needs an answer</Badge>
                  )}
                  {row.needsReceipt && !row.hasReceipt ? <Badge tone="warn">No receipt</Badge> : null}
                  {row.hasReceipt ? <Badge tone="good">Receipt</Badge> : null}
                  {row.jobReference ? <Badge tone="info">{row.jobReference}</Badge> : null}
                  {row.status === 'reviewed' ? <Badge tone="good">Reviewed</Badge> : null}
                  {row.status === 'excluded' ? <Badge tone="neutral">Excluded</Badge> : null}
                </>
              }
              right={
                <Money
                  pence={row.direction === 'money_in' ? row.amountPence : -row.amountPence}
                  className={row.direction === 'money_in' ? 'text-good-700' : 'text-ink-900'}
                  showSign={row.direction === 'money_in'}
                />
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}

/** Prefers the supplier or customer we matched over the raw bank text. */
function friendlyDescription(
  description: string,
  supplierName: string | null,
  customerName: string | null,
): string {
  return supplierName ?? customerName ?? description;
}
