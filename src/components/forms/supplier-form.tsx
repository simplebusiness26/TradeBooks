'use client';

import { useActionState, useState } from 'react';
import { saveSupplierAction } from '@/app/(app)/contacts-actions';
import { IDLE } from '@/lib/action-result';
import {
  Card,
  ErrorMessage,
  Field,
  Input,
  Notice,
  Select,
  SuccessMessage,
  Textarea,
} from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export type SupplierValues = {
  id?: string;
  name: string;
  kind: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  vatNumber: string | null;
  defaultCategoryId: string | null;
  utr: string | null;
  cisStatus: string;
  cisVerificationNumber: string | null;
  cisVerificationSource: string | null;
  notes: string | null;
};

export function SupplierForm({
  values,
  categories,
  defaultKind,
}: {
  values?: SupplierValues;
  categories: { id: string; name: string }[];
  defaultKind?: string;
}) {
  const [state, action] = useActionState(saveSupplierAction, IDLE);
  const [kind, setKind] = useState(values?.kind ?? defaultKind ?? 'supplier');
  const isSubcontractor = kind === 'subcontractor' || kind === 'both';

  return (
    <form action={action} className="space-y-5">
      {values?.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
      {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

      <Card className="space-y-4 p-5">
        <Field label="Name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" defaultValue={values?.name ?? ''} maxLength={160} required />
        </Field>

        <Field label="What do they do for you?" htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="supplier">Supplier — materials, hire, services</option>
            <option value="subcontractor">Subcontractor — labour under CIS</option>
            <option value="both">Both</option>
          </Select>
        </Field>

        <Field label="Contact person" htmlFor="contactName">
          <Input id="contactName" name="contactName" defaultValue={values?.contactName ?? ''} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
            <Input id="email" name="email" type="email" inputMode="email" defaultValue={values?.email ?? ''} />
          </Field>
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={values?.phone ?? ''} />
          </Field>
        </div>

        <Field
          label="Usual category for their spending"
          htmlFor="defaultCategoryId"
          hint="TradeBooks uses this to sort their payments automatically."
        >
          <Select id="defaultCategoryId" name="defaultCategoryId" defaultValue={values?.defaultCategoryId ?? ''}>
            <option value="">Not set</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Their VAT number" htmlFor="vatNumber">
          <Input id="vatNumber" name="vatNumber" defaultValue={values?.vatNumber ?? ''} maxLength={20} />
        </Field>
      </Card>

      {isSubcontractor ? (
        <Card className="space-y-4 p-5">
          <h2 className="text-sm font-semibold text-ink-800">CIS details</h2>
          <Notice tone="info">
            Verification is done with HMRC. Record the result here so the right deduction is used — unverified
            subcontractors must be deducted at 30%.
          </Notice>

          <Field label="Their UTR" htmlFor="utr" hint="The 10-digit reference HMRC gave them.">
            <Input id="utr" name="utr" defaultValue={values?.utr ?? ''} maxLength={20} inputMode="numeric" />
          </Field>

          <Field label="Verification status" htmlFor="cisStatus">
            <Select id="cisStatus" name="cisStatus" defaultValue={values?.cisStatus ?? 'unknown'}>
              <option value="unknown">Not verified — deduct 30%</option>
              <option value="net_20">Verified, standard rate — deduct 20%</option>
              <option value="gross">Verified for gross payment — deduct nothing</option>
              <option value="net_30">Verified, higher rate — deduct 30%</option>
            </Select>
          </Field>

          <Field label="HMRC verification number" htmlFor="cisVerificationNumber">
            <Input
              id="cisVerificationNumber"
              name="cisVerificationNumber"
              defaultValue={values?.cisVerificationNumber ?? ''}
              maxLength={30}
            />
          </Field>

          <Field
            label="Where did this come from?"
            htmlFor="cisVerificationSource"
            hint="For the audit trail — who verified them and when."
          >
            <Input
              id="cisVerificationSource"
              name="cisVerificationSource"
              defaultValue={values?.cisVerificationSource ?? ''}
              maxLength={200}
            />
          </Field>
        </Card>
      ) : null}

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Address and notes</h2>
        <Field label="Address line 1" htmlFor="addressLine1">
          <Input id="addressLine1" name="addressLine1" defaultValue={values?.addressLine1 ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values?.city ?? ''} />
          </Field>
          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" defaultValue={values?.postcode ?? ''} maxLength={12} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" defaultValue={values?.notes ?? ''} maxLength={2000} />
        </Field>
      </Card>

      <SubmitButton pendingLabel="Saving…">{values?.id ? 'Save changes' : 'Add supplier'}</SubmitButton>
    </form>
  );
}
