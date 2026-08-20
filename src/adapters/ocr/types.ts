export type ExtractionField<T> = {
  value: T;
  /** 0–100. */
  confidence: number;
  /** The literal text the value was read from, kept for audit. */
  sourceText?: string;
};

export type ReceiptExtraction = {
  provider: string;
  /** 0–100 overall confidence. 0 means nothing could be read. */
  confidence: number;
  supplierName?: ExtractionField<string>;
  documentDate?: ExtractionField<string>;
  netPence?: ExtractionField<number>;
  vatPence?: ExtractionField<number>;
  grossPence?: ExtractionField<number>;
  vatNumber?: ExtractionField<string>;
  /** Raw provider response, stored verbatim on the document record. */
  raw: Record<string, unknown>;
  /** Set when the provider cannot handle this file type at all. */
  unsupported?: boolean;
  message?: string;
};

export interface OcrAdapter {
  readonly name: string;
  readonly supportsImages: boolean;
  extract(input: { buffer: Buffer; contentType: string; filename: string }): Promise<ReceiptExtraction>;
}
