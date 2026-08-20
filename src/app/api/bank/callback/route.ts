import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bankConnections } from '@/db/schema';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { syncBankConnection } from '@/domain/bank-sync';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const context = await requirePermissionOrThrow('company.settings');
  const state = request.nextUrl.searchParams.get('state');
  if (!state) {
    return NextResponse.redirect(new URL('/settings/accounts?bank=invalid-return', request.url));
  }

  const rows = await db
    .select()
    .from(bankConnections)
    .where(
      and(
        eq(bankConnections.companyId, context.company.id),
        eq(bankConnections.stateNonce, state),
        eq(bankConnections.provider, 'truelayer'),
      ),
    )
    .limit(1);
  const connection = rows[0];
  if (!connection) {
    return NextResponse.redirect(new URL('/settings/accounts?bank=invalid-return', request.url));
  }

  try {
    const result = await syncBankConnection({
      companyId: context.company.id,
      connectionRowId: connection.id,
      externalConnectionId: connection.externalConnectionId,
      userId: context.user.userId,
      userIp: request.headers.get('x-forwarded-for'),
    });
    const url = new URL('/settings/accounts', request.url);
    url.searchParams.set('bank', 'connected');
    url.searchParams.set('imported', String(result.imported));
    return NextResponse.redirect(url);
  } catch (error) {
    console.error('Open Banking callback sync failed', error);
    await db
      .update(bankConnections)
      .set({ status: 'error', updatedAt: new Date() })
      .where(and(eq(bankConnections.companyId, context.company.id), eq(bankConnections.id, connection.id)));
    return NextResponse.redirect(new URL('/settings/accounts?bank=sync-error', request.url));
  }
}
