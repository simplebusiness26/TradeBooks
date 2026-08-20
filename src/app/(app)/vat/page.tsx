import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { calculateVatPeriod, listVatPeriods } from '@/domain/vat-return';
import { addMonths, formatDate, todayIso, vatPeriodFor } from '@/lib/dates';
import { Badge, ButtonLink, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { Icon } from '@/components/shell/icons';
import { VatActions } from './actions-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'VAT — TradeBooks' };

export default async function VatPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { company, role } = await requireAuth();
  const params = await searchParams;
  const today = todayIso();

  const anchor = params.period && /^\d{4}-\d{2}-\d{2}$/.test(params.period) ? params.period : today;
  const info = vatPeriodFor(anchor, company.vatPeriodMonths);

  const [summary, history] = await Promise.all([
    calculateVatPeriod(db, company.id, info.start, info.end),
    listVatPeriods(db, company.id),
  ]);

  const previous = vatPeriodFor(addMonths(info.start, -company.vatPeriodMonths), company.vatPeriodMonths);
  const next = vatPeriodFor(addMonths(info.start, company.vatPeriodMonths), company.vatPeriodMonths);

  return (
    <div className="space-y-5">
      <PageHeader title="VAT" description="Your VAT position, worked out from your own records." />

      {!company.vatRegistered ? (
        <Notice tone="warn" title="This business is not marked as VAT registered">
          These figures are for information only.{' '}
          <Link href="/settings/business" className="font-semibold underline">
            Change it in Settings
          </Link>{' '}
          if that is wrong.
        </Notice>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/vat?period=${previous.start}`}
          className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          ← Previous
        </Link>
        <p className="text-center text-sm font-semibold text-ink-900">{summary.label}</p>
        <Link
          href={`/vat?period=${next.start}`}
          className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          Next →
        </Link>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-ink-500">
              {summary.boxes.netVatDue >= 0 ? 'Estimated VAT to pay' : 'Estimated VAT to come back'}
            </p>
            <Money pence={Math.abs(summary.boxes.netVatDue)} size="xl" className="mt-1 block" />
            <p className="mt-1 text-sm text-ink-500">
              {formatDate(summary.start)} to {formatDate(summary.end)} · due {formatDate(summary.dueDate)}
            </p>
          </div>
          <Badge tone={summary.status === 'filed' ? 'good' : summary.status === 'prepared' ? 'info' : 'neutral'}>
            {statusLabel(summary.status)}
          </Badge>
        </div>

        {summary.isEstimate ? (
          <div className="mt-4">
            <Notice tone="info" title="This is an estimate">
              Worked out from the invoices, bills and payments recorded so far. It is not a filed return, and it
              will change as more is recorded.
            </Notice>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">The figures</h2>
        <dl>
          <DataRow label="VAT charged on sales" hint="Box 1" value={<Money pence={summary.boxes.vatDueSales} size="sm" />} />
          <DataRow label="Total VAT due" hint="Box 3" value={<Money pence={summary.boxes.totalVatDue} size="sm" />} />
          <DataRow
            label="VAT you can reclaim on purchases"
            hint="Box 4"
            value={<Money pence={summary.boxes.vatReclaimed} size="sm" />}
          />
          <DataRow
            label={summary.boxes.netVatDue >= 0 ? 'Net VAT to pay' : 'Net VAT to reclaim'}
            hint="Box 5"
            value={<Money pence={Math.abs(summary.boxes.netVatDue)} size="sm" />}
          />
          <DataRow
            label="Total sales excluding VAT"
            hint="Box 6"
            value={<Money pence={summary.boxes.totalSalesExVat} size="sm" />}
          />
          <DataRow
            label="Total purchases excluding VAT"
            hint="Box 7"
            value={<Money pence={summary.boxes.totalPurchasesExVat} size="sm" />}
          />
        </dl>
      </Card>

      {summary.warnings.length > 0 ? (
        <Notice tone="warn" title="Things that could change these figures">
          <ul className="list-disc space-y-1 pl-4">
            {summary.warnings.map((warning) => (
              <li key={warning.message}>{warning.message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Ready to file?</h2>
        <ul className="space-y-2">
          {summary.readiness.map((item) => (
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
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href="/ask" variant="secondary">
            Answer outstanding questions
          </ButtonLink>
          <ButtonLink href="/review/exports" variant="secondary">
            Export for the accountant
          </ButtonLink>
        </div>
      </Card>

      {can(role, 'periods.prepare') ? (
        <VatActions
          start={summary.start}
          end={summary.end}
          status={summary.status}
          canClose={can(role, 'periods.close')}
        />
      ) : null}

      <Notice tone="neutral" title="TradeBooks does not file your VAT return">
        It prepares the figures and keeps the evidence together. Submitting to HMRC through Making Tax Digital is
        done by you or your accountant.
      </Notice>

      {history.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Previous periods</h2>
          <ul className="space-y-2 text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/vat?period=${row.startDate}`} className="text-brand-700 underline">
                  {row.label}
                </Link>
                <span className="text-ink-600">
                  <Money pence={row.netVatDuePence ?? 0} size="sm" /> · {statusLabel(row.status)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
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
      return 'Estimate';
  }
}
