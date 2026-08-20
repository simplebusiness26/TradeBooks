import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { SignInForm } from './form';

export const metadata: Metadata = { title: 'Sign in — TradeBooks' };

export default async function SignInPage() {
  const context = await getAuthContext();
  if (context) redirect('/home');

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <h1 className="text-2xl font-bold text-ink-900">Sign in</h1>
      <p className="mt-1 text-sm text-ink-500">Welcome back. Let’s get your books up to date.</p>
      <SignInForm />
      <p className="mt-6 text-center text-sm text-ink-600">
        No account yet?{' '}
        <Link href="/sign-up" className="font-semibold text-brand-700 underline">
          Set one up
        </Link>
      </p>
    </div>
  );
}
