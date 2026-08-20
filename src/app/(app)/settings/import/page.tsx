/*
 * Downloading a CSV template is a route-handler download, so plain anchors are
 * correct here — a client-side <Link> would swallow the download.
 */
/* eslint-disable @next/next/no-html-link-for-pages */
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/page';
import { Card, Notice } from '@/components/ui/primitives';
import { ContactImportForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Import contacts — TradeBooks' };

export default async function ImportContactsPage() {
  await requirePermission('imports.run');

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Bring your contacts across"
        description="Import your existing customers and suppliers from a spreadsheet."
      />

      <ContactImportForm />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">What the file needs</h2>
        <p className="mt-1 text-sm text-ink-500">
          One row per contact, with a heading row. Only the name is required — everything else is
          matched by heading if it is there, and ignored if it is not.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-ink-600">
          <li>
            <span className="font-medium">Customers:</span> name, contact, email, phone, address,
            town, postcode, payment terms
          </li>
          <li>
            <span className="font-medium">Suppliers:</span> name, contact, email, phone, address,
            town, postcode, VAT number, category, UTR, CIS status
          </li>
        </ul>
        <p className="mt-3 text-sm text-ink-500">
          A supplier row with a UTR or a CIS status is treated as a subcontractor. Importing the
          same file twice updates the existing contacts rather than duplicating them.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href="/api/export/customers"
            className="inline-flex min-h-11 items-center rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
          >
            Download a customer template
          </a>
          <a
            href="/api/export/suppliers"
            className="inline-flex min-h-11 items-center rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
          >
            Download a supplier template
          </a>
        </div>
      </Card>

      <Notice tone="info" title="Bank statements go elsewhere">
        This page is for contacts. Import bank transactions from <strong>Money out → Import
        statement</strong>.
      </Notice>
    </div>
  );
}
