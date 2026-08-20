import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { listRules } from '@/domain/rules';
import { activeCategories, activeSuppliers } from '@/domain/queries';
import { formatDateTime } from '@/lib/dates';
import { Badge, Card, EmptyState, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { deleteRuleAction, toggleRuleAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Rules — TradeBooks' };

const MATCH_LABELS: Record<string, string> = {
  description_contains: 'description contains',
  description_equals: 'description is exactly',
  counterparty_equals: 'the payee is',
  reference_contains: 'the reference contains',
};

export default async function RulesPage() {
  const { company } = await requirePermission('rules.manage');
  const [rules, categories, suppliers] = await Promise.all([
    listRules(db, company.id),
    activeCategories(db, company.id),
    activeSuppliers(db, company.id),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/review"
        backLabel="Bookkeeper view"
        title="Automation rules"
        description="What TradeBooks sorts without asking, and why."
      />

      <Notice tone="info" title="Rules come first, always">
        Every payment is checked against these rules before anything else. Only when no rule matches does
        TradeBooks fall back to supplier history, then matching, then a question in Ask Me.
      </Notice>

      {rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Rules are created automatically when the owner answers a question in Ask Me."
        />
      ) : (
        <Card>
          <ul>
            {rules.map((rule) => (
              <li key={rule.id} className="border-b border-ink-100 px-4 py-4 last:border-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{rule.name}</p>
                    <p className="mt-0.5 text-sm text-ink-500">
                      When the {MATCH_LABELS[rule.matchType] ?? rule.matchType}{' '}
                      <span className="font-mono text-ink-700">“{rule.matchValue}”</span>
                      {rule.appliesToDirection !== 'any'
                        ? ` on ${rule.appliesToDirection === 'money_in' ? 'money in' : 'money out'}`
                        : ''}
                      , set{' '}
                      {[
                        rule.setCategoryId ? categoryName.get(rule.setCategoryId) : null,
                        rule.setSupplierId ? supplierName.get(rule.setSupplierId) : null,
                        rule.setIsPersonal ? 'personal' : null,
                      ]
                        .filter(Boolean)
                        .join(', ') || 'nothing'}
                      .
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge tone={rule.isActive ? 'good' : 'neutral'}>{rule.isActive ? 'On' : 'Off'}</Badge>
                      <span className="text-xs text-ink-500">
                        Used {rule.timesApplied} time{rule.timesApplied === 1 ? '' : 's'}
                        {rule.lastAppliedAt ? `, last ${formatDateTime(rule.lastAppliedAt)}` : ''}
                      </span>
                      {rule.createdFromExceptionId ? (
                        <span className="text-xs text-ink-400">Learned from an answer</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={toggleRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <input type="hidden" name="isActive" value={rule.isActive ? 'no' : 'yes'} />
                      <SubmitButton variant="secondary" pendingLabel="…">
                        {rule.isActive ? 'Switch off' : 'Switch on'}
                      </SubmitButton>
                    </form>
                    <form action={deleteRuleAction}>
                      <input type="hidden" name="ruleId" value={rule.id} />
                      <SubmitButton variant="ghost" pendingLabel="…">
                        Delete
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
