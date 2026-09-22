import { isApiError, request } from "./transport";
import { isRecord, requireResponse } from "./validation";
import { legacySourceOptions, websiteHost, type MonitoringSourceOption } from "../lib/websiteCatalog";

export interface WebsiteActivity extends MonitoringSourceOption {
  findings: number | null;
  monitored_ips: number | null;
  other_brands: number | null;
}

export interface WebsiteCatalog {
  scope: "all_brands" | "workspace";
  websites: WebsiteActivity[];
}

export function parseWebsiteCatalog(value: unknown): WebsiteCatalog {
  requireResponse(isRecord(value) && (value.scope === "all_brands" || value.scope === "workspace")
    && Array.isArray(value.websites), "source catalog");
  const seen = new Set<string>();
  const websites = value.websites.map((row: unknown): WebsiteActivity => {
    requireResponse(isRecord(row) && (row.kind === "domain" || row.kind === "search" || row.kind === "pattern")
      && typeof row.key === "string" && row.key.length > 0 && !seen.has(row.key)
      && typeof row.name === "string" && row.name.trim().length > 0
      && typeof row.value === "string" && row.value.length > 0
      && typeof row.domain === "string" && row.domain.length > 0
      && (row.search_url_template === null || typeof row.search_url_template === "string")
      && [row.findings, row.monitored_ips, row.other_brands].every((n) => n === null ||
        (typeof n === "number" && Number.isSafeInteger(n) && n >= 0)), "source catalog");
    requireResponse(row.kind === "pattern" || websiteHost(row.value) === row.domain, "source catalog");
    seen.add(row.key);
    return { key: row.key, kind: row.kind, name: row.name, value: row.value, domain: row.domain,
      search_url_template: row.search_url_template, findings: row.findings as number | null,
      monitored_ips: row.monitored_ips as number | null, other_brands: row.other_brands as number | null };
  });
  return { scope: value.scope, websites };
}

export async function getWebsiteCatalog(signal?: AbortSignal): Promise<WebsiteCatalog> {
  try {
    return parseWebsiteCatalog(await request<unknown>("/api/monitoring/website-catalog", { signal }));
  } catch (error) {
    if (!isApiError(error, 404)) throw error;
    const [domains, summary] = await Promise.all([
      request<{ domains: Array<{ domain: string; display_name?: string | null; source_type: string; ip_catalog_id: string | null; enabled: boolean }> }>("/api/monitoring/domains", { signal }),
      request<{ platforms: Array<{ domain: string; findings: number }> }>("/api/monitoring/dashboard/summary", { signal }),
    ]);
    requireResponse(Array.isArray(domains.domains) && Array.isArray(summary.platforms), "source catalog");
    const rows = new Map<string, WebsiteActivity>(legacySourceOptions().map(source => [source.key, {
      ...source, findings: null, monitored_ips: null, other_brands: null,
    }]));
    const ips = new Map<string, Set<string>>();
    for (const row of domains.domains) {
      if (row.source_type !== "domain") continue;
      requireResponse(typeof row.domain === "string" && typeof row.enabled === "boolean"
        && (row.ip_catalog_id === null || typeof row.ip_catalog_id === "string"), "source catalog");
      const domain = websiteHost(row.domain);
      requireResponse(domain, "source catalog");
      const key = `domain:${domain}`;
      const existing = rows.get(key);
      rows.set(key, { key, kind: "domain", domain, name: existing?.name || row.display_name?.trim() || domain,
        value: existing?.value ?? domain, search_url_template: existing?.search_url_template ?? null,
        findings: 0, monitored_ips: 0, other_brands: null });
      const monitored = ips.get(key) ?? new Set<string>();
      if (row.enabled && row.ip_catalog_id) monitored.add(row.ip_catalog_id);
      ips.set(key, monitored);
    }
    for (const row of summary.platforms) {
      requireResponse(typeof row.domain === "string" && Number.isSafeInteger(row.findings) && row.findings >= 0, "source catalog");
      const key = `domain:${websiteHost(row.domain)}`;
      // Findings destinations never create catalog entries. Search attribution
      // is unavailable on the old API, so search-engine counts remain unknown.
      const source = rows.get(key);
      if (source && ips.has(key)) source.findings = (source.findings ?? 0) + row.findings;
    }
    return parseWebsiteCatalog({ scope: "workspace", websites: [...rows.values()].map(row => ({
      ...row, monitored_ips: ips.has(row.key) ? ips.get(row.key)!.size : null,
    })) });
  }
}
