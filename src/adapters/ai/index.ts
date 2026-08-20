import { env } from '@/lib/env';
import { AnthropicAiAdapter } from './anthropic';
import { CloudflareAiAdapter } from './cloudflare';
import { NoAiAdapter } from './none';
import type { AiAdapter } from './types';

export type { AiAdapter, CategorySuggestion, CategorySuggestionInput } from './types';

let cached: AiAdapter | null = null;

/**
 * AI is always optional. When no provider is configured — the default — the
 * product loses no capability: deterministic rules, supplier history and
 * matching decide what they can, and anything left over becomes a question in
 * the Ask Me queue.
 */
export function getAi(): AiAdapter {
  if (cached) return cached;
  const config = env();

  if (config.AI_DRIVER === 'anthropic' && config.ANTHROPIC_API_KEY) {
    cached = new AnthropicAiAdapter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL });
  } else if (config.AI_DRIVER === 'cloudflare' && config.CLOUDFLARE_ACCOUNT_ID && config.CLOUDFLARE_API_TOKEN) {
    cached = new CloudflareAiAdapter({
      accountId: config.CLOUDFLARE_ACCOUNT_ID,
      apiToken: config.CLOUDFLARE_API_TOKEN,
      model: config.CLOUDFLARE_AI_MODEL,
    });
  } else {
    cached = new NoAiAdapter();
  }

  return cached;
}

export function resetAiCache(): void {
  cached = null;
}
