import { z } from 'zod';

/**
 * Fail-fast environment validation.
 *
 * Only DATABASE_URL and AUTH_SECRET are required. Every integration is
 * optional and defaults to a local/deterministic driver so that TradeBooks
 * runs completely standalone with zero external credentials.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  OCR_DRIVER: z.enum(['builtin', 'none', 'http']).default('builtin'),
  OCR_HTTP_ENDPOINT: z.string().optional(),
  OCR_HTTP_API_KEY: z.string().optional(),

  AI_DRIVER: z.enum(['none', 'anthropic', 'cloudflare']).default('none'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_AI_MODEL: z.string().default('@cf/meta/llama-3.1-8b-instruct'),

  EMAIL_DRIVER: z.enum(['log', 'smtp']).default('log'),
  EMAIL_FROM: z.string().default('TradeBooks <no-reply@tradebooks.local>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  BANK_FEED_DRIVER: z.enum(['none', 'truelayer']).default('none'),
  TRUELAYER_ENV: z.enum(['sandbox', 'live']).default('sandbox'),
  // Trim integration credentials because copying from mobile password/secret
  // views can introduce leading/trailing whitespace or a newline. Those are
  // invisible in dashboards but make OAuth client authentication fail.
  TRUELAYER_CLIENT_ID: z.string().trim().optional(),
  TRUELAYER_CLIENT_SECRET: z.string().trim().optional(),
  TRUELAYER_REDIRECT_URI: z.string().trim().url().optional(),

  XERO_CLIENT_ID: z.string().optional(),
  XERO_CLIENT_SECRET: z.string().optional(),
  XERO_REDIRECT_URI: z.string().optional(),
  QUICKBOOKS_CLIENT_ID: z.string().optional(),
  QUICKBOOKS_CLIENT_SECRET: z.string().optional(),
  QUICKBOOKS_REDIRECT_URI: z.string().optional(),
  FREEAGENT_CLIENT_ID: z.string().optional(),
  FREEAGENT_CLIENT_SECRET: z.string().optional(),
  FREEAGENT_REDIRECT_URI: z.string().optional(),

  SEED_DEMO_PASSWORD: z.string().min(8).default('DemoPassw0rd!'),
  DISABLE_RATE_LIMIT: booleanish.default(false),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function isBuildPhase(): boolean {
  // `next build` collects page data without a live environment. Allow the
  // build to proceed with placeholder values; runtime still validates.
  return process.env.NEXT_PHASE === 'phase-production-build';
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (cached) return cached;
  if (isBuildPhase()) {
    cached = envSchema.parse({
      ...process.env,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://build:build@localhost:5432/build',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'build-phase-placeholder-secret-value-0123456789',
    });
    return cached;
  }
  cached = loadEnv();
  return cached;
}

/** Test helper — clears the memoised environment. */
export function resetEnvCache(): void {
  cached = null;
}
