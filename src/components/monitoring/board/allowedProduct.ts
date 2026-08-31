type AllowProductImageFields = {
  screenshot_url?: string | null;
  archived_image_urls?: string[] | null;
  gallery_scores?: Array<{ url: string; similarity: number }> | null;
  image_urls?: string[] | null;
  image_url?: string | null;
};

/** Pick the strongest original product image while excluding screenshots and
 * archived enrichment copies, which are not stable visual-learning sources. */
export function preferredAllowedProductImage(
  finding: AllowProductImageFields,
): string | null {
  const blocked = new Set([
    finding.screenshot_url,
    ...(finding.archived_image_urls ?? []),
  ].filter((url): url is string => Boolean(url)));
  const scored = [...(finding.gallery_scores ?? [])]
    .sort((left, right) => right.similarity - left.similarity)
    .map((entry) => entry.url);
  const candidates = [
    ...scored,
    ...(finding.image_urls ?? []),
    finding.image_url,
  ];
  return candidates.find((url): url is string =>
    typeof url === "string" && url.length > 0 && !blocked.has(url)
  ) ?? null;
}
