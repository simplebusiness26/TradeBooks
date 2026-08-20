import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { outboxMessages } from '@/db/schema';
import { env } from '@/lib/env';

export type OutboundMessage = {
  companyId: string;
  to: string;
  subject: string;
  body: string;
  purpose?: string;
  relatedType?: string | null;
  relatedId?: string | null;
};

export type SendResult = { status: 'sent' | 'queued' | 'failed'; providerMessageId?: string; error?: string };

export interface EmailAdapter {
  readonly name: string;
  readonly available: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}

/**
 * Default delivery: record only. Every message is written to the outbox table
 * so reminder history and chasing status work in full without an email
 * provider; nothing is silently dropped and nothing is silently sent.
 */
class LogEmailAdapter implements EmailAdapter {
  readonly name = 'log';
  readonly available = true;
  async send(): Promise<SendResult> {
    return { status: 'queued' };
  }
}

/**
 * SMTP delivery.
 *
 * NOT CONNECTED. nodemailer is deliberately not a dependency of the
 * standalone build. To enable: npm install nodemailer, complete the send()
 * body, set EMAIL_DRIVER=smtp and the SMTP_* variables.
 * See CONNECTIONS_REQUIRED.md section 8.
 */
class SmtpEmailAdapter implements EmailAdapter {
  readonly name = 'smtp';
  constructor(private readonly config: { host?: string; port?: number; user?: string; password?: string }) {}
  get available(): boolean {
    return Boolean(this.config.host && this.config.user);
  }
  async send(): Promise<SendResult> {
    return {
      status: 'failed',
      error:
        'SMTP delivery is selected but not implemented in this build. Install nodemailer and complete src/adapters/email/index.ts, or set EMAIL_DRIVER=log. See CONNECTIONS_REQUIRED.md section 8.',
    };
  }
}

let cached: EmailAdapter | null = null;

export function getEmail(): EmailAdapter {
  if (cached) return cached;
  const config = env();
  cached =
    config.EMAIL_DRIVER === 'smtp'
      ? new SmtpEmailAdapter({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          user: config.SMTP_USER,
          password: config.SMTP_PASSWORD,
        })
      : new LogEmailAdapter();
  return cached;
}

export function resetEmailCache(): void {
  cached = null;
}

/**
 * Records the message in the outbox and attempts delivery through whichever
 * driver is configured. The outbox row is written first so the trail exists
 * even if the provider fails.
 */
export async function deliver(db: Database, message: OutboundMessage): Promise<{ id: string; status: string }> {
  const adapter = getEmail();
  const [row] = await db
    .insert(outboxMessages)
    .values({
      companyId: message.companyId,
      channel: 'email',
      toAddress: message.to,
      subject: message.subject,
      body: message.body,
      purpose: message.purpose ?? 'other',
      relatedType: message.relatedType ?? null,
      relatedId: message.relatedId ?? null,
      status: 'queued',
      provider: adapter.name,
    })
    .returning({ id: outboxMessages.id });

  if (!row) throw new Error('Failed to record outbound message');

  const result = await adapter.send(message);
  await db
    .update(outboxMessages)
    .set({
      status: result.status,
      providerMessageId: result.providerMessageId ?? null,
      error: result.error ?? null,
      sentAt: result.status === 'sent' ? new Date() : null,
    })
    .where(eq(outboxMessages.id, row.id));

  return { id: row.id, status: result.status };
}
