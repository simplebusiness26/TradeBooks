import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { bankConnections } from '@/db/schema';
import { getBankFeed } from '@/adapters/bank';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const context = await requirePermissionOrThrow('company.settings');
  const feed = getBankFeed();
  if (!feed.available) {
    return NextResponse.redirect(new URL('/settings/accounts?bank=not-configured', request.url));
  }

  const stateNonce = randomBytes(24).toString('base64url');
  const baseReturnUri = env().TRUELAYER_REDIRECT_URI;
  if (!baseReturnUri) {
    return NextResponse.redirect(new URL('/settings/accounts?bank=not-configured', request.url));
  }
  const returnUri = new URL(baseReturnUri);
  returnUri.searchParams.set('state', stateNonce);

  try {
    const created = await feed.createConnection({
      companyId: context.company.id,
      userName: context.user.name,
      userEmail: context.user.email,
      returnUri: returnUri.toString(),
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

    return NextResponse.redirect(created.hostedPageUri);
  } catch (error) {
    console.error('Open Banking connection failed', error);
    return NextResponse.redirect(new URL('/settings/accounts?bank=connect-error', request.url));
  }
}
