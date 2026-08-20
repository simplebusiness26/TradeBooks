import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { getAuthContext } from '@/lib/auth-context';
import { openExceptionCount } from '@/domain/exceptions';
import { can } from '@/lib/permissions';
import { ROLE_LABELS } from '@/lib/permissions';
import { BottomNav } from '@/components/shell/bottom-nav';
import { SideNav } from '@/components/shell/side-nav';
import { TopBar } from '@/components/shell/top-bar';
import { signOutAction, switchCompanyAction } from '../(auth)/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect('/sign-in');

  const askMeCount = await openExceptionCount(db, context.company.id);
  const canReview = can(context.role, 'audit.read');

  return (
    <div className="min-h-dvh bg-ink-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-brand-600 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to the main content
      </a>
      <TopBar
        companyName={context.company.tradingName ?? context.company.name}
        userName={context.user.name}
        roleLabel={ROLE_LABELS[context.role]}
        isDemo={context.company.isDemo}
        canReview={canReview}
        companies={context.memberCompanies.map((c) => ({ id: c.id, name: c.name }))}
        onSignOut={signOutAction}
        onSwitchCompany={switchCompanyAction}
      />

      <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 pb-28 pt-5 md:pb-10">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-24">
            <SideNav askMeCount={askMeCount} canReview={canReview} />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>

      <BottomNav askMeCount={askMeCount} />
    </div>
  );
}
