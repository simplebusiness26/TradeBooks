import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { listBills } from '@/domain/queries';
import { formatDate, relativeDays, todayIso } from '@/lib/dates';
import { Badge, ButtonLink, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader, Tabs } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bills to pay — TradeBooks' };

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { company } = await requireAuth();
  const params = await searchParams;
  const view = params.view === 'paid' ? 'paid' : params.view === 'all' ? 'all' : 'unpaid';
  const bills = await listBills(db, company.id, { status: view });
  const today = todayIso();
  const total = bills.reduce((sum, bill) => sum + bill.outstandingPence, 0);

  return (
    <div>
      <PageHeader
        backHref="/money-out"
        backLabel="Money out"
        title="Bills to pay"
        description="Supplier and subcontractor invoices you have received."
        action={
          <ButtonLink href="/money-out/bills/new">
            <Icon name="plus" className="size-5" /> Add a bill
          </ButtonLink>
        }
      />

      <Tabs
        current={`/money-out/bills?view=${view}`}
        items={[
          { href: '/money-out/bills?view=unpaid', label: 'To pay', count: undefined },
          { href: '/money-out/bills?view=paid', label: 'Paid' },
          { href: '/money-out/bills?view=all', label: 'Everything' },
        ]}
      />

      {view === 'unpaid' && bills.length > 0 ? (
        <p className="mb-3 text-sm text-ink-600">
          <Money pence={total} size="sm" className="text-ink-900" /> due across {bills.length}{' '}
          {bills.length === 1 ? 'bill' : 'bills'}.
        </p>
      ) : null}

      {bills.length === 0 ? (
        <EmptyState
          title={view === 'unpaid' ? 'Nothing to pay' : 'No bills yet'}
          description="Add merchant invoices and subcontractor bills here so you always know what is owed."
          action={<ButtonLink href="/money-out/bills/new">Add a bill</ButtonLink>}
        />
      ) : (
        <List>
          {bills.map((bill) => (
            <ListRow
              key={bill.id}
              href={`/money-out/bills/${bill.id}`}
              title={bill.supplierName}
              subtitle={`${bill.number}${bill.reference ? ` · ${bill.reference}` : ''}`}
              meta={
                <>
                  {bill.status === 'paid' ? (
                    <Badge tone="good">Paid</Badge>
                  ) : bill.isOverdue ? (
                    <Badge tone="bad">Overdue</Badge>
                  ) : bill.status === 'part_paid' ? (
                    <Badge tone="warn">Part paid</Badge>
                  ) : (
                    <Badge tone="info">To pay</Badge>
                  )}
                  {bill.isSubcontractorPayment ? <Badge tone="info">CIS</Badge> : null}
                  {bill.jobReference ? <Badge tone="neutral">{bill.jobReference}</Badge> : null}
                  <span className="text-xs text-ink-500">
                    Due {formatDate(bill.dueDate)} ({relativeDays(bill.dueDate, today)})
                  </span>
                </>
              }
              right={
                <Money
                  pence={bill.status === 'paid' ? bill.grossPence : bill.outstandingPence}
                  className="text-ink-900"
                />
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
