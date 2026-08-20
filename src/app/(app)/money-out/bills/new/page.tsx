import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeCategories, activeJobs, activeSuppliers } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { ButtonLink, EmptyState } from '@/components/ui/primitives';
import { NewBillForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a bill — TradeBooks' };

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ supplierId?: string; jobId?: string }>;
}) {
  const { company } = await requirePermission('records.write');
  const params = await searchParams;
  const [suppliers, categories, jobs] = await Promise.all([
    activeSuppliers(db, company.id),
    activeCategories(db, company.id),
    activeJobs(db, company.id),
  ]);

  return (
    <div>
      <PageHeader backHref="/money-out/bills" backLabel="Bills" title="Add a bill" />
      {suppliers.length === 0 ? (
        <EmptyState
          title="Add a supplier first"
          description="A bill needs to be from someone."
          action={<ButtonLink href="/suppliers/new">Add a supplier</ButtonLink>}
        />
      ) : (
        <NewBillForm
          suppliers={suppliers.map((s) => ({
            id: s.id,
            name: s.name,
            isSubcontractor: s.isSubcontractor,
            defaultCategoryId: s.defaultCategoryId,
            cisStatus: s.cisStatus,
          }))}
          categories={categories
            .filter((c) => c.kind !== 'income')
            .map((c) => ({ id: c.id, name: c.name, defaultVatTreatment: c.defaultVatTreatment }))}
          jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
          defaultSupplierId={params.supplierId}
          defaultJobId={params.jobId}
          vatRegistered={company.vatRegistered}
        />
      )}
    </div>
  );
}
