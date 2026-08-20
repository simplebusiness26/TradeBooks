import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { transactions } from '@/db/schema';
import { getDocument } from '@/domain/documents';
import { activeCategories, activeJobs, activeSuppliers } from '@/domain/queries';
import { describeReasons, findTransactionMatchesForReceipt } from '@/domain/matching';
import { listAuditEvents } from '@/domain/audit';
import { formatDate, formatDateTime } from '@/lib/dates';
import { Badge, Card, DataRow, Money, Notice, SuccessMessage } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { ReceiptEditor, ReceiptMatchPicker } from './editor';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Receipt — TradeBooks' };

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const { company, role } = await requireAuth();
  const { id } = await params;
  const { msg } = await searchParams;

  const document = await getDocument(db, company.id, id).catch(() => null);
  if (!document) notFound();

  const [categories, jobs, suppliers, matchedRows, history] = await Promise.all([
    activeCategories(db, company.id),
    activeJobs(db, company.id),
    activeSuppliers(db, company.id),
    document.matchedTransactionId
      ? db.select().from(transactions).where(eq(transactions.id, document.matchedTransactionId)).limit(1)
      : Promise.resolve([]),
    listAuditEvents(db, company.id, { entityType: 'document', entityId: document.id, limit: 10 }),
  ]);

  const matched = matchedRows[0];
  const candidates =
    !matched && document.grossPence
      ? await findTransactionMatchesForReceipt(db, {
          companyId: company.id,
          grossPence: document.grossPence,
          documentDate: document.documentDate,
          supplierId: document.supplierId,
          supplierNameText: document.supplierNameText,
          excludeDocumentId: document.id,
        })
      : null;

  const isImage = document.contentType.startsWith('image/');
  const canEdit = can(role, 'documents.upload');

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/receipts"
        backLabel="Receipts"
        title={document.supplierNameText ?? document.originalFilename}
        description={document.documentDate ? formatDate(document.documentDate) : 'Date not read yet'}
      />

      {msg ? <SuccessMessage>{msg}</SuccessMessage> : null}

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink-500">Total on the receipt</p>
            {document.grossPence !== null ? (
              <Money pence={document.grossPence} size="xl" className="mt-1 block" />
            ) : (
              <p className="mt-1 text-xl font-semibold text-ink-400">Not read yet</p>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-2">
              {matched ? <Badge tone="good">Filed against a payment</Badge> : <Badge tone="warn">Not matched yet</Badge>}
              {document.extractionConfidence !== null ? (
                <span className="text-sm text-ink-500">
                  Read with {document.extractionConfidence}% confidence
                </span>
              ) : null}
            </p>
          </div>
          <Link
            href={`/receipts/${document.id}/file`}
            target="_blank"
            className="inline-flex min-h-12 items-center rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-800"
          >
            Open original
          </Link>
        </div>

        {document.extractionError ? (
          <p className="mt-4 rounded-xl bg-warn-50 px-4 py-3 text-sm text-warn-800">{document.extractionError}</p>
        ) : null}
      </Card>

      {isImage ? (
        <Card className="overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/receipts/${document.id}/file`}
            alt={`Receipt from ${document.supplierNameText ?? 'an unknown supplier'}`}
            className="max-h-[28rem] w-full bg-ink-100 object-contain"
          />
        </Card>
      ) : null}

      {matched ? (
        <Card className="p-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-800">Filed against</h2>
          <Link href={`/money-out/${matched.id}`} className="block text-sm text-brand-700 underline">
            {matched.description}
          </Link>
          <p className="mt-1 text-sm text-ink-500">
            {formatDate(matched.transactionDate)} · <Money pence={matched.amountPence} size="sm" />
          </p>
          {document.matchReason ? (
            <p className="mt-2 text-sm text-ink-500">Matched because {document.matchReason}.</p>
          ) : null}
          {canEdit ? <ReceiptMatchPicker documentId={document.id} matched candidates={[]} /> : null}
        </Card>
      ) : canEdit ? (
        <ReceiptMatchPicker
          documentId={document.id}
          matched={false}
          candidates={(candidates?.candidates ?? []).slice(0, 5).map((candidate) => ({
            id: candidate.record.id,
            label: candidate.record.description,
            amountPence: candidate.record.amountPence,
            date: candidate.record.transactionDate,
            reason: describeReasons(candidate.reasons),
          }))}
        />
      ) : null}

      {canEdit ? (
        <ReceiptEditor
          document={{
            id: document.id,
            supplierNameText: document.supplierNameText,
            supplierId: document.supplierId,
            documentDate: document.documentDate,
            grossPence: document.grossPence,
            vatPence: document.vatPence,
            categoryId: document.categoryId,
            jobId: document.jobId,
            notes: document.notes,
          }}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          categories={categories.filter((c) => c.kind !== 'income').map((c) => ({ id: c.id, name: c.name }))}
          jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
        />
      ) : null}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">What we read</h2>
        <dl>
          <DataRow label="Supplier" value={document.supplierNameText ?? '—'} />
          <DataRow label="Date" value={document.documentDate ? formatDate(document.documentDate) : '—'} />
          <DataRow label="Net" value={document.netPence !== null ? <Money pence={document.netPence} size="sm" /> : '—'} />
          <DataRow label="VAT" value={document.vatPence !== null ? <Money pence={document.vatPence} size="sm" /> : '—'} />
          <DataRow label="Total" value={document.grossPence !== null ? <Money pence={document.grossPence} size="sm" /> : '—'} />
          <DataRow label="Read by" value={document.extractionProvider ?? 'not read'} />
          <DataRow label="Original file" value={`${document.originalFilename} (${formatBytes(document.byteSize)})`} />
          <DataRow label="Fingerprint" value={<code className="text-xs">{document.checksumSha256.slice(0, 16)}…</code>} />
        </dl>
      </Card>

      <Notice tone="neutral">
        The original file is stored exactly as you sent it and is never altered. Anything TradeBooks reads is kept
        separately, so a correction never overwrites the evidence.
      </Notice>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-800">History</h2>
        <ul className="space-y-2 text-sm">
          {history.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink-700">{event.summary}</span>
              <span className="text-xs text-ink-400">{formatDateTime(event.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
