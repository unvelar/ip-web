export interface MonitoringPlatformOption {
  value: string;
  label: string;
  popular?: boolean;
  searchUrlTemplate?: string;
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
  {
    value: "google.com/shopping",
    label: "Google Shopping",
    searchUrlTemplate: "https://www.google.com/search?tbm=shop&q={q}",
  },
  { value: "marktplaats.nl", label: "Marktplaats" },
  { value: "subito.it", label: "Subito" },
  { value: "vinted.es", label: "Vinted Spain" },
  { value: "es.wallapop.com", label: "Wallapop Spain" },
  { value: "es.aliexpress.com", label: "AliExpress Spain" },
  { value: "blocket.se", label: "Blocket" },
];

export const KNOWN_PLATFORMS = MONITORING_PLATFORM_OPTIONS.map((platform) => platform.value);

export function monitoringPlatformOption(value: string): MonitoringPlatformOption | undefined {
  return MONITORING_PLATFORM_OPTIONS.find((platform) => platform.value === value);
}

export function monitoringPlatformLabel(domain: string): string {
  return MONITORING_PLATFORM_OPTIONS.find((platform) => platform.value === domain)?.label ?? domain;
}
