'use client';

import { useActionState } from 'react';
import { signUpAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { ErrorMessage, Field, Input } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, IDLE);

  return (
    <form action={action} className="mt-6 space-y-4">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}

      <Field label="Your name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>

      <Field
        label="Business name"
        htmlFor="businessName"
        error={state.fieldErrors?.businessName?.[0]}
        hint="The name you trade under."
        required
      >
        <Input id="businessName" name="businessName" autoComplete="organization" required />
      </Field>

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

      <Field
        label="Password"
        htmlFor="password"
        hint="At least 10 characters."
        error={state.fieldErrors?.password?.[0]}
        required
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} />
      </Field>

      <Field
        label="Confirm password"
        htmlFor="confirmPassword"
        error={state.fieldErrors?.confirmPassword?.[0]}
        required
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <SubmitButton className="w-full" pendingLabel="Setting up…">
        Create my account
      </SubmitButton>
    </form>
  );
}
