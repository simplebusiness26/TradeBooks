import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { bills, documents, invoices, suppliers, transactions } from '@/db/schema';
import { calculateJobProfitability, formatMarginPercent } from '@/domain/jobs';
import { formatDate } from '@/lib/dates';
import { Badge, ButtonLink, Card, DataRow, Money, Notice } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Job — TradeBooks' };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await requireAuth();
  const { id } = await params;

  const profit = await calculateJobProfitability(db, company.id, id).catch(() => null);
  if (!profit) notFound();

  const [jobInvoices, jobBills, jobTransactions, jobDocuments] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, company.id), eq(invoices.jobId, id)))
      .orderBy(desc(invoices.issueDate)),
    db
      .select({ bill: bills, supplierName: suppliers.name })
      .from(bills)
      .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
      .where(and(eq(bills.companyId, company.id), eq(bills.jobId, id)))
      .orderBy(desc(bills.billDate)),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.companyId, company.id), eq(transactions.jobId, id)))
      .orderBy(desc(transactions.transactionDate)),
    db
      .select()
      .from(documents)
      .where(and(eq(documents.companyId, company.id), eq(documents.jobId, id))),
  ]);

  const job = profit.job;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/jobs"
        backLabel="Jobs"
        title={job.name}
        description={`${job.reference}${profit.customerName ? ` · ${profit.customerName}` : ''}`}
        action={
          <ButtonLink href={`/money-in/new?jobId=${job.id}${job.customerId ? `&customerId=${job.customerId}` : ''}`}>
            Invoice this job
          </ButtonLink>
        }
      />

      <Card className="p-5">
        <p className="text-sm text-ink-500">Profit so far</p>
        <Money
          pence={profit.grossProfitPence}
          size="xl"
          className={profit.grossProfitPence >= 0 ? 'mt-1 block text-good-700' : 'mt-1 block text-bad-700'}
        />
        <p className="mt-1 text-sm text-ink-500">
          {formatMarginPercent(profit.marginBasisPoints)} margin
          {profit.quotedRevenuePence > 0 ? ` · quoted ${money(profit.quotedRevenuePence)}` : ''}
        </p>

        <dl className="mt-4">
          <DataRow
            label="Invoiced (excluding VAT)"
            value={<Money pence={profit.invoicedNetPence} size="sm" />}
          />
          <DataRow label="Materials" value={<Money pence={profit.costs.materialsPence} size="sm" />} />
          <DataRow label="Labour and subcontractors" value={<Money pence={profit.costs.labourPence} size="sm" />} />
          <DataRow label="Other costs" value={<Money pence={profit.costs.otherPence} size="sm" />} />
          <DataRow label="Total costs" value={<Money pence={profit.costs.totalPence} size="sm" />} />
        </dl>
      </Card>

      {profit.warnings.length > 0 ? (
        <Notice tone="warn" title="Worth a look">
          <ul className="list-disc space-y-1 pl-4">
            {profit.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">Job details</h2>
        <dl>
          <DataRow label="Status" value={job.status.replace(/_/g, ' ')} />
          {profit.customerName ? <DataRow label="Customer" value={profit.customerName} /> : null}
          {job.siteAddressLine1 ? (
            <DataRow
              label="Site"
              value={[job.siteAddressLine1, job.siteCity, job.sitePostcode].filter(Boolean).join(', ')}
            />
          ) : null}
          {job.startDate ? <DataRow label="Started" value={formatDate(job.startDate)} /> : null}
          {job.endDate ? <DataRow label="Finished" value={formatDate(job.endDate)} /> : null}
          <DataRow label="Money still owed on this job" value={<Money pence={profit.outstandingPence} size="sm" />} />
        </dl>
        {job.description ? <p className="mt-3 text-sm text-ink-600">{job.description}</p> : null}
      </Card>

      {jobInvoices.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Invoices</h2>
          <List>
            {jobInvoices.map((invoice) => (
              <ListRow
                key={invoice.id}
                href={`/money-in/${invoice.id}`}
                title={invoice.number}
                subtitle={formatDate(invoice.issueDate)}
                meta={<Badge tone={invoice.status === 'paid' ? 'good' : 'info'}>{invoice.status.replace(/_/g, ' ')}</Badge>}
                right={<Money pence={invoice.grossPence} size="sm" />}
              />
            ))}
          </List>
        </section>
      ) : null}

      {jobBills.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Bills</h2>
          <List>
            {jobBills.map(({ bill, supplierName }) => (
              <ListRow
                key={bill.id}
                href={`/money-out/bills/${bill.id}`}
                title={supplierName}
                subtitle={`${bill.number} · ${formatDate(bill.billDate)}`}
                meta={<Badge tone={bill.status === 'paid' ? 'good' : 'info'}>{bill.status.replace(/_/g, ' ')}</Badge>}
                right={<Money pence={bill.grossPence} size="sm" />}
              />
            ))}
          </List>
        </section>
      ) : null}

      {jobTransactions.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Payments on this job</h2>
          <List>
            {jobTransactions.map((transaction) => (
              <ListRow
                key={transaction.id}
                href={`/money-out/${transaction.id}`}
                title={transaction.description}
                subtitle={formatDate(transaction.transactionDate)}
                right={
                  <Money
                    pence={transaction.direction === 'money_in' ? transaction.amountPence : -transaction.amountPence}
                    size="sm"
                  />
                }
              />
            ))}
          </List>
        </section>
      ) : null}

      {jobDocuments.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Receipts</h2>
          <List>
            {jobDocuments.map((document) => (
              <ListRow
                key={document.id}
                href={`/receipts/${document.id}`}
                title={document.supplierNameText ?? document.originalFilename}
                subtitle={document.documentDate ? formatDate(document.documentDate) : 'Date unknown'}
                right={document.grossPence !== null ? <Money pence={document.grossPence} size="sm" /> : null}
              />
            ))}
          </List>
        </section>
      ) : null}

      <p className="text-sm">
        <Link href={`/jobs/${job.id}/edit`} className="font-semibold text-brand-700 underline">
          Edit this job
        </Link>
      </p>
    </div>
  );
}

function money(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
