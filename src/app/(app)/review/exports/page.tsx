/*
 * Exports are file downloads served by route handlers, not page navigations.
 * A client-side <Link> would swallow the Content-Disposition header and leave
 * the user on a blank screen, so plain anchors are correct here.
 */
/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { currentVatPeriod } from '@/domain/vat-return';
import { allAccountingAdapters } from '@/adapters/accounting';
import { Badge, Card, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Exports — TradeBooks' };

const CSV_EXPORTS = [
  { kind: 'transactions', label: 'Transactions', description: 'Every bank line with its category, VAT and decision trail' },
  { kind: 'invoices', label: 'Sales invoices', description: 'Numbers, dates, totals and what is still owed' },
  { kind: 'bills', label: 'Purchase bills', description: 'Supplier bills including the CIS split' },
  { kind: 'customers', label: 'Customers', description: 'Contact details and payment terms' },
  { kind: 'suppliers', label: 'Suppliers', description: 'Including UTR and CIS verification status' },
  { kind: 'jobs', label: 'Jobs', description: 'Revenue, costs, profit and margin per job' },
  { kind: 'journal', label: 'Journal', description: 'The internal double-entry postings' },
];

export default async function ExportsPage() {
  const { company } = await requirePermission('exports.run');
  const vat = await currentVatPeriod(db, company.id);
  const adapters = allAccountingAdapters();
  const periodQuery = `?start=${vat.start}&end=${vat.end}`;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Exports"
        description="Take everything out as plain files, any time, with nothing connected."
      />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">Accountant pack</h2>
        <p className="mt-1 text-sm text-ink-500">
          Every core record in one download, ready to hand over or archive.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/export/accountant-pack"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
          >
            <Icon name="download" className="size-5" /> Everything
          </a>
          <a
            href={`/api/export/accountant-pack${periodQuery}`}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-ink-300 bg-white px-5 text-sm font-semibold text-ink-800"
          >
            <Icon name="download" className="size-5" /> Just {vat.label}
          </a>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">Individual files</h2>
        <ul className="mt-3 space-y-2">
          {CSV_EXPORTS.map((item) => (
            <li key={item.kind} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{item.label}</p>
                <p className="text-xs text-ink-500">{item.description}</p>
              </div>
              <a
                href={`/api/export/${item.kind}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
              >
                <Icon name="download" className="size-4" /> CSV
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">Accounting packages</h2>
        <p className="mt-1 text-sm text-ink-500">
          TradeBooks holds the canonical records. These packages are optional — download the mapped payload to see
          exactly what would be sent.
        </p>
        <ul className="mt-3 space-y-2">
          {adapters.map((adapter) => (
            <li key={adapter.name} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-ink-900">{adapter.displayName}</p>
                <p className="mt-0.5">
                  <Badge tone={adapter.configured ? 'info' : 'neutral'}>
                    {adapter.configured ? 'Credentials configured' : 'Not connected'}
                  </Badge>
                </p>
              </div>
              <a
                href={`/api/export/${adapter.name}`}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
              >
                <Icon name="download" className="size-4" /> Mapped JSON
              </a>
            </li>
          ))}
        </ul>
      </Card>

      <Notice tone="neutral" title="Your data is yours">
        Nothing here needs an external account. Exports read straight from the TradeBooks database.
      </Notice>
    </div>
  );
}
