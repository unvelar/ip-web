const PERSONAL_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

const COUNTRY_CODE_SECOND_LEVELS = new Set([
  "ac",
  "co",
  "com",
  "gov",
  "net",
  "org",
]);

export interface OnboardingIpSuggestion {
  domain: string;
  name: string;
}

export function buildMonitoringKeywords(
  brandNames: string[],
  productTerms: string[],
  limit = 30,
): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const brandName of brandNames) {
    for (const productTerm of productTerms) {
      const normalizedBrandName = brandName.trim();
      const normalizedProductTerm = productTerm.trim();
      if (!normalizedBrandName || !normalizedProductTerm) continue;
      const keyword = `${normalizedBrandName} ${normalizedProductTerm}`.replace(/\s+/g, " ");
      const normalized = keyword.toLocaleLowerCase();
      if (!keyword || seen.has(normalized)) continue;
      seen.add(normalized);
      keywords.push(keyword);
      if (keywords.length >= limit) return keywords;
    }
  }

  return keywords;
}

/**
 * Turn a verified corporate email domain into an editable onboarding hint.
 * This is presentation-only: backend tenant routing remains the source of
 * truth, and the user must still submit the suggested IP name themselves.
 */
export function suggestOnboardingIp(
  email: string | null | undefined,
): OnboardingIpSuggestion | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;

  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "");
  if (PERSONAL_EMAIL_DOMAINS.has(domain)) return null;

  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9-]+$/.test(label))) return null;

  let organizationIndex = labels.length - 2;
  const topLevel = labels.at(-1) ?? "";
  if (
    topLevel.length === 2 &&
    COUNTRY_CODE_SECOND_LEVELS.has(labels[organizationIndex]) &&
    labels.length >= 3
  ) {
    organizationIndex--;
  }

  const organizationLabel = labels[organizationIndex];
  const words = organizationLabel.split("-").filter(Boolean);
  if (words.length === 0) return null;

  const name = words
    .map((word) =>
      word.length <= 3
        ? word.toUpperCase()
        : `${word[0].toUpperCase()}${word.slice(1)}`,
    )
    .join(" ");

  return name ? { domain, name } : null;
}
