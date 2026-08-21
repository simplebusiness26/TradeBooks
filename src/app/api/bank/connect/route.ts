import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bankConnections } from '@/db/schema';
import { getBankFeed } from '@/adapters/bank';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';
const BANK_STATE_COOKIE = 'tb_bank_state';

function appUrl(path: string): URL {
  return new URL(path, env().APP_BASE_URL);
}

export async function GET(request: NextRequest) {
  const context = await requirePermissionOrThrow('company.settings');
  const feed = getBankFeed();
  if (!feed.available) {
    return NextResponse.redirect(appUrl('/settings/accounts?bank=not-configured'));
  }

  const stateNonce = randomBytes(24).toString('base64url');
  const returnUri = env().TRUELAYER_REDIRECT_URI;
  if (!returnUri) {
    return NextResponse.redirect(appUrl('/settings/accounts?bank=not-configured'));
  }

  try {
    const created = await feed.createConnection({
      companyId: context.company.id,
      userName: context.user.name,
      userEmail: context.user.email,
      returnUri,
      userIp: request.headers.get('x-forwarded-for'),
    });

    await db.insert(bankConnections).values({
      companyId: context.company.id,
      provider: 'truelayer',
      externalConnectionId: created.connectionId,
      stateNonce,
      status: created.status,
      createdByUserId: context.user.userId,
    });

    const response = NextResponse.redirect(created.hostedPageUri);
    response.cookies.set(BANK_STATE_COOKIE, stateNonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env().NODE_ENV === 'production',
      path: '/api/bank/callback',
      maxAge: 60 * 30,
    });
    return response;
  } catch (error) {
    console.error('Open Banking connection failed', error);
    return NextResponse.redirect(appUrl('/settings/accounts?bank=connect-error'));
  }
}
