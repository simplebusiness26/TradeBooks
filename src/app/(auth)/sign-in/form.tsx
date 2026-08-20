'use client';

import { useActionState } from 'react';
import { signInAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { ErrorMessage, Field, Input } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function SignInForm() {
  const [state, action] = useActionState(signInAction, IDLE);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}

      <Field label="Email address" htmlFor="email" error={state.fieldErrors?.email?.[0]} required>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field label="Password" htmlFor="password" error={state.fieldErrors?.password?.[0]} required>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
