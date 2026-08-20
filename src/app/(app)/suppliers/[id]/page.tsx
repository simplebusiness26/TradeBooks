import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bills, suppliers, transactions } from '@/db/schema';
import { requireAuth } from '@/lib/auth-context';
import { activeCategories } from '@/domain/queries';
import { formatDate, formatDateTime } from '@/lib/dates';
import { Badge, ButtonLink, Card, DataRow, EmptyState, Money, Notice } from '@/components/ui/primitives';
import { List, ListRow, PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { SupplierForm } from '@/components/forms/supplier-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Supplier — TradeBooks' };

const CIS_LABELS: Record<string, string> = {
  unknown: 'Not verified — deduct 30%',
  gross: 'Verified for gross payment — no deduction',
  net_20: 'Verified, standard rate — deduct 20%',
  net_30: 'Verified, higher rate — deduct 30%',
};

export default async function SupplierPage({
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
    .from(suppliers)
    .where(and(eq(suppliers.companyId, company.id), eq(suppliers.id, id)))
    .limit(1);
  const supplier = rows[0];
  if (!supplier) notFound();

  if (edit === '1' && can(role, 'records.write')) {
    const categories = await activeCategories(db, company.id);
    return (
      <div>
        <PageHeader backHref={`/suppliers/${supplier.id}`} backLabel="Back" title={`Edit ${supplier.name}`} />
        <SupplierForm
          categories={categories.filter((c) => c.kind !== 'income').map((c) => ({ id: c.id, name: c.name }))}
          values={{
            id: supplier.id,
            name: supplier.name,
            kind: supplier.kind,
            contactName: supplier.contactName,
            email: supplier.email,
            phone: supplier.phone,
            addressLine1: supplier.addressLine1,
            addressLine2: supplier.addressLine2,
            city: supplier.city,
            postcode: supplier.postcode,
            vatNumber: supplier.vatNumber,
            defaultCategoryId: supplier.defaultCategoryId,
            utr: supplier.utr,
            cisStatus: supplier.cisStatus,
            cisVerificationNumber: supplier.cisVerificationNumber,
            cisVerificationSource: supplier.cisVerificationSource,
            notes: supplier.notes,
          }}
        />
      </div>
    );
  }

  const [supplierBills, supplierTransactions] = await Promise.all([
    db
      .select()
      .from(bills)
      .where(and(eq(bills.companyId, company.id), eq(bills.supplierId, id)))
      .orderBy(desc(bills.billDate))
      .limit(30),
    db
      .select()
      .from(transactions)
      .where(and(eq(transactions.companyId, company.id), eq(transactions.supplierId, id)))
      .orderBy(desc(transactions.transactionDate))
      .limit(20),
  ]);

  const owed = supplierBills
    .filter((bill) => ['awaiting_payment', 'part_paid'].includes(bill.status))
    .reduce((sum, bill) => sum + bill.grossPence - bill.cisDeductionPence - bill.paidPence, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/suppliers"
        backLabel="Suppliers"
        title={supplier.name}
        description={supplier.contactName ?? undefined}
        action={
          can(role, 'records.write') ? (
            <div className="flex gap-2">
              <ButtonLink href={`/suppliers/${supplier.id}?edit=1`} variant="secondary">
                Edit
              </ButtonLink>
              <ButtonLink href={`/money-out/bills/new?supplierId=${supplier.id}`}>Add a bill</ButtonLink>
            </div>
          ) : null
        }
      />

      <Card className="p-5">
        <p className="text-sm text-ink-500">Still to pay them</p>
        <Money pence={owed} size="xl" className="mt-1 block" />
        <dl className="mt-4">
          {supplier.email ? <DataRow label="Email" value={supplier.email} /> : null}
          {supplier.phone ? <DataRow label="Phone" value={supplier.phone} /> : null}
          {supplier.vatNumber ? <DataRow label="VAT number" value={supplier.vatNumber} /> : null}
        </dl>
      </Card>

      {supplier.isSubcontractor ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">CIS</h2>
          <dl>
            <DataRow label="UTR" value={supplier.utr ?? 'Not recorded'} />
            <DataRow label="Verification" value={CIS_LABELS[supplier.cisStatus] ?? supplier.cisStatus} />
            <DataRow label="Verification number" value={supplier.cisVerificationNumber ?? 'Not recorded'} />
            <DataRow label="Verified on" value={formatDateTime(supplier.cisVerifiedAt)} />
            {supplier.cisVerificationSource ? (
              <DataRow label="Recorded by" value={supplier.cisVerificationSource} />
            ) : null}
          </dl>
          {supplier.cisStatus === 'unknown' || !supplier.utr ? (
            <div className="mt-4">
              <Notice tone="warn" title="Details missing">
                Verify them with HMRC and record the UTR and verification number here. Until then TradeBooks uses
                the higher 30% deduction rate.
              </Notice>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-800">Bills</h2>
        {supplierBills.length === 0 ? (
          <EmptyState title="No bills recorded" description="Add one when their invoice arrives." />
        ) : (
          <List>
            {supplierBills.map((bill) => (
              <ListRow
                key={bill.id}
                href={`/money-out/bills/${bill.id}`}
                title={bill.number}
                subtitle={formatDate(bill.billDate)}
                meta={<Badge tone={bill.status === 'paid' ? 'good' : 'info'}>{bill.status.replace(/_/g, ' ')}</Badge>}
                right={<Money pence={bill.grossPence} size="sm" />}
              />
            ))}
          </List>
        )}
      </section>

      {supplierTransactions.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Payments</h2>
          <List>
            {supplierTransactions.map((transaction) => (
              <ListRow
                key={transaction.id}
                href={`/money-out/${transaction.id}`}
                title={transaction.description}
                subtitle={formatDate(transaction.transactionDate)}
                right={<Money pence={-transaction.amountPence} size="sm" />}
              />
            ))}
          </List>
        </section>
      ) : null}
    </div>
  );
}
