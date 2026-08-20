'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ui] unhandled error', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-ink-900">Something went wrong</h1>
      <p className="max-w-sm text-ink-500">
        Your records are safe. Try again, and if it keeps happening let your bookkeeper know.
      </p>
      {error.digest ? <p className="text-xs text-ink-400">Reference: {error.digest}</p> : null}
      <button
        type="button"
        onClick={reset}
        className="min-h-12 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white"
      >
        Try again
      </button>
    </div>
  );
}
