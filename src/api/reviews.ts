export interface ProtectedTermAssessment {
  policy_version: string;
  configuration_revision: number;
  outcome: "matched" | "not_matched" | "unclear";
  listing: { title: string; description: string; captured_at: string; page_url: string; source: string };
  decisions: Array<{ term_id: string; term: string; use: string; confidence: number;
    item_for_sale: string; explanation: string; resale_considered: string;
    evidence: Array<{ field: "title" | "description"; quote: string; start?: number; end?: number }>;
    visual_use: string; visual_explanation: string }>;
}

import type { CaseReviewStatus, SaleType, SaleUrgencyBand } from "./cases";
import type {
  SellerSalesObservation,
  ListingAuthenticityAssessment,
  ListingConditionAssessment,
  MonitoringActionability,
  MonitoringCandidateOutcome,
  MonitoringDecisionFactor,
  MonitoringDecisionReasonCategory,
  ProductAuthenticityAssessment,
} from "./monitoring";
import type { TakedownLegalQueueReason } from "./takedowns";
import { API, authHeaders, request } from "./transport";

// --- IP Reviews (guided legal-grade workflow) ---

export type IpReviewMode = "clearance" | "monitoring";
export type IpReviewStatus = "processing" | "complete" | "failed";
export type IpReviewDecision = "cleared" | "not_cleared";

export type RightsType = "copyright" | "trademark" | "design" | "publicity";
export type RiskBand = "high" | "medium" | "low" | "clear";

export interface IpReviewSegment {
  risk_band: RiskBand;
  top_score: number;
  match_ids: string[];
}

export interface IpReviewMatch {
  id: string;
  ip_name: string;
  trademark_id: string | null;
  catalog_source: string;
  rights_types: RightsType[];
  scores: {
    visual_similarity: number;
    structural_inliers: number;
    ocr_match: number;
    calibrator_combined: number;
  };
  region: string | null;
  bbox: number[] | null;
  in_scope_territories: string[];
  category_overlap: boolean;
  evidence: string[];
  justification: string | null;
  closest_ref: string | null;
  reference_images: { id: string; image_url: string }[];
  // "lookalike" for entries in IpReviewResult.lookalikes — visually close but
  // a distinct IP per the VLM.
  relationship?: "lookalike";
}

export interface IpReviewResult {
  asset_image_path: string;
  image_width: number;
  image_height: number;
  segments: Record<RightsType, IpReviewSegment>;
  matches: IpReviewMatch[];
  // Visually-similar-but-distinct IPs (e.g. Wooloo for a Lamball query),
  // surfaced as a secondary band separate from the exact-IP `matches`.
  lookalikes?: IpReviewMatch[];
  verdict_lines: string[];
  scope_disclosure: string[];
  context_echo: Record<string, unknown>;
}

export interface IpReview {
  id: string;
  tenant_id: string;
  account_id: string;
  job_id: string | null;
  mode: IpReviewMode;
  title: string;
  status: IpReviewStatus;
  asset_image_path: string;
  asset_name: string | null;
  asset_type: string | null;
  intended_use: string | null;
  territories: string[];
  product_categories: string[];
  asset_placement: string | null;
  inspiration_board_paths: string[];
  notes: string | null;
  result: IpReviewResult | null;
  decision: IpReviewDecision | null;
  decision_rationale: string | null;
  decided_by_account_id: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  // Monitoring-mode fields (NULL/empty for clearance mode):
  monitored_ip_catalog_id: string | null;
  approved_licensees: string[];
  monitored_platforms: string[];
  // Annotated on response:
  asset_image_url?: string;
  inspiration_image_urls?: string[];
  monitored_ip?: { id: string; name: string } | null;
  monitoring_run_in_progress?: boolean;
  findings?: IpReviewFinding[];
  match_decisions?: IpReviewMatchDecision[];
  // Inbox counts — populated by GET /api/ip-reviews list responses.
  // Clearance: flagged matches awaiting a locked decision.
  // Monitoring: undismissed, non-licensee findings.
  flagged_match_count?: number;
  open_findings_count?: number;
}

