'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadReceiptAction } from '../actions';
import { IDLE } from '@/lib/action-result';
import { Button, Card, ErrorMessage, Field, Select, SuccessMessage } from '@/components/ui/primitives';
import { SubmitButton } from '@/components/ui/submit-button';
import { Icon } from '@/components/shell/icons';

export function UploadForm({
  jobs,
  transactionId,
  defaultJobId,
}: {
  jobs: { id: string; label: string }[];
  transactionId?: string;
  defaultJobId?: string;
}) {
  const [state, action] = useActionState(uploadReceiptAction, IDLE);
  const [names, setNames] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className="p-5">
      <form action={action} className="space-y-4">
        {transactionId ? <input type="hidden" name="transactionId" value={transactionId} /> : null}
        {state.status === 'error' ? <ErrorMessage>{state.message}</ErrorMessage> : null}
        {state.status === 'success' ? <SuccessMessage>{state.message}</SuccessMessage> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            variant="primary"
            className="min-h-24 flex-col"
            onClick={() => cameraRef.current?.click()}
          >
            <Icon name="camera" className="size-7" />
            Take a photo
          </Button>
          <Button
            variant="secondary"
            className="min-h-24 flex-col"
            onClick={() => fileRef.current?.click()}
          >
            <Icon name="receipt" className="size-7" />
            Choose a file
          </Button>
        </div>

        <input
          ref={cameraRef}
          type="file"
          name="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(event) => setNames(Array.from(event.target.files ?? []).map((f) => f.name))}
        />
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/*,application/pdf,text/plain,text/csv"
          multiple
          className="sr-only"
          onChange={(event) => setNames(Array.from(event.target.files ?? []).map((f) => f.name))}
        />

        {names.length > 0 ? (
          <ul className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
            {names.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-500">Nothing chosen yet.</p>
        )}

        {jobs.length > 0 ? (
          <Field label="Which job is it for?" htmlFor="jobId" hint="Optional — you can set it later.">
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

        <SubmitButton className="w-full" pendingLabel="Saving…" >
          Save receipt
        </SubmitButton>
      </form>
    </Card>
  );
}
