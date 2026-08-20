import type { AiAdapter, CategorySuggestion } from './types';

/**
 * Default AI provider: none. TradeBooks resolves everything it can with
 * deterministic rules and history; anything left over goes to Ask Me. No
 * feature is lost when no AI provider is configured.
 */
export class NoAiAdapter implements AiAdapter {
  readonly name = 'none';
  readonly available = false;
  async suggestCategory(): Promise<CategorySuggestion | null> {
    return null;
  }
}
