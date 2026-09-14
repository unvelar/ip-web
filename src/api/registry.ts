import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

// --- Trademarks ---

export interface BaselineConfig {
  identity_match?: { min_score?: number; min_confidence?: "LOW" | "MEDIUM" | "HIGH" };
  style_fidelity?: { min_similarity?: number; warn_below?: number };
  canonical_proximity?: { k?: number; min_proximity?: number; calibration_percentile?: string };
}

export type MonitoringFrequency = "daily" | "weekly" | "monthly";

export interface Trademark {
  id: string;
  name: string;
  public_slug: string | null;
  tenant_public_slug: string | null;
  description: string | null;
  monitoring_identity?: MonitoringIdentity;
  /** Monitoring keywords proposed by the wizard's VLM step + user edits. */
  keywords: string[];
  monitoring_frequency: MonitoringFrequency;
  image_count: number;
  indexed_count: number;
  centroid_dino: number[] | null;
  centroid_clip: number[] | null;
  guidelines: string | null;
  baseline_config: BaselineConfig | null;
  created_at: string;
}

export interface TrademarkImage {
  id: string;
  trademark_id: string;
  storage_path: string;
  url: string;
  status: string;
  created_at: string;
}

export type IpOnboardingState =
  | "setup_required"
  | "processing"
  | "delayed"
  | "active"
  | "needs_attention";

export type IpOnboardingCheckStatus =
  | "complete"
  | "processing"
  | "waiting"
  | "missing"
  | "attention";

export type MonitoringSourceSetupStatus =
  | "ready"
  | "processing"
  | "retry_needed";

export interface IpOnboardingStatus {
  state: IpOnboardingState;
  customer_action_required: boolean;
  title: string;
  message: string;
  checks: Array<{
    key: "reference_images" | "keywords" | "monitoring_sources" | "first_scan";
    label: string;
    status: IpOnboardingCheckStatus;
    detail: string;
  }>;
  progress: {
    reference_images: {
      total: number;
      indexed: number;
      pending: number;
      failed: number;
    };
    keywords: { total: number };
    monitoring_sources: {
      total: number;
      ready: number;
      pending: number;
      processing: number;
      retry_needed: number;
      source_statuses: Array<{
        source_id: string;
        status: MonitoringSourceSetupStatus;
      }>;
    };
    first_scan: {
      total: number;
      completed: number;
      pending: number;
    };
  };
}

export interface KeywordLearningCandidate {
  keyword: string;
  normalized_keyword: string;
  score: number;
  confidence: "emerging" | "medium" | "high";
  evidence: {
    finding_count: number;
    seller_count: number;
    source_count: number;
    first_observed_at: string;
    last_observed_at: string;
    sample_titles: string[];
  };
}

export interface KeywordLearningPerformance {
  decision_id: string;
  keyword: string;
  normalized_keyword: string;
  activated_at: string | null;
  monitoring_runs: number;
  findings_found: number;
  reviewed_findings: number;
  actionable_findings: number;
  dismissed_findings: number;
  last_run_at: string | null;
}

export interface KeywordLearningReport {
  state:
    | "collecting_evidence"
    | "suggestions_ready"
    | "testing_keywords"
    | "producing_results"
    | "no_results_yet";
  generated_at: string;
  evidence: {
    findings_analyzed: number;
    seller_count: number;
    source_count: number;
    lookback_days: number;
  };
  metrics: {
    new_suggestions: number;
    approved_keywords: number;
    rejected_keywords: number;
    monitoring_runs: number;
    findings_from_learned_keywords: number;
    reviewed_findings: number;
    actionable_findings: number;
    dismissed_findings: number;
    productive_keywords: number;
  };
  suggestions: KeywordLearningCandidate[];
  approved_keywords: KeywordLearningPerformance[];
  rejected_keywords: Array<{ keyword: string; reviewed_at: string }>;
}

export interface TrademarkSelector {
  id: string;
  name: string;
}

type TrademarkRecord = Omit<Trademark, "image_count" | "indexed_count">;

function requireTrademark(value: unknown): asserts value is TrademarkRecord & Record<string, unknown> {
  requireResponse(isRecord(value) && typeof value.id === "string" && value.id.length > 0 &&
    typeof value.name === "string" && Array.isArray(value.keywords) &&
    value.keywords.every((keyword) => typeof keyword === "string"), "IP response");
}

export function parseTrademarkList(value: unknown): { trademarks: Trademark[] } {
  requireResponse(isRecord(value) && Array.isArray(value.trademarks), "IP list");
  for (const trademark of value.trademarks) {
    requireTrademark(trademark);
    requireResponse(isRecord(trademark) && typeof trademark.image_count === "number" &&
      Number.isFinite(trademark.image_count) && typeof trademark.indexed_count === "number" &&
      Number.isFinite(trademark.indexed_count), "IP summary");
  }
  return { trademarks: value.trademarks as Trademark[] };
}

export async function listTrademarks(signal?: AbortSignal) {
  return parseTrademarkList(await request<unknown>("/api/ip", { signal }));
}

export function listTrademarkSelectors(signal?: AbortSignal) {
  return request<{ ips: TrademarkSelector[] }>("/api/ip/selector", { signal });
}

