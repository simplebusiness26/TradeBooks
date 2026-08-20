'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { Icon } from './icons';
import { cx } from '@/components/ui/primitives';

export function TopBar({
  companyName,
  userName,
  roleLabel,
  isDemo,
  canReview,
  companies,
  onSignOut,
  onSwitchCompany,
}: {
  companyName: string;
  userName: string;
  roleLabel: string;
  isDemo: boolean;
  canReview: boolean;
  companies: { id: string; name: string }[];
  onSignOut: () => Promise<void>;
  onSwitchCompany: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canReview || item.href !== '/review');

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/home" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            TB
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-ink-900">{companyName}</span>
            <span className="block text-xs text-ink-500">TradeBooks</span>
          </span>
        </Link>

        {isDemo ? (
          <span className="hidden rounded-full bg-warn-50 px-2.5 py-1 text-xs font-semibold text-warn-700 ring-1 ring-inset ring-warn-100 sm:inline">
            Demo data
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/receipts/new"
            className="flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Icon name="camera" className="size-5" />
            <span className="hidden sm:inline">Add receipt</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="main-menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink-300 text-ink-700 hover:bg-ink-50"
          >
            <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
            <Icon name={open ? 'chevron' : 'menu'} className="size-5" />
          </button>
        </div>
      </div>

      {open ? (
        <div id="main-menu" className="border-t border-ink-200 bg-ink-50">
          <div className="mx-auto max-w-6xl px-4 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Signed in as {userName} · {roleLabel}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cx(
                        'flex min-h-14 items-center gap-3 rounded-xl border bg-white px-3 py-2',
                        active ? 'border-brand-300' : 'border-ink-200',
                      )}
                    >
                      <Icon name={item.icon} className="size-5 shrink-0 text-ink-500" />
                      <span>
                        <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
                        <span className="block text-xs text-ink-500">{item.description}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {companies.length > 1 ? (
              <form action={onSwitchCompany} className="mt-4 flex items-center gap-2">
                <label htmlFor="companyId" className="text-sm font-semibold text-ink-700">
                  Business
                </label>
                <select
                  id="companyId"
                  name="companyId"
                  defaultValue=""
                  className="min-h-11 flex-1 rounded-xl border border-ink-300 bg-white px-3 text-sm"
                >
                  <option value="" disabled>
                    Switch to…
                  </option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="min-h-11 rounded-xl border border-ink-300 bg-white px-4 text-sm font-semibold"
                >
                  Switch
                </button>
              </form>
            ) : null}

            <form action={onSignOut} className="mt-4">
              <button
                type="submit"
                className="min-h-12 w-full rounded-xl border border-ink-300 bg-white text-sm font-semibold text-ink-800"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </header>
  );
}
