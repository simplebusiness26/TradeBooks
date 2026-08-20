import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth-context';
import { ROLE_LABELS, can } from '@/lib/permissions';
import { Card, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { Icon } from '@/components/shell/icons';
import { ChangePasswordForm } from './password-form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Settings — TradeBooks' };

export default async function SettingsPage() {
  const { company, user, role } = await requireAuth();

  const items = [
    {
      href: '/settings/business',
      label: 'Business details',
      description: 'Name, address, VAT and CIS settings',
      icon: 'settings',
      show: can(role, 'company.settings'),
    },
    {
      href: '/settings/accounts',
      label: 'Bank accounts',
      description: 'Accounts, opening balances and statement imports',
      icon: 'vat',
      show: can(role, 'company.settings'),
    },
    {
      href: '/settings/categories',
      label: 'Categories',
      description: 'What things get sorted into',
      icon: 'job',
      show: can(role, 'company.settings'),
    },
    {
      href: '/settings/people',
      label: 'People',
      description: 'Who can sign in and what they can do',
      icon: 'people',
      show: can(role, 'company.members'),
    },
    {
      href: '/review/integrations',
      label: 'Connections',
      description: 'Bank feeds, receipt reading, email and accounting packages',
      icon: 'review',
      show: can(role, 'audit.read'),
    },
  ].filter((item) => item.show);

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description={`${company.name} · you are signed in as ${ROLE_LABELS[role]}.`} />

      {company.isDemo ? (
        <Notice tone="warn" title="This is the demonstration business">
          Northgate Roofing Ltd and everything in it is made up. When you set up the real business, create a new
          account from the sign-in screen.
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3 shadow-sm hover:border-ink-300"
          >
            <Icon name={item.icon} className="size-5 shrink-0 text-ink-500" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink-900">{item.label}</span>
              <span className="block text-xs text-ink-500">{item.description}</span>
            </span>
            <Icon name="chevron" className="size-5 shrink-0 text-ink-300" />
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold text-ink-800">Your account</h2>
        <p className="mb-4 text-sm text-ink-500">
          {user.name} · {user.email}
        </p>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
