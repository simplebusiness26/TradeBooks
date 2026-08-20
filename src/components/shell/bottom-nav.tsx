'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS } from './nav-items';
import { Icon } from './icons';
import { cx } from '@/components/ui/primitives';

export function BottomNav({ askMeCount }: { askMeCount: number }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.primary);

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.href === '/ask' ? askMeCount : 0;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold',
                  active ? 'text-brand-700' : 'text-ink-500',
                )}
              >
                <span className="relative">
                  <Icon name={item.icon} className="size-6" />
                  {badge > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 min-w-5 rounded-full bg-bad-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
                      <span aria-hidden="true">{badge > 9 ? '9+' : badge}</span>
                      <span className="sr-only">{badge} waiting</span>
                    </span>
                  ) : null}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
