import { z } from 'zod';
import type { AiAdapter, CategorySuggestion, CategorySuggestionInput } from './types';
import { formatMoney } from '@/lib/money';

/**
 * Cloudflare Workers AI suggestion provider.
 *
 * OPTIONAL and NOT CONNECTED by default. Included because Workers AI has a
 * free allowance, so a business can try AI-assisted categorisation without a
 * per-token bill. It sits behind exactly the same adapter interface as every
 * other provider and is only consulted after deterministic rules, supplier
 * history and matching have all failed.
 *
 * Enable with AI_DRIVER=cloudflare, CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_API_TOKEN. See CONNECTIONS_REQUIRED.md section 7.
 */
const suggestionSchema = z.object({
  category_id: z.string().nullable(),
  supplier_id: z.string().nullable().optional(),
  confidence: z.number().min(0).max(100),
  reason: z.string().max(300),
});

export class CloudflareAiAdapter implements AiAdapter {
  readonly name = 'cloudflare';

  constructor(
    private readonly config: {
      accountId?: string;
      apiToken?: string;
      model: string;
      timeoutMs?: number;
    },
  ) {}

  get available(): boolean {
    return Boolean(this.config.accountId && this.config.apiToken);
  }

  async suggestCategory(input: CategorySuggestionInput): Promise<CategorySuggestion | null> {
    if (!this.available) return null;

    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/ai/run/${this.config.model}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiToken}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content:
                'You classify UK construction-trade bank transactions for a bookkeeping system. Reply with JSON only, using the exact shape {"category_id": string|null, "supplier_id": string|null, "confidence": number, "reason": string}. Use null and a low confidence whenever you are unsure. Never invent an id that was not listed.',
            },
            { role: 'user', content: buildPrompt(input) },
          ],
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
      });

      if (!response.ok) return null;
      const payload = (await response.json()) as { result?: { response?: string } };
      const text = payload.result?.response;
      if (!text) return null;

      const parsed = suggestionSchema.safeParse(JSON.parse(extractJson(text)));
      if (!parsed.success) return null;

      // Never trust an id the model produced without checking it exists.
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
