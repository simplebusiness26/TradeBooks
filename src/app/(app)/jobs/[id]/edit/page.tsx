import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { activeCustomers } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { JobForm } from '../../new/form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Edit job — TradeBooks' };

export default async function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { company } = await requirePermission('records.write');
  const { id } = await params;

  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.companyId, company.id), eq(jobs.id, id)))
    .limit(1);
  const job = rows[0];
  if (!job) notFound();

  const customers = await activeCustomers(db, company.id);

  return (
    <div>
      <PageHeader backHref={`/jobs/${job.id}`} backLabel="Back to job" title={`Edit ${job.reference}`} />
      <JobForm
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        values={{
          id: job.id,
          reference: job.reference,
          name: job.name,
          customerId: job.customerId,
          status: job.status,
          siteAddressLine1: job.siteAddressLine1,
          siteCity: job.siteCity,
          sitePostcode: job.sitePostcode,
          description: job.description,
          quotedRevenuePence: job.quotedRevenuePence,
          estimatedCostPence: job.estimatedCostPence,
          startDate: job.startDate,
          endDate: job.endDate,
        }}
      />
    </div>
  );
}
