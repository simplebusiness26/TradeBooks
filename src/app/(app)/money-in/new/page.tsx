import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeCustomers, activeJobs } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { EmptyState, ButtonLink } from '@/components/ui/primitives';
import { NewInvoiceForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New invoice — TradeBooks' };

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string; jobId?: string }>;
}) {
  const { company } = await requirePermission('records.write');
  const params = await searchParams;
  const [customers, jobs] = await Promise.all([
    activeCustomers(db, company.id),
    activeJobs(db, company.id),
  ]);

  return (
    <div>
      <PageHeader backHref="/money-in" backLabel="Money in" title="New invoice" />
      {customers.length === 0 ? (
        <EmptyState
          title="Add a customer first"
          description="An invoice needs someone to send it to."
          action={<ButtonLink href="/customers/new">Add a customer</ButtonLink>}
        />
      ) : (
        <NewInvoiceForm
          customers={customers.map((c) => ({ id: c.id, name: c.name, paymentTermsDays: c.paymentTermsDays }))}
          jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
          vatRegistered={company.vatRegistered}
          defaultCustomerId={params.customerId}
          defaultJobId={params.jobId}
        />
      )}
    </div>
  );
}
