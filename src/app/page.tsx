import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth-context';

export const dynamic = 'force-dynamic';

export default async function IndexPage() {
  const context = await getAuthContext();
  redirect(context ? '/home' : '/sign-in');
}
