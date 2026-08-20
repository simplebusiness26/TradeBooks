'use client';

import { useActionState } from 'react';
import { findMatchesAction, matchReceiptAction, unmatchReceiptAction, updateReceiptAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, Money, Select, SuccessMessage, Textarea } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function ReceiptEditor({
  document,
  suppliers,
  categories,
  jobs,
}: {
  document: {
    id: string;
    supplierNameText: string | null;
    supplierId: string | null;
    documentDate: string | null;
    grossPence: number | null;
    vatPence: number | null;
    categoryId: string | null;
    jobId: string | null;
    notes: string | null;
  };
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  jobs: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(updateReceiptAction, IDLE);

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink-800">Receipt details</h2>
      <form action={action} className="space-y-4">
        <input type="hidden" name="documentId" value={document.id} />
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <Field label="Who was it from?" htmlFor="supplierNameText">
          <Input
            id="supplierNameText"
            name="supplierNameText"
            defaultValue={document.supplierNameText ?? ''}
            maxLength={160}
            placeholder="Travis Perkins"
          />
        </Field>

        {suppliers.length > 0 ? (
          <Field label="Link to a supplier on file" htmlFor="supplierId">
            <Select id="supplierId" name="supplierId" defaultValue={document.supplierId ?? ''}>
              <option value="">Not linked</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date on the receipt" htmlFor="documentDate">
            <Input id="documentDate" name="documentDate" type="date" defaultValue={document.documentDate ?? ''} />
          </Field>
          <Field label="Total (£)" htmlFor="gross">
            <Input
              id="gross"
              name="gross"
              inputMode="decimal"
              defaultValue={document.grossPence !== null ? (document.grossPence / 100).toFixed(2) : ''}
            />
          </Field>
          <Field label="VAT (£)" htmlFor="vat">
            <Input
              id="vat"
              name="vat"
              inputMode="decimal"
              defaultValue={document.vatPence !== null ? (document.vatPence / 100).toFixed(2) : ''}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" defaultValue={document.categoryId ?? ''}>
              <option value="">Not set</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          {jobs.length > 0 ? (
            <Field label="Job" htmlFor="jobId">
              <Select id="jobId" name="jobId" defaultValue={document.jobId ?? ''}>
                <option value="">Not for a specific job</option>
                {jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={document.notes ?? ''} maxLength={1000} />
        </Field>

        <SubmitButton pendingLabel="Saving…">Save details</SubmitButton>
      </form>
    </Card>
  );
}

export function ReceiptMatchPicker({
  documentId,
  matched,
  candidates,
}: {
  documentId: string;
  matched: boolean;
  candidates: { id: string; label: string; amountPence: number; date: string; reason: string }[];
}) {
  if (matched) {
    return (
      <form action={unmatchReceiptAction} className="mt-4">
        <input type="hidden" name="documentId" value={documentId} />
        <SubmitButton variant="ghost" pendingLabel="Unlinking…">
          This is the wrong payment — unlink it
        </SubmitButton>
      </form>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink-800">Which payment is this?</h2>
      {candidates.length === 0 ? (
        <>
          <p className="text-sm text-ink-500">
            No matching payment found yet. Add the total above, or import the statement it is on.
          </p>
          <form action={findMatchesAction} className="mt-3">
            <input type="hidden" name="documentId" value={documentId} />
            <SubmitButton variant="secondary" pendingLabel="Looking…">
              Look again
            </SubmitButton>
          </form>
        </>
      ) : (
        <ul className="space-y-2">
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <form action={matchReceiptAction}>
                <input type="hidden" name="documentId" value={documentId} />
                <input type="hidden" name="transactionId" value={candidate.id} />
                <button
                  type="submit"
                  className="flex w-full min-h-16 items-center justify-between gap-3 rounded-xl border border-ink-200 px-4 py-3 text-left hover:bg-ink-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink-900">{candidate.label}</span>
                    <span className="block text-xs text-ink-500">
                      {candidate.date} · {candidate.reason}
                    </span>
                  </span>
                  <Money pence={candidate.amountPence} size="sm" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
