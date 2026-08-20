import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { integrationHealth } from '@/domain/integrations';
import { Badge, Card, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Connections — TradeBooks' };

export default async function IntegrationsPage() {
  const { company } = await requirePermission('audit.read');
  const health = await integrationHealth(db, company.id);

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Connections"
        description="What is switched on, what is not, and what nothing depends on."
      />

      <Notice tone="good" title="Everything below is optional">
        TradeBooks is the canonical record. Every core workflow — invoices, bills, receipts, categorisation, VAT
        and CIS preparation, exports — works with all of these disconnected.
      </Notice>

      <div className="space-y-3">
        {health.map((item) => (
          <Card key={item.provider} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-900">{item.displayName}</p>
                <p className="mt-0.5 text-sm text-ink-500">{item.purpose}</p>
              </div>
              <Badge tone={item.tone}>{item.statusLabel}</Badge>
            </div>

            <p className="mt-3 text-sm text-ink-600">
              <span className="font-medium">Right now: </span>
              {item.currentBehaviour}
            </p>

            {item.setupSteps.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">
                  How to connect it
                </summary>
                <ol className="mt-2 space-y-1 text-sm text-ink-600">
                  {item.setupSteps.map((step, index) => (
                    <li key={step}>
                      {index + 1}. {step}
                    </li>
                  ))}
                </ol>
                {item.connectionsSection ? (
                  <p className="mt-2 text-xs text-ink-500">
                    Full instructions: CONNECTIONS_REQUIRED.md, section {item.connectionsSection}.
                  </p>
                ) : null}
              </details>
            ) : null}
          </Card>
        ))}
      </div>
    </div>
  );
}
