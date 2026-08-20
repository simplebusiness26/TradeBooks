import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, invoices } from '@/db/schema';
import { requireAuth } from '@/lib/auth-context';
import { ButtonLink, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Customers — TradeBooks' };

export default async function CustomersPage() {
  const { company } = await requireAuth();

  const rows = await db
    .select({
      customer: customers,
      owed: sql<number>`coalesce(sum(case when ${invoices.status} in ('sent','part_paid','overdue') then ${invoices.grossPence} - ${invoices.cisDeductionPence} - ${invoices.paidPence} else 0 end), 0)::bigint`,
      invoiceCount: sql<number>`count(${invoices.id})::int`,
    })
    .from(customers)
    .leftJoin(invoices, eq(invoices.customerId, customers.id))
    .where(eq(customers.companyId, company.id))
    .groupBy(customers.id)
    .orderBy(customers.name);

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Who you work for, and what they owe."
        action={
          <ButtonLink href="/customers/new">
            <Icon name="plus" className="size-5" /> Add customer
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Add the people and businesses you invoice."
          action={<ButtonLink href="/customers/new">Add a customer</ButtonLink>}
        />
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.customer.id}
              href={`/customers/${row.customer.id}`}
              title={row.customer.name}
              subtitle={[row.customer.contactName, row.customer.city].filter(Boolean).join(' · ') || undefined}
              meta={
                <span className="text-xs text-ink-500">
                  {row.invoiceCount} invoice{row.invoiceCount === 1 ? '' : 's'} · pays in{' '}
                  {row.customer.paymentTermsDays} days
                </span>
              }
              right={
                Number(row.owed) > 0 ? (
                  <>
                    <Money pence={Number(row.owed)} className="block" />
                    <span className="text-xs text-ink-500">owed</span>
                  </>
                ) : (
                  <span className="text-sm text-ink-400">Nothing owed</span>
                )
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
