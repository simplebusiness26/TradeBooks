'use client';

import { useActionState, useState } from 'react';
import { addTransactionAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, Select } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function AddTransactionForm({
  accounts,
  categories,
  jobs,
}: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string; kind: string }[];
  jobs: { id: string; label: string }[];
}) {
  const [state, action] = useActionState(addTransactionAction, IDLE);
  const [direction, setDirection] = useState<'money_in' | 'money_out'>('money_out');
  const today = new Date().toISOString().slice(0, 10);

  const relevant = categories.filter((c) => (direction === 'money_in' ? c.kind !== 'expense' : c.kind !== 'income'));

  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}

      <Card className="space-y-4 p-5">
        <Field label="Money in or out?" htmlFor="direction" required>
          <Select
            id="direction"
            name="direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value as 'money_in' | 'money_out')}
          >
            <option value="money_out">Money out — something you paid</option>
            <option value="money_in">Money in — something you were paid</option>
          </Select>
        </Field>

        <Field label="Which account?" htmlFor="bankAccountId" required>
          <Select id="bankAccountId" name="bankAccountId" defaultValue={accounts[0]?.id ?? ''} required>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (£)" htmlFor="amount" error={state.fieldErrors?.amount?.[0]} required>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required />
          </Field>
          <Field label="Date" htmlFor="transactionDate" required>
            <Input id="transactionDate" name="transactionDate" type="date" defaultValue={today} required />
          </Field>
        </div>

        <Field
          label="What was it?"
          htmlFor="description"
          error={state.fieldErrors?.description?.[0]}
          hint="For example: Travis Perkins — battens and felt"
          required
        >
          <Input id="description" name="description" required maxLength={400} />
        </Field>

        <Field label="Category" htmlFor="categoryId" hint="Leave blank and TradeBooks will have a go.">
          <Select id="categoryId" name="categoryId" defaultValue="">
            <option value="">Let TradeBooks sort it</option>
            {relevant.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        {jobs.length > 0 ? (
          <Field label="Which job?" htmlFor="jobId">
            <Select id="jobId" name="jobId" defaultValue="">
              <option value="">Not for a specific job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Reference (optional)" htmlFor="reference">
          <Input id="reference" name="reference" maxLength={120} />
        </Field>
      </Card>

      <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
    </form>
  );
}
