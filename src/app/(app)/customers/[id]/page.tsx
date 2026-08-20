import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, invoices, jobs } from '@/db/schema';
import { requireAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/dates';
import { Badge, ButtonLink, Card, DataRow, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { CustomerForm } from '@/components/forms/customer-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customer — TradeBooks' };

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { company, role } = await requireAuth();
  const { id } = await params;
  const { edit } = await searchParams;

  const rows = await db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, company.id), eq(customers.id, id)))
    .limit(1);
  const customer = rows[0];
  if (!customer) notFound();

  const [customerInvoices, customerJobs] = await Promise.all([
    db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, company.id), eq(invoices.customerId, id)))
      .orderBy(desc(invoices.issueDate))
      .limit(30),
    db
      .select()
      .from(jobs)
      .where(and(eq(jobs.companyId, company.id), eq(jobs.customerId, id)))
      .orderBy(desc(jobs.createdAt))
      .limit(20),
  ]);

  const owed = customerInvoices
    .filter((invoice) => ['sent', 'part_paid', 'overdue'].includes(invoice.status))
    .reduce((sum, invoice) => sum + invoice.grossPence - invoice.cisDeductionPence - invoice.paidPence, 0);

  if (edit === '1' && can(role, 'records.write')) {
    return (
      <div>
        <PageHeader backHref={`/customers/${customer.id}`} backLabel="Back" title={`Edit ${customer.name}`} />
        <CustomerForm
          values={{
            id: customer.id,
            name: customer.name,
            contactName: customer.contactName,
            email: customer.email,
            phone: customer.phone,
            addressLine1: customer.addressLine1,
            addressLine2: customer.addressLine2,
            city: customer.city,
            postcode: customer.postcode,
            paymentTermsDays: customer.paymentTermsDays,
            notes: customer.notes,
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/customers"
        backLabel="Customers"
        title={customer.name}
        description={customer.contactName ?? undefined}
        action={
          can(role, 'records.write') ? (
            <div className="flex gap-2">
              <ButtonLink href={`/customers/${customer.id}?edit=1`} variant="secondary">
                Edit
              </ButtonLink>
              <ButtonLink href={`/money-in/new?customerId=${customer.id}`}>New invoice</ButtonLink>
            </div>
          ) : null
        }
      />

      <Card className="p-5">
        <p className="text-sm text-ink-500">Owed to you</p>
        <Money pence={owed} size="xl" className="mt-1 block" />
        <dl className="mt-4">
          {customer.email ? <DataRow label="Email" value={customer.email} /> : null}
          {customer.phone ? <DataRow label="Phone" value={customer.phone} /> : null}
          {customer.addressLine1 ? (
            <DataRow
              label="Address"
              value={[customer.addressLine1, customer.addressLine2, customer.city, customer.postcode]
                .filter(Boolean)
                .join(', ')}
            />
          ) : null}
          <DataRow label="Payment terms" value={`${customer.paymentTermsDays} days`} />
        </dl>
        {customer.notes ? <p className="mt-3 text-sm text-ink-600">{customer.notes}</p> : null}
      </Card>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-800">Invoices</h2>
        {customerInvoices.length === 0 ? (
          <EmptyState title="No invoices yet" description="Raise one and it will show up here." />
        ) : (
          <List>
            {customerInvoices.map((invoice) => (
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
        )}
      </section>

      {customerJobs.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Jobs</h2>
          <List>
            {customerJobs.map((job) => (
              <ListRow key={job.id} href={`/jobs/${job.id}`} title={job.name} subtitle={job.reference} />
            ))}
          </List>
        </section>
      ) : null}
    </div>
  );
}
