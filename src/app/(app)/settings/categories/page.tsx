import type { Metadata } from 'next';
import { db } from '@/db/client';
import { requirePermission } from '@/lib/auth-context';
import { eq } from 'drizzle-orm';
import { categories } from '@/db/schema';
import { VAT_TREATMENT_LABELS, type VatTreatment } from '@/domain/vat';
import { Badge, Card, Notice } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { archiveCategoryAction } from '../actions';
import { AddCategoryForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Categories — TradeBooks' };

export default async function CategoriesPage() {
  const { company } = await requirePermission('company.settings');
  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.companyId, company.id))
    .orderBy(categories.sortOrder, categories.name);

  const income = rows.filter((c) => c.kind === 'income');
  const expense = rows.filter((c) => c.kind === 'expense');
  const other = rows.filter((c) => c.kind === 'both');

  return (
    <div className="space-y-5">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Categories"
        description="The buckets everything gets sorted into."
      />

      <Notice tone="info">
        These are the choices the owner sees when answering a question. Keep the list short — it is easier to
        answer five options than thirty.
      </Notice>

      {[
        { title: 'Money in', items: income },
        { title: 'Money out', items: expense },
        { title: 'Other', items: other },
      ].map((group) =>
        group.items.length > 0 ? (
          <Card key={group.title}>
            <h2 className="border-b border-ink-100 px-4 py-3 text-sm font-semibold text-ink-800">{group.title}</h2>
            <ul>
              {group.items.map((category) => (
                <li key={category.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">{category.name}</p>
                    {category.description ? (
                      <p className="text-xs text-ink-500">{category.description}</p>
                    ) : null}
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">
                        {VAT_TREATMENT_LABELS[category.defaultVatTreatment as VatTreatment]}
                      </Badge>
                      {category.isJobCost ? <Badge tone="info">Job cost · {category.jobCostGroup}</Badge> : null}
                      {category.isArchived ? <Badge tone="warn">Hidden</Badge> : null}
                    </p>
                  </div>
                  <form action={archiveCategoryAction}>
                    <input type="hidden" name="categoryId" value={category.id} />
                    <input type="hidden" name="isArchived" value={category.isArchived ? 'no' : 'yes'} />
                    <SubmitButton variant="ghost" pendingLabel="…">
                      {category.isArchived ? 'Show again' : 'Hide'}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        ) : null,
      )}

      <AddCategoryForm />
    </div>
  );
}
