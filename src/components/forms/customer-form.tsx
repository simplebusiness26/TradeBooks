'use client';

import { useActionState } from 'react';
import { saveCustomerAction } from '@/app/(app)/contacts-actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, SuccessMessage, Textarea } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export type CustomerValues = {
  id?: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  paymentTermsDays: number;
  notes: string | null;
};

export function CustomerForm({ values }: { values?: CustomerValues }) {
  const [state, action] = useActionState(saveCustomerAction, IDLE);

  return (
    <form action={action} className="space-y-5">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
      {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

      <Card className="space-y-4 p-5">
        <Field label="Customer name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" defaultValue={values?.name ?? ''} maxLength={160} required />
        </Field>
        <Field label="Contact person" htmlFor="contactName">
          <Input id="contactName" name="contactName" defaultValue={values?.contactName ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]} hint="Needed to send invoices and reminders.">
            <Input id="email" name="email" type="email" inputMode="email" defaultValue={values?.email ?? ''} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={values?.phone ?? ''} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Address</h2>
        <Field label="Address line 1" htmlFor="addressLine1">
          <Input id="addressLine1" name="addressLine1" defaultValue={values?.addressLine1 ?? ''} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2">
          <Input id="addressLine2" name="addressLine2" defaultValue={values?.addressLine2 ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values?.city ?? ''} />
          </Field>
          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" defaultValue={values?.postcode ?? ''} maxLength={12} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <Field
          label="How many days do they get to pay?"
          htmlFor="paymentTermsDays"
          hint="Used to set the due date on new invoices."
        >
          <Input
            id="paymentTermsDays"
            name="paymentTermsDays"
            type="number"
            min={0}
            max={180}
            defaultValue={values?.paymentTermsDays ?? 14}
          />
        </Field>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={values?.notes ?? ''} maxLength={2000} />
        </Field>
      </Card>

      <SubmitButton pendingLabel="Saving…">{values?.id ? 'Save changes' : 'Add customer'}</SubmitButton>
    </form>
  );
}
