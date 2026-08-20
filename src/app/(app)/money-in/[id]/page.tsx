import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import {
  customers,
  invoiceLines,
  jobs,
  paymentAllocations,
  payments,
} from '@/db/schema';
import { getInvoice, outstandingPence } from '@/domain/invoices';
import { listAuditEvents } from '@/domain/audit';
import { formatDate, formatDateTime, relativeDays, todayIso } from '@/lib/dates';
import { VAT_TREATMENT_LABELS, type VatTreatment } from '@/domain/vat';
import { Badge, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { InvoiceActions } from './actions-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice — TradeBooks' };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { company, role } = await requireAuth();
  const { id } = await params;

  const invoice = await getInvoice(db, company.id, id).catch(() => null);
  if (!invoice) notFound();

  const [lines, customerRows, jobRows, allocations, history] = await Promise.all([
    db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id)).orderBy(invoiceLines.position),
    db.select().from(customers).where(eq(customers.id, invoice.customerId)).limit(1),
    invoice.jobId
      ? db.select().from(jobs).where(eq(jobs.id, invoice.jobId)).limit(1)
      : Promise.resolve([]),
    db
      .select({ allocation: paymentAllocations, payment: payments })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(
        and(
          eq(paymentAllocations.companyId, company.id),
          eq(paymentAllocations.invoiceId, invoice.id),
        ),
      ),
    listAuditEvents(db, company.id, { entityType: 'invoice', entityId: invoice.id, limit: 12 }),
  ]);

  const customer = customerRows[0];
  const job = jobRows[0];
  const today = todayIso();
  const outstanding = outstandingPence(invoice);
  const isOverdue = ['sent', 'part_paid', 'overdue'].includes(invoice.status) && invoice.dueDate < today;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/money-in"
        backLabel="Money in"
        title={`Invoice ${invoice.number}`}
        description={customer?.name}
      />

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">
              {invoice.status === 'paid' ? 'Paid in full' : 'Still owed'}
            </p>
            <Money
              pence={invoice.status === 'paid' ? invoice.grossPence : outstanding}
              size="xl"
              className="mt-1 block"
            />
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {statusBadge(invoice.status, isOverdue)}
              <span className="text-sm text-ink-500">
                Due {formatDate(invoice.dueDate)} ({relativeDays(invoice.dueDate, today)})
              </span>
            </p>
          </div>
          <Link
            href={`/money-in/${invoice.id}/document`}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
            target="_blank"
          >
            View / print invoice
          </Link>
        </div>
      </Card>

      <InvoiceActions
        invoiceId={invoice.id}
        status={invoice.status}
        outstandingPence={outstanding}
        canWrite={role !== 'reviewer'}
        customerEmail={customer?.email ?? null}
        reminderCount={invoice.reminderCount}
        lastReminderAt={invoice.lastReminderAt ? formatDateTime(invoice.lastReminderAt) : null}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">What was invoiced</h2>
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{line.description}</p>
                <p className="text-xs text-ink-500">
                  {(line.quantityMilli / 1000).toString()} × <Money pence={line.unitPricePence} size="sm" className="font-normal" />
                  {' · '}
                  {VAT_TREATMENT_LABELS[line.vatTreatment as VatTreatment]}
                  {line.isLabour ? ' · Labour (CIS)' : ''}
                </p>
              </div>
              <Money pence={line.netPence} size="sm" className="shrink-0" />
            </li>
          ))}
        </ul>

        <dl className="mt-4">
          <DataRow label="Subtotal" value={<Money pence={invoice.netPence} size="sm" />} />
          <DataRow label="VAT" value={<Money pence={invoice.vatPence} size="sm" />} />
          {invoice.cisDeductionPence > 0 ? (
            <DataRow
              label="CIS deducted by customer"
              hint="Your customer pays this to HMRC on your behalf"
              value={<Money pence={-invoice.cisDeductionPence} size="sm" />}
            />
          ) : null}
          <DataRow
            label="Total due"
            value={<Money pence={invoice.grossPence - invoice.cisDeductionPence} />}
          />
          {invoice.paidPence > 0 ? (
            <DataRow label="Paid so far" value={<Money pence={invoice.paidPence} size="sm" />} />
          ) : null}
        </dl>
      </Card>

      {allocations.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Payments received</h2>
          <ul className="space-y-2">
            {allocations.map(({ allocation, payment }) => (
              <li key={allocation.id} className="flex items-center justify-between text-sm">
                <span className="text-ink-600">
                  {formatDate(payment.paymentDate)} · {payment.method.replace(/_/g, ' ')}
                  {payment.reference ? ` · ${payment.reference}` : ''}
                </span>
                <Money pence={allocation.amountPence} size="sm" />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Details</h2>
        <dl>
          <DataRow label="Customer" value={customer?.name ?? '—'} />
          <DataRow label="Issued" value={formatDate(invoice.issueDate)} />
          <DataRow label="Payment due" value={formatDate(invoice.dueDate)} />
          {job ? (
            <DataRow
              label="Job"
              value={
                <Link href={`/jobs/${job.id}`} className="text-brand-700 underline">
                  {job.reference} — {job.name}
                </Link>
              }
            />
          ) : null}
          {invoice.reference ? <DataRow label="Their reference" value={invoice.reference} /> : null}
        </dl>
        {invoice.notes ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink-600">{invoice.notes}</p> : null}
      </Card>

      {invoice.status === 'void' ? (
        <Notice tone="neutral" title="This invoice was cancelled">
          It stays on record so the history is complete, but it is excluded from every figure.
        </Notice>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">History</h2>
        <ul className="space-y-2 text-sm">
          {history.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink-700">{event.summary}</span>
              <span className="text-xs text-ink-400">{formatDateTime(event.createdAt)}</span>
            </li>
          ))}
          {history.length === 0 ? <li className="text-ink-500">Nothing recorded yet.</li> : null}
        </ul>
      </Card>
    </div>
  );
}

function statusBadge(status: string, isOverdue: boolean) {
  if (status === 'paid') return <Badge tone="good">Paid</Badge>;
  if (status === 'draft') return <Badge tone="neutral">Draft — not sent</Badge>;
  if (status === 'void') return <Badge tone="neutral">Cancelled</Badge>;
  if (isOverdue) return <Badge tone="bad">Overdue</Badge>;
  if (status === 'part_paid') return <Badge tone="warn">Part paid</Badge>;
  return <Badge tone="info">Waiting for payment</Badge>;
}
