import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bankConnections } from '@/db/schema';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { syncBankConnection } from '@/domain/bank-sync';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const context = await requirePermissionOrThrow('company.settings');
  const connections = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.companyId, context.company.id),
        eq(bankConnections.provider, 'truelayer'),
      ),
    );

  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  for (const connection of connections) {
    if (connection.status === 'authorization_required') continue;
    try {
      const result = await syncBankConnection({
        companyId: context.company.id,
        connectionRowId: connection.id,
        externalConnectionId: connection.externalConnectionId,
        userId: context.user.userId,
        userIp: request.headers.get('x-forwarded-for'),
      });
      imported += result.imported;
      duplicates += result.duplicates;
      errors += result.errors;
    } catch (error) {
      errors += 1;
      console.error('Manual Open Banking sync failed', error);
    }
  }

  const url = new URL('/settings/accounts', env().APP_BASE_URL);
  url.searchParams.set('bank', errors > 0 ? 'sync-warning' : 'synced');
  url.searchParams.set('imported', String(imported));
  url.searchParams.set('duplicates', String(duplicates));
  return NextResponse.redirect(url, 303);
}
