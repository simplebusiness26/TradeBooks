import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { formatMarginPercent, listJobSummaries, unallocatedJobCosts } from '@/domain/jobs';
import { Badge, ButtonLink, EmptyState, Money, Notice } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Jobs — TradeBooks' };

export default async function JobsPage() {
  const { company } = await requireAuth();
  const [summaries, unallocated] = await Promise.all([
    listJobSummaries(db, company.id),
    unallocatedJobCosts(db, company.id),
  ]);

  const totalProfit = summaries.reduce((sum, job) => sum + job.profitPence, 0);

  return (
    <div>
      <PageHeader
        title="Jobs"
        description="What each job actually made, once the costs are in."
        action={
          <ButtonLink href="/jobs/new">
            <Icon name="plus" className="size-5" /> New job
          </ButtonLink>
        }
      />

      {unallocated.count > 0 ? (
        <div className="mb-4">
          <Notice tone="warn" title="Some costs are not on a job yet">
            <Money pence={unallocated.totalPence} size="sm" /> across {unallocated.count} payment
            {unallocated.count === 1 ? '' : 's'}. Job profit is understated until they are allocated.{' '}
            <a href="/money-out?view=all" className="font-semibold underline">
              Sort them out
            </a>
          </Notice>
        </div>
      ) : null}

      {summaries.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          description="Add a job, then link invoices, bills and receipts to it. TradeBooks works out the profit."
          action={<ButtonLink href="/jobs/new">Add your first job</ButtonLink>}
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-600">
            <Money pence={totalProfit} size="sm" className="text-ink-900" /> total profit across{' '}
            {summaries.length} {summaries.length === 1 ? 'job' : 'jobs'}.
          </p>
          <List>
            {summaries.map((job) => (
              <ListRow
                key={job.id}
                href={`/jobs/${job.id}`}
                title={job.name}
                subtitle={`${job.reference}${job.customerName ? ` · ${job.customerName}` : ''}`}
                meta={
                  <>
                    <Badge tone={statusTone(job.status)}>{statusLabel(job.status)}</Badge>
                    <span className="text-xs text-ink-500">
                      In <Money pence={job.invoicedNetPence} size="sm" className="font-normal" /> · Out{' '}
                      <Money pence={job.costsPence} size="sm" className="font-normal" />
                    </span>
                  </>
                }
                right={
                  <>
                    <Money
                      pence={job.profitPence}
                      className={job.profitPence >= 0 ? 'block text-good-700' : 'block text-bad-700'}
                    />
                    <span className="text-xs text-ink-500">{formatMarginPercent(job.marginBasisPoints)}</span>
                  </>
                }
              />
            ))}
          </List>
        </>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'quoted':
      return 'Quoted';
    case 'active':
      return 'In progress';
    case 'on_hold':
      return 'On hold';
    case 'completed':
      return 'Finished';
    case 'invoiced':
      return 'Invoiced';
    case 'closed':
      return 'Closed';
    default:
      return 'Cancelled';
  }
}

function statusTone(status: string): 'good' | 'info' | 'warn' | 'neutral' {
  switch (status) {
    case 'active':
      return 'info';
    case 'completed':
    case 'invoiced':
      return 'good';
    case 'on_hold':
      return 'warn';
    default:
      return 'neutral';
  }
}
