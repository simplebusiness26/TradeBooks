'use client';

import { useActionState, useState } from 'react';
import { recordInvoicePaymentAction, sendInvoiceAction, sendReminderAction, voidInvoiceAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function InvoiceActions({
  invoiceId,
  status,
  outstandingPence,
  canWrite,
  customerEmail,
  reminderCount,
  lastReminderAt,
}: {
  invoiceId: string;
  status: string;
  outstandingPence: number;
  canWrite: boolean;
  customerEmail: string | null;
  reminderCount: number;
  lastReminderAt: string | null;
}) {
  const [paymentState, paymentAction] = useActionState(recordInvoicePaymentAction, IDLE);
  const [showPayment, setShowPayment] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  if (!canWrite) return null;

  const today = new Date().toISOString().slice(0, 10);
  const canTakePayment = status !== 'draft' && status !== 'void' && outstandingPence > 0;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' ? (
          <form action={sendInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton pendingLabel="Marking as sent…">Mark as sent</SubmitButton>
          </form>
        ) : null}

        {canTakePayment ? (
          <Button variant={showPayment ? 'secondary' : 'primary'} onClick={() => setShowPayment((v) => !v)}>
            {showPayment ? 'Cancel' : 'Record a payment'}
          </Button>
        ) : null}

        {canTakePayment && customerEmail ? (
          <form action={sendReminderAction}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <SubmitButton variant="secondary" pendingLabel="Queuing…">
              Chase this invoice
            </SubmitButton>
          </form>
        ) : null}

        {status !== 'void' && status !== 'paid' ? (
          <Button variant="ghost" onClick={() => setShowCancel((v) => !v)}>
            Cancel invoice
          </Button>
        ) : null}
      </div>

      {reminderCount > 0 ? (
        <p className="mt-3 text-sm text-ink-500">
          {reminderCount} reminder{reminderCount === 1 ? '' : 's'} sent{lastReminderAt ? `, last on ${lastReminderAt}` : ''}.
        </p>
      ) : null}
      {canTakePayment && !customerEmail ? (
        <p className="mt-3 text-sm text-ink-500">
          Add an email address for this customer to chase the invoice from here.
        </p>
      ) : null}

      {showPayment ? (
        <form action={paymentAction} className="mt-4 space-y-4 border-t border-ink-100 pt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          {paymentState.status === 'error' ? <ErrorMessage>{paymentState.message}</ErrorMessage> : null}
          {paymentState.status === 'success' ? <SuccessMessage>{paymentState.message}</SuccessMessage> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="How much came in?" htmlFor="amount" required>
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
            <Field label="How was it paid?" htmlFor="method">
              <Select id="method" name="method" defaultValue="bank_transfer">
                <option value="bank_transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
                <option value="other">Something else</option>
              </Select>
            </Field>
            <Field label="Reference (optional)" htmlFor="reference">
              <Input id="reference" name="reference" />
            </Field>
          </div>

          <SubmitButton pendingLabel="Saving…">Save payment</SubmitButton>
        </form>
      ) : null}

      {showCancel ? (
        <form action={voidInvoiceAction} className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Field
            label="Why are you cancelling it?"
            htmlFor="reason"
            hint="Kept on record so the history stays complete."
            required
          >
            <Input id="reason" name="reason" required maxLength={200} />
          </Field>
          <SubmitButton variant="danger" pendingLabel="Cancelling…">
            Cancel this invoice
          </SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}
