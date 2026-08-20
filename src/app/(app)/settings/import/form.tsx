'use client';

import { useActionState } from 'react';
import { importContactsAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function ContactImportForm() {
  const [state, action] = useActionState(importContactsAction, IDLE);
  const errors = (state.data?.errors as { row: number; message: string }[] | undefined) ?? [];

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <Field label="What are you importing?" htmlFor="kind" required>
          <Select id="kind" name="kind" defaultValue="customers">
            <option value="customers">Customers</option>
            <option value="suppliers">Suppliers and subcontractors</option>
          </Select>
        </Field>

        <Field label="CSV file" htmlFor="file" hint="Up to 4MB." required>
          <Input id="file" name="file" type="file" accept=".csv,text/csv,text/plain" required />
        </Field>

        <SubmitButton pendingLabel="Reading the file…">Import contacts</SubmitButton>
      </form>

      {errors.length > 0 ? (
        <div className="mt-4 rounded-xl bg-warn-50 p-4">
          <p className="text-sm font-semibold text-warn-800">Some rows could not be read</p>
          <ul className="mt-2 space-y-1 text-sm text-warn-700">
            {errors.map((error, index) => (
              <li key={index}>
                Row {error.row}: {error.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
