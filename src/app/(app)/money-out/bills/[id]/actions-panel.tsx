'use client';

import { useActionState, useState } from 'react';
import { payBillAction, voidBillAction } from '../../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function BillActions({
  billId,
  status,
  outstandingPence,
}: {
  billId: string;
  status: string;
  outstandingPence: number;
}) {
  const [state, action] = useActionState(payBillAction, IDLE);
  const [showPay, setShowPay] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  if (status === 'void') return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap gap-2">
        {outstandingPence > 0 ? (
          <Button variant={showPay ? 'secondary' : 'primary'} onClick={() => setShowPay((v) => !v)}>
            {showPay ? 'Cancel' : 'Record a payment'}
          </Button>
        ) : null}
        {status !== 'paid' ? (
          <Button variant="ghost" onClick={() => setShowCancel((v) => !v)}>
            Cancel this bill
          </Button>
        ) : null}
      </div>

      {showPay ? (
        <form action={action} className="mt-4 space-y-4 border-t border-ink-100 pt-4">
          <input type="hidden" name="billId" value={billId} />
          {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
          {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How much did you pay?" htmlFor="amount" required>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                defaultValue={(outstandingPence / 100).toFixed(2)}
                required
              />
            </Field>
            <Field label="When?" htmlFor="paymentDate" required>
              <Input id="paymentDate" name="paymentDate" type="date" defaultValue={today} required />
            </Field>
          </div>
          <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
        </form>
      ) : null}

      {showCancel ? (
        <form action={voidBillAction} className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <input type="hidden" name="billId" value={billId} />
          <Field label="Why?" htmlFor="reason" required>
            <Input id="reason" name="reason" required maxLength={200} />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Cancelling…">
            Cancel this bill
          </SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}