export type IpReviewMatchDecisionValue = "flag" | "dismiss";

export type AnnotationShape =
  | { kind: "pen"; points: [number, number][]; color: string; width: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number; color: string; width: number }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; size: number };

export interface IpReviewMatchDecision {
  review_id: string;
  match_id: string;
  decision: IpReviewMatchDecisionValue;
  note: string | null;
  annotations: AnnotationShape[] | null;
  decided_by_account_id: string | null;
  decided_at: string;
}

/**
 * Inbox classification: does this review need lawyer attention?
 *
 * - `processing` / `failed` always need attention (regardless of mode).
 * - Clearance: needs attention until a `decision` is locked.
 * - Monitoring: needs attention while at least one open finding remains
 *   (open = not dismissed, not an approved-licensee hit). Worker-set
 *   `open_findings_count` comes from the list endpoint.
 *
 * Shared between the clearance task list and AppShell (top-bar attention
 * badge) — keep them in sync by exporting from one place.
 */
export function needsAttention(r: IpReview): boolean {
  if (r.status === "processing") return true;
  if (r.status === "failed") return true;
  if (r.mode === "clearance") return !r.decision;
  if (r.mode === "monitoring") return (r.open_findings_count ?? 0) > 0;
  return false;
}

export function setIpReviewMatchDecision(
  reviewId: string,
  matchId: string,
  patch: {
    decision: IpReviewMatchDecisionValue | null;
    note: string | null;
    annotations?: AnnotationShape[] | null;
  },
) {
  return request<{ decision: IpReviewMatchDecision | null }>(
    `/api/ip-reviews/${reviewId}/matches/${matchId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export interface IpReviewFinding {
  result_id: string;
  run_id: string;
  domain_id: string | null;
  domain: string;
  page_url: string;
  image_url: string | null;
  similarity_score: number | null;
  inliers: number | null;
  vlm_verdict: string | null;
  vlm_confidence: number | null;
  vlm_reasoning: string | null;
  status: string;
  case_id: string | null;
  enforcement_priority: number;
  found_at: string;
  updated_at: string;
  dismissed_at: string | null;
  availability: string | null;
  dismissal_reason: string | null;
  last_checked_at: string | null;
  source_method: string | null;
  /** How the match fired: 'visual', 'name', or 'both'. Null on legacy rows. */
  match_method: string | null;
  protected_term_assessment?: ProtectedTermAssessment | null;
  /** Opaque canonical seller identity. Use this for seller profile links. */
  seller_key: string | null;
  seller_name: string | null;
  seller_url: string | null;
  listing_title: string | null;
  price: string | null;
  location: string | null;
  description_summary: string | null;
  match_explanation: string | null;
  infringement_type: string | null;
  infringement_reasoning: string | null;
  license_status: string | null;
  license_reasoning: string | null;
  /** True when the seller matches a saved IP x domain license rule. */
  licensed_seller: boolean;
  screenshot_url: string | null;
  enrichment_error: string | null;
  ready_for_review: boolean;
  // Enforcement-pipeline status (from cases LEFT JOIN). null when the finding
  // hasn't graduated to a case yet — UI treats null as 'pending'.
  review_status: CaseReviewStatus | null;
  takedown_pending_at: string | null;
  takedown_pending_reason: TakedownLegalQueueReason | null;
  takedown_sent_at: string | null;
  takedown_submission_method: "email" | "manual" | null;
  takedown_submitted_by: string | null;
  enforced_at: string | null;
  /** Durable case-scoped task assignment shared by Tasks and Product Lab. */
  assigned_to_account_id: string | null;
  assignee_display_name: string | null;
  assignee_email: string | null;
  assignee_picture_url: string | null;
  assignment_updated_at: string | null;
  decision_by_account_id?: string | null;
  decision_by_display_name?: string | null;
  decision_by_email?: string | null;
  decision_by_picture_url?: string | null;
  decision_reason?: string | null;
  decision_source?: string | null;
  decision_batch_size?: number | null;
  decision_feedback_at?: string | null;
  // Round-3 dashboard metadata — all nullable (only populated when visible on
  // the listing page during enrichment). Typed for filter/sort/aggregation.
  published_at: string | null;
  shipping_price: string | null;
  description_full: string | null;
  description_full_en: string | null;
  description_language: string | null;
  item_details: Record<string, unknown> | null;
  image_urls: string[] | null;
  archived_images?: Array<{
    url: string;
    source_url: string | null;
    content_hash: string;
    width: number;
    height: number;
  }>;
  /** Compatibility list for API versions predating archived source metadata. */
  archived_image_urls?: string[];
  /** Per-image similarity (vs this finding's IP), sorted desc — lets the
   *  carousel mark which listing photo actually matched. Entries with a
   *  strong enough match also carry `bbox` (in gallery-image pixel coords)
   *  from ORB / neural keypoint localization so the carousel can overlay
   *  the located logo / label region. */
  gallery_scores: Array<{
    url: string;
    similarity: number;
    bbox?: [number, number, number, number];
    bbox_source?: "orb" | "neural";
    inliers?: number;
    matched_ref_image_id?: string | null;
  }> | null;
  seller_sales: number | null;
  seller_sales_observation?: SellerSalesObservation | null;
  seller_prior_enforcement_count: number | null;
  seller_years_active: number | null;
  seller_rating: number | null;
  seller_rating_count: number | null;
  quantity_available: number | null;
  quantity_in_carts: number | null;
  sale_type: SaleType | null;
  sale_ends_at: string | null;
  sale_urgency_source: string | null;
  sale_urgency_confidence: number | null;
  sale_urgency: SaleUrgencyBand;
  sale_urgency_rank: number;
  sale_seconds_remaining: number | null;
  /** Canonical English country derived server-side from `location` (e.g.
   *  "Sold from Sweden" → "Sweden"). Null when location is empty or doesn't
   *  match any known country. */
  country: string | null;
  /** Structured price for per-item market math (price_value × quantity). */
  price_value: number | null;
  price_currency: string | null;
  /** `price_value` converted to USD server-side (fx_rates). Use this for all
   *  per-row figures so the UI shows one unified currency. */
  price_value_usd: number | null;
  /** Quantity chosen by the backend for market estimates; absent on older APIs. */
  market_quantity?: number;
  description_risk_breakdown: Record<string, unknown> | null;
  condition_assessment: ListingConditionAssessment | null;
  authenticity_assessment: ListingAuthenticityAssessment | null;
  product_authenticity_assessment: ProductAuthenticityAssessment | null;
  marketplace_condition: "new" | "second_hand" | "unknown";
  authenticity_status:
    | "likely_genuine"
    | "likely_counterfeit"
    | "unclear"
    | null;
  authenticity_confidence: number | null;
  authenticity_reasoning: string | null;
  offer_subject:
    | "product"
    | "packaging_only"
    | "accessory"
    | "unclear"
    | null;
  manual_candidate_outcome: MonitoringCandidateOutcome | null;
  suggested_review_outcome:
    | "false_positive"
    | "do_not_pursue"
    | "takedown"
    | "second_hand"
    | "none";
  suggested_review_reason: string | null;
  actionability: MonitoringActionability;
  automated_candidate_outcome: MonitoringCandidateOutcome | null;
  automated_candidate_reason: string | null;
  automated_reason_category: MonitoringDecisionReasonCategory | null;
  automated_decision_factors: MonitoringDecisionFactor[] | null;
  automated_decision_version: string | null;
  automated_decided_at: string | null;
  // Present on tenant-wide findings (GET /api/monitoring/findings) so a
  // multi-IP board can key per-finding actions off the finding's own IP and
  // render an IP chip. Absent on per-IP findings (the IP is implied).
  ip_id?: string;
  ip_name?: string | null;
  /** True when the finding's IP has a complete takedown signer profile.
   *  Incomplete profiles route approved takedowns to the legal queue. */
  signer_ready?: boolean;
}

export interface IpReviewContext {
  title: string;
  mode?: IpReviewMode;
  asset_name?: string;
  asset_type?: string;
  intended_use?: string;
  territories?: string[];
  product_categories?: string[];
  asset_placement?: string;
  notes?: string;
}

export async function createIpReview(
  image: File,
  context: IpReviewContext,
  inspirationImages: File[] = []
) {
  const form = new FormData();
  form.append("image", image);
  form.append("title", context.title);
  if (context.mode) form.append("mode", context.mode);
  if (context.asset_name) form.append("asset_name", context.asset_name);
  if (context.asset_type) form.append("asset_type", context.asset_type);
  if (context.intended_use) form.append("intended_use", context.intended_use);
  if (context.asset_placement) form.append("asset_placement", context.asset_placement);
  if (context.notes) form.append("notes", context.notes);
  if (context.territories?.length) {
    form.append("territories", JSON.stringify(context.territories));
  }
  if (context.product_categories?.length) {
    form.append("product_categories", JSON.stringify(context.product_categories));
  }
  for (const f of inspirationImages) form.append("inspiration", f);

  const headers: Record<string, string> = {};
  authHeaders(headers);
  const res = await fetch(`${API}/api/ip-reviews`, { method: "POST", headers, body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<{ id: string }>;
}

export function listIpReviews(filter: { mode?: IpReviewMode; decision?: IpReviewDecision; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (filter.mode) params.set("mode", filter.mode);
  if (filter.decision) params.set("decision", filter.decision);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  const qs = params.toString();
  return request<{ reviews: IpReview[] }>(`/api/ip-reviews${qs ? `?${qs}` : ""}`);
}

export function getIpReviewsAttentionCount() {
  return request<{ count: number }>("/api/ip-reviews/count");
}

export async function getIpReview(id: string) {
  const { review } = await request<{ review: IpReview }>(`/api/ip-reviews/${id}`);
  // Defensive: if any annotations row leaked through as a JSON-encoded
  // string (legacy data from before the storage fix), parse it here so
  // consumers can always rely on it being an array | null.
  if (review.match_decisions) {
    for (const d of review.match_decisions) {
      if (typeof d.annotations === "string") {
        try {
          d.annotations = JSON.parse(d.annotations) as AnnotationShape[];
        } catch {
          d.annotations = null;
        }
      }
    }
  }
  return { review };
}

export interface MonitorAuditCandidate {
  id: string;
  kind: "candidate";
  source_method: string | null;
  url: string | null;
  image_url: string | null;
  top_ip: string | null;
  similarity_score: number | null;
  inliers: number | null;
  vlm_verdict: string | null;
  vlm_confidence: number | null;
  vlm_reasoning: string | null;
  disposition: string | null;
  created_at: string;
}

export interface MonitorAuditPage {
  id: string;
  kind: "page";
  source_method: string | null;
  url: string | null;
  http_status: number | null;
  blocked: boolean | null;
  harvested_count: number | null;
  disposition: string | null;
  screenshot_url: string | null;
  created_at: string;
}

export interface MonitorAuditRun {
  run_id: string;
  domain: string;
  keyword: string | null;
  status: string;
  error: string | null;
  results_found: number | null;
  cases_created: number | null;
  started_at: string | null;
  completed_at: string | null;
  pages: MonitorAuditPage[];
  candidates: MonitorAuditCandidate[];
  identity_screening?: {
    harvested: number;
    admitted: number;
    rejected: number;
    inspected: number;
    items: Array<{
      page_url: string | null;
      title: string;
      outcome: "admit" | "reject";
      reason: string;
      matched_name: string | null;
    }>;
  } | null;
}

export async function getIpMonitoringAudit(ipId: string) {
  return request<{ runs: MonitorAuditRun[] }>(`/api/ip/${ipId}/monitoring/audit`);
}

export type IpFirstScanResultStage =
  | "discovered"
  | "matching"
  | "qualifying"
  | "enriching"
  | "ready"
  | "filtered"
  | "failed";

/** A stable listing row that gains metadata as the monitoring pipeline runs. */
export interface IpFirstScanResult {
  candidate_id: string;
  run_id: string;
  source_id: string;
  source_domain: string;
  source_name: string | null;
  keyword: string | null;
  run_status: string;
  run_error: string | null;
  score_job_status: string | null;
  score_job_error: string | null;
  qualification_job_status: string | null;
  qualification_job_error: string | null;
  qualification_access_blocked: boolean;
  page_url: string;
  image_url: string | null;
  candidate_title: string | null;
  source_method: string | null;
  discovered_at: string;
  candidate_page_kind: string | null;
  candidate_actionability: string | null;
  qualification_confidence: number | null;
  qualification_classifier: string | null;
  qualified_at: string | null;
  result_id: string | null;
  lifecycle_state: string | null;
  similarity_score: number | null;
  match_method: string | null;
  protected_term_assessment?: ProtectedTermAssessment | null;
  vlm_verdict: string | null;
  vlm_confidence: number | null;
  vlm_reasoning: string | null;
  case_id: string | null;
  listing_title: string | null;
  seller_name: string | null;
  seller_url: string | null;
  price: string | null;
  location: string | null;
  description_summary: string | null;
  image_urls: string[] | null;
  enrichment_error: string | null;
  ready_for_review: boolean;
  review_status: string | null;
  updated_at: string;
  stage: IpFirstScanResultStage;
}

export interface IpFirstScanTotals {
  discovered: number;
  processing: number;
  ready: number;
  filtered: number;
  failed: number;
  qualified: number;
}

export interface IpFirstScanResultsPage {
  results: IpFirstScanResult[];
  source_totals: Array<IpFirstScanTotals & { source_id: string; source_domain: string; source_name: string | null }>;
  filter_totals: IpFirstScanTotals;
  total: number;
  next_cursor: string | null;
  as_of: string;
}

export interface IpFirstScanResultsOptions {
  limit?: number;
  cursor?: string;
  source_id?: string;
  stage?: "all" | "processing" | "ready" | "filtered" | "failed";
  query?: string;
}

export function getIpFirstScanResults(ipId: string, options: IpFirstScanResultsOptions = {}, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: String(options.limit ?? 100) });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.source_id) params.set("source_id", options.source_id);
  if (options.stage) params.set("stage", options.stage);
  if (options.query) params.set("q", options.query);
  return request<IpFirstScanResultsPage>(
    `/api/ip/${ipId}/monitoring/first-scan-results?${params}`,
    { signal },
  );
}

export interface IpLicense {
  id: string;
  ip_catalog_id: string;
  domain: string;
  seller_name: string | null;
  seller_url: string | null;
  created_at: string;
}

export async function listIpLicenses(ipId: string) {
  return request<{ licenses: IpLicense[] }>(`/api/ip/${ipId}/licenses`);
}

export async function addIpLicense(
  ipId: string,
  input: { domain: string; seller_name?: string | null; seller_url?: string | null },
) {
  return request<{ license: IpLicense; dismissed: number }>(`/api/ip/${ipId}/licenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteIpLicense(ipId: string, licenseId: string) {
  return request<{ ok: true }>(`/api/ip/${ipId}/licenses/${licenseId}`, { method: "DELETE" });
}

export function updateIpReviewDecision(
  id: string,
  patch: { decision: IpReviewDecision | null; decision_rationale: string | null }
) {
  return request<{ review: IpReview }>(`/api/ip-reviews/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteIpReview(id: string) {
  return request<{ ok: boolean }>(`/api/ip-reviews/${id}`, { method: "DELETE" });
}

/**
 * Fetch the clearance-review PDF with the bearer token attached and open
 * it in a new tab. Same workaround as the per-finding takedown packet —
 * anchor navigation can't carry the Authorization header.
 */
export async function openIpReviewReport(id: string): Promise<void> {
  const headers: Record<string, string> = {};
  authHeaders(headers);
  const res = await fetch(`${API}/api/ip-reviews/${id}/report.pdf`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
