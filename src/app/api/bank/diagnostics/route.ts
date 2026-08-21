import { NextResponse } from 'next/server';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Authenticated, non-secret diagnostics for Open Banking setup.
 * Never returns the client secret or any part of it.
 */
export async function GET() {
  await requirePermissionOrThrow('company.settings');

  const config = env();
  const rawSecret = process.env.TRUELAYER_CLIENT_SECRET ?? '';
  const rawClientId = process.env.TRUELAYER_CLIENT_ID ?? '';

  return NextResponse.json({
    bankFeedDriver: config.BANK_FEED_DRIVER,
    environment: config.TRUELAYER_ENV,
    clientId: config.TRUELAYER_CLIENT_ID ?? null,
    clientIdStartsWithSandbox: config.TRUELAYER_CLIENT_ID?.startsWith('sandbox-') ?? false,
    clientIdHadOuterWhitespace: rawClientId !== rawClientId.trim(),
    clientSecretPresent: Boolean(config.TRUELAYER_CLIENT_SECRET),
    clientSecretLength: config.TRUELAYER_CLIENT_SECRET?.length ?? 0,
    clientSecretStartsWithSandbox: config.TRUELAYER_CLIENT_SECRET?.startsWith('sandbox-') ?? false,
    clientSecretHadOuterWhitespace: rawSecret !== rawSecret.trim(),
    redirectUri: config.TRUELAYER_REDIRECT_URI ?? null,
  });
}
