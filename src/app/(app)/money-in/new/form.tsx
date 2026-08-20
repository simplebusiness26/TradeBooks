'use client';

import { useActionState, useState } from 'react';
import { createInvoiceAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import {
  Button,
  Card,
  ErrorMessage,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { VAT_TREATMENT_LABELS } from '@/domain/vat';

type LineDraft = { key: number };

export function NewInvoiceForm({
  customers,
  jobs,
  vatRegistered,
  defaultCustomerId,
  defaultJobId,
}: {
  customers: { id: string; name: string; paymentTermsDays: number }[];
  jobs: { id: string; label: string }[];
  vatRegistered: boolean;
  defaultCustomerId?: string;
  defaultJobId?: string;
}) {
  const [state, action] = useActionState(createInvoiceAction, IDLE);
  const [lines, setLines] = useState<LineDraft[]>([{ key: 1 }]);
  const [applyCis, setApplyCis] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const defaultTreatment = vatRegistered ? 'standard' : 'no_vat';

  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}

      <Card className="space-y-4 p-5">
        <Field label="Who is it for?" htmlFor="customerId" error={state.fieldErrors?.customerId?.[0]} required>
          <Select id="customerId" name="customerId" defaultValue={defaultCustomerId ?? ''} required>
            <option value="" disabled>
              Choose a customer…
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </Select>
        </Field>

        {jobs.length > 0 ? (
          <Field label="Which job?" htmlFor="jobId" hint="Optional, but it is how you see job profit.">
            <Select id="jobId" name="jobId" defaultValue={defaultJobId ?? ''}>
              <option value="">Not linked to a job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice date" htmlFor="issueDate" required>
            <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Payment due" htmlFor="dueDate" hint="Leave blank to use the customer’s usual terms.">
            <Input id="dueDate" name="dueDate" type="date" />
          </Field>
        </div>

        <Field label="Their reference (optional)" htmlFor="reference" hint="A purchase order number, for example.">
          <Input id="reference" name="reference" maxLength={120} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">What are you charging for?</h2>

        {lines.map((line, index) => (
          <fieldset key={line.key} className="space-y-3 rounded-xl border border-ink-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Line {index + 1}
            </legend>

            <Field label="Description" htmlFor={`lineDescription-${line.key}`} required>
              <Input
                id={`lineDescription-${line.key}`}
                name="lineDescription"
                placeholder="Strip and re-roof, felt and battens"
                required
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Quantity" htmlFor={`lineQuantity-${line.key}`}>
                <Input
                  id={`lineQuantity-${line.key}`}
                  name="lineQuantity"
                  inputMode="decimal"
                  defaultValue="1"
                />
              </Field>
              <Field label="Price each (£)" htmlFor={`lineUnitPrice-${line.key}`} required>
                <Input
                  id={`lineUnitPrice-${line.key}`}
                  name="lineUnitPrice"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field label="VAT" htmlFor={`lineVatTreatment-${line.key}`}>
                <Select
                  id={`lineVatTreatment-${line.key}`}
                  name="lineVatTreatment"
                  defaultValue={defaultTreatment}
                >
                  {Object.entries(VAT_TREATMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {applyCis ? (
              <Field label="Is this line labour?" htmlFor={`lineIsLabour-${line.key}`} hint="CIS is deducted from labour only.">
                <Select id={`lineIsLabour-${line.key}`} name="lineIsLabour" defaultValue="no">
                  <option value="no">No — materials or other</option>
                  <option value="yes">Yes — labour</option>
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="lineIsLabour" value="no" />
            )}

            {lines.length > 1 ? (
              <Button
                variant="ghost"
                onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
              >
                Remove this line
              </Button>
            ) : null}
          </fieldset>
        ))}

        <Button
          variant="secondary"
          onClick={() => setLines((current) => [...current, { key: Date.now() }])}
        >
          Add another line
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <Field
          label="Is the customer deducting CIS?"
          htmlFor="applyCis"
          hint="Choose yes when you are working as a subcontractor for another construction business."
        >
          <Select
            id="applyCis"
            name="applyCis"
            value={applyCis ? 'yes' : 'no'}
            onChange={(event) => setApplyCis(event.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes — deduct 20% from labour</option>
          </Select>
        </Field>

        <Field label="Notes on the invoice (optional)" htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={2000} placeholder="Payment by bank transfer please." />
        </Field>
      </Card>

      {!vatRegistered ? (
        <Notice tone="info">
          This business is not marked as VAT registered, so no VAT is added. Change that in Settings if it is wrong.
        </Notice>
      ) : null}

      <div className="flex gap-3">
        <SubmitButton pendingLabel="Creating…">Create invoice</SubmitButton>
      </div>
    </form>
  );
}
