'use client';

import { useActionState, useState } from 'react';
import { createBillAction } from '../../actions';
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

type Supplier = {
  id: string;
  name: string;
  isSubcontractor: boolean;
  defaultCategoryId: string | null;
  cisStatus: string;
};

export function NewBillForm({
  suppliers,
  categories,
  jobs,
  defaultSupplierId,
  defaultJobId,
  vatRegistered,
}: {
  suppliers: Supplier[];
  categories: { id: string; name: string; defaultVatTreatment: string }[];
  jobs: { id: string; label: string }[];
  defaultSupplierId?: string;
  defaultJobId?: string;
  vatRegistered: boolean;
}) {
  const [state, action] = useActionState(createBillAction, IDLE);
  const [supplierId, setSupplierId] = useState(defaultSupplierId ?? '');
  const [lines, setLines] = useState([{ key: 1 }]);
  const today = new Date().toISOString().slice(0, 10);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const isSubcontractor = supplier?.isSubcontractor ?? false;
  const defaultTreatment = isSubcontractor ? 'reverse_charge' : vatRegistered ? 'standard' : 'no_vat';

  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}

      <Card className="space-y-4 p-5">
        <Field label="Who is the bill from?" htmlFor="supplierId" error={state.fieldErrors?.supplierId?.[0]} required>
          <Select
            id="supplierId"
            name="supplierId"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            required
          >
            <option value="" disabled>
              Choose a supplier…
            </option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.isSubcontractor ? ' (subcontractor)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill date" htmlFor="billDate" required>
            <Input id="billDate" name="billDate" type="date" defaultValue={today} required />
          </Field>
          <Field label="Due date" htmlFor="dueDate" hint="Leave blank for 30 days.">
            <Input id="dueDate" name="dueDate" type="date" />
          </Field>
        </div>

        <Field label="Their invoice number" htmlFor="reference">
          <Input id="reference" name="reference" maxLength={120} />
        </Field>

        {jobs.length > 0 ? (
          <Field label="Which job?" htmlFor="jobId" hint="Optional, but it is how job costs add up.">
            <Select id="jobId" name="jobId" defaultValue={defaultJobId ?? ''}>
              <option value="">Not for a specific job</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">What is on the bill</h2>

        {lines.map((line, index) => (
          <fieldset key={line.key} className="space-y-3 rounded-xl border border-ink-200 p-4">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Line {index + 1}
            </legend>

            <Field label="Description" htmlFor={`lineDescription-${line.key}`} required>
              <Input id={`lineDescription-${line.key}`} name="lineDescription" required />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Amount before VAT (£)" htmlFor={`lineUnitPrice-${line.key}`} required>
                <Input
                  id={`lineUnitPrice-${line.key}`}
                  name="lineUnitPrice"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                />
              </Field>
              <Field label="Category" htmlFor={`lineCategoryId-${line.key}`}>
                <Select
                  id={`lineCategoryId-${line.key}`}
                  name="lineCategoryId"
                  defaultValue={supplier?.defaultCategoryId ?? ''}
                >
                  <option value="">Choose…</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
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
              {isSubcontractor ? (
                <Field
                  label="Is this labour?"
                  htmlFor={`lineIsLabour-${line.key}`}
                  hint="CIS comes off labour only."
                >
                  <Select id={`lineIsLabour-${line.key}`} name="lineIsLabour" defaultValue="yes">
                    <option value="yes">Yes — labour</option>
                    <option value="no">No — materials</option>
                  </Select>
                </Field>
              ) : (
                <input type="hidden" name="lineIsLabour" value="no" />
              )}
            </div>

            {lines.length > 1 ? (
              <Button variant="ghost" onClick={() => setLines((c) => c.filter((l) => l.key !== line.key))}>
                Remove this line
              </Button>
            ) : null}
          </fieldset>
        ))}

        <Button variant="secondary" onClick={() => setLines((c) => [...c, { key: Date.now() }])}>
          Add another line
        </Button>
      </Card>

      <Card className="space-y-4 p-5">
        <input type="hidden" name="isSubcontractorPayment" value={isSubcontractor ? 'yes' : 'no'} />
        <Field label="Notes (optional)" htmlFor="description">
          <Textarea id="description" name="description" maxLength={400} />
        </Field>
      </Card>

      {isSubcontractor ? (
        <Notice tone="info" title="CIS will be worked out for you">
          {supplier?.cisStatus === 'unknown'
            ? 'This subcontractor is not verified, so 30% will be deducted from the labour element.'
            : 'The deduction comes off the labour element only, excluding VAT and materials.'}
        </Notice>
      ) : null}

      <SubmitButton pendingLabel="Saving…">Save bill</SubmitButton>
    </form>
  );
}
