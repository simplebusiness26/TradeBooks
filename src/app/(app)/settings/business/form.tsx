'use client';

import { useActionState, useState } from 'react';
import { updateBusinessAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Card, ErrorMessage, Field, Input, Notice, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type BusinessValues = {
  name: string;
  tradingName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  vatScheme: string;
  vatPeriodMonths: number;
  vatFirstPeriodEnd: string | null;
  cisContractor: boolean;
  cisSubcontractor: boolean;
  cisUtr: string | null;
  financialYearEndMonth: number;
  financialYearEndDay: number;
};

export function BusinessForm({ values }: { values: BusinessValues }) {
  const [state, action] = useActionState(updateBusinessAction, IDLE);
  const [vatRegistered, setVatRegistered] = useState(values.vatRegistered);
  const [cisContractor, setCisContractor] = useState(values.cisContractor);
  const [cisSubcontractor, setCisSubcontractor] = useState(values.cisSubcontractor);

  return (
    <form action={action} className="space-y-5">
      {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
      {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Who you are</h2>
        <Field label="Registered business name" htmlFor="name" error={state.fieldErrors?.name?.[0]} required>
          <Input id="name" name="name" defaultValue={values.name} maxLength={160} required />
        </Field>
        <Field label="Trading name" htmlFor="tradingName" hint="If you trade under a different name.">
          <Input id="tradingName" name="tradingName" defaultValue={values.tradingName ?? ''} maxLength={160} />
        </Field>
        <Field label="Address" htmlFor="addressLine1">
          <Input id="addressLine1" name="addressLine1" defaultValue={values.addressLine1 ?? ''} />
        </Field>
        <Field label="Address line 2" htmlFor="addressLine2">
          <Input id="addressLine2" name="addressLine2" defaultValue={values.addressLine2 ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Town" htmlFor="city">
            <Input id="city" name="city" defaultValue={values.city ?? ''} />
          </Field>
          <Field label="Postcode" htmlFor="postcode">
            <Input id="postcode" name="postcode" defaultValue={values.postcode ?? ''} maxLength={12} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" defaultValue={values.phone ?? ''} />
          </Field>
          <Field label="Email" htmlFor="email" error={state.fieldErrors?.email?.[0]}>
            <Input id="email" name="email" type="email" defaultValue={values.email ?? ''} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">VAT</h2>
        <Field label="Are you VAT registered?" htmlFor="vatRegistered">
          <Select
            id="vatRegistered"
            name="vatRegistered"
            value={vatRegistered ? 'yes' : 'no'}
            onChange={(event) => setVatRegistered(event.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>

        {vatRegistered ? (
          <>
            <Field label="VAT number" htmlFor="vatNumber" error={state.fieldErrors?.vatNumber?.[0]} required>
              <Input id="vatNumber" name="vatNumber" defaultValue={values.vatNumber ?? ''} maxLength={20} />
            </Field>
            <Field label="Which scheme?" htmlFor="vatScheme">
              <Select id="vatScheme" name="vatScheme" defaultValue={values.vatScheme}>
                <option value="standard">Standard (accrual)</option>
                <option value="cash">Cash accounting</option>
                <option value="flat_rate">Flat rate</option>
              </Select>
            </Field>
            <Field label="How often do you file?" htmlFor="vatPeriodMonths">
              <Select id="vatPeriodMonths" name="vatPeriodMonths" defaultValue={String(values.vatPeriodMonths)}>
                <option value="1">Every month</option>
                <option value="3">Every quarter</option>
                <option value="12">Once a year</option>
              </Select>
            </Field>
            <Field
              label="When does a VAT period end?"
              htmlFor="vatFirstPeriodEnd"
              hint="Any past period end date. TradeBooks lines the rest up from it."
            >
              <Input
                id="vatFirstPeriodEnd"
                name="vatFirstPeriodEnd"
                type="date"
                defaultValue={values.vatFirstPeriodEnd ?? ''}
              />
            </Field>
            {values.vatScheme === 'flat_rate' ? (
              <Notice tone="warn">
                Flat-rate VAT is recorded here but the estimate is calculated on the standard basis. Check the
                figures with your accountant before filing.
              </Notice>
            ) : null}
          </>
        ) : (
          <Notice tone="info">No VAT will be added to invoices or worked out on purchases.</Notice>
        )}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Construction Industry Scheme</h2>
        <Field
          label="Do you pay subcontractors?"
          htmlFor="cisContractor"
          hint="This makes you a contractor for CIS purposes."
        >
          <Select
            id="cisContractor"
            name="cisContractor"
            value={cisContractor ? 'yes' : 'no'}
            onChange={(event) => setCisContractor(event.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>
        <Field
          label="Do other builders deduct CIS from your invoices?"
          htmlFor="cisSubcontractor"
          hint="This makes you a subcontractor for CIS purposes."
        >
          <Select
            id="cisSubcontractor"
            name="cisSubcontractor"
            value={cisSubcontractor ? 'yes' : 'no'}
            onChange={(event) => setCisSubcontractor(event.target.value === 'yes')}
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </Select>
        </Field>
        {cisContractor || cisSubcontractor ? (
          <Field label="Your UTR" htmlFor="cisUtr" hint="The 10-digit reference HMRC gave the business.">
            <Input id="cisUtr" name="cisUtr" defaultValue={values.cisUtr ?? ''} maxLength={20} inputMode="numeric" />
          </Field>
        ) : null}
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-ink-800">Financial year</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Year end month" htmlFor="financialYearEndMonth">
            <Select
              id="financialYearEndMonth"
              name="financialYearEndMonth"
              defaultValue={String(values.financialYearEndMonth)}
            >
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Year end day" htmlFor="financialYearEndDay">
            <Input
              id="financialYearEndDay"
              name="financialYearEndDay"
              type="number"
              min={1}
              max={31}
              defaultValue={values.financialYearEndDay}
            />
          </Field>
        </div>
      </Card>

      <SubmitButton pendingLabel="Saving…">Save business details</SubmitButton>
    </form>
  );
}
