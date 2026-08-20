import type { Metadata } from 'next';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db/client';
import { bills, suppliers } from '@/db/schema';
import { requireAuth } from '@/lib/auth-context';
import { Badge, ButtonLink, EmptyState, Money } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Suppliers — TradeBooks' };

export default async function SuppliersPage() {
  const { company } = await requireAuth();

  const rows = await db
    .select({
      supplier: suppliers,
      owed: sql<number>`coalesce(sum(case when ${bills.status} in ('awaiting_payment','part_paid') then ${bills.grossPence} - ${bills.cisDeductionPence} - ${bills.paidPence} else 0 end), 0)::bigint`,
      billCount: sql<number>`count(${bills.id})::int`,
    })
    .from(suppliers)
    .leftJoin(bills, eq(bills.supplierId, suppliers.id))
    .where(eq(suppliers.companyId, company.id))
    .groupBy(suppliers.id)
    .orderBy(suppliers.name);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Merchants, hire companies and subcontractors."
        action={
          <ButtonLink href="/suppliers/new">
            <Icon name="plus" className="size-5" /> Add supplier
          </ButtonLink>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Add your merchants and subcontractors so TradeBooks can sort their payments automatically."
          action={<ButtonLink href="/suppliers/new">Add a supplier</ButtonLink>}
        />
      ) : (
        <List>
          {rows.map((row) => (
            <ListRow
              key={row.supplier.id}
              href={`/suppliers/${row.supplier.id}`}
              title={row.supplier.name}
              subtitle={[row.supplier.contactName, row.supplier.city].filter(Boolean).join(' · ') || undefined}
              meta={
                <>
                  {row.supplier.isSubcontractor ? <Badge tone="info">Subcontractor</Badge> : null}
                  {row.supplier.isSubcontractor && row.supplier.cisStatus === 'unknown' ? (
                    <Badge tone="warn">Not verified</Badge>
                  ) : null}
                  <span className="text-xs text-ink-500">
                    {row.billCount} bill{row.billCount === 1 ? '' : 's'}
                  </span>
                </>
              }
              right={
                Number(row.owed) > 0 ? (
                  <>
                    <Money pence={Number(row.owed)} className="block" />
                    <span className="text-xs text-ink-500">to pay</span>
                  </>
                ) : null
              }
            />
          ))}
        </List>
      )}
    </div>
  );
}
