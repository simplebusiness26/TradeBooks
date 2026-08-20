import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit';
import { RateLimitError } from '@/lib/errors';
import { resetEnvCache } from '@/lib/env';
import { detectContentType, validateUpload, ALLOWED_CONTENT_TYPES, MAX_UPLOAD_BYTES } from '@/domain/documents';
import { LocalStorageAdapter } from '@/adapters/storage';
import { loadEnv } from '@/lib/env';

describe('rate limiting', () => {
  beforeEach(() => {
    // The test environment disables limits; turn them on for this file only.
    process.env.DISABLE_RATE_LIMIT = 'false';
    resetEnvCache();
  });

  afterEach(() => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    resetEnvCache();
  });

  it('blocks after the configured number of attempts', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < RATE_LIMITS.signIn.limit; i += 1) {
      expect(() => checkRateLimit(key, RATE_LIMITS.signIn)).not.toThrow();
    }
    expect(() => checkRateLimit(key, RATE_LIMITS.signIn)).toThrow(RateLimitError);
  });

  it('tells the user when they can try again', () => {
    const key = `test-${Math.random()}`;
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit(key, rule);
    expect(() => checkRateLimit(key, rule)).toThrow(/try again/i);
  });

  it('counts each key separately and can be reset on success', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    const rule = { limit: 1, windowMs: 60_000 };
    checkRateLimit(a, rule);
    expect(() => checkRateLimit(b, rule)).not.toThrow();
    resetRateLimit(a);
    expect(() => checkRateLimit(a, rule)).not.toThrow();
  });

  it('is switched off when DISABLE_RATE_LIMIT is set', () => {
    process.env.DISABLE_RATE_LIMIT = 'true';
    resetEnvCache();
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 50; i += 1) {
      expect(() => checkRateLimit(key, { limit: 1, windowMs: 60_000 })).not.toThrow();
    }
  });
});

describe('environment validation', () => {
  it('refuses to start without the required values', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv)).toThrow(
      /DATABASE_URL/,
    );
  });

  it('refuses a short auth secret', () => {
    expect(() =>
      loadEnv({ DATABASE_URL: 'postgres://x', AUTH_SECRET: 'too-short' } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/at least 32/);
  });

  it('defaults every optional provider to a local driver', () => {
    const parsed = loadEnv({
      DATABASE_URL: 'postgres://x',
      AUTH_SECRET: 'a'.repeat(40),
    } as unknown as NodeJS.ProcessEnv);
    expect(parsed.STORAGE_DRIVER).toBe('local');
    expect(parsed.AI_DRIVER).toBe('none');
    expect(parsed.EMAIL_DRIVER).toBe('log');
    expect(parsed.BANK_FEED_DRIVER).toBe('none');
    expect(parsed.OCR_DRIVER).toBe('builtin');
  });
});

describe('upload validation', () => {
  it('recognises real file types from their contents, not their name', () => {
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(32)]);
    expect(detectContentType(jpeg, 'text/plain')).toBe('image/jpeg');
    expect(detectContentType(pdf, 'image/png')).toBe('application/pdf');
    expect(detectContentType(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c]), 'text/plain')).toBe(
      'application/octet-stream',
    );
  });

  it('only accepts the document types the product supports', () => {
    expect([...ALLOWED_CONTENT_TYPES]).toContain('image/jpeg');
    expect([...ALLOWED_CONTENT_TYPES]).toContain('application/pdf');
    expect([...ALLOWED_CONTENT_TYPES]).not.toContain('application/javascript');
    expect([...ALLOWED_CONTENT_TYPES]).not.toContain('text/html');
  });

  it('enforces a size limit', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(() => validateUpload(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 65), 'text/plain', 'big.txt')).toThrow();
  });
});

describe('storage keys', () => {
  it('cannot be made to escape the storage root', async () => {
    const adapter = new LocalStorageAdapter('./storage/test-security');
    await expect(adapter.get('../../../etc/passwd')).rejects.toThrow(/Invalid storage key/);
    await expect(adapter.get('/etc/passwd')).rejects.toThrow(/Invalid storage key/);
  });

  it('sanitises the filename it is given', () => {
    const key = LocalStorageAdapter.keyFor('company-1', 'abc123', '../../etc/passwd');
    expect(key).not.toContain('..');
    expect(key.startsWith('company-1/')).toBe(true);
  });
});
