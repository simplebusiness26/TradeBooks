'use client';

import { useActionState, useState } from 'react';
import { markCisFiledAction, prepareCisAction } from './actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Input, Notice, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';

export function CisActions({
  start,
  end,
  status,
  canClose,
}: {
  start: string;
  end: string;
  status: string;
  canClose: boolean;
}) {
  const [prepareState, prepare] = useActionState(prepareCisAction, IDLE);
  const [filedState, markFiled] = useActionState(markCisFiledAction, IDLE);
  const [showFiled, setShowFiled] = useState(false);

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-ink-800">Finish this period</h2>

      {prepareState.status === 'error' ? <ErrorMessage>{prepareState.message}</ErrorMessage> : null}
      {prepareState.status === 'success' ? <SuccessMessage>{prepareState.message}</SuccessMessage> : null}
      {filedState.status === 'error' ? <ErrorMessage>{filedState.message}</ErrorMessage> : null}
      {filedState.status === 'success' ? <SuccessMessage>{filedState.message}</SuccessMessage> : null}

      <div className="flex flex-wrap gap-2">
        <form action={prepare}>
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="end" value={end} />
          <SubmitButton pendingLabel="Preparing…">
            {status === 'prepared' || status === 'filed' ? 'Re-prepare figures' : 'Prepare for review'}
          </SubmitButton>
        </form>

        {canClose && status !== 'filed' ? (
          <Button variant="secondary" onClick={() => setShowFiled((v) => !v)}>
            Record it as filed
          </Button>
        ) : null}
      </div>

      {showFiled ? (
        <form action={markFiled} className="mt-4 space-y-3 border-t border-ink-100 pt-4">
          <input type="hidden" name="start" value={start} />
          <input type="hidden" name="end" value={end} />
          <Notice tone="warn" title="TradeBooks does not file returns">
            Submit the return through HMRC or your accountant first, then record the reference here so the audit
            trail is complete.
          </Notice>
          <Field label="HMRC submission reference" htmlFor="reference" required>
            <Input id="reference" name="reference" required maxLength={60} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel="Recording…">
            Record as filed
          </SubmitButton>
        </form>
      ) : null}
    </Card>
  );
}
