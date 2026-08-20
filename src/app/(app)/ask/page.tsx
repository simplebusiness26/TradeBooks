import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requireAuth } from '@/lib/auth-context';
import { listOpenExceptions, listResolvedExceptions } from '@/domain/exceptions';
import { activeCategories, activeJobs } from '@/domain/queries';
import { formatDateTime } from '@/lib/dates';
import { Card, EmptyState, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { can } from '@/lib/permissions';
import { AskQueue } from './queue';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Ask me — TradeBooks' };

export default async function AskPage() {
  const { company, role } = await requireAuth();

  const [open, resolved, categories, jobs] = await Promise.all([
    listOpenExceptions(db, company.id, { limit: 40 }),
    listResolvedExceptions(db, company.id, 10),
    activeCategories(db, company.id),
    activeJobs(db, company.id),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ask me"
        description="A few short questions. Answer them and the books stay straight."
      />

      {open.length === 0 ? (
        <EmptyState
          title="Nothing to answer"
          description="TradeBooks has sorted everything it can. It will ask you here whenever it is unsure."
        />
      ) : (
        <>
          <Notice tone="info">
            {open.length} {open.length === 1 ? 'question' : 'questions'} waiting. Most take one tap.
          </Notice>
          <AskQueue
            questions={open.map((exception) => ({
              id: exception.id,
              type: exception.type,
              question: exception.question,
              detail: exception.detail,
              candidates: exception.candidates,
              subjectType: exception.subjectType,
              subjectId: exception.subjectId,
            }))}
            categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            jobs={jobs.map((j) => ({ id: j.id, label: `${j.reference} — ${j.name}` }))}
            canAnswer={can(role, 'exceptions.resolve')}
          />
        </>
      )}

      {resolved.length > 0 ? (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Recently answered</h2>
          <ul className="space-y-3">
            {resolved.map((exception) => (
              <li key={exception.id} className="border-b border-ink-100 pb-3 last:border-0 last:pb-0">
                <p className="text-sm text-ink-700">{exception.question}</p>
                <p className="text-sm text-ink-500">{exception.resolutionNote}</p>
                <p className="mt-0.5 text-xs text-ink-400">{formatDateTime(exception.resolvedAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
