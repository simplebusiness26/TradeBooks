'use client';

import { useActionState } from 'react';
import { createJobAction, updateJobAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, Select, SuccessMessage, Textarea } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

const STATUSES = [
  { value: 'quoted', label: 'Quoted — not started' },
  { value: 'active', label: 'In progress' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Finished' },
  { value: 'invoiced', label: 'Invoiced' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export type JobFormValues = {
  id?: string;
  reference: string;
  name: string;
  customerId: string | null;
  status: string;
  siteAddressLine1: string | null;
  siteCity: string | null;
  sitePostcode: string | null;
  description: string | null;
  quotedRevenuePence: number;
  estimatedCostPence: number;
  startDate: string | null;
  endDate: string | null;
};

export function JobForm({
  customers,
  values,
  suggestedReference,
}: {
  customers: { id: string; name: string }[];
  values?: JobFormValues;
  suggestedReference?: string;
}) {
  const [state, action] = useActionState(values?.id ? updateJobAction : createJobAction, IDLE);

  return (
    <form action={action} className="space-y-5">
      {values?.id ? <input type="hidden" name="jobId" value={values.id} /> : null}
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
      {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job reference" htmlFor="reference" error={state.fieldErrors?.reference?.[0]} required>
            <Input
              id="reference"
              name="reference"
              defaultValue={values?.reference ?? suggestedReference ?? ''}
              maxLength={40}
              required
            />
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={values?.status ?? 'quoted'}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="What is the job?" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input
            id="name"
            name="name"
            defaultValue={values?.name ?? ''}
            placeholder="Full re-roof — Bramham Road"
            maxLength={160}
            required
          />
        </Field>

        <Field label="Customer" htmlFor="customerId">
          <Select id="customerId" name="customerId" defaultValue={values?.customerId ?? ''}>
            <option value="">Not set yet</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Site</h2>
        <Field label="Address" htmlFor="siteAddressLine1">
          <Input id="siteAddressLine1" name="siteAddressLine1" defaultValue={values?.siteAddressLine1 ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town" htmlFor="siteCity">
            <Input id="siteCity" name="siteCity" defaultValue={values?.siteCity ?? ''} />
          </Field>
          <Field label="Postcode" htmlFor="sitePostcode">
            <Input id="sitePostcode" name="sitePostcode" defaultValue={values?.sitePostcode ?? ''} maxLength={12} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Money and dates</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quoted price (£)" htmlFor="quotedRevenue" hint="Excluding VAT.">
            <Input
              id="quotedRevenue"
              name="quotedRevenue"
              inputMode="decimal"
              defaultValue={values ? (values.quotedRevenuePence / 100).toFixed(2) : ''}
            />
          </Field>
          <Field label="Expected costs (£)" htmlFor="estimatedCost">
            <Input
              id="estimatedCost"
              name="estimatedCost"
              inputMode="decimal"
              defaultValue={values ? (values.estimatedCostPence / 100).toFixed(2) : ''}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" htmlFor="startDate">
            <Input id="startDate" name="startDate" type="date" defaultValue={values?.startDate ?? ''} />
          </Field>
          <Field label="Finish date" htmlFor="endDate">
            <Input id="endDate" name="endDate" type="date" defaultValue={values?.endDate ?? ''} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="description">
          <Textarea id="description" name="description" defaultValue={values?.description ?? ''} maxLength={2000} />
        </Field>
      </Card>

      <SubmitButton pendingLabel="Saving…">{values?.id ? 'Save changes' : 'Create job'}</SubmitButton>
    </form>
  );
}
