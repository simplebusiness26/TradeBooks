import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';
import { SignUpForm } from './form';

export const metadata: Metadata = { title: 'Create an account — TradeBooks' };

export default async function SignUpPage() {
  const context = await getAuthContext();
  if (context) redirect('/home');

  return (
    <div className="rounded-2xl bg-white p-6 shadow-xl">
      <h1 className="text-2xl font-bold text-ink-900">Set up TradeBooks</h1>
      <p className="mt-1 text-sm text-ink-500">Two minutes now, and the books look after themselves.</p>
      <SignUpForm />
      <p className="mt-6 text-center text-sm text-ink-600">
        Already set up?{' '}
        <Link href="/sign-in" className="font-semibold text-brand-700 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
