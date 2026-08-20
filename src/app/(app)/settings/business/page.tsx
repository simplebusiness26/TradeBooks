import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { companies } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { PageHeader } from '@/components/ui/page';
import { Notice } from '@/components/ui/primitives';
import { BusinessForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Business details — TradeBooks' };

export default async function BusinessSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const context = await requirePermission('company.settings');
  const params = await searchParams;

  const rows = await db.select().from(companies).where(eq(companies.id, context.company.id)).limit(1);
  const company = rows[0]!;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Business details"
        description="Used on your invoices and to work out VAT and CIS."
      />

      {params.welcome === '1' ? (
        <Notice tone="info" title="Welcome to TradeBooks">
          Fill this in once and the rest follows. Next: add a bank account, import a statement, and raise your
          first invoice.
        </Notice>
      ) : null}

      <BusinessForm
        values={{
          name: company.name,
          tradingName: company.tradingName,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          city: company.city,
          postcode: company.postcode,
          phone: company.phone,
          email: company.email,
          vatRegistered: company.vatRegistered,
          vatNumber: company.vatNumber,
          vatScheme: company.vatScheme,
          vatPeriodMonths: company.vatPeriodMonths,
          vatFirstPeriodEnd: company.vatFirstPeriodEnd,
          cisContractor: company.cisContractor,
          cisSubcontractor: company.cisSubcontractor,
          cisUtr: company.cisUtr,
          financialYearEndMonth: company.financialYearEndMonth,
          financialYearEndDay: company.financialYearEndDay,
        }}
      />
    </div>
  );
}
