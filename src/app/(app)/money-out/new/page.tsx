import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeBankAccounts, activeCategories, activeJobs } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { ButtonLink, EmptyState } from '@/components/ui/primitives';
import { AddTransactionForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a payment — TradeBooks' };

export default async function AddTransactionPage() {
  const { company } = await requirePermission('records.write');
  const [accounts, categories, jobs] = await Promise.all([
    activeBankAccounts(db, company.id),
    activeCategories(db, company.id),
    activeJobs(db, company.id),
  ]);

  return (
    <div>
      <PageHeader
        backHref="/money-out"
        backLabel="Money out"
        title="Add a payment"
        description="For anything that is not on a statement yet — cash, or a payment you want to record now."
      />
      {accounts.length === 0 ? (
        <EmptyState
          title="Add a bank account first"
          description="Every payment belongs to an account."
          action={<ButtonLink href="/settings/accounts">Add an account</ButtonLink>}
        />
      ) : (
        <AddTransactionForm
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
          jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
        />
      )}
    </div>
  );
}
