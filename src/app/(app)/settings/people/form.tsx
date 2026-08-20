'use client';

import { useActionState, useState } from 'react';
import { addPersonAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, Notice, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function AddPersonForm({ emailConnected }: { emailConnected: boolean }) {
  const [state, action] = useActionState(addPersonAction, IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Add someone
      </Button>
    );
  }

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        <h2 className="text-sm font-semibold text-ink-800">Add someone to this business</h2>
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        {!emailConnected ? (
          <Notice tone="info" title="No email provider connected yet">
            Set a starting password here and pass it to them yourself. Once an email provider is connected, this
            becomes a proper invitation.
          </Notice>
        ) : null}

        <Field label="Their name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" required maxLength={120} />
        </Field>
        <Field label="Their email" htmlFor="email" error={state.fieldErrors?.email?.[0]} required>
          <Input id="email" name="email" type="email" inputMode="email" autoCapitalize="none" required />
        </Field>
        <Field label="What can they do?" htmlFor="role" required>
          <Select id="role" name="role" defaultValue="staff">
            <option value="staff">Staff — day-to-day work</option>
            <option value="reviewer">Bookkeeper / accountant — review and close periods</option>
            <option value="admin">Admin — everything except ownership</option>
            <option value="owner">Owner — full control</option>
          </Select>
        </Field>
        <Field
          label="Starting password"
          htmlFor="password"
          hint="At least 10 characters. Ask them to change it after signing in."
          error={state.fieldErrors?.password?.[0]}
          required
        >
          <Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
        </Field>

        <div className="flex gap-2">
          <SubmitButton pendingLabel="Adding…">Add person</SubmitButton>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
