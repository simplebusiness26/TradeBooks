import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-bold text-ink-900">We could not find that page</h1>
      <p className="max-w-sm text-ink-500">
        The link may be out of date, or the record may have been removed.
      </p>
      <Link href="/home" className="min-h-12 rounded-xl bg-brand-600 px-5 py-3 font-semibold text-white">
        Back to home
      </Link>
    </div>
  );
}
