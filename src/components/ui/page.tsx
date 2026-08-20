import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/shell/icons';

export function PageHeader({
  title,
  description,
  action,
  backHref,
  backLabel,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-5">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700"
        >
          <Icon name="back" className="size-4" />
          {backLabel ?? 'Back'}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
        </div>
        {action}
      </div>
    </div>
  );
}

export function Tabs({
  items,
  current,
}: {
  items: { href: string; label: string; count?: number }[];
  current: string;
}) {
  return (
    <nav className="mb-4 -mx-4 overflow-x-auto px-4">
      <ul className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = item.href === current;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={
                  active
                    ? 'flex min-h-11 items-center gap-2 rounded-full bg-ink-900 px-4 text-sm font-semibold text-white'
                    : 'flex min-h-11 items-center gap-2 rounded-full border border-ink-300 bg-white px-4 text-sm font-semibold text-ink-700'
                }
              >
                {item.label}
                {item.count !== undefined ? (
                  <span className={active ? 'text-ink-300' : 'text-ink-400'}>{item.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ListRow({
  href,
  title,
  subtitle,
  right,
  meta,
  leading,
}: {
  href?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
}) {
  const inner = (
    <div className="flex min-h-16 items-center gap-3 px-4 py-3">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-900">{title}</div>
        {subtitle ? <div className="truncate text-sm text-ink-500">{subtitle}</div> : null}
        {meta ? <div className="mt-1 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {right ? <div className="shrink-0 text-right">{right}</div> : null}
      {href ? <Icon name="chevron" className="size-5 shrink-0 text-ink-300" /> : null}
    </div>
  );

  return (
    <li className="border-b border-ink-100 last:border-0">
      {href ? (
        <Link href={href} className="block transition-colors hover:bg-ink-50">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </li>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">{children}</ul>
  );
}
