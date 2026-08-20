import { z } from 'zod';
import type { OcrAdapter, ReceiptExtraction } from './types';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate } from '@/lib/dates';

/**
 * Generic HTTP OCR provider boundary.
 *
 * NOT CONNECTED by default. Point OCR_HTTP_ENDPOINT at any service that
 * accepts a multipart upload and returns the JSON shape below; nothing else
 * in TradeBooks changes. See CONNECTIONS_REQUIRED.md section 6.
 */
const responseSchema = z.object({
  supplier_name: z.string().optional().nullable(),
  document_date: z.string().optional().nullable(),
  net: z.union([z.string(), z.number()]).optional().nullable(),
  vat: z.union([z.string(), z.number()]).optional().nullable(),
  gross: z.union([z.string(), z.number()]).optional().nullable(),
  vat_number: z.string().optional().nullable(),
  confidence: z.number().min(0).max(100).optional(),
});

export class HttpOcrAdapter implements OcrAdapter {
  readonly name = 'http';
  readonly supportsImages = true;

  constructor(
    private readonly config: { endpoint?: string; apiKey?: string; timeoutMs?: number } = {},
  ) {}

  isConfigured(): boolean {
    return Boolean(this.config.endpoint);
  }

  async extract(input: {
    buffer: Buffer;
    contentType: string;
    filename: string;
  }): Promise<ReceiptExtraction> {
    if (!this.config.endpoint) {
      return {
        provider: this.name,
        confidence: 0,
        unsupported: true,
        message: 'OCR_DRIVER is set to http but OCR_HTTP_ENDPOINT is not configured.',
        raw: {},
      };
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.buffer)], { type: input.contentType }),
      input.filename,
    );

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        body: form,
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : undefined,
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 20_000),
      });
      if (!response.ok) {
        return {
          provider: this.name,
          confidence: 0,
          message: `Receipt reader returned ${response.status}.`,
          raw: { status: response.status },
        };
      }
      const json: unknown = await response.json();
      const parsed = responseSchema.safeParse(json);
      if (!parsed.success) {
        return {
          provider: this.name,
          confidence: 0,
          message: 'Receipt reader returned an unexpected response.',
          raw: { response: json },
        };
      }
      return toExtraction(parsed.data, this.name, json);
    } catch (error) {
      return {
        provider: this.name,
        confidence: 0,
        message: error instanceof Error ? error.message : 'Receipt reader unavailable.',
        raw: {},
      };
    }
  }
}

function toExtraction(
  data: z.infer<typeof responseSchema>,
  provider: string,
  raw: unknown,
): ReceiptExtraction {
  const confidence = data.confidence ?? 60;
  const result: ReceiptExtraction = { provider, confidence, raw: { response: raw } };
  if (data.supplier_name) result.supplierName = { value: data.supplier_name, confidence };
  if (data.document_date && isIsoDate(data.document_date)) {
    result.documentDate = { value: data.document_date, confidence };
  }
  for (const [key, field] of [
    ['net', 'netPence'],
    ['vat', 'vatPence'],
    ['gross', 'grossPence'],
  ] as const) {
    const value = data[key];
    if (value === null || value === undefined) continue;
    try {
      result[field] = { value: parseMoneyInput(value), confidence };
    } catch {
      /* ignore unreadable amounts rather than failing the whole upload */
    }
  }
  if (data.vat_number) result.vatNumber = { value: data.vat_number, confidence };
  return result;
}