export function listPublicTrademarks() {
  return request<{ trademarks: Trademark[] }>("/api/ip/public");
}

// --- Catalog browse (paginated + searchable) ---

export interface TrademarkCatalogItem {
  id: string;
  application_number: string;
  source: string;
  verbal_element: string | null;
  mark_kind: string | null;
  status: string | null;
  application_date: string | null;
  registration_date: string | null;
  nice_classes: number[];
  image_count: number;
  detail_url: string | null;
  image_url: string | null;
}

export interface DesignCatalogItem {
  id: string;
  registration_id: string;
  base_id: string;
  design_office: string | null;
  product_class: string | null;
  status: string | null;
  wipo_link: string | null;
  image_count: number;
  image_url: string | null;
}

export interface CatalogPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function browseTrademarkCatalog(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.limit !== undefined) p.set("limit", String(opts.limit));
  if (opts.offset !== undefined) p.set("offset", String(opts.offset));
  const qs = p.toString();
  return request<CatalogPage<TrademarkCatalogItem>>(`/api/ip/catalog/browse${qs ? `?${qs}` : ""}`);
}

export function browseDesignCatalog(opts: { q?: string; limit?: number; offset?: number } = {}) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.limit !== undefined) p.set("limit", String(opts.limit));
  if (opts.offset !== undefined) p.set("offset", String(opts.offset));
  const qs = p.toString();
  return request<CatalogPage<DesignCatalogItem>>(`/api/design-match/catalog/browse${qs ? `?${qs}` : ""}`);
}

/**
 * Step 1 of the IP-creation wizard. Just the name — description, keywords,
 * and guidelines are added through subsequent wizard steps via updateTrademark.
 */
export function createTrademark(name: string) {
  return request<{ trademark: Trademark }>("/api/ip", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function parseTrademarkDetail(value: unknown, expectedId: string): { trademark: Trademark; images: TrademarkImage[] } {
  requireResponse(isRecord(value) && Array.isArray(value.images), "IP details");
  requireTrademark(value.trademark);
  requireResponse(value.trademark.id === expectedId, "IP details");
  for (const image of value.images) {
    requireResponse(isRecord(image) && typeof image.id === "string" &&
      image.trademark_id === expectedId && typeof image.url === "string" &&
      typeof image.status === "string", "reference image");
  }
  const images = value.images as TrademarkImage[];
  // The detail endpoint returns the IP record without summary counts. Derive
  // them from its complete image list, matching the summary endpoint's rules.
  return {
    trademark: { ...value.trademark, image_count: images.length, indexed_count: images.filter((image) => image.status === "indexed").length },
    images,
  };
}

export async function getTrademark(id: string, signal?: AbortSignal) {
  return parseTrademarkDetail(await request<unknown>(`/api/ip/${encodeURIComponent(id)}`, { signal }), id);
}

export function getIpOnboardingStatus(id: string, signal?: AbortSignal) {
  return request<{ status: IpOnboardingStatus }>(`/api/ip/${id}/onboarding-status`, { signal });
}

export async function getKeywordLearningReport(id: string, signal?: AbortSignal) {
  const response = await request<{ report?: KeywordLearningReport }>(
    `/api/ip/${id}/keyword-learning`,
    { signal },
  );
  if (!response.report) throw new Error("Keyword learning report is unavailable.");
  return { report: response.report };
}

export function reviewKeywordLearningSuggestion(
  id: string,
  keyword: string,
  action: "approve" | "reject",
) {
  return request<{ report: KeywordLearningReport; keywords: string[] }>(
    `/api/ip/${id}/keyword-learning/review`,
    { method: "POST", body: JSON.stringify({ keyword, action }) },
  );
}

export function deleteTrademark(id: string) {
  return request<{ ok: boolean }>(`/api/ip/${id}`, { method: "DELETE" });
}

export function updateTrademark(
  id: string,
  patch: {
    name?: string;
    description?: string;
    guidelines?: string | null;
    baseline_config?: BaselineConfig | null;
    keywords?: string[];
    monitoring_frequency?: MonitoringFrequency;
    monitoring_identity?: MonitoringIdentity;
  }
) {
  return request<{ trademark: Trademark }>(`/api/ip/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function setIpMonitoringFrequency(ipId: string, frequency: MonitoringFrequency) {
  return updateTrademark(ipId, { monitoring_frequency: frequency });
}

export async function uploadTrademarkImages(trademarkId: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("images", f);

  return request<{ job_id: string; images_uploaded: number }>(`/api/ip/${trademarkId}/images`, {
    method: "POST",
    body: form,
  });
}

export function deleteTrademarkImage(trademarkId: string, imageId: string) {
  return request<{ ok: boolean }>(`/api/ip/${trademarkId}/images/${imageId}`, { method: "DELETE" });
}

export function importOnboardingWebsiteReference(trademarkId: string) {
  return request<{
    imported: boolean;
    job_id: string | null;
    reason?: "not_applicable" | "image_unavailable" | "fetch_failed";
  }>(
    `/api/ip/${trademarkId}/onboarding-reference`,
    { method: "POST" },
  );
}



export interface MonitoringIdentity {
  aliases: string[];
  brands: string[];
  categories: string[];
}
