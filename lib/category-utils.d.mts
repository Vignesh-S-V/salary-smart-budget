export const MEAT_CATEGORY: string;
export const CATEGORIES: string[];
export function categorySuggestion(item: string): {
  category: string;
  matched: boolean;
  examples: string;
};
