/** Shown while a screen's data is being read. Mirrors the real layout so the
 *  page does not jump when it arrives. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-ink-200" />
        <div className="h-4 w-72 max-w-full rounded bg-ink-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[0, 1].map((key) => (
          <div key={key} className="rounded-2xl border border-ink-200 bg-white p-5">
            <div className="h-4 w-24 rounded bg-ink-100" />
            <div className="mt-3 h-8 w-36 rounded-lg bg-ink-200" />
            <div className="mt-4 space-y-2">
              <div className="h-3 w-full rounded bg-ink-100" />
              <div className="h-3 w-2/3 rounded bg-ink-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="flex items-center gap-3 border-b border-ink-100 px-4 py-4 last:border-0">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-ink-200" />
              <div className="h-3 w-1/2 rounded bg-ink-100" />
            </div>
            <div className="h-5 w-20 rounded bg-ink-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
