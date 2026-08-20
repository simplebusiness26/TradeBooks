'use client';

import { useActionState, useState } from 'react';
import { changePasswordAction } from './actions';
import { IDLE } from '@/lib/action-result';
import { Button, ErrorMessage, Field, Input, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, IDLE);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change my password
      </Button>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
      {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

      <Field label="Current password" htmlFor="currentPassword" required>
        <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
      </Field>
      <Field
        label="New password"
        htmlFor="newPassword"
        hint="At least 10 characters."
        error={state.fieldErrors?.newPassword?.[0]}
        required
      >
        <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword?.[0]}
        required
      >
        <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required />
      </Field>

      <div className="flex gap-2">
        <SubmitButton pendingLabel="Saving…">Change password</SubmitButton>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
