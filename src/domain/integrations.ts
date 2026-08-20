import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { integrationConnections } from '@/db/schema';
import { env } from '@/lib/env';
import { getBankFeed } from '@/adapters/bank';
import { getAi } from '@/adapters/ai';
import { getEmail } from '@/adapters/email';
import { getOcr } from '@/adapters/ocr';
import { getStorage } from '@/adapters/storage';
import { allAccountingAdapters } from '@/adapters/accounting';

export type IntegrationHealth = {
  provider: string;
  displayName: string;
  purpose: string;
  statusLabel: string;
  tone: 'good' | 'info' | 'warn' | 'neutral';
  /** What the app does today, connected or not. */
  currentBehaviour: string;
  setupSteps: string[];
  connectionsSection?: string;
};

/**
 * A single honest picture of every optional provider. Nothing here claims a
 * connection that does not exist.
 */
export async function integrationHealth(db: Database, companyId: string): Promise<IntegrationHealth[]> {
  const config = env();
  const rows = await db
    .select()
    .from(integrationConnections)
    .where(eq(integrationConnections.companyId, companyId));
  const stored = new Map(rows.map((row) => [row.provider, row]));

  const storage = getStorage();
  const ocr = getOcr();
  const ai = getAi();
  const email = getEmail();
  const bank = getBankFeed();

  const health: IntegrationHealth[] = [
    {
      provider: 'storage',
      displayName: 'Receipt storage',
      purpose: 'Where uploaded receipts and documents are kept.',
      statusLabel: storage.name === 'local' ? 'Local disk' : 'S3-compatible',
      tone: 'good',
      currentBehaviour:
        storage.name === 'local'
          ? `Files are written to ${config.STORAGE_LOCAL_DIR} on the server. Fine for a single machine; move to object storage before scaling out.`
          : 'Files are written to the configured S3-compatible bucket.',
      setupSteps: [
        'Create a bucket with your object-storage provider.',
        'Set STORAGE_DRIVER=s3 and the S3_* variables.',
        'Install @aws-sdk/client-s3 and complete src/adapters/storage/s3.ts.',
      ],
      connectionsSection: '3',
    },
    {
      provider: 'ocr',
      displayName: 'Receipt reading',
      purpose: 'Reading supplier, date, total and VAT from a receipt.',
      statusLabel: config.OCR_DRIVER === 'builtin' ? 'Built-in text reader' : config.OCR_DRIVER === 'http' ? 'External provider' : 'Off',
      tone: config.OCR_DRIVER === 'none' ? 'neutral' : 'good',
      currentBehaviour: ocr.supportsImages
        ? 'Photos and scans are read automatically by the configured provider.'
        : 'Emailed text receipts are read automatically. For photos, TradeBooks asks the owner to confirm the supplier and total, then finds the payment itself.',
      setupSteps: [
        'Choose a document-extraction provider that accepts a multipart upload.',
        'Set OCR_DRIVER=http, OCR_HTTP_ENDPOINT and OCR_HTTP_API_KEY.',
        'The response shape is documented in src/adapters/ocr/http.ts.',
      ],
      connectionsSection: '6',
    },
    {
      provider: 'ai',
      displayName: 'AI suggestions',
      purpose: 'Suggesting a category for a payment nothing else could place.',
      statusLabel: ai.available ? `On (${ai.name})` : 'Off',
      tone: ai.available ? 'info' : 'neutral',
      currentBehaviour: ai.available
        ? 'Consulted only after rules, supplier history and matching have all failed. Its answers are always recorded as suggestions with a confidence and reason, and are never applied without review.'
        : 'Not used. Everything is decided by deterministic rules, supplier history and matching; anything left over becomes a question in Ask Me. No feature is lost.',
      setupSteps: [
        'Optional. Nothing here is required — leave AI_DRIVER=none and the product is complete.',
        'Zero cost option: Cloudflare Workers AI has a free allowance. Set AI_DRIVER=cloudflare with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.',
        'Paid option: set AI_DRIVER=anthropic with ANTHROPIC_API_KEY.',
        'Routine transactions are never sent to a model — only ones no rule, history or match could place.',
        'Suggestions stay capped below the auto-apply threshold, so a person always confirms them.',
      ],
      connectionsSection: '7',
    },
    {
      provider: 'email',
      displayName: 'Email and reminders',
      purpose: 'Sending invoices and chasing overdue payments.',
      statusLabel: config.EMAIL_DRIVER === 'log' ? 'Recorded only' : 'SMTP',
      tone: config.EMAIL_DRIVER === 'log' ? 'warn' : 'good',
      currentBehaviour:
        config.EMAIL_DRIVER === 'log'
          ? 'Reminders are written to the outbox with full history, but nothing leaves the server. Chasing status still works.'
          : `Messages are sent through ${email.name}.`,
      setupSteps: [
        'Choose an email provider and verify your sending domain.',
        'Set EMAIL_DRIVER=smtp, EMAIL_FROM and the SMTP_* variables.',
        'Install nodemailer and complete src/adapters/email/index.ts.',
      ],
      connectionsSection: '8',
    },
    {
      provider: 'bank_feed',
      displayName: 'Bank feed (open banking)',
      purpose: 'Pulling transactions in automatically instead of importing a CSV.',
      statusLabel: bank.available ? 'Configured' : 'Not connected',
      tone: bank.available ? 'info' : 'neutral',
      currentBehaviour: bank.available
        ? 'Credentials are present; the feed can be authorised.'
        : 'Transactions come from CSV statement imports and manual entry. Every downstream workflow — categorisation, matching, VAT, job costs — works exactly the same.',
      setupSteps: [
        'Register with an open-banking provider (TrueLayer is scaffolded).',
        'Set BANK_FEED_DRIVER=truelayer and the TRUELAYER_* variables.',
        'Complete listAccounts and listTransactions in src/adapters/bank/index.ts.',
      ],
      connectionsSection: '4',
    },
    {
      provider: 'hmrc',
      displayName: 'HMRC submission',
      purpose: 'Filing VAT returns and CIS returns directly.',
      statusLabel: 'Not implemented',
      tone: 'neutral',
      currentBehaviour:
        'TradeBooks prepares VAT and CIS figures and keeps the evidence, but it does not file anything. Returns are submitted by you or your accountant, and the reference is recorded here for the audit trail.',
      setupSteps: [
        'This requires HMRC recognition and a fraud-prevention header implementation.',
        'It is deliberately out of scope for V1 — nothing in the product implies otherwise.',
      ],
      connectionsSection: '9',
    },
  ];

  for (const adapter of allAccountingAdapters()) {
    health.push({
      provider: adapter.name,
      displayName: adapter.displayName,
      purpose: 'Optional sync or export if the business already uses this package.',
      statusLabel: adapter.configured ? 'Credentials configured' : 'Not connected',
      tone: adapter.configured ? 'info' : 'neutral',
      currentBehaviour: adapter.configured
        ? 'OAuth credentials are present. Records can be mapped and exported; pushing needs the transport completing.'
        : 'Not connected, and nothing depends on it. The mapped payload can still be downloaded from Exports so you can see exactly what would be sent.',
      setupSteps: [
        `Create a developer app with ${adapter.displayName}.`,
        `Set ${adapter.name.toUpperCase()}_CLIENT_ID, _CLIENT_SECRET and _REDIRECT_URI.`,
        'Complete the push method in the adapter to send the mapped records.',
      ],
      connectionsSection: '5',
    });
  }

  return health.map((item) => {
    const row = stored.get(item.provider);
    if (row?.lastError) return { ...item, statusLabel: 'Error', tone: 'warn' as const };
    return item;
  });
}
