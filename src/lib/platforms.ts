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
