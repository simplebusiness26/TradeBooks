import { NextResponse } from 'next/server';
import { requirePermissionOrThrow } from '@/lib/auth-context';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

type ProbeResult = {
  label: string;
  endpoint: string;
  grantType: string;
  scope: string | null;
  status: number | null;
  ok: boolean;
  error: string | null;
  errorDescription: string | null;
  accessTokenReturned: boolean;
  tokenType: string | null;
  expiresIn: number | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function probeToken(input: {
  label: string;
  endpoint: string;
  clientId: string;
  clientSecret: string;
  scope?: string;
}): Promise<ProbeResult> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  if (input.scope !== undefined) body.set('scope', input.scope);

  try {
    const response = await fetch(input.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body,
      cache: 'no-store',
    });
    const payload = asRecord(await response.json().catch(() => ({})));

    // Deliberately expose only metadata about the response. Never return the
    // access token, refresh token, client secret, or any fragment of them.
    return {
      label: input.label,
      endpoint: input.endpoint,
      grantType: 'client_credentials',
      scope: input.scope ?? null,
      status: response.status,
      ok: response.ok,
      error: asString(payload.error),
      errorDescription: asString(payload.error_description) ?? asString(payload.detail),
      accessTokenReturned: Boolean(asString(payload.access_token)),
      tokenType: asString(payload.token_type),
      expiresIn: asNumber(payload.expires_in),
    };
  } catch (error) {
    return {
      label: input.label,
      endpoint: input.endpoint,
      grantType: 'client_credentials',
      scope: input.scope ?? null,
      status: null,
      ok: false,
      error: 'network_error',
      errorDescription: error instanceof Error ? error.message : 'Unknown network error',
      accessTokenReturned: false,
      tokenType: null,
      expiresIn: null,
    };
  }
}

/**
 * Authenticated, non-secret diagnostics for Open Banking setup.
 * Never returns the client secret, an access token, or any part of either.
 */
export async function GET() {
  await requirePermissionOrThrow('company.settings');

  const config = env();
  const rawSecret = process.env.TRUELAYER_CLIENT_SECRET ?? '';
  const rawClientId = process.env.TRUELAYER_CLIENT_ID ?? '';
  const clientId = config.TRUELAYER_CLIENT_ID ?? '';
  const clientSecret = config.TRUELAYER_CLIENT_SECRET ?? '';
  const authBase =
    config.TRUELAYER_ENV === 'sandbox'
      ? 'https://auth.truelayer-sandbox.com'
      : 'https://auth.truelayer.com';

  const base = {
    bankFeedDriver: config.BANK_FEED_DRIVER,
    environment: config.TRUELAYER_ENV,
    clientId: config.TRUELAYER_CLIENT_ID ?? null,
    clientIdStartsWithSandbox: config.TRUELAYER_CLIENT_ID?.startsWith('sandbox-') ?? false,
    clientIdHadOuterWhitespace: rawClientId !== rawClientId.trim(),
    clientSecretPresent: Boolean(config.TRUELAYER_CLIENT_SECRET),
    clientSecretLength: config.TRUELAYER_CLIENT_SECRET?.length ?? 0,
    clientSecretHadOuterWhitespace: rawSecret !== rawSecret.trim(),
    redirectUri: config.TRUELAYER_REDIRECT_URI ?? null,
  };

  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ...base,
      compatibility: {
        ran: false,
        diagnosis: 'TrueLayer client credentials are missing, so token probes were not run.',
        probes: [],
      },
    });
  }

  const probes = await Promise.all([
    probeToken({
      label: 'data-v3-documented',
      endpoint: `${authBase}/connect/token`,
      clientId,
      clientSecret,
      scope: 'data',
    }),
    probeToken({
      label: 'data-v3-trailing-slash',
      endpoint: `${authBase}/connect/token/`,
      clientId,
      clientSecret,
      scope: 'data',
    }),
    probeToken({
      label: 'client-credentials-no-scope',
      endpoint: `${authBase}/connect/token`,
      clientId,
      clientSecret,
    }),
    probeToken({
      label: 'legacy-data-scope-comparison',
      endpoint: `${authBase}/connect/token`,
      clientId,
      clientSecret,
      scope: 'accounts balance transactions',
    }),
  ]);

  const documented = probes.find((probe) => probe.label === 'data-v3-documented');
  const trailingSlash = probes.find((probe) => probe.label === 'data-v3-trailing-slash');
  const noScope = probes.find((probe) => probe.label === 'client-credentials-no-scope');
  const legacy = probes.find((probe) => probe.label === 'legacy-data-scope-comparison');

  let diagnosis = 'Token responses are mixed; review the probe status/error values.';
  if (documented?.ok) {
    diagnosis = 'The documented Data v3 client-credentials token request succeeds.';
  } else if (documented?.error === 'invalid_client') {
    diagnosis = 'TrueLayer is rejecting the client ID / client secret pair.';
  } else if (documented?.error === 'invalid_scope') {
    if (trailingSlash?.ok) {
      diagnosis = 'The trailing-slash token endpoint succeeds while the non-slash endpoint fails.';
    } else if (legacy?.ok) {
      diagnosis = 'The client accepts legacy Data scopes but rejects the Data v3 data scope; this points to Data v3 entitlement/provisioning.';
    } else if (noScope?.error !== 'invalid_client') {
      diagnosis = 'The client credentials are recognised, but TrueLayer rejects the Data v3 data scope. This points to scope entitlement/provisioning rather than credential parsing.';
    } else {
      diagnosis = 'TrueLayer rejects the Data v3 data scope; the comparison probes did not identify a request-format workaround.';
    }
  }

  return NextResponse.json({
    ...base,
    compatibility: {
      ran: true,
      diagnosis,
      probes,
      note: 'No client secret or access token is returned by this diagnostic.',
    },
  });
}
