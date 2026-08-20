import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { activeJobs } from '@/domain/queries';
import { PageHeader } from '@/components/ui/page';
import { Card, Notice } from '@/components/ui/primitives';
import { getOcr } from '@/adapters/ocr';
import { UploadForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Add a receipt — TradeBooks' };

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ transactionId?: string; jobId?: string }>;
}) {
  const { company } = await requirePermission('documents.upload');
  const params = await searchParams;
  const jobs = await activeJobs(db, company.id);
  const ocr = getOcr();

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/receipts"
        backLabel="Receipts"
        title="Add a receipt"
        description="Take a photo, or upload a file the merchant emailed you."
      />

      <UploadForm
        jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
        transactionId={params.transactionId}
        defaultJobId={params.jobId}
      />

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-ink-800">What happens next</h2>
        <ol className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li>1. The original file is stored exactly as you sent it and never changed.</li>
          <li>2. TradeBooks reads what it can — supplier, date, total and VAT.</li>
          <li>3. It looks for the payment on your bank statement that matches.</li>
          <li>4. If it is sure, it files it. If not, it asks you one short question.</li>
        </ol>
      </Card>

      {!ocr.supportsImages ? (
        <Notice tone="info" title="Photos need a few details from you">
          TradeBooks reads emailed text and PDF-style receipts automatically. For a photo it will ask you for the
          supplier and the total — then it finds the payment itself. Your bookkeeper can switch on automatic
          photo reading later.
        </Notice>
      ) : null}
    </div>
  );
}
