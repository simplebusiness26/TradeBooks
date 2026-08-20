export type CategorySuggestionInput = {
  description: string;
  counterparty?: string | null;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  date: string;
  availableCategories: { id: string; name: string; description: string | null }[];
  knownSuppliers: { id: string; name: string }[];
};

export type CategorySuggestion = {
  categoryId: string | null;
  supplierId: string | null;
  /** 0–100. Anything below the auto-apply threshold becomes an Ask Me item. */
  confidence: number;
  reason: string;
  provider: string;
};

export interface AiAdapter {
  readonly name: string;
  readonly available: boolean;
  suggestCategory(input: CategorySuggestionInput): Promise<CategorySuggestion | null>;
}
