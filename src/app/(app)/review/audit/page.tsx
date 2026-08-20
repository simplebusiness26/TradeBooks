import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { listAuditEvents } from '@/domain/audit';
import { users } from '@/db/schema';
import { formatDateTime } from '@/lib/dates';
import { Badge, Card, EmptyState } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Audit history — TradeBooks' };

const PAGE_SIZE = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; entityType?: string }>;
}) {
  const { company } = await requirePermission('audit.read');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? '1') || 1);

  const [events, people] = await Promise.all([
    listAuditEvents(db, company.id, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      entityType: params.entityType,
    }),
    db.select({ id: users.id, name: users.name }).from(users),
  ]);

  const nameById = new Map(people.map((p) => [p.id, p.name]));

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Audit history"
        description="Every change to the records, with who or what made it."
      />

      {events.length === 0 ? (
        <EmptyState title="Nothing recorded yet" description="Changes appear here as soon as they happen." />
      ) : (
        <Card>
          <ul>
            {events.map((event) => (
              <li key={event.id} className="border-b border-ink-100 px-4 py-3 last:border-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm text-ink-900">{event.summary}</p>
                  <span className="shrink-0 text-xs text-ink-400">{formatDateTime(event.createdAt)}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{event.action}</Badge>
                  <span className="text-xs text-ink-500">
                    {event.actorUserId
                      ? (nameById.get(event.actorUserId) ?? 'A person')
                      : (event.actorLabel ?? sourceLabel(event.source))}
                  </span>
                  {event.ipAddress ? <span className="text-xs text-ink-400">{event.ipAddress}</span> : null}
                </div>
                {event.changes && Object.keys(event.changes).length > 0 ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-ink-500">
                    {Object.entries(event.changes).map(([field, change]) => (
                      <li key={field}>
                        <span className="font-medium text-ink-600">{field}</span>: {format(change.from)} →{' '}
                        {format(change.to)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex justify-between">
        {page > 1 ? (
          <a href={`/review/audit?page=${page - 1}`} className="text-sm font-semibold text-brand-700 underline">
            ← Newer
          </a>
        ) : (
          <span />
        )}
        {events.length === PAGE_SIZE ? (
          <a href={`/review/audit?page=${page + 1}`} className="text-sm font-semibold text-brand-700 underline">
            Older →
          </a>
        ) : null}
      </div>
    </div>
  );
}

function format(value: unknown): string {
  if (value === null || value === undefined) return 'nothing';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value).slice(0, 60);
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'rule':
      return 'A rule';
    case 'history':
      return 'Past behaviour';
    case 'heuristic':
      return 'Automatic matching';
    case 'ai_suggestion':
      return 'AI suggestion';
    case 'import':
      return 'Import';
    default:
      return 'TradeBooks';
  }
}
