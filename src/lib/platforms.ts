export interface MonitoringPlatformOption {
  value: string;
  label: string;
  popular?: boolean;
}

/**
 * Sources offered by the monitoring picker. Keep the catalog separate from the
 * UI so the list can grow without making the creation flow harder to scan.
 */
export const MONITORING_PLATFORM_OPTIONS: MonitoringPlatformOption[] = [
  { value: "amazon.com", label: "Amazon", popular: true },
  { value: "ebay.com", label: "eBay", popular: true },
  { value: "etsy.com", label: "Etsy", popular: true },
  { value: "aliexpress.com", label: "AliExpress", popular: true },
  { value: "facebook.com/marketplace", label: "Facebook Marketplace", popular: true },
  { value: "vinted.com", label: "Vinted", popular: true },
  { value: "alibaba.com", label: "Alibaba" },
  { value: "bol.com", label: "bol.com" },
  { value: "google.com/shopping", label: "Google Shopping" },
  { value: "marktplaats.nl", label: "Marktplaats" },
  { value: "subito.it", label: "Subito" },
  { value: "vinted.es", label: "Vinted Spain" },
  { value: "es.wallapop.com", label: "Wallapop Spain" },
  { value: "es.aliexpress.com", label: "AliExpress Spain" },
  { value: "blocket.se", label: "Blocket" },
];

export const KNOWN_PLATFORMS = MONITORING_PLATFORM_OPTIONS.map((platform) => platform.value);

/**
 * Human-readable marketplace name. Catalog entries preserve intentional brand
 * casing (such as "eBay"); domains that are not in the catalog still get a
 * useful label derived from their registrable-domain segment.
 */
export function monitoringPlatformLabel(domain: string): string {
  const normalizedDomain = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
  const knownLabel = MONITORING_PLATFORM_OPTIONS.find(
    (platform) => platform.value === normalizedDomain,
  )?.label;
  if (knownLabel) return knownLabel;

  const hostname = normalizedDomain.split(/[/?#]/, 1)[0].split(":", 1)[0];
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) return domain;

  // In country-code domains such as example.co.uk, `co` is the suffix rather
  // than the marketplace name. Other subdomains do not need special handling.
  const commonSecondLevelSuffixes = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  const hasCountryCodeSuffix =
    parts.at(-1)?.length === 2 && commonSecondLevelSuffixes.has(parts.at(-2) ?? "");
  const name = parts.at(hasCountryCodeSuffix ? -3 : -2);
  if (!name) return domain;

  return name
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
