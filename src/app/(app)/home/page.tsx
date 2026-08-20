import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/db/client';
import { formatMoney } from '@/lib/money';
import { requireAuth } from '@/lib/auth-context';
import { buildDashboard } from '@/domain/dashboard';
import { formatDate, relativeDays, todayIso } from '@/lib/dates';
import { Badge, ButtonLink, Card, EmptyState, Money, Notice } from '@/components/ui/primitives';
import { Icon } from '@/components/shell/icons';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Home — TradeBooks' };

export default async function HomePage() {
  const { company, user } = await requireAuth();
  const today = todayIso();
  const summary = await buildDashboard(db, company.id, today);

  const hasAnything =
    summary.cash.accounts.length > 0 ||
    summary.owedToYou.count > 0 ||
    summary.billsToPay.count > 0 ||
    summary.askMe.openCount > 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{greeting()}, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-500">Here is where {company.tradingName ?? company.name} stands today.</p>
      </div>

      {!hasAnything ? (
        <EmptyState
          title="Nothing here yet"
          description="Add a bank account and import a statement, or raise your first invoice. TradeBooks fills in the rest."
          action={<ButtonLink href="/settings/accounts">Set up a bank account</ButtonLink>}
        />
      ) : null}

      {summary.askMe.openCount > 0 ? (
        <Link href="/ask" className="block">
          <Card className="border-brand-300 bg-brand-50/60 p-4 transition-colors hover:bg-brand-50">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Icon name="ask" className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-brand-900">
                  {summary.askMe.openCount} quick {summary.askMe.openCount === 1 ? 'question' : 'questions'} for you
                </p>
                <p className="truncate text-sm text-brand-800">{summary.askMe.topQuestion}</p>
              </div>
              <Icon name="chevron" className="size-5 shrink-0 text-brand-700" />
            </div>
          </Card>
        </Link>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-sm font-medium text-ink-500">In the bank</p>
          <Money pence={summary.cash.totalPence} size="xl" className="mt-1 block text-ink-900" />
          <ul className="mt-3 space-y-1.5">
            {summary.cash.accounts.map((account) => (
              <li key={account.id} className="flex justify-between text-sm text-ink-600">
                <span className="truncate">{account.name}</span>
                <Money pence={account.balancePence} size="sm" />
              </li>
            ))}
            {summary.cash.accounts.length === 0 ? (
              <li className="text-sm text-ink-500">No accounts added yet.</li>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-ink-400">
            Worked out from your opening balance plus everything recorded since.
          </p>
        </Card>

        <Card className="p-5">
          <p className="text-sm font-medium text-ink-500">This month ({summary.month.label})</p>
          <Money
            pence={summary.month.profitPence}
            size="xl"
            className={summary.month.profitPence >= 0 ? 'mt-1 block text-good-700' : 'mt-1 block text-bad-700'}
          />
          <p className="text-sm text-ink-500">profit so far</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-600">
              <dt>Money in</dt>
              <dd><Money pence={summary.month.incomePence} size="sm" /></dd>
            </div>
            <div className="flex justify-between text-ink-600">
              <dt>Costs</dt>
              <dd><Money pence={summary.month.costsPence} size="sm" /></dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-400">Excludes VAT and anything marked personal.</p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/money-in" className="block">
          <Card className="p-5 transition-colors hover:border-ink-300">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-ink-500">Who owes you</p>
              <Icon name="chevron" className="size-5 text-ink-400" />
            </div>
            <Money pence={summary.owedToYou.totalPence} size="lg" className="mt-1 block text-ink-900" />
            <p className="mt-1 text-sm text-ink-500">
              across {summary.owedToYou.count} {summary.owedToYou.count === 1 ? 'invoice' : 'invoices'}
            </p>
            {summary.owedToYou.overdueCount > 0 ? (
              <p className="mt-3">
                <Badge tone="bad">
                  {summary.owedToYou.overdueCount} overdue · {formatMoney(summary.owedToYou.overduePence)}
                </Badge>
              </p>
            ) : summary.owedToYou.count > 0 ? (
              <p className="mt-3"><Badge tone="good">All up to date</Badge></p>
            ) : null}
          </Card>
        </Link>

        <Link href="/money-out/bills" className="block">
          <Card className="p-5 transition-colors hover:border-ink-300">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-ink-500">Bills to pay</p>
              <Icon name="chevron" className="size-5 text-ink-400" />
            </div>
            <Money pence={summary.billsToPay.totalPence} size="lg" className="mt-1 block text-ink-900" />
            <p className="mt-1 text-sm text-ink-500">
              across {summary.billsToPay.count} {summary.billsToPay.count === 1 ? 'bill' : 'bills'}
            </p>
            {summary.billsToPay.overdueCount > 0 ? (
              <p className="mt-3">
                <Badge tone="warn">{summary.billsToPay.overdueCount} past their due date</Badge>
              </p>
            ) : null}
          </Card>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/vat" className="block">
          <Card className="p-5 transition-colors hover:border-ink-300">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-ink-500">VAT ({summary.vat.label})</p>
              <Icon name="chevron" className="size-5 text-ink-400" />
            </div>
            {summary.vat.registered ? (
              <>
                <Money
                  pence={Math.abs(summary.vat.netVatDuePence)}
                  size="lg"
                  className="mt-1 block text-ink-900"
                />
                <p className="mt-1 text-sm text-ink-500">
                  estimated {summary.vat.netVatDuePence >= 0 ? 'to pay' : 'to come back'} · due{' '}
                  {formatDate(summary.vat.dueDate)}
                </p>
                <p className="mt-3"><Badge tone="info">Estimate, not a filed return</Badge></p>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-500">
                Not VAT registered. Turn it on in Settings if that changes.
              </p>
            )}
          </Card>
        </Link>

        <Link href="/receipts" className="block">
          <Card className="p-5 transition-colors hover:border-ink-300">
            <div className="flex items-start justify-between">
              <p className="text-sm font-medium text-ink-500">Receipts</p>
              <Icon name="chevron" className="size-5 text-ink-400" />
            </div>
            <p className="mt-1 text-xl font-semibold text-ink-900">
              {summary.receipts.missingCount} missing
            </p>
            <p className="mt-1 text-sm text-ink-500">
              {summary.receipts.unmatchedCount} uploaded but not yet matched to a payment
            </p>
            <div className="mt-4">
              <ButtonLink href="/receipts/new" variant="secondary">
                <Icon name="camera" className="size-5" /> Take a photo
              </ButtonLink>
            </div>
          </Card>
        </Link>
      </div>

      {summary.deadlines.length > 0 ? (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink-800">Coming up</h2>
          <ul className="mt-3 space-y-3">
            {summary.deadlines.map((deadline) => (
              <li key={`${deadline.kind}-${deadline.dueDate}`} className="flex items-start gap-3">
                <Icon name="clock" className="mt-0.5 size-5 shrink-0 text-ink-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">{deadline.label}</p>
                  <p className="text-sm text-ink-500">{deadline.detail}</p>
                </div>
                <span className="shrink-0 text-sm text-ink-600">
                  {formatDate(deadline.dueDate)}
                  <span className="block text-xs text-ink-400">{relativeDays(deadline.dueDate, today)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {company.isDemo ? (
        <Notice tone="warn" title="This is demonstration data">
          Northgate Roofing Ltd is a made-up business used to show how TradeBooks works. Nothing here is real.
        </Notice>
      ) : null}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  return 'Evening';
}

