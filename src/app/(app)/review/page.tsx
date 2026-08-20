import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { documents, exceptions, invoices, transactions } from '@/db/schema';
import { trialBalance } from '@/domain/exports';
import { currentVatPeriod } from '@/domain/vat-return';
import { currentCisPeriod } from '@/domain/cis';
import { unallocatedJobCosts } from '@/domain/jobs';
import { countAuditEvents } from '@/domain/audit';
import { Badge, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bookkeeper view — TradeBooks' };

export default async function ReviewPage() {
  const { company } = await requirePermission('audit.read');

  const [counts, balance, vat, cis, unallocated, auditCount] = await Promise.all([
    db
      .select({
        uncategorised: sql<number>`count(*) filter (where ${transactions.categoryId} is null and ${transactions.status} <> 'excluded')::int`,
        unreconciled: sql<number>`count(*) filter (where ${transactions.reconciliationStatus} = 'unreconciled')::int`,
        needsReceipt: sql<number>`count(*) filter (where ${transactions.needsReceipt})::int`,
        aiSourced: sql<number>`count(*) filter (where ${transactions.categorySource} = 'ai_suggestion' and ${transactions.confirmedAt} is null)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(eq(transactions.companyId, company.id)),
    trialBalance(db, company.id),
    currentVatPeriod(db, company.id),
    currentCisPeriod(db, company.id),
    unallocatedJobCosts(db, company.id),
    countAuditEvents(db, company.id),
  ]);

  const [openQuestions, unmatchedReceipts, unpaidInvoices] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(exceptions)
      .where(and(eq(exceptions.companyId, company.id), eq(exceptions.status, 'open'))),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(documents)
      .where(and(eq(documents.companyId, company.id), sql`${documents.matchedTransactionId} is null`)),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(invoices)
      .where(and(eq(invoices.companyId, company.id), sql`${invoices.status} in ('sent','part_paid','overdue')`)),
  ]);

  const row = counts[0]!;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bookkeeper view"
        description="Everything needed to review the month without touching the owner’s screens."
      />

      {!balance.balanced ? (
        <Notice tone="bad" title="The internal journal does not balance">
          Debits {money(balance.totalDebitPence)} against credits {money(balance.totalCreditPence)}. This should
          never happen — please report it before relying on any figure.
        </Notice>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-800">Needs attention</h2>
          <dl className="mt-3">
            <DataRow label="Payments with no category" value={String(row.uncategorised)} />
            <DataRow label="Not reconciled" value={String(row.unreconciled)} />
            <DataRow label="Purchases without a receipt" value={String(row.needsReceipt)} />
            <DataRow label="Unconfirmed AI suggestions" value={String(row.aiSourced)} />
            <DataRow label="Open questions in Ask Me" value={String(openQuestions[0]?.value ?? 0)} />
            <DataRow label="Receipts not matched" value={String(unmatchedReceipts[0]?.value ?? 0)} />
            <DataRow label="Unpaid sales invoices" value={String(unpaidInvoices[0]?.value ?? 0)} />
            <DataRow
              label="Job costs not allocated"
              value={
                <>
                  <Money pence={unallocated.totalPence} size="sm" /> ({unallocated.count})
                </>
              }
            />
          </dl>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-800">Period position</h2>
          <dl className="mt-3">
            <DataRow
              label={`VAT ${vat.label}`}
              value={
                <>
                  <Money pence={vat.boxes.netVatDue} size="sm" />{' '}
                  <Badge tone={vat.status === 'filed' ? 'good' : 'info'}>{vat.status}</Badge>
                </>
              }
            />
            <DataRow
              label={`CIS ${cis.label}`}
              value={
                <>
                  <Money pence={cis.totals.deductionPence} size="sm" />{' '}
                  <Badge tone={cis.status === 'filed' ? 'good' : 'info'}>{cis.status}</Badge>
                </>
              }
            />
            <DataRow label="Transactions recorded" value={String(row.total)} />
            <DataRow label="Audit events" value={String(auditCount)} />
            <DataRow
              label="Trial balance"
              value={
                balance.balanced ? (
                  <Badge tone="good">Balanced</Badge>
                ) : (
                  <Badge tone="bad">Out by {money(balance.totalDebitPence - balance.totalCreditPence)}</Badge>
                )
              }
            />
          </dl>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { href: '/review/close', label: 'Period close checklist', description: 'Work through the month end', icon: 'check' },
          { href: '/review/audit', label: 'Audit history', description: 'Every change, who made it and why', icon: 'review' },
          { href: '/review/rules', label: 'Automation rules', description: 'What sorts itself, and how', icon: 'settings' },
          { href: '/review/exports', label: 'Exports', description: 'CSV and accountant-ready packs', icon: 'download' },
          { href: '/review/integrations', label: 'Connections', description: 'What is connected and what is not', icon: 'settings' },
          { href: '/review/trial-balance', label: 'Trial balance', description: 'The internal journal, account by account', icon: 'vat' },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 shadow-sm hover:border-ink-300"
          >
            <Icon name={item.icon} className="size-5 shrink-0 text-ink-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
              <span className="block text-xs text-ink-500">{item.description}</span>
            </span>
            <Icon name="chevron" className="size-5 shrink-0 text-ink-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function money(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
