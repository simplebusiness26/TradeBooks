'use client';

import { useActionState, useState } from 'react';
import { addAccountAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function AddAccountForm() {
  const [state, action] = useActionState(addAccountAction, IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add a bank account
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <h2 className="text-sm font-semibold text-ink-800">Add a bank account</h2>
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <Field label="What do you call it?" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" placeholder="Business current account" maxLength={80} required />
        </Field>

        <Field label="Type" htmlFor="accountType">
          <Select id="accountType" name="accountType" defaultValue="current">
            <option value="current">Current account</option>
            <option value="savings">Savings account</option>
            <option value="credit_card">Credit card</option>
            <option value="cash">Cash</option>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sort code" htmlFor="sortCode">
            <Input id="sortCode" name="sortCode" placeholder="20-00-00" maxLength={10} />
          </Field>
          <Field label="Last 4 digits" htmlFor="accountNumberLast4">
            <Input id="accountNumberLast4" name="accountNumberLast4" maxLength={4} inputMode="numeric" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Opening balance (£)"
            htmlFor="openingBalance"
            hint="The balance on the day you start using TradeBooks."
          >
            <Input id="openingBalance" name="openingBalance" inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="On what date?" htmlFor="openingBalanceDate">
            <Input id="openingBalanceDate" name="openingBalanceDate" type="date" />
          </Field>
        </div>

        <div className="flex gap-2">
          <SubmitButton pendingLabel="Adding…">Add account</SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
