import type { MonitoredDomain } from "./monitoringSettings";
import type { IpReviewFinding } from "./reviews";
import { API, authHeaders, request } from "./transport";

// --- IP-scoped monitoring (platforms + findings live under the IP) ---

/** Platforms (monitored domains) wired to a single IP. */
export function listIpMonitoringPlatforms(ipId: string, signal?: AbortSignal) {
  return request<{ platforms: MonitoredDomain[] }>(
    `/api/ip/${ipId}/monitoring/platforms`,
    { signal },
  );
}

/** Add a platform by bare host or full URL — the backend normalises it.
 *  `country` (ISO-2) optionally routes scrapes through a residential proxy in
 *  that country; omit/empty for the default egress. */
export function addIpMonitoringPlatform(
  ipId: string,
  domain: string,
  country?: string | null,
  searchUrlTemplate?: string,
) {
  return request<{ platform: MonitoredDomain; jobs_enqueued: number }>(
    `/api/ip/${ipId}/monitoring/platforms`,
    {
      method: "POST",
      body: JSON.stringify({
        domain,
        country: country ?? null,
        ...(searchUrlTemplate ? { search_url_template: searchUrlTemplate } : {}),
      }),
    },
  );
}

export interface OpenWebSearchConfig {
  search_scopes?: string[];
  query_templates?: string[];
  max_candidates?: number;
  per_query_limit?: number;
  strict_gate?: boolean;
}

export function upsertIpOpenWebSearch(ipId: string, config: Partial<OpenWebSearchConfig>) {
  return request<{ source: MonitoredDomain; jobs_enqueued: number }>(
    `/api/ip/${ipId}/monitoring/open-web-search`,
    { method: "POST", body: JSON.stringify({ config }) },
  );
}

export function updateIpOpenWebSearch(
  ipId: string,
  sourceId: string,
  patch: { enabled?: boolean; config?: Partial<OpenWebSearchConfig> },
) {
  return request<{ source: MonitoredDomain }>(
    `/api/ip/${ipId}/monitoring/open-web-search/${sourceId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function setIpMonitoringPlatformEnabled(
  ipId: string,
  domainId: string,
  enabled: boolean,
) {
  return request<{ platform: MonitoredDomain }>(
    `/api/ip/${ipId}/monitoring/platforms/${domainId}`,
    { method: "PATCH", body: JSON.stringify({ enabled }) },
  );
}

/** Set (or clear, with null) the scrape-from country for a platform. */
export function setIpMonitoringPlatformCountry(
  ipId: string,
  domainId: string,
  country: string | null,
) {
  return request<{ platform: MonitoredDomain }>(
    `/api/ip/${ipId}/monitoring/platforms/${domainId}`,
    { method: "PATCH", body: JSON.stringify({ country }) },
  );
}

export function removeIpMonitoringPlatform(ipId: string, domainId: string) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/platforms/${domainId}`,
    { method: "DELETE" },
  );
}

/** Stop monitoring an IP entirely — removes all its watched platforms. */
export function removeIpMonitoring(ipId: string) {
  return request<{ ok: boolean; removed: number }>(
    `/api/ip/${ipId}/monitoring`,
    { method: "DELETE" },
  );
}

/** "Refresh now" — fans out one run per linked platform server-side. */
export function triggerIpMonitoringRun(ipId: string) {
  return request<{ jobs_enqueued: number }>(`/api/ip/${ipId}/monitoring/runs`, {
    method: "POST",
  });
}

/** Refresh one monitored platform for this IP. */
export function triggerIpMonitoringPlatformRun(_ipId: string, domainId: string) {
  return request<{ jobs: unknown[] }>("/api/monitoring/runs", {
    method: "POST",
    body: JSON.stringify({ domain_id: domainId }),
  });
}

export function listIpMonitoringFindings(
  ipId: string,
  opts: { include_dismissed?: boolean } = {},
) {
  const params = new URLSearchParams();
  if (opts.include_dismissed) params.set("include_dismissed", "true");
  const qs = params.toString();
  return request<{
    findings: IpReviewFinding[];
    monitoring_run_in_progress: boolean;
  }>(`/api/ip/${ipId}/monitoring/findings${qs ? `?${qs}` : ""}`);
}

