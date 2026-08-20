import { env } from '@/lib/env';
import { BuiltinOcrAdapter } from './builtin';
import { HttpOcrAdapter } from './http';
import type { OcrAdapter, ReceiptExtraction } from './types';

export type { OcrAdapter, ReceiptExtraction } from './types';
export { BuiltinOcrAdapter, extractFromText } from './builtin';

/** Records the document but reads nothing from it. */
class NoopOcrAdapter implements OcrAdapter {
  readonly name = 'none';
  readonly supportsImages = false;
  async extract(): Promise<ReceiptExtraction> {
    return {
      provider: this.name,
      confidence: 0,
      unsupported: true,
      message: 'Automatic receipt reading is switched off.',
      raw: {},
    };
  }
}

let cached: OcrAdapter | null = null;

export function getOcr(): OcrAdapter {
  if (cached) return cached;
  const config = env();
  switch (config.OCR_DRIVER) {
    case 'none':
      cached = new NoopOcrAdapter();
      break;
    case 'http':
      cached = new HttpOcrAdapter({
        endpoint: config.OCR_HTTP_ENDPOINT,
        apiKey: config.OCR_HTTP_API_KEY,
      });
      break;
    default:
      cached = new BuiltinOcrAdapter();
  }
  return cached;
}

export function resetOcrCache(): void {
  cached = null;
}
