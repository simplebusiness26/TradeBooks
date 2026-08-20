import Link from 'next/link';
import type { ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  as: Component = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Component className={cx('rounded-2xl border border-ink-200 bg-white shadow-sm', className)}>
      {children}
    </Component>
  );
}

export function SectionHeading({
  title,
  action,
  description,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const BUTTON_VARIANTS = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  secondary: 'border border-ink-300 bg-white text-ink-800 hover:bg-ink-50',
  danger: 'bg-bad-600 text-white hover:bg-bad-700',
  ghost: 'text-brand-700 hover:bg-brand-50',
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

export function Button({
  children,
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type={type} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = 'primary',
  className,
}: {
  children: ReactNode;
  href: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Link href={href} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

const TONES = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  good: 'bg-good-50 text-good-700 ring-good-100',
  warn: 'bg-warn-50 text-warn-700 ring-warn-100',
  bad: 'bg-bad-50 text-bad-700 ring-bad-100',
  info: 'bg-brand-50 text-brand-700 ring-brand-100',
} as const;

export type Tone = keyof typeof TONES;

/**
 * Status is always carried by the words as well as the colour, so the
 * meaning survives for anyone who cannot distinguish the colours.
 */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
      {icon ? <div className="mb-3 flex justify-center text-ink-400">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink-800">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl bg-bad-50 px-4 py-3 text-sm font-medium text-bad-700">
      {children}
    </p>
  );
}

export function SuccessMessage({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-xl bg-good-50 px-4 py-3 text-sm font-medium text-good-700">
      {children}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink-800">
        {label}
        {required ? <span className="ml-1 text-bad-600" aria-hidden="true">*</span> : null}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-ink-500">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-sm font-medium text-bad-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const INPUT_CLASS =
  'block w-full min-h-12 rounded-xl border border-ink-300 bg-white px-4 py-3 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:ring-0';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(INPUT_CLASS, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(INPUT_CLASS, 'pr-10', props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(INPUT_CLASS, 'min-h-24', props.className)} />;
}

export function Money({
  pence,
  className,
  showSign,
  size = 'base',
}: {
  pence: number;
  className?: string;
  showSign?: boolean;
  size?: 'sm' | 'base' | 'lg' | 'xl';
}) {
  const sizes = { sm: 'text-sm', base: 'text-base', lg: 'text-xl', xl: 'text-3xl' };
  return (
    <span className={cx('tabular font-semibold', sizes[size], className)}>
      {formatMoneyValue(pence, showSign)}
    </span>
  );
}

function formatMoneyValue(pence: number, showSign?: boolean): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const whole = Math.floor(abs / 100).toLocaleString('en-GB');
  const rest = String(abs % 100).padStart(2, '0');
  const sign = negative ? '−' : showSign ? '+' : '';
  return `${sign}£${whole}.${rest}`;
}

export function DataRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 py-3 last:border-0">
      <div>
        <dt className="text-sm text-ink-500">{label}</dt>
        {hint ? <p className="text-xs text-ink-400">{hint}</p> : null}
      </div>
      <dd className="text-right text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('rounded-xl px-4 py-3 text-sm ring-1 ring-inset', TONES[tone])}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1' : undefined}>{children}</div>
    </div>
  );
}
