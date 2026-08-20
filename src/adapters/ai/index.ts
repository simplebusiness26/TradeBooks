import { env } from '@/lib/env';
import { AnthropicAiAdapter } from './anthropic';
import { NoAiAdapter } from './none';
import type { AiAdapter } from './types';

export type { AiAdapter, CategorySuggestion, CategorySuggestionInput } from './types';

let cached: AiAdapter | null = null;

export function getAi(): AiAdapter {
  if (cached) return cached;
  const config = env();
  cached =
    config.AI_DRIVER === 'anthropic' && config.ANTHROPIC_API_KEY
      ? new AnthropicAiAdapter({ apiKey: config.ANTHROPIC_API_KEY, model: config.ANTHROPIC_MODEL })
      : new NoAiAdapter();
  return cached;
}

export function resetAiCache(): void {
  cached = null;
}
