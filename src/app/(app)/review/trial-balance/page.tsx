import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { trialBalance } from '@/domain/exports';
import { Badge, Card, Money, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Trial balance — TradeBooks' };

export default async function TrialBalancePage() {
  const { company } = await requirePermission('audit.read');
  const balance = await trialBalance(db, company.id);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Trial balance"
        description="TradeBooks keeps its own double-entry journal behind the owner-facing screens."
      />

      <Notice tone={balance.balanced ? 'good' : 'bad'} title={balance.balanced ? 'Balanced' : 'Out of balance'}>
        {balance.balanced
          ? 'Every posting in the journal balances, so the figures on the other screens reconcile to it.'
          : 'Debits and credits do not agree. Do not rely on the reports until this is investigated.'}
      </Notice>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-500">
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Account</th>
              <th className="px-4 py-3 text-right">Debit</th>
              <th className="px-4 py-3 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {balance.rows.map((row) => (
              <tr key={row.code} className="border-b border-ink-100">
                <td className="px-4 py-3 font-mono text-xs text-ink-500">{row.code}</td>
                <td className="px-4 py-3 text-ink-900">{row.name}</td>
                <td className="px-4 py-3 text-right">
                  {row.debitPence > 0 ? <Money pence={row.debitPence} size="sm" /> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  {row.creditPence > 0 ? <Money pence={row.creditPence} size="sm" /> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-4 py-3" colSpan={2}>
                Total
              </td>
              <td className="px-4 py-3 text-right">
                <Money pence={balance.totalDebitPence} size="sm" />
              </td>
              <td className="px-4 py-3 text-right">
                <Money pence={balance.totalCreditPence} size="sm" />
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>

      {balance.rows.length === 0 ? (
        <p className="text-sm text-ink-500">Nothing posted yet.</p>
      ) : (
        <p className="text-sm text-ink-500">
          <Badge tone="neutral">Derived</Badge> These postings are generated automatically from invoices, bills and
          bank transactions. They are never edited by hand.
        </p>
      )}
    </div>
  );
}
