import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { documents, exceptions, invoices, transactions } from '@/db/schema';
import { trialBalance } from '@/domain/exports';
import { currentCisPeriod } from '@/domain/cis';
import { currentVatPeriod } from '@/domain/vat-return';
import { endOfMonth, formatDate, formatMonthYear, startOfMonth, todayIso, addMonths } from '@/lib/dates';
import { Card, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Period close — TradeBooks' };

export default async function ClosePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { company } = await requirePermission('periods.prepare');
  const params = await searchParams;
  const anchor = params.month && /^\d{4}-\d{2}-\d{2}$/.test(params.month) ? params.month : todayIso();
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);

  const [rows, unmatched, questions, balance, vat, cis] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        uncategorised: sql<number>`count(*) filter (where ${transactions.categoryId} is null and ${transactions.status} <> 'excluded')::int`,
        unreviewed: sql<number>`count(*) filter (where ${transactions.status} <> 'reviewed' and ${transactions.status} <> 'excluded')::int`,
        missingReceipt: sql<number>`count(*) filter (where ${transactions.needsReceipt})::int`,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.companyId, company.id),
          gte(transactions.transactionDate, start),
          lte(transactions.transactionDate, end),
        ),
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.companyId, company.id), sql`${documents.matchedTransactionId} is null`)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(exceptions)
      .where(and(eq(exceptions.companyId, company.id), eq(exceptions.status, 'open'))),
    trialBalance(db, company.id, { start, end }),
    currentVatPeriod(db, company.id, end),
    currentCisPeriod(db, company.id, end),
  ]);

  const draftInvoices = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, company.id),
        eq(invoices.status, 'draft'),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
      ),
    );

  const month = rows[0]!;

  const checklist = [
    {
      label: 'Every payment in the month has a category',
      done: month.uncategorised === 0,
      detail: `${month.uncategorised} still to sort`,
      href: '/money-out?view=needs_answer',
    },
    {
      label: 'No questions left in Ask Me',
      done: (questions[0]?.value ?? 0) === 0,
      detail: `${questions[0]?.value ?? 0} waiting`,
      href: '/ask',
    },
    {
      label: 'Receipts collected for purchases',
      done: month.missingReceipt === 0,
      detail: `${month.missingReceipt} missing`,
      href: '/money-out?view=needs_receipt',
    },
    {
      label: 'All uploaded receipts matched to a payment',
      done: (unmatched[0]?.value ?? 0) === 0,
      detail: `${unmatched[0]?.value ?? 0} unmatched`,
      href: '/receipts?view=unmatched',
    },
    {
      label: 'No invoices left in draft',
      done: (draftInvoices[0]?.value ?? 0) === 0,
      detail: `${draftInvoices[0]?.value ?? 0} drafts`,
      href: '/money-in?view=draft',
    },
    {
      label: 'Every payment reviewed',
      done: month.unreviewed === 0,
      detail: `${month.unreviewed} not yet reviewed`,
      href: '/money-out?view=all',
    },
    {
      label: 'Internal journal balances',
      done: balance.balanced,
      detail: balance.balanced ? 'Balanced' : 'Out of balance',
      href: '/review/trial-balance',
    },
    {
      label: `VAT ${vat.label} prepared`,
      done: vat.status === 'prepared' || vat.status === 'filed',
      detail: vat.status,
      href: '/vat',
    },
    {
      label: `CIS ${cis.label} prepared`,
      done: cis.status === 'prepared' || cis.status === 'filed' || cis.totals.subcontractorCount === 0,
      detail: cis.totals.subcontractorCount === 0 ? 'Nothing to file' : cis.status,
      href: '/subcontractors',
    },
  ];

  const outstanding = checklist.filter((item) => !item.done).length;
  const previousMonth = startOfMonth(addMonths(start, -1));
  const nextMonth = startOfMonth(addMonths(start, 1));

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Period close"
        description={`Working through ${formatMonthYear(start)}.`}
      />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/review/close?month=${previousMonth}`}
          className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          ← {formatMonthYear(previousMonth)}
        </Link>
        <Link
          href={`/review/close?month=${nextMonth}`}
          className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-semibold"
        >
          {formatMonthYear(nextMonth)} →
        </Link>
      </div>

      <Notice tone={outstanding === 0 ? 'good' : 'warn'} title={outstanding === 0 ? 'Ready to close' : `${outstanding} things left`}>
        {outstanding === 0
          ? `Everything for ${formatMonthYear(start)} is categorised, evidenced and reconciled.`
          : 'Work down the list. Each item links to the screen where it can be cleared.'}
      </Notice>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">
          {formatDate(start)} to {formatDate(end)}
        </h2>
        <ul className="space-y-1">
          {checklist.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="flex min-h-12 items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-50"
              >
                <Icon
                  name={item.done ? 'check' : 'warning'}
                  className={item.done ? 'size-5 shrink-0 text-good-600' : 'size-5 shrink-0 text-warn-600'}
                />
                <span className="min-w-0 flex-1">
                  <span className={item.done ? 'block text-sm text-ink-600' : 'block text-sm font-medium text-ink-900'}>
                    {item.label}
                  </span>
                  <span className="block text-xs text-ink-500">{item.detail}</span>
                </span>
                <Icon name="chevron" className="size-5 shrink-0 text-ink-300" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Month at a glance</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">Transactions in the month</dt>
            <dd className="font-medium text-ink-900">{month.total}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Journal debits</dt>
            <dd>
              <Money pence={balance.totalDebitPence} size="sm" />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">Journal credits</dt>
            <dd>
              <Money pence={balance.totalCreditPence} size="sm" />
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
