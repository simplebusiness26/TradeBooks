'use client';

import { useActionState, useState } from 'react';
import { addCategoryAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { VAT_TREATMENT_LABELS } from '@/domain/vat';

export function AddCategoryForm() {
  const [state, action] = useActionState(addCategoryAction, IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add a category
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <h2 className="text-sm font-semibold text-ink-800">Add a category</h2>
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" maxLength={80} required placeholder="Lead and flashing" />
        </Field>
        <Field label="Money in or out?" htmlFor="kind">
          <Select id="kind" name="kind" defaultValue="expense">
            <option value="expense">Money out</option>
            <option value="income">Money in</option>
            <option value="both">Both</option>
          </Select>
        </Field>
        <Field label="Short explanation" htmlFor="description" hint="Shown next to the name when answering questions.">
          <Input id="description" name="description" maxLength={300} />
        </Field>
        <Field
          label="Does it count as a job cost?"
          htmlFor="jobCostGroup"
          hint="Job costs show up in job profitability."
        >
          <Select id="jobCostGroup" name="jobCostGroup" defaultValue="none">
            <option value="none">No — a running cost</option>
            <option value="materials">Yes — materials</option>
            <option value="labour">Yes — labour</option>
            <option value="other">Yes — other job cost</option>
          </Select>
        </Field>
        <Field label="Usual VAT treatment" htmlFor="defaultVatTreatment">
          <Select id="defaultVatTreatment" name="defaultVatTreatment" defaultValue="standard">
            {Object.entries(VAT_TREATMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="flex gap-2">
          <SubmitButton pendingLabel="Adding…">Add category</SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
