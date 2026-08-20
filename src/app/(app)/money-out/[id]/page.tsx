import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { bankAccounts, documents, transactionLinks } from '@/db/schema';
import { getTransaction } from '@/domain/transactions';
import { activeCategories, activeJobs, activeSuppliers, listBills } from '@/domain/queries';
import { listAuditEvents } from '@/domain/audit';
import { findReceiptMatchesForTransaction, describeReasons } from '@/domain/matching';
import { formatDate, formatDateTime } from '@/lib/dates';
import { Badge, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { TransactionEditor } from './editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment — TradeBooks' };

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { company, role } = await requireAuth();
  const canWrite = can(role, 'transactions.categorise');
  const { id } = await params;

  const transaction = await getTransaction(db, company.id, id).catch(() => null);
  if (!transaction) notFound();

  const [categories, jobs, suppliers, accountRows, receipts, links, history, unpaidBills] = await Promise.all([
    activeCategories(db, company.id),
    activeJobs(db, company.id),
    activeSuppliers(db, company.id),
    db.select().from(bankAccounts).where(eq(bankAccounts.id, transaction.bankAccountId)).limit(1),
    db
      .select()
      .from(documents)
      .where(and(eq(documents.companyId, company.id), eq(documents.matchedTransactionId, transaction.id))),
    db.select().from(transactionLinks).where(eq(transactionLinks.transactionId, transaction.id)),
    listAuditEvents(db, company.id, { entityType: 'transaction', entityId: transaction.id, limit: 12 }),
    listBills(db, company.id, { status: 'unpaid', limit: 20 }),
  ]);

  const candidateReceipts =
    receipts.length === 0 && transaction.direction === 'money_out'
      ? await findReceiptMatchesForTransaction(db, company.id, transaction)
      : null;

  return (
    <div className="space-y-5">
      <PageHeader backHref="/money-out" backLabel="Money out" title={transaction.description} />

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">
              {transaction.direction === 'money_in' ? 'Money in' : 'Money out'}
            </p>
            <Money
              pence={transaction.direction === 'money_in' ? transaction.amountPence : -transaction.amountPence}
              size="xl"
              className="mt-1 block"
              showSign={transaction.direction === 'money_in'}
            />
            <p className="mt-1 text-sm text-ink-500">
              {formatDate(transaction.transactionDate)} · {accountRows[0]?.name}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {transaction.status === 'reviewed' ? <Badge tone="good">Reviewed</Badge> : null}
            {transaction.status === 'needs_answer' ? <Badge tone="warn">Needs an answer</Badge> : null}
            {transaction.status === 'excluded' ? <Badge tone="neutral">Excluded</Badge> : null}
            {transaction.needsReceipt && receipts.length === 0 ? <Badge tone="warn">No receipt</Badge> : null}
          </div>
        </div>

        {transaction.categoryReason ? (
          <p className="mt-4 rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">
            <span className="font-semibold">How this was sorted: </span>
            {transaction.categoryReason}
            {transaction.categoryConfidence !== null
              ? ` (${transaction.categoryConfidence}% confident, ${sourceLabel(transaction.categorySource)})`
              : ''}
          </p>
        ) : null}
      </Card>

      <TransactionEditor
        transaction={{
          id: transaction.id,
          categoryId: transaction.categoryId,
          supplierId: transaction.supplierId,
          jobId: transaction.jobId,
          vatTreatment: transaction.vatTreatment,
          isPersonal: transaction.isPersonal,
          notes: transaction.notes,
          direction: transaction.direction,
          status: transaction.status,
          counterparty: transaction.counterparty,
        }}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          defaultVatTreatment: c.defaultVatTreatment,
        }))}
        jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        canEdit={canWrite}
        vatRegistered={company.vatRegistered}
      />

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Receipt</h2>
        {receipts.length > 0 ? (
          <ul className="space-y-2">
            {receipts.map((receipt) => (
              <li key={receipt.id}>
                <Link href={`/receipts/${receipt.id}`} className="text-sm font-medium text-brand-700 underline">
                  {receipt.supplierNameText ?? receipt.originalFilename}
                </Link>
                <span className="ml-2 text-sm text-ink-500">
                  {receipt.grossPence !== null ? <Money pence={receipt.grossPence} size="sm" /> : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className="text-sm text-ink-500">No receipt filed against this payment yet.</p>
            {candidateReceipts && candidateReceipts.candidates.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium text-ink-700">These uploaded receipts might match:</p>
                {candidateReceipts.candidates.slice(0, 3).map((candidate) => (
                  <Link
                    key={candidate.record.id}
                    href={`/receipts/${candidate.record.id}`}
                    className="block rounded-xl border border-ink-200 px-4 py-3 text-sm hover:bg-ink-50"
                  >
                    <span className="font-medium text-ink-900">
                      {candidate.record.supplierNameText ?? candidate.record.originalFilename}
                    </span>
                    <span className="block text-ink-500">{describeReasons(candidate.reasons)}</span>
                  </Link>
                ))}
              </div>
            ) : null}
            <p className="mt-3">
              <Link href={`/receipts/new?transactionId=${transaction.id}`} className="text-sm font-semibold text-brand-700 underline">
                Add a receipt for this payment
              </Link>
            </p>
          </>
        )}
      </Card>

      {links.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Matched to</h2>
          <ul className="space-y-2 text-sm">
            {links.map((link) => (
              <li key={link.id} className="flex items-center justify-between">
                <Link
                  href={link.linkedType === 'invoice' ? `/money-in/${link.linkedId}` : `/money-out/bills/${link.linkedId}`}
                  className="text-brand-700 underline"
                >
                  {link.linkedType === 'invoice' ? 'Customer invoice' : link.linkedType === 'bill' ? 'Supplier bill' : link.linkedType}
                </Link>
                <Money pence={link.amountPence} size="sm" />
              </li>
            ))}
          </ul>
        </Card>
      ) : transaction.direction === 'money_out' && unpaidBills.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Is this paying a bill?</h2>
          <p className="text-sm text-ink-500">
            Linking it stops the cost being counted twice.
          </p>
          <ul className="mt-3 space-y-2">
            {unpaidBills
              .filter((bill) => Math.abs(bill.outstandingPence - transaction.amountPence) <= 100)
              .slice(0, 3)
              .map((bill) => (
                <li key={bill.id}>
                  <Link href={`/money-out/bills/${bill.id}`} className="text-sm text-brand-700 underline">
                    {bill.supplierName} · {bill.number}
                  </Link>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Details</h2>
        <dl>
          <DataRow label="Bank description" value={transaction.description} />
          {transaction.reference ? <DataRow label="Reference" value={transaction.reference} /> : null}
          <DataRow
            label="VAT"
            value={
              transaction.vatPence !== null ? (
                <>
                  <Money pence={transaction.vatPence} size="sm" />
                  <span className="ml-2 text-ink-500">of {<Money pence={transaction.amountPence} size="sm" />}</span>
                </>
              ) : (
                '—'
              )
            }
          />
          <DataRow label="Where it came from" value={sourceLabel(transaction.source)} />
          <DataRow label="Reconciliation" value={reconciliationLabel(transaction.reconciliationStatus)} />
        </dl>
      </Card>

      {transaction.status === 'excluded' ? (
        <Notice tone="neutral" title="Excluded from the books">
          This payment is kept on record but left out of every total.
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

function sourceLabel(source: string): string {
  switch (source) {
    case 'rule':
      return 'one of your rules';
    case 'history':
      return 'how you sorted it before';
    case 'heuristic':
      return 'a supplier match';
    case 'ai_suggestion':
      return 'an AI suggestion';
    case 'import':
      return 'a statement import';
    case 'user':
      return 'entered by a person';
    default:
      return 'TradeBooks';
  }
}

function reconciliationLabel(status: string): string {
  switch (status) {
    case 'reconciled':
      return 'Checked off';
    case 'matched':
      return 'Matched to a document';
    default:
      return 'Not matched yet';
  }
}
