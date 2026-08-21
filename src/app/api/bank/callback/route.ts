import { and, eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bankConnections } from '@/db/schema';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { syncBankConnection } from '@/domain/bank-sync';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
const BANK_STATE_COOKIE = 'tb_bank_state';

function appUrl(path: string): URL {
  return new URL(path, env().APP_BASE_URL);
}

export async function GET(request: NextRequest) {
  const context = await requirePermissionOrThrow('company.settings');
  const state = request.cookies.get(BANK_STATE_COOKIE)?.value;
  if (!state) {
    return NextResponse.redirect(appUrl('/settings/accounts?bank=invalid-return'));
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
    const response = NextResponse.redirect(appUrl('/settings/accounts?bank=invalid-return'));
    response.cookies.delete(BANK_STATE_COOKIE);
    return response;
  }

  try {
    const result = await syncBankConnection({
      companyId: context.company.id,
      connectionRowId: connection.id,
      externalConnectionId: connection.externalConnectionId,
      userId: context.user.userId,
      userIp: request.headers.get('x-forwarded-for'),
    });
    const url = appUrl('/settings/accounts');
    url.searchParams.set('bank', 'connected');
    url.searchParams.set('imported', String(result.imported));
    const response = NextResponse.redirect(url);
    response.cookies.delete(BANK_STATE_COOKIE);
    return response;
  } catch (error) {
    console.error('Open Banking callback sync failed', error);
    await db
      .update(bankConnections)
      .set({ status: 'error', updatedAt: new Date() })
      .where(and(eq(bankConnections.companyId, context.company.id), eq(bankConnections.id, connection.id)));
    const response = NextResponse.redirect(appUrl('/settings/accounts?bank=sync-error'));
    response.cookies.delete(BANK_STATE_COOKIE);
    return response;
  }
}
