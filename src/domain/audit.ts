import { desc, eq, and, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { auditEvents } from '@/db/schema';

export type DecisionSource = 'user' | 'rule' | 'history' | 'heuristic' | 'ai_suggestion' | 'import' | 'system';

export type AuditInput = {
  companyId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  metadata?: Record<string, unknown>;
  source?: DecisionSource;
  actorUserId?: string | null;
  actorLabel?: string | null;
  ipAddress?: string | null;
};

/**
 * Appends an audit event. Audit writes never throw into the caller's
 * workflow: losing an audit line must not roll back a financial record, but
 * it is logged loudly so it can be investigated.
 */
export async function recordAudit(db: Database, input: AuditInput): Promise<void> {
  try {
    await db.insert(auditEvents).values({
      companyId: input.companyId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      changes: input.changes ?? null,
      metadata: input.metadata ?? {},
      source: input.source ?? 'user',
      actorUserId: input.actorUserId ?? null,
      actorLabel: input.actorLabel ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  } catch (error) {
    console.error('[audit] failed to record event', input.action, error);
  }
}

/** Computes a field-level diff for the audit trail, ignoring unchanged keys. */
export function diffRecords<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (!(field in after)) continue;
    const from = before[field];
    const to = after[field];
    if (from === to) continue;
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) continue;
    changes[String(field)] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}

export async function listAuditEvents(
  db: Database,
  companyId: string,
  options: { entityType?: string; entityId?: string; limit?: number; offset?: number } = {},
) {
  const conditions = [eq(auditEvents.companyId, companyId)];
  if (options.entityType) conditions.push(eq(auditEvents.entityType, options.entityType));
  if (options.entityId) conditions.push(eq(auditEvents.entityId, options.entityId));
  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt))
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
}

export async function countAuditEvents(db: Database, companyId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditEvents)
    .where(eq(auditEvents.companyId, companyId));
  return rows[0]?.count ?? 0;
}
