import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { invoiceCounts, listInvoices } from '@/domain/queries';
import { formatDate, relativeDays, todayIso } from '@/lib/dates';
import { Badge, ButtonLink, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader, Tabs } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Money in — TradeBooks' };

const FILTERS = ['all', 'unpaid', 'overdue', 'paid', 'draft'] as const;
type Filter = (typeof FILTERS)[number];

export default async function MoneyInPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string }>;
}) {
  const { company } = await requireAuth();
  const params = await searchParams;
  const view = (FILTERS as readonly string[]).includes(params.view ?? '')
    ? (params.view as Filter)
    : 'unpaid';

  const [invoices, counts] = await Promise.all([
    listInvoices(db, company.id, { status: view, search: params.q }),
    invoiceCounts(db, company.id),
  ]);

  const owed = invoices.reduce((sum, invoice) => sum + invoice.outstandingPence, 0);
  const today = todayIso();

  return (
    <div>
      <PageHeader
        title="Money in"
        description="Invoices you have sent and what is still owed."
        action={
          <ButtonLink href="/money-in/new">
            <Icon name="plus" className="size-5" /> New invoice
          </ButtonLink>
        }
      />

      <Tabs
        current={`/money-in?view=${view}`}
        items={[
          { href: '/money-in?view=unpaid', label: 'Owed to you', count: counts.unpaid },
          { href: '/money-in?view=overdue', label: 'Overdue', count: counts.overdue },
          { href: '/money-in?view=paid', label: 'Paid', count: counts.paid },
          { href: '/money-in?view=draft', label: 'Drafts', count: counts.draft },
          { href: '/money-in?view=all', label: 'Everything', count: counts.all },
        ]}
      />

      {invoices.length > 0 && view !== 'paid' ? (
        <p className="mb-3 text-sm text-ink-600">
          <span className="font-semibold text-ink-900">
            <Money pence={owed} size="sm" />
          </span>{' '}
          outstanding across {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}.
        </p>
      ) : null}

      {invoices.length === 0 ? (
        <EmptyState
          title={view === 'unpaid' ? 'Nothing outstanding' : 'No invoices here'}
          description={
            view === 'unpaid'
              ? 'Every invoice you have sent has been paid. Nice.'
              : 'Raise an invoice and it will appear here with its payment status.'
          }
          action={<ButtonLink href="/money-in/new">New invoice</ButtonLink>}
        />
      ) : (
        <List>
          {invoices.map((invoice) => (
            <ListRow
              key={invoice.id}
              href={`/money-in/${invoice.id}`}
              title={invoice.customerName}
              subtitle={`${invoice.number}${invoice.jobReference ? ` · ${invoice.jobReference}` : ''}`}
              meta={
                <>
                  {statusBadge(invoice.status, invoice.isOverdue)}
                  {invoice.cisDeductionPence > 0 ? <Badge tone="info">CIS deducted</Badge> : null}
                  <span className="text-xs text-ink-500">
                    {invoice.status === 'paid'
                      ? `Paid · issued ${formatDate(invoice.issueDate)}`
                      : `Due ${formatDate(invoice.dueDate)} (${relativeDays(invoice.dueDate, today)})`}
                  </span>
                </>
              }
              right={
                <>
                  <Money
                    pence={invoice.status === 'paid' ? invoice.grossPence : invoice.outstandingPence}
                    className="block text-ink-900"
                  />
                  {invoice.paidPence > 0 && invoice.status !== 'paid' ? (
                    <span className="text-xs text-ink-500">
                      of <Money pence={invoice.grossPence} size="sm" className="font-normal" />
                    </span>
                  ) : null}
                </>
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}

function statusBadge(status: string, isOverdue: boolean) {
  if (status === 'paid') return <Badge tone="good">Paid</Badge>;
  if (status === 'draft') return <Badge tone="neutral">Draft</Badge>;
  if (status === 'void') return <Badge tone="neutral">Cancelled</Badge>;
  if (isOverdue) return <Badge tone="bad">Overdue</Badge>;
  if (status === 'part_paid') return <Badge tone="warn">Part paid</Badge>;
  return <Badge tone="info">Waiting for payment</Badge>;
}
