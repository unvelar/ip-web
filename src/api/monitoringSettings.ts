import type { MonitoringSourceSetupStatus } from "./registry";
import { request } from "./transport";

// --- Brand monitoring (scrape target sites for IP infringements) ---

export interface MonitoredDomain {
  id: string;
  tenant_id: string;
  domain: string;
  source_type: "domain" | "web_search";
  display_name: string | null;
  source_config: Record<string, unknown>;
  /** Linked IP — keywords for the scrape come from the IP, not this row. */
  ip_catalog_id: string | null;
  /** Convenience fields surfaced by GET /api/monitoring/domains (JOINed). */
  ip_name: string | null;
  ip_keywords: string[] | null;
  recipe: Record<string, unknown> | null;
  recipe_updated_at: string | null;
  api_route?: {
    provider: string;
    mode: "disabled" | "shadow" | "required";
    configured: boolean;
    execution_route: "browser" | "marketplace_api";
    browser_fallback_allowed: boolean;
    capabilities: string[];
    configuration_error: string | null;
    snapshot_retention_hours: number | null;
  } | null;
  /** Customer-facing readiness for this source's scrape setup. */
  setup_status?: MonitoringSourceSetupStatus;
  /** At least one currently validated search route or configured API connection. */
  connected?: boolean;
  last_run_at: string | null;
  enabled: boolean;
  zero_yield_streak: number;
  /** Optional ISO-2 country to scrape from (residential proxy egress). */
  country: string | null;
  created_at: string;
}

export interface ReverseSearchRun {
  id: string;
  tenant_id: string;
  trademark_id: string | null;
  domain_id: string | null;
  keyword: string | null;
  job_id: string | null;
  status: string;
  images_searched: number;
  results_found: number;
  results_after_filter: number;
  cases_created: number;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MonitoringSettings {
  monitoring_enabled: boolean;
}

export function listMonitoredDomains(signal?: AbortSignal) {
  return request<{ domains: MonitoredDomain[] }>("/api/monitoring/domains", { signal });
}

export function createMonitoredDomain(domain: string, ip_catalog_id: string) {
  return request<{ domain: MonitoredDomain }>("/api/monitoring/domains", {
    method: "POST",
    body: JSON.stringify({ domain, ip_catalog_id }),
  });
}

export function updateMonitoredDomain(
  id: string,
  patch: {
    ip_catalog_id?: string;
    enabled?: boolean;
    recipe?: Record<string, unknown> | null;
  },
) {
  return request<{ domain: MonitoredDomain | null }>(`/api/monitoring/domains/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteMonitoredDomain(id: string) {
  return request<{ ok: boolean }>(`/api/monitoring/domains/${id}`, {
    method: "DELETE",
  });
}

export function listMonitoringRuns(opts: { domain_id?: string; limit?: number } = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (opts.domain_id) params.set("domain_id", opts.domain_id);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request<{ runs: ReverseSearchRun[] }>(
    `/api/monitoring/runs${qs ? `?${qs}` : ""}`,
    { signal },
  );
}

export function triggerMonitoringRun(domainId: string, keyword?: string) {
  return request<{ jobs: Array<{ id: string; type: string; status: string }> }>(
    "/api/monitoring/runs",
    {
      method: "POST",
      body: JSON.stringify({ domain_id: domainId, keyword }),
    },
  );
}

export function getMonitoringSettings() {
  return request<{ settings: MonitoringSettings | null }>("/api/monitoring/settings");
}

export function updateMonitoringSettings(patch: {
  enabled?: boolean;
}) {
  return request<{ settings: MonitoringSettings | null }>("/api/monitoring/settings", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface MonitoringPreset {
  key: string;
  label: string;
  recipe: Record<string, unknown>;
}

export function listMonitoringPresets() {
  return request<{ presets: MonitoringPreset[] }>("/api/monitoring/presets");
}
