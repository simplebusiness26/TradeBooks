import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeBankAccounts } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { ButtonLink, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { ImportForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import a statement — TradeBooks' };

export default async function ImportPage() {
  const { company } = await requirePermission('imports.run');
  const accounts = await activeBankAccounts(db, company.id);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/money-out"
        backLabel="Money out"
        title="Import a bank statement"
        description="Download a CSV from your online banking and drop it in here."
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="Add a bank account first"
          description="TradeBooks needs to know which account the statement belongs to."
          action={<ButtonLink href="/settings/accounts">Add an account</ButtonLink>}
        />
      ) : (
        <ImportForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">What TradeBooks can read</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li>• A date column, however it is named or formatted.</li>
          <li>• A description, details or narrative column.</li>
          <li>• Either one signed amount column, or separate “paid in” and “paid out” columns.</li>
          <li>• A balance column, if there is one.</li>
        </ul>
        <p className="mt-3 text-sm text-ink-500">
          Importing the same file twice adds nothing — every line is fingerprinted, so duplicates are skipped
          rather than doubled up.
        </p>
      </Card>

      <Notice tone="info" title="No bank connection needed">
        TradeBooks works entirely from statements you import and payments you add. An automatic bank feed is an
        optional extra your bookkeeper can switch on later.
      </Notice>
    </div>
  );
}
