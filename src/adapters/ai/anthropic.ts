import { z } from 'zod';
import type { AiAdapter, CategorySuggestion, CategorySuggestionInput } from './types';
import { formatMoney } from '@/lib/money';

/**
 * Anthropic-backed suggestion provider.
 *
 * OPTIONAL and NOT CONNECTED by default. Set AI_DRIVER=anthropic and
 * ANTHROPIC_API_KEY to enable. It is only consulted after deterministic rules
 * and supplier history have failed, it can only pick from the company's own
 * categories, and its answer is always recorded as a suggestion with a
 * confidence and reason — it never silently confirms a financial decision.
 * See CONNECTIONS_REQUIRED.md section 7.
 */
const suggestionSchema = z.object({
  category_id: z.string().nullable(),
  supplier_id: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100),
  reason: z.string().max(300),
});

export class AnthropicAiAdapter implements AiAdapter {
  readonly name = 'anthropic';

  constructor(
    private readonly config: { apiKey?: string; model: string; timeoutMs?: number },
  ) {}

  get available(): boolean {
    return Boolean(this.config.apiKey);
  }

  async suggestCategory(input: CategorySuggestionInput): Promise<CategorySuggestion | null> {
    if (!this.config.apiKey) return null;

    const prompt = buildPrompt(input);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 400,
          system:
            'You classify UK construction-trade bank transactions for a bookkeeping system. Reply with JSON only, using the exact shape {"category_id": string|null, "supplier_id": string|null, "confidence": number, "reason": string}. Use null and a low confidence whenever you are unsure. Never invent an id that was not listed.',
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
      });

      if (!response.ok) return null;
      const payload = (await response.json()) as { content?: { type: string; text?: string }[] };
      const text = payload.content?.find((c) => c.type === 'text')?.text;
      if (!text) return null;

      const json: unknown = JSON.parse(extractJson(text));
      const parsed = suggestionSchema.safeParse(json);
      if (!parsed.success) return null;

      // Guard against hallucinated identifiers.
      const validCategory = input.availableCategories.some((c) => c.id === parsed.data.category_id);
      const validSupplier = input.knownSuppliers.some((s) => s.id === parsed.data.supplier_id);

      return {
        categoryId: validCategory ? parsed.data.category_id : null,
        supplierId: validSupplier ? (parsed.data.supplier_id ?? null) : null,
        confidence: validCategory ? Math.min(parsed.data.confidence, 90) : 0,
        reason: parsed.data.reason,
        provider: this.name,
      };
    } catch {
      return null;
    }
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

function buildPrompt(input: CategorySuggestionInput): string {
  const categories = input.availableCategories
    .map((c) => `- ${c.id}: ${c.name}${c.description ? ` (${c.description})` : ''}`)
    .join('\n');
  const suppliers = input.knownSuppliers.map((s) => `- ${s.id}: ${s.name}`).join('\n');
  return [
    'Transaction to classify:',
    `  date: ${input.date}`,
    `  direction: ${input.direction === 'money_in' ? 'money received' : 'money paid out'}`,
    `  amount: ${formatMoney(input.amountPence)}`,
    `  description: ${input.description}`,
    input.counterparty ? `  counterparty: ${input.counterparty}` : '',
    '',
    'Available categories:',
    categories,
    '',
    'Known suppliers:',
    suppliers || '- (none)',
  ]
    .filter(Boolean)
    .join('\n');
}
