'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { Icon } from './icons';
import { cx } from '@/components/ui/primitives';

export function SideNav({ askMeCount, canReview }: { askMeCount: number; canReview: boolean }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canReview || item.href !== '/review');

  return (
    <nav aria-label="Sections" className="hidden md:block">
      <ul className="space-y-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.href === '/ask' ? askMeCount : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold',
                  active ? 'bg-brand-50 text-brand-800' : 'text-ink-600 hover:bg-ink-100',
                )}
              >
                <Icon name={item.icon} className="size-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 ? (
                  <span className="min-w-6 rounded-full bg-bad-600 px-1.5 text-center text-xs font-bold leading-6 text-white">
                    {badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
