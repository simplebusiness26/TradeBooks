import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeCategories } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { SupplierForm } from '@/components/forms/supplier-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a supplier — TradeBooks' };

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { company } = await requirePermission('records.write');
  const params = await searchParams;
  const categories = await activeCategories(db, company.id);

  return (
    <div>
      <PageHeader backHref="/suppliers" backLabel="Suppliers" title="Add a supplier" />
      <SupplierForm
        categories={categories.filter((c) => c.kind !== 'income').map((c) => ({ id: c.id, name: c.name }))}
        defaultKind={params.kind === 'subcontractor' ? 'subcontractor' : 'supplier'}
      />
    </div>
  );
}
