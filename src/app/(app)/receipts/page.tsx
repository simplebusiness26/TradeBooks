import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { documentCounts, listDocuments } from '@/domain/queries';
import { countMissingReceipts } from '@/domain/documents';
import { formatDate } from '@/lib/dates';
import { Badge, ButtonLink, EmptyState, Money, Notice } from '@/components/ui/primitives';
import { List, ListRow, PageHeader, Tabs } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Receipts — TradeBooks' };

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { company } = await requireAuth();
  const params = await searchParams;
  const view =
    params.view === 'matched' ? 'matched' : params.view === 'needs_answer' ? 'needs_answer' : params.view === 'all' ? 'all' : 'unmatched';

  const [documents, counts, missing] = await Promise.all([
    listDocuments(db, company.id, { status: view }),
    documentCounts(db, company.id),
    countMissingReceipts(db, company.id),
  ]);

  return (
    <div>
      <PageHeader
        title="Receipts"
        description="Photograph it once and TradeBooks files it against the payment."
        action={
          <ButtonLink href="/receipts/new">
            <Icon name="camera" className="size-5" /> Add receipt
          </ButtonLink>
        }
      />

      {missing > 0 ? (
        <div className="mb-4">
          <Notice tone="warn" title={`${missing} payment${missing === 1 ? '' : 's'} without a receipt`}>
            Chase these up before the VAT period closes — you can only reclaim VAT with the evidence.{' '}
            <a href="/money-out?view=needs_receipt" className="font-semibold underline">
              See which ones
            </a>
          </Notice>
        </div>
      ) : null}

      <Tabs
        current={`/receipts?view=${view}`}
        items={[
          { href: '/receipts?view=unmatched', label: 'Not matched', count: counts.unmatched },
          { href: '/receipts?view=needs_answer', label: 'Needs an answer', count: counts.needsAnswer },
          { href: '/receipts?view=matched', label: 'Filed' },
          { href: '/receipts?view=all', label: 'Everything', count: counts.all },
        ]}
      />

      {documents.length === 0 ? (
        <EmptyState
          title="No receipts here"
          description="Take a photo of a receipt and TradeBooks reads what it can, then finds the payment it belongs to."
          action={<ButtonLink href="/receipts/new">Add your first receipt</ButtonLink>}
        />
      ) : (
        <List>
          {documents.map((document) => (
            <ListRow
              key={document.id}
              href={`/receipts/${document.id}`}
              title={document.supplierNameText ?? document.supplierName ?? document.originalFilename}
              subtitle={
                document.documentDate
                  ? formatDate(document.documentDate)
                  : `Uploaded ${formatDate(document.createdAt.toISOString().slice(0, 10))}`
              }
              meta={
                <>
                  {statusBadge(document.status, Boolean(document.matchedTransactionId))}
                  {document.jobReference ? <Badge tone="neutral">{document.jobReference}</Badge> : null}
                  {document.transactionDescription ? (
                    <span className="text-xs text-ink-500">
                      Filed against {formatDate(document.transactionDate ?? '')}
                    </span>
                  ) : null}
                </>
              }
              right={document.grossPence !== null ? <Money pence={document.grossPence} /> : <span className="text-sm text-ink-400">—</span>}
            />
          ))}
        </List>
      )}
    </div>
  );
}

function statusBadge(status: string, matched: boolean) {
  if (matched) return <Badge tone="good">Filed</Badge>;
  switch (status) {
    case 'needs_answer':
      return <Badge tone="warn">Needs an answer</Badge>;
    case 'failed':
      return <Badge tone="bad">Could not be read</Badge>;
    case 'filed':
      return <Badge tone="neutral">Kept on file</Badge>;
    default:
      return <Badge tone="info">Waiting to be matched</Badge>;
  }
}
