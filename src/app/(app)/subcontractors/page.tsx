import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { calculateCisPeriod, listCisPeriods, listSubcontractors } from '@/domain/cis';
import { cisPeriodFor, formatDate, todayIso } from '@/lib/dates';
import { Badge, ButtonLink, Card, DataRow, EmptyState, Money, Notice } from '@/components/ui/primitives';
import { List, ListRow, PageHeader, Tabs } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { Icon } from '@/components/shell/icons';
import { CisActions } from './actions-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Subcontractors — TradeBooks' };

export default async function SubcontractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; view?: string }>;
}) {
  const { company, role } = await requireAuth();
  const params = await searchParams;
  const today = todayIso();

  const requested = params.period && /^\d{4}-\d{2}-\d{2}$/.test(params.period) ? params.period : today;
  const periodInfo = cisPeriodFor(requested);

  const [period, subcontractors, history] = await Promise.all([
    calculateCisPeriod(db, company.id, periodInfo.start, periodInfo.end),
    listSubcontractors(db, company.id),
    listCisPeriods(db, company.id),
  ]);

  const previous = cisPeriodFor(shiftMonth(periodInfo.start, -1));
  const next = cisPeriodFor(shiftMonth(periodInfo.start, 1));
  const view = params.view === 'people' ? 'people' : 'period';

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subcontractors"
        description="CIS records, deductions and the monthly return."
        action={
          can(role, 'records.write') ? (
            <ButtonLink href="/suppliers/new?kind=subcontractor">
              <Icon name="plus" className="size-5" /> Add subcontractor
            </ButtonLink>
          ) : null
        }
      />

      <Tabs
        current={`/subcontractors?view=${view}`}
        items={[
          { href: '/subcontractors?view=period', label: 'This month’s return' },
          { href: '/subcontractors?view=people', label: 'People', count: subcontractors.length },
        ]}
      />

      {view === 'people' ? (
        subcontractors.length === 0 ? (
          <EmptyState
            title="No subcontractors yet"
            description="Add the people you pay under CIS. TradeBooks then works out deductions for you."
            action={<ButtonLink href="/suppliers/new?kind=subcontractor">Add a subcontractor</ButtonLink>}
          />
        ) : (
          <List>
            {subcontractors.map((subcontractor) => (
              <ListRow
                key={subcontractor.id}
                href={`/suppliers/${subcontractor.id}`}
                title={subcontractor.name}
                subtitle={subcontractor.contactName ?? undefined}
                meta={
                  <>
                    {subcontractor.cisStatus === 'unknown' ? (
                      <Badge tone="warn">Not verified — 30%</Badge>
                    ) : subcontractor.cisStatus === 'gross' ? (
                      <Badge tone="good">Gross — no deduction</Badge>
                    ) : (
                      <Badge tone="good">Verified — 20%</Badge>
                    )}
                    {!subcontractor.utr ? <Badge tone="bad">No UTR</Badge> : null}
                  </>
                }
              />
            ))}
          </List>
        )
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Link
              href={`/subcontractors?period=${previous.start}`}
              className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              ← Previous
            </Link>
            <p className="text-center text-sm font-semibold text-ink-900">{period.label}</p>
            <Link
              href={`/subcontractors?period=${next.start}`}
              className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              Next →
            </Link>
          </div>

          <Notice tone="info" title="Prepared, not filed">
            TradeBooks prepares your CIS figures from the bills you have recorded. Submitting the monthly return to
            HMRC is done by you or your accountant — TradeBooks never files anything on your behalf.
          </Notice>

          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink-500">Deducted this period</p>
                <Money pence={period.totals.deductionPence} size="xl" className="mt-1 block" />
                <p className="mt-1 text-sm text-ink-500">
                  Pay to HMRC by {formatDate(period.dueDate)}
                </p>
              </div>
              <Badge tone={period.status === 'prepared' || period.status === 'filed' ? 'good' : 'neutral'}>
                {statusLabel(period.status)}
              </Badge>
            </div>

            <dl className="mt-4">
              <DataRow label="Subcontractors paid" value={String(period.totals.subcontractorCount)} />
              <DataRow label="Labour" value={<Money pence={period.totals.labourPence} size="sm" />} />
              <DataRow label="Materials" value={<Money pence={period.totals.materialsPence} size="sm" />} />
              <DataRow label="Gross paid" value={<Money pence={period.totals.grossPaidPence} size="sm" />} />
              <DataRow label="Deducted" value={<Money pence={period.totals.deductionPence} size="sm" />} />
              <DataRow label="Net paid to subcontractors" value={<Money pence={period.totals.netPaidPence} size="sm" />} />
            </dl>
          </Card>

          {period.warnings.length > 0 ? (
            <Notice tone="warn" title="Before this can be filed">
              <ul className="list-disc space-y-1 pl-4">
                {period.warnings.map((warning) => (
                  <li key={warning.message}>{warning.message}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-800">Readiness</h2>
            <ul className="space-y-2">
              {period.readiness.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <Icon
                    name={item.done ? 'check' : 'warning'}
                    className={item.done ? 'mt-0.5 size-5 text-good-600' : 'mt-0.5 size-5 text-warn-600'}
                  />
                  <span className={item.done ? 'text-ink-600' : 'font-medium text-ink-900'}>
                    {item.label}
                    {item.detail ? <span className="text-ink-500"> — {item.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {period.lines.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-ink-800">Per subcontractor</h2>
              <List>
                {period.lines.map((line) => (
                  <ListRow
                    key={line.supplierId}
                    href={`/suppliers/${line.supplierId}`}
                    title={line.supplierName}
                    subtitle={`UTR ${line.utr ?? 'missing'} · ${(line.deductionRateBasisPoints / 100).toFixed(0)}% deduction`}
                    meta={
                      line.warnings.length > 0 ? (
                        <Badge tone="warn">{line.warnings[0]}</Badge>
                      ) : (
                        <Badge tone="good">Complete</Badge>
                      )
                    }
                    right={
                      <>
                        <Money pence={line.deductionPence} className="block" />
                        <span className="text-xs text-ink-500">
                          of <Money pence={line.labourPence} size="sm" className="font-normal" /> labour
                        </span>
                      </>
                    }
                  />
                ))}
              </List>
            </section>
          ) : (
            <EmptyState
              title="No subcontractor payments this period"
              description="Record bills against your subcontractors and they will appear here with their deductions."
            />
          )}

          {can(role, 'periods.prepare') ? (
            <CisActions
              start={period.start}
              end={period.end}
              status={period.status}
              canClose={can(role, 'periods.close')}
            />
          ) : null}

          {history.length > 0 ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink-800">Previous periods</h2>
              <ul className="space-y-2 text-sm">
                {history.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/subcontractors?period=${row.startDate}`} className="text-brand-700 underline">
                      {row.label}
                    </Link>
                    <span className="text-ink-600">
                      <Money pence={row.totalDeductionPence ?? 0} size="sm" /> · {statusLabel(row.status)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'prepared':
      return 'Prepared — not filed';
    case 'filed':
      return 'Recorded as filed';
    case 'in_review':
      return 'In review';
    case 'closed':
      return 'Closed';
    default:
      return 'Open';
  }
}

function shiftMonth(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const total = year * 12 + (month - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
