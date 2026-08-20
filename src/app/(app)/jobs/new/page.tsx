import type { Metadata } from 'next';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { activeCustomers } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { JobForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New job — TradeBooks' };

export default async function NewJobPage() {
  const { company } = await requirePermission('records.write');
  const [customers, latest] = await Promise.all([
    activeCustomers(db, company.id),
    db
      .select({ reference: jobs.reference })
      .from(jobs)
      .where(eq(jobs.companyId, company.id))
      .orderBy(desc(jobs.createdAt))
      .limit(30),
  ]);

  const highest = latest.reduce((max, row) => {
    const match = /(\d+)\s*$/.exec(row.reference);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);

  return (
    <div>
      <PageHeader backHref="/jobs" backLabel="Jobs" title="New job" />
      <JobForm
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        suggestedReference={`J-${highest + 1}`}
      />
    </div>
  );
}
