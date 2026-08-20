import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-950">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link href="/" className="mb-8 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white">
            TB
          </span>
          <span className="text-xl font-semibold text-white">TradeBooks</span>
        </Link>
        {children}
      </div>
      <p className="px-5 pb-8 text-center text-xs text-ink-400">
        TradeBooks organises your records. It is not a substitute for advice from your accountant.
      </p>
    </div>
  );
}
