'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app] unhandled error', error);
  }, [error]);

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-6">
      <h1 className="text-xl font-bold text-ink-900">That screen could not be loaded</h1>
      <p className="mt-2 text-sm text-ink-600">
        Your records are safe — nothing was changed. Try again, and if it keeps happening let your
        bookkeeper know.
      </p>
      {error.digest ? <p className="mt-2 text-xs text-ink-400">Reference: {error.digest}</p> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="min-h-12 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white"
        >
          Try again
        </button>
        <Link
          href="/home"
          className="inline-flex min-h-12 items-center rounded-xl border border-ink-300 px-5 text-sm font-semibold text-ink-800"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