export type MonitoringReviewOutcome =
  | "false_positive"
  | "do_not_pursue"
  | "second_hand"
  | "manual_cleared"
  | "licensed"
  | "allowed_product"
  | "resale";

export type MonitoringDismissReasonCode =
  | "different_product"
  | "genuine_second_hand"
  | "original_packaging_only"
  | "compatibility_only"
  | "unrelated_mention";

export type MonitoringDismissOptions = {
  reason?: MonitoringReviewOutcome;
  reason_code?: MonitoringDismissReasonCode;
  reason_notes?: string | null;
};

export function dismissIpFinding(
  ipId: string,
  resultId: string,
  opts: MonitoringDismissOptions = {},
) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/dismiss`,
    { method: "POST", body: JSON.stringify(opts) },
  );
}

export function allowIpFindingProductImage(
  ipId: string,
  resultId: string,
  opts: { image_url?: string | null; reason_notes?: string | null } = {},
) {
  return request<{
    ok: boolean;
    queued: boolean;
    job_id: string;
    dismissed: number;
  }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/allow-product-image`,
    { method: "POST", body: JSON.stringify(opts) },
  );
}

export interface IpAllowedProductImage {
  id: number;
  ip_catalog_id: string;
  source_case_id: string | null;
  source_result_id: string | null;
  source_page_url: string | null;
  image_url: string | null;
  reason_notes: string | null;
  allowed_by: string | null;
  allowed_by_display_name?: string | null;
  allowed_by_email?: string | null;
  allowed_at: string;
}

export function listAllowedProductImages(ipId: string) {
  return request<{ allowed_product_images: IpAllowedProductImage[] }>(
    `/api/ip/${ipId}/allowed-product-images`,
  );
}

export function deleteAllowedProductImage(ipId: string, allowedImageId: number) {
  return request<{ ok: true }>(
    `/api/ip/${ipId}/allowed-product-images/${allowedImageId}`,
    { method: "DELETE" },
  );
}

export function undismissIpFinding(ipId: string, resultId: string) {
  return request<{ ok: boolean; restored: number }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/undismiss`,
    { method: "POST" },
  );
}

/** Monitoring finding state transitions (all require the finding to have a linked
 *  case). Triage can pause in review, wait in takedown_pending for legal handling,
 *  move to takedown_sent on submission, then enforced. Reopen returns to pending. */
export function markIpFindingNeedsReview(ipId: string, resultId: string) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/review`,
    { method: "POST" },
  );
}
export function markIpFindingEnforced(ipId: string, resultId: string) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/enforce`,
    { method: "POST" },
  );
}
export function reopenIpFinding(ipId: string, resultId: string) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/reopen`,
    { method: "POST" },
  );
}

/** Re-enqueue the enrichment job for a finding — re-scrapes the listing,
 *  re-runs the VLM extract, and re-scores + re-localizes the gallery photos.
 *  Useful when the original enrichment ran before a worker fix landed, or
 *  the listing page changed (more photos, edited title, etc.). */
export function reenrichIpFinding(ipId: string, resultId: string) {
  return request<{ ok: boolean }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/reenrich`,
    { method: "POST" },
  );
}

/**
 * Fetch a per-finding takedown packet with the bearer token attached and
 * open it in a new tab. Anchor `href` navigation doesn't carry the
 * Authorization header, so the request would 401 — instead we pull the
 * PDF as a Blob and hand the browser a blob: URL.
 */
export async function openIpFindingTakedownPacket(
  ipId: string,
  resultId: string,
): Promise<void> {
  const headers: Record<string, string> = {};
  authHeaders(headers);
  const res = await fetch(
    `${API}/api/ip/${ipId}/monitoring/findings/${resultId}/takedown-packet.pdf`,
    { headers },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  // Revoke after a beat — early revoke kills the open in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
