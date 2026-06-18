const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 120;

export function parseKeywordDraft(draft: string): string[] {
  return draft
    .split(/[,\n]+/)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && keyword.length <= MAX_KEYWORD_LENGTH);
}

export function mergeKeywords(existing: string[], draft: string): string[] {
  const seen = new Set(existing.map((keyword) => keyword.toLowerCase()));
  const merged = [...existing];

  for (const keyword of parseKeywordDraft(draft)) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(keyword);
    if (merged.length >= MAX_KEYWORDS) break;
  }

  return merged;
}
