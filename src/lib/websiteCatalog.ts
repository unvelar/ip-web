import type { WebsiteActivity } from "../api/websiteCatalog";
import { MONITORING_PLATFORM_OPTIONS } from "./platforms";

export type MonitoringSourceKind = "domain" | "search" | "pattern";
export interface MonitoringSourceOption {
  key: string;
  kind: MonitoringSourceKind;
  name: string;
  value: string;
  domain: string;
  search_url_template: string | null;
}

/** Match the backend's host-based monitoring identity without merging regions. */
export function websiteHost(value: string): string {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Compatibility for older APIs only. Once available, the database catalog owns
// names, targets, search templates and the complete set of offered sources.
export function legacySourceOptions(): MonitoringSourceOption[] {
  return [
    ...MONITORING_PLATFORM_OPTIONS.map(option => ({
      key: `domain:${websiteHost(option.value)}`, kind: "domain" as const,
      name: option.label, value: option.value, domain: websiteHost(option.value),
      search_url_template: option.searchUrlTemplate ?? null,
    })),
    ...[
      { key: "google", value: "google.com", name: "Google" },
      { key: "bing", value: "bing.com", name: "Bing" },
      { key: "duckduckgo", value: "duckduckgo.com", name: "DuckDuckGo" },
      { key: "brave", value: "search.brave.com", name: "Brave" },
    ].map(option => ({ ...option, key: `search:${option.key}`, kind: "search" as const,
      domain: option.value, search_url_template: null })),
    { key: "pattern:*.myshopify.com", kind: "pattern", name: "Shopify", value: "*.myshopify.com",
      domain: "*.myshopify.com", search_url_template: null },
  ];
}

export interface WebsiteOption extends MonitoringSourceOption {
  activity: WebsiteActivity | null;
}

export function websiteOptions(activity: WebsiteActivity[] | null, patterns: string[] = []): WebsiteOption[] {
  const options = new Map<string, WebsiteOption>();
  for (const source of activity ?? legacySourceOptions()) {
    options.set(source.key, { ...source, activity: activity ? source as WebsiteActivity : null });
  }
  // Unsaved user patterns belong to this editor, not to the shared catalog.
  for (const raw of patterns) {
    const value = raw === "myshopify.com" ? "*.myshopify.com" : raw;
    const key = `pattern:${value}`;
    if (!options.has(key)) options.set(key, { key, kind: "pattern", name: value,
      value, domain: value, search_url_template: null, activity: null });
  }
  return [...options.values()];
}
