import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { billLines, jobs, suppliers } from '@/db/schema';
import { billOutstandingPence, getBill } from '@/domain/bills';
import { listAuditEvents } from '@/domain/audit';
import { formatDate, formatDateTime } from '@/lib/dates';
import { VAT_TREATMENT_LABELS, type VatTreatment } from '@/domain/vat';
import { Badge, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { BillActions } from './actions-panel';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Bill — TradeBooks' };

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, role } = await requireAuth();
  const { id } = await params;

  const bill = await getBill(db, company.id, id).catch(() => null);
  if (!bill) notFound();

  const [lines, supplierRows, jobRows, history] = await Promise.all([
    db.select().from(billLines).where(eq(billLines.billId, bill.id)).orderBy(billLines.position),
    db.select().from(suppliers).where(eq(suppliers.id, bill.supplierId)).limit(1),
    bill.jobId ? db.select().from(jobs).where(eq(jobs.id, bill.jobId)).limit(1) : Promise.resolve([]),
    listAuditEvents(db, company.id, { entityType: 'bill', entityId: bill.id, limit: 12 }),
  ]);

  const supplier = supplierRows[0];
  const outstanding = billOutstandingPence(bill);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/money-out/bills"
        backLabel="Bills"
        title={supplier?.name ?? 'Bill'}
        description={`${bill.number}${bill.reference ? ` · their ref ${bill.reference}` : ''}`}
      />

      <Card className="p-5">
        <p className="text-sm text-ink-500">{bill.status === 'paid' ? 'Paid in full' : 'Still to pay'}</p>
        <Money pence={bill.status === 'paid' ? bill.grossPence : outstanding} size="xl" className="mt-1 block" />
        <p className="mt-2 flex flex-wrap items-center gap-2">
          {bill.status === 'paid' ? (
            <Badge tone="good">Paid</Badge>
          ) : bill.status === 'void' ? (
            <Badge tone="neutral">Cancelled</Badge>
          ) : bill.status === 'part_paid' ? (
            <Badge tone="warn">Part paid</Badge>
          ) : (
            <Badge tone="info">To pay</Badge>
          )}
          {bill.isSubcontractorPayment ? <Badge tone="info">CIS subcontractor</Badge> : null}
          <span className="text-sm text-ink-500">Due {formatDate(bill.dueDate)}</span>
        </p>
      </Card>

      {can(role, 'records.write') ? (
        <BillActions billId={bill.id} status={bill.status} outstandingPence={outstanding} />
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">What is on the bill</h2>
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-4 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{line.description}</p>
                <p className="text-xs text-ink-500">
                  {VAT_TREATMENT_LABELS[line.vatTreatment as VatTreatment]}
                  {line.isLabour ? ' · Labour (CIS)' : ''}
                </p>
              </div>
              <Money pence={line.netPence} size="sm" className="shrink-0" />
            </li>
          ))}
        </ul>

        <dl className="mt-4">
          <DataRow label="Subtotal" value={<Money pence={bill.netPence} size="sm" />} />
          <DataRow label="VAT" value={<Money pence={bill.vatPence} size="sm" />} />
          {bill.isSubcontractorPayment ? (
            <>
              <DataRow label="Labour (CIS)" value={<Money pence={bill.cisLabourPence} size="sm" />} />
              <DataRow label="Materials" value={<Money pence={bill.cisMaterialsPence} size="sm" />} />
              <DataRow
                label={`CIS deducted at ${(bill.cisDeductionRateBasisPoints ?? 0) / 100}%`}
                hint="You pay this to HMRC, not to the subcontractor"
                value={<Money pence={-bill.cisDeductionPence} size="sm" />}
              />
            </>
          ) : null}
          <DataRow label="Pay the supplier" value={<Money pence={bill.grossPence - bill.cisDeductionPence} />} />
          {bill.paidPence > 0 ? <DataRow label="Paid so far" value={<Money pence={bill.paidPence} size="sm" />} /> : null}
        </dl>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Details</h2>
        <dl>
          <DataRow label="Supplier" value={supplier?.name ?? '—'} />
          <DataRow label="Bill date" value={formatDate(bill.billDate)} />
          <DataRow label="Due" value={formatDate(bill.dueDate)} />
          {jobRows[0] ? (
            <DataRow
              label="Job"
              value={
                <Link href={`/jobs/${jobRows[0].id}`} className="text-brand-700 underline">
                  {jobRows[0].reference} — {jobRows[0].name}
                </Link>
              }
            />
          ) : null}
        </dl>
        {bill.description ? <p className="mt-3 text-sm text-ink-600">{bill.description}</p> : null}
      </Card>

      {bill.isSubcontractorPayment && supplier && supplier.cisStatus === 'unknown' ? (
        <Notice tone="warn" title="This subcontractor is not verified">
          Without HMRC verification the deduction must be at the higher 30% rate. Verify them and record the
          verification number on the subcontractor record.
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
