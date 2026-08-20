'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { answerExceptionAction, snoozeExceptionAction } from './actions';
import { IDLE } from '@/lib/action-result';
import { Badge, Card, ErrorMessage, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { Icon } from '@/components/shell/icons';

type Candidate = { id: string; label: string; sublabel?: string; action: Record<string, unknown> };

type Question = {
  id: string;
  type: string;
  question: string;
  detail: string | null;
  candidates: Candidate[];
  subjectType: string;
  subjectId: string;
};

const TYPE_LABELS: Record<string, string> = {
  uncategorised_transaction: 'Sorting a payment',
  missing_receipt: 'Missing receipt',
  ambiguous_receipt_match: 'Matching a receipt',
  unmatched_receipt: 'Receipt with no payment',
  business_or_personal: 'Business or personal',
  which_job: 'Which job',
  unallocated_payment: 'Matching a payment in',
  duplicate_suspected: 'Possible duplicate',
  vat_treatment_unclear: 'VAT treatment',
  cis_details_missing: 'CIS details',
  other: 'Question',
};

export function AskQueue({
  questions,
  categories,
  jobs,
  canAnswer,
}: {
  questions: Question[];
  categories: { id: string; name: string; kind: string }[];
  jobs: { id: string; label: string }[];
  canAnswer: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [state, action] = useActionState(answerExceptionAction, IDLE);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  const remaining = questions.filter((q) => !answered.has(q.id));
  const current = remaining[Math.min(index, Math.max(0, remaining.length - 1))];

  if (!current) {
    return (
      <Card className="p-6 text-center">
        <p className="text-base font-semibold text-ink-900">That is everything answered.</p>
        <p className="mt-1 text-sm text-ink-500">Refresh the page to check for anything new.</p>
      </Card>
    );
  }

  const subjectHref =
    current.subjectType === 'transaction'
      ? `/money-out/${current.subjectId}`
      : current.subjectType === 'document'
        ? `/receipts/${current.subjectId}`
        : current.subjectType === 'invoice'
          ? `/money-in/${current.subjectId}`
          : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-ink-500">
        <span>
          Question {Math.min(index + 1, remaining.length)} of {remaining.length}
        </span>
        <Badge tone="neutral">{TYPE_LABELS[current.type] ?? 'Question'}</Badge>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-ink-900">{current.question}</h2>
        {current.detail ? <p className="mt-1 text-sm text-ink-500">{current.detail}</p> : null}
        {subjectHref ? (
          <Link href={subjectHref} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
            See the full record <Icon name="chevron" className="size-4" />
          </Link>
        ) : null}

        {state.status === 'error' ? (
          <div className="mt-4">
            <ErrorMessage>{state.message}</ErrorMessage>
          </div>
        ) : null}
        {state.status === 'success' ? (
          <div className="mt-4">
            <SuccessMessage>{state.message}</SuccessMessage>
          </div>
        ) : null}

        {!canAnswer ? (
          <p className="mt-4 text-sm text-ink-500">You do not have permission to answer questions.</p>
        ) : (
          <div className="mt-5 space-y-2">
            {current.candidates.map((candidate) =>
              // "Take a photo" is not an answer — it is a trip to the camera.
              candidate.action.kind === 'upload_receipt' ? (
                <Link
                  key={candidate.id}
                  href={`/receipts/new?transactionId=${current.subjectId}`}
                  className="flex w-full min-h-14 items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-900">{candidate.label}</span>
                    {candidate.sublabel ? (
                      <span className="block text-xs text-ink-500">{candidate.sublabel}</span>
                    ) : null}
                  </span>
                  <Icon name="camera" className="size-5 shrink-0 text-ink-400" />
                </Link>
              ) : (
                <form
                  key={candidate.id}
                  action={action}
                  onSubmit={() => setAnswered((prev) => new Set(prev).add(current.id))}
                >
                  <input type="hidden" name="exceptionId" value={current.id} />
                  <input type="hidden" name="resolution" value={JSON.stringify(candidate.action)} />
                  <button
                    type="submit"
                    className="flex w-full min-h-14 items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink-900">{candidate.label}</span>
                      {candidate.sublabel ? (
                        <span className="block text-xs text-ink-500">{candidate.sublabel}</span>
                      ) : null}
                    </span>
                    <Icon name="chevron" className="size-5 shrink-0 text-ink-300" />
                  </button>
                </form>
              ),
            )}

            <OtherAnswer
              exceptionId={current.id}
              type={current.type}
              categories={categories}
              jobs={jobs}
              action={action}
              onAnswered={() => setAnswered((prev) => new Set(prev).add(current.id))}
            />
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
          {remaining.length > 1 ? (
            <button
              type="button"
              onClick={() => setIndex((value) => (value + 1) % remaining.length)}
              className="min-h-11 rounded-xl border border-ink-300 px-4 text-sm font-semibold text-ink-700"
            >
              Skip for now
            </button>
          ) : null}
          <form action={snoozeExceptionAction}>
            <input type="hidden" name="exceptionId" value={current.id} />
            <input type="hidden" name="days" value="7" />
            <SubmitButton variant="ghost" pendingLabel="Snoozing…">
              Ask me next week
            </SubmitButton>
          </form>
        </div>
      </Card>
    </div>
  );
}

/** The escape hatch: pick any category or job, or set the question aside. */
function OtherAnswer({
  exceptionId,
  type,
  categories,
  jobs,
  action,
  onAnswered,
}: {
  exceptionId: string;
  type: string;
  categories: { id: string; name: string; kind: string }[];
  jobs: { id: string; label: string }[];
  action: (formData: FormData) => void;
  onAnswered: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [jobId, setJobId] = useState('');

  const wantsJob = type === 'which_job';

  return (
    <div className="pt-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-12 w-full rounded-xl border border-dashed border-ink-300 px-4 text-sm font-semibold text-ink-600"
        >
          Something else…
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-ink-200 p-4">
          {wantsJob ? (
            <>
              <Select value={jobId} onChange={(event) => setJobId(event.target.value)} aria-label="Choose a job">
                <option value="">Choose a job…</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.label}
                  </option>
                ))}
              </Select>
              {jobId ? (
                <form action={action} onSubmit={onAnswered}>
                  <input type="hidden" name="exceptionId" value={exceptionId} />
                  <input type="hidden" name="resolution" value={JSON.stringify({ kind: 'set_job', jobId })} />
                  <SubmitButton className="w-full" pendingLabel="Saving…">
                    Use this job
                  </SubmitButton>
                </form>
              ) : null}
            </>
          ) : (
            <>
              <Select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                aria-label="Choose a category"
              >
                <option value="">Choose a category…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {categoryId ? (
                <form action={action} onSubmit={onAnswered}>
                  <input type="hidden" name="exceptionId" value={exceptionId} />
                  <input
                    type="hidden"
                    name="resolution"
                    value={JSON.stringify({ kind: 'set_category', categoryId, createRule: true })}
                  />
                  <SubmitButton className="w-full" pendingLabel="Saving…">
                    Use this category
                  </SubmitButton>
                </form>
              ) : null}
            </>
          )}

          <form action={action} onSubmit={onAnswered}>
            <input type="hidden" name="exceptionId" value={exceptionId} />
            <input type="hidden" name="resolution" value={JSON.stringify({ kind: 'dismiss' })} />
            <SubmitButton variant="ghost" className="w-full" pendingLabel="Setting aside…">
              Set this question aside
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
