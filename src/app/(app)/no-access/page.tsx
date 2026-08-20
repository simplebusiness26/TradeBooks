import type { Metadata } from 'next';
import { requireAuth } from '@/lib/auth-context';
import { ROLE_LABELS } from '@/lib/permissions';
import { ButtonLink, Card } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'No access — TradeBooks' };

/** Shown instead of an error page when a role does not cover an action. */
export default async function NoAccessPage() {
  const { role } = await requireAuth();

  return (
    <div>
      <PageHeader title="That is not yours to change" />
      <Card className="p-6">
        <p className="text-sm text-ink-700">
          You are signed in as <span className="font-semibold">{ROLE_LABELS[role]}</span>, and this
          screen is only available to an owner or admin.
        </p>
        <p className="mt-2 text-sm text-ink-500">
          If you need it, ask the business owner to change your role in Settings → People.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href="/home">Back to home</ButtonLink>
          <ButtonLink href="/ask" variant="secondary">
            Go to Ask me
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
