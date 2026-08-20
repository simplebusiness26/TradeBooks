import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { listMembers } from '@/domain/company';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/dates';
import { Badge, Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { changeRoleAction, removePersonAction } from '../actions';
import { AddPersonForm } from './form';
import { getEmail } from '@/adapters/email';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'People — TradeBooks' };

export default async function PeoplePage() {
  const context = await requirePermission('company.members');
  const members = await listMembers(db, context.company.id);
  const emailDriver = getEmail().name;

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="People"
        description="Who can sign in, and what each of them can do."
      />

      <Card>
        <ul>
          {members.map((member) => (
            <li key={member.userId} className="border-b border-ink-100 px-4 py-4 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-900">{member.name}</p>
                  <p className="text-sm text-ink-500">{member.email}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={member.role === 'owner' ? 'good' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
                    {member.userId === context.user.userId ? <Badge tone="info">You</Badge> : null}
                    <span className="text-xs text-ink-500">
                      {member.lastSignedInAt ? `Last signed in ${formatDateTime(member.lastSignedInAt)}` : 'Never signed in'}
                    </span>
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <form action={changeRoleAction} className="flex items-center gap-2">
                    <input type="hidden" name="userId" value={member.userId} />
                    <label className="sr-only" htmlFor={`role-${member.userId}`}>
                      Role for {member.name}
                    </label>
                    <select
                      id={`role-${member.userId}`}
                      name="role"
                      defaultValue={member.role}
                      className="min-h-11 rounded-xl border border-ink-300 bg-white px-3 text-sm"
                    >
                      {(['owner', 'admin', 'staff', 'reviewer'] as const).map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" pendingLabel="…">
                      Change
                    </SubmitButton>
                  </form>
                  {member.userId !== context.user.userId ? (
                    <form action={removePersonAction}>
                      <input type="hidden" name="userId" value={member.userId} />
                      <SubmitButton variant="ghost" pendingLabel="…">
                        Remove
                      </SubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <AddPersonForm emailConnected={emailDriver !== 'log'} />

      <Card className="p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink-800">What each role can do</h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium text-ink-900">Owner and Admin</dt>
            <dd className="text-ink-500">Everything, including business settings, people and connections.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">Staff</dt>
            <dd className="text-ink-500">
              Day-to-day work: add records, upload receipts, sort payments, answer questions. Cannot change
              settings or delete records.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">Bookkeeper / accountant</dt>
            <dd className="text-ink-500">
              Review everything, reconcile, manage rules, prepare and close VAT and CIS periods, run exports and
              read the audit trail. Cannot change business settings or manage people.
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
