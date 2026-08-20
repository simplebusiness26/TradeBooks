'use client';

import { useActionState, useState } from 'react';
import {
  categoriseTransactionAction,
  excludeTransactionAction,
  markReviewedAction,
} from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Select, SuccessMessage, Textarea } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { VAT_TREATMENT_HELP, VAT_TREATMENT_LABELS, type VatTreatment } from '@/domain/vat';

type Category = { id: string; name: string; kind: string; defaultVatTreatment: string };

export function TransactionEditor({
  transaction,
  categories,
  jobs,
  suppliers,
  canEdit,
  vatRegistered,
}: {
  transaction: {
    id: string;
    categoryId: string | null;
    supplierId: string | null;
    jobId: string | null;
    vatTreatment: string;
    isPersonal: boolean;
    notes: string | null;
    direction: 'money_in' | 'money_out';
    status: string;
    counterparty: string | null;
  };
  categories: Category[];
  jobs: { id: string; label: string }[];
  suppliers: { id: string; name: string }[];
  canEdit: boolean;
  vatRegistered: boolean;
}) {
  const [state, action] = useActionState(categoriseTransactionAction, IDLE);
  const [categoryId, setCategoryId] = useState(transaction.categoryId ?? '');
  const [isPersonal, setIsPersonal] = useState(transaction.isPersonal);
  const [vatTreatment, setVatTreatment] = useState(transaction.vatTreatment);

  const relevant = categories.filter((c) =>
    transaction.direction === 'money_in' ? c.kind !== 'expense' : c.kind !== 'income',
  );

  if (!canEdit) return null;

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <input type="hidden" name="transactionId" value={transaction.id} />

        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <Field label="Is this business or personal?" htmlFor="isPersonal">
          <Select
            id="isPersonal"
            name="isPersonal"
            value={isPersonal ? 'yes' : 'no'}
            onChange={(event) => setIsPersonal(event.target.value === 'yes')}
          >
            <option value="no">Business</option>
            <option value="yes">Personal — keep it out of the books</option>
          </Select>
        </Field>

        {!isPersonal ? (
          <>
            <Field label="What was it for?" htmlFor="categoryId" required>
              <Select
                id="categoryId"
                name="categoryId"
                value={categoryId}
                onChange={(event) => {
                  setCategoryId(event.target.value);
                  const found = relevant.find((c) => c.id === event.target.value);
                  if (found) setVatTreatment(found.defaultVatTreatment);
                }}
              >
                <option value="">Choose…</option>
                {relevant.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>

            {transaction.direction === 'money_out' && suppliers.length > 0 ? (
              <Field label="Who was it paid to?" htmlFor="supplierId" hint="Optional.">
                <Select id="supplierId" name="supplierId" defaultValue={transaction.supplierId ?? ''}>
                  <option value="">Not linked to a supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {jobs.length > 0 ? (
              <Field label="Which job?" htmlFor="jobId" hint="This is what makes job profit accurate.">
                <Select id="jobId" name="jobId" defaultValue={transaction.jobId ?? ''}>
                  <option value="">Not for a specific job</option>
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            {vatRegistered ? (
              <Field
                label="VAT treatment"
                htmlFor="vatTreatment"
                hint={VAT_TREATMENT_HELP[vatTreatment as VatTreatment]}
              >
                <Select
                  id="vatTreatment"
                  name="vatTreatment"
                  value={vatTreatment}
                  onChange={(event) => setVatTreatment(event.target.value)}
                >
                  {Object.entries(VAT_TREATMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="vatTreatment" value="no_vat" />
            )}

            {transaction.counterparty ? (
              <Field
                label="Sort payments like this automatically from now on?"
                htmlFor="createRule"
                hint={`Applies to future payments mentioning “${transaction.counterparty}”.`}
              >
                <Select id="createRule" name="createRule" defaultValue="yes">
                  <option value="yes">Yes, remember this</option>
                  <option value="no">No, just this one</option>
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}

        <Field label="Notes (optional)" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={transaction.notes ?? ''} maxLength={2000} />
        </Field>

        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-ink-100 pt-4">
        {transaction.status !== 'reviewed' && transaction.status !== 'excluded' ? (
          <form action={markReviewedAction}>
            <input type="hidden" name="transactionId" value={transaction.id} />
            <SubmitButton variant="secondary" pendingLabel="Marking…">
              Mark as reviewed
            </SubmitButton>
          </form>
        ) : null}
        {transaction.status !== 'excluded' ? (
          <form action={excludeTransactionAction}>
            <input type="hidden" name="transactionId" value={transaction.id} />
            <SubmitButton variant="ghost" pendingLabel="Excluding…">
              Not a real payment — exclude it
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </Card>
  );
}
