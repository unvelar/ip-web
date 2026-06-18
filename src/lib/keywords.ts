const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 120;
const KEYWORD_SEPARATOR = /[,\n]+/;
const TRAILING_SEPARATOR = /[,\n]\s*$/;

export function parseKeywordDraft(draft: string): string[] {
  return draft
    .split(KEYWORD_SEPARATOR)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0 && keyword.length <= MAX_KEYWORD_LENGTH);
}

function appendKeywords(existing: string[], candidates: string[]): string[] {
  const seen = new Set(existing.map((keyword) => keyword.toLowerCase()));
  const merged = [...existing];

  for (const raw of candidates) {
    const keyword = raw.trim();
    if (!keyword || keyword.length > MAX_KEYWORD_LENGTH) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(keyword);
    if (merged.length >= MAX_KEYWORDS) break;
  }

  return merged;
}

export function mergeKeywords(existing: string[], draft: string): string[] {
  return appendKeywords(existing, parseKeywordDraft(draft));
}

export function consumeCommittedKeywords(
  existing: string[],
  draft: string,
): { keywords: string[]; draft: string } {
  if (!KEYWORD_SEPARATOR.test(draft)) {
    return { keywords: existing, draft };
  }

  const parts = draft.split(KEYWORD_SEPARATOR);
  const remainder = TRAILING_SEPARATOR.test(draft) ? "" : (parts.pop() ?? "").trimStart();

  return {
    keywords: appendKeywords(existing, parts),
    draft: remainder,
  };
}
