import type { MonitoringFrequency } from "./registry";
import type { IpReviewFinding } from "./reviews";
import { isApiError, request } from "./transport";

export interface SellerSalesObservation {
  value: number;
  lower_bound: boolean;
  source_text: string;
  observed_at: string;
}

// --- Tenant-wide monitoring hub (across ALL monitored IPs) ---

/** Sort modes (must match api/src/db.ts MonitoringSortMode). */
export type MonitoringSortMode =
  | "score_desc" | "score_asc"
  | "found_desc" | "found_asc"
  | "updated_desc" | "updated_asc"
  | "price_desc" | "price_asc"
  | "seller_desc" | "seller_asc"
  | "platform_desc" | "platform_asc";

export type MonitoringPriorityBand = "high" | "med" | "low";
export type MonitoringStatusFilter =
  | "all" | "preparing" | "pending" | "review" | "takedown_pending" | "takedown_sent" | "enforced" | "dismissed";
export type MonitoringDismissalReasonFilter =
  | "false_positive"
  | "do_not_pursue"
  | "second_hand"
  | "licensed"
  | "allowed_product"
  | "dead"
  | "manual_cleared";
export type MonitoringCandidateOutcome =
  | "false_positive"
  | "do_not_pursue"
  | "takedown"
  | "second_hand"
  | "none";
export type MonitoringActionabilityKey =
  | "send_takedown"
  | "allowed_resale"
  | "licensed_seller"
  | "false_positive"
  | "needs_review";

export type MonitoringDecisionReasonCategory =
  | "counterfeit"
  | "unauthorized_ip_use"
  | "policy_violation"
  | "high_risk_description"
  | "allowed_resale"
  | "licensed"
  | "weak_match"
  | "manual"
  | "insufficient_evidence";

export interface MonitoringDecisionFactor {
  code: string;
  source:
    | "identity"
    | "condition"
    | "authenticity"
    | "product_authenticity"
    | "license"
    | "infringement"
    | "description"
    | "playbook"
    | "seller"
    | "manual";
  effect: "identity" | "violation" | "clearance" | "context";
  strength: "strong" | "moderate" | "weak";
  detail: string;
}

export interface ListingConditionAssessment {
  declared_condition: "new" | "used" | "unknown";
  observed_use_state:
    | "unused"
    | "used"
    | "partially_used"
    | "opened"
    | "packaging_only"
    | "unknown";
  effective_condition: "new" | "second_hand" | "unknown";
  confidence: number;
  evidence: Array<{
    source: "title" | "description" | "item_details" | "image" | "marketplace" | "system";
    kind:
      | "declared_new"
      | "declared_used"
      | "unused"
      | "opened"
      | "partial_quantity"
      | "prior_use"
      | "wear"
      | "packaging_only";
    text: string;
    confidence: number;
  }>;
  contradictions: string[];
}

export interface ListingAuthenticityAssessment {
  status: "counterfeit_signals" | "genuine_signals" | "no_visible_signals" | "unclear";
  confidence: number;
  reasoning: string | null;
  evidence: Array<{
    source: "image" | "description" | "item_details";
    signal: string;
    text: string;
  }>;
}

export type ProductAuthenticityRuleVerdict =
  | "violated"
  | "satisfied"
  | "not_visible"
  | "unclear";

export interface ProductAuthenticityRuleAssessment {
  rule_id: string;
  rule_version: number;
  expected_feature: string;
  failure_action: "review" | "takedown";
  verdict: ProductAuthenticityRuleVerdict;
  confidence: number;
  evidence_source: "image" | "description" | "both" | "none";
  evidence: string | null;
  evidence_image_positions: number[];
  evidence_regions: Array<{
    position: number;
    box_2d: [number, number, number, number];
  }>;
  reasoning: string | null;
}

export interface ProductAuthenticityAssessment {
  policy_version: string;
  product_group_id: string;
  source_content_hash: string;
  ruleset_hash: string;
  matched: boolean;
  confidence: number;
  evidence_source: "image" | "description" | "both" | "none";
  matched_cues: string[];
  reasoning: string | null;
  rule_assessments: ProductAuthenticityRuleAssessment[];
}

export interface MonitoringActionability {
  key: MonitoringActionabilityKey;
  label: string;
  reason: string;
  reason_category: MonitoringDecisionReasonCategory;
  decision_factors: MonitoringDecisionFactor[];
  classification_version: string;
}

export type MonitoringRelatedBucketKey =
  | "same_seller"
  | "similar_product_images"
  | "past_decisions"
  | "cross_site_matches";

export type MonitoringRelatedReason =
  | "same_seller"
  | "same_product_image"
  | "image_only_unverified"
  | "prior_takedown_pending"
  | "prior_takedown"
  | "prior_enforced"
  | "prior_dismissal"
  | "allowed_product"
  | "cleared_listing"
  | "cross_site_reuse";

export interface MonitoringRelatedFinding extends IpReviewFinding {
  relation_reasons: MonitoringRelatedReason[];
  relation_score: number | null;
  campaign_eligible: boolean;
  triageable: boolean;
}

export interface MonitoringRelatedDecision {
  kind: "cleared_listing" | "allowed_product";
  id: number;
  page_url: string | null;
  listing_title: string | null;
  image_url?: string | null;
  reason: string | null;
  decided_at: string;
  similarity: number | null;
}

export interface MonitoringRelatedExternalMatch {
  id: string;
  source: string;
  page_url: string;
  image_url: string | null;
  title: string | null;
  similarity_score: number;
  created_at: string;
}

export interface MonitoringRelatedBucket {
  key: MonitoringRelatedBucketKey;
  label: string;
  summary: string;
  items: MonitoringRelatedFinding[];
  decisions?: MonitoringRelatedDecision[];
  external_matches?: MonitoringRelatedExternalMatch[];
  outcome_counts?: Record<string, number>;
}

export interface MonitoringCampaignSuggestion {
  trigger:
    | "same_seller_prior_enforcement"
    | "same_seller_volume"
    | "same_seller_high_confidence"
    | "same_product_image"
    | "same_text_template";
  title: string;
  reason: string;
  result_ids: string[];
}

export interface MonitoringCampaign {
  id: string;
  tenant_id: string;
  ip_catalog_id: string;
  source_result_id: string | null;
  title: string;
  trigger: string;
  reason: string | null;
  status: string;
  created_by: string | null;
  confirmed_at: string | null;
  dismissed_by: string | null;
  dismissed_at: string | null;
  dismissal_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface MonitoringCampaignSummary extends MonitoringCampaign {
  ip_name: string | null;
  included_count: number;
  excluded_count: number;
  open_count: number;
  takedown_pending_count: number;
  takedown_sent_count: number;
  enforced_count: number;
  dismissed_count: number;
  platform_count: number;
  seller_count: number;
  platforms: string[];
  sellers: string[];
  sample_image_url: string | null;
  estimated_market_usd: number | null;
}

export interface MonitoringCampaignMember extends IpReviewFinding {
  campaign_state: "included" | "excluded";
  exception_reason: string | null;
  added_at: string;
}

export interface MonitoringCampaignDetail extends MonitoringCampaignSummary {
  members: MonitoringCampaignMember[];
}

export interface MonitoringRelatedItems {
  anchor: IpReviewFinding;
  buckets: MonitoringRelatedBucket[];
  campaign_suggestions: MonitoringCampaignSuggestion[];
  logo_only_notice: string;
}

/** Full-tenant facet counts returned alongside every findings page. */
export interface MonitoringFacets {
  statuses: Record<string, number>;
  priorities: { high: number; med: number; low: number };
  platforms: Array<{ domain: string; n: number }>;
  ips: Array<{ ip_id: string; name: string | null; n: number }>;
  product_groups: Array<{ product_group_id: string; name: string; n: number }>;
  /** Top-50 sellers (by finding count). Server-capped. */
  sellers: Array<{ seller_name: string; n: number }>;
  dismissal_reasons: Record<string, number>;
  candidate_outcomes: Record<MonitoringCandidateOutcome, number>;
  total: number;
}

export interface MonitoringFindingsPage {
  findings: IpReviewFinding[];
  /** Pass back as `cursor` to fetch the next page; null = no more rows. */
  next_cursor: string | null;
  facets: MonitoringFacets;
}

export type MonitoringFindingRowsPage = Pick<
  MonitoringFindingsPage,
  "findings" | "next_cursor"
>;

export interface MonitoringFindingsQuery {
  priority?: MonitoringPriorityBand | null;
  status?: MonitoringStatusFilter | null;
  ip_id?: string | null;
  product_group_id?: string | null;
  catalog_product_id?: string | null;
  case_ids?: string[] | null;
  platform?: string | null;
  match_basis?: "text" | "text_only" | "visual" | "both" | null;
  protected_term_id?: string | null;
  seller?: string | null;
  query?: string | null;
  /** Tenant-member account id, or the literal "unassigned". */
  assignee?: string | null;
  dismissal_reason?: MonitoringDismissalReasonFilter | null;
  candidate_outcome?: MonitoringCandidateOutcome | null;
  show_dismissed?: boolean;
  sort?: MonitoringSortMode;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}

/**
 * One page of the tenant-wide monitoring findings feed. All filtering,
 * sorting, and keyset pagination happens server-side; the response also
 * carries the full-tenant facet counts so dropdowns stay accurate without
 * the client needing the whole result set.
 */
function monitoringFindingsParams(
  opts: MonitoringFindingsQuery,
  options: {
    includeFacets: boolean;
    includeSellerPriorEnforcement: boolean;
  },
) {
  const params = new URLSearchParams();
  if (opts.priority)     params.set("priority", opts.priority);
  if (opts.status)       params.set("status", opts.status);
  if (opts.ip_id)        params.set("ip_id", opts.ip_id);
  if (opts.product_group_id) params.set("product_group_id", opts.product_group_id);
  if (opts.catalog_product_id) params.set("catalog_product_id", opts.catalog_product_id);
  if (opts.case_ids?.length) {
    params.set("case_ids", [...new Set(opts.case_ids)].join(","));
  }
  if (opts.match_basis) params.set("match_basis", opts.match_basis);
  if (opts.protected_term_id) params.set("protected_term_id", opts.protected_term_id);
  if (opts.platform)     params.set("platform", opts.platform);
  if (opts.seller)       params.set("seller", opts.seller);
  if (opts.query)        params.set("q", opts.query);
  if (opts.assignee)     params.set("assignee", opts.assignee);
  if (opts.dismissal_reason) params.set("dismissal_reason", opts.dismissal_reason);
  if (opts.candidate_outcome) params.set("candidate_outcome", opts.candidate_outcome);
  if (opts.show_dismissed) params.set("show_dismissed", "true");
  if (opts.sort)         params.set("sort", opts.sort);
  if (opts.cursor)       params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 50));
  if (!options.includeFacets) params.set("include_facets", "false");
  if (!options.includeSellerPriorEnforcement) {
    params.set("include_seller_prior_enforcement", "false");
  }
  return params;
}

export function listMonitoringFindingsGlobal(
  opts: MonitoringFindingsQuery = {},
) {
  const params = monitoringFindingsParams(opts, {
    includeFacets: true,
    includeSellerPriorEnforcement: true,
  });
  const qs = params.toString();
  return request<MonitoringFindingsPage>(
    `/api/monitoring/findings${qs ? `?${qs}` : ""}`,
    { signal: opts.signal },
  );
}

export function listMonitoringFindingRowsGlobal(
  opts: MonitoringFindingsQuery = {},
) {
  const params = monitoringFindingsParams(opts, {
    includeFacets: false,
    includeSellerPriorEnforcement: false,
  });
  const qs = params.toString();
  return request<MonitoringFindingRowsPage>(
    `/api/monitoring/findings${qs ? `?${qs}` : ""}`,
    { signal: opts.signal },
  );
}

export function getMonitoringFinding(resultId: string) {
  return request<{ finding: IpReviewFinding }>(
    `/api/monitoring/findings/${encodeURIComponent(resultId)}`,
  );
}

export interface MonitoringTaskAssignment {
  assigned_to_account_id: string | null;
  assignee_display_name: string | null;
  assignee_email: string | null;
  assignee_picture_url: string | null;
  assignment_updated_at: string | null;
}

export function updateMonitoringFindingAssignment(
  resultId: string,
  assigneeAccountId: string | null,
) {
  return request<{ assignment: MonitoringTaskAssignment }>(
    `/api/monitoring/findings/${encodeURIComponent(resultId)}/assignment`,
    {
      method: "PATCH",
      body: JSON.stringify({ assignee_account_id: assigneeAccountId }),
    },
  );
}

export function getMonitoringFindingForCase(caseId: string) {
  return request<{ finding: IpReviewFinding }>(
    `/api/monitoring/findings/case/${encodeURIComponent(caseId)}`,
  );
}

export type MonitoringSellerStatus = "open" | "all" | "dismissed" | "enforced";
export type MonitoringSellerAvailability = "available" | "blocked" | "unknown" | "unavailable";
export type MonitoringSellerSort = "found_desc" | "price_desc" | "risk_desc";
export type MonitoringSellerListStatus = "open" | "returned" | "all";

export interface MonitoringSellerSummary {
  seller_key: string;
  seller_name: string;
  domain: string;
  profile_url: string | null;
  rating: number | null;
  sales: number | null;
  sales_observation?: SellerSalesObservation | null;
  open_listing_count: number;
  returned_listing_count: number;
  prior_enforcement_count: number;
  affected_ip_count: number;
  ip_names: string[];
  monitored_market_usd: number;
  max_enforcement_priority: number;
  latest_found_at: string;
  latest_result_id: string | null;
  sample_image_url: string | null;
  last_prior_takedown_at: string | null;
}

export interface MonitoringSellersPage {
  sellers: MonitoringSellerSummary[];
  next_cursor: string | null;
  total_sellers: number;
  returned_seller_count: number;
  platforms: string[];
}

export interface MonitoringSellerProfilePage {
  seller: {
    key: string;
    name: string;
    domain: string;
    profile_url: string | null;
    rating: number | null;
    rating_count: number | null;
    sales: number | null;
    sales_observation?: SellerSalesObservation | null;
    years_active: number | null;
    location: string | null;
  };
  summary: {
    monitored_listings: number;
    available_listings: number;
    blocked_listings: number;
    unknown_availability: number;
    unavailable_listings: number;
    monitored_market_usd: number;
    affected_ip_count: number;
    prior_enforcement_count: number;
    returned_listing_count: number;
    last_prior_takedown_at: string | null;
  };
  ips: Array<{ ip_id: string; ip_name: string; findings: number }>;
  statuses: Record<string, number>;
  findings: IpReviewFinding[];
  next_cursor: string | null;
}

/** Tenant-wide returned sellers with at least one current open listing — the
 * Sellers navigation badge. */
export function getReturnedMonitoringSellersCount() {
  return request<{ count: number }>("/api/monitoring/sellers/returned-count");
}

export function listMonitoringSellers(opts: {
  status?: MonitoringSellerListStatus;
  ip_id?: string | null;
  platform?: string | null;
  query?: string | null;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
} = {}) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.ip_id) params.set("ip_id", opts.ip_id);
  if (opts.platform) params.set("platform", opts.platform);
  if (opts.query) params.set("q", opts.query);
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 24));
  return request<MonitoringSellersPage>(`/api/monitoring/sellers?${params.toString()}`, {
    signal: opts.signal,
  });
}

export async function getMonitoringSellerProfile(
  sellerKey: string,
  opts: {
    status?: MonitoringSellerStatus;
    ip_id?: string | null;
    availability?: MonitoringSellerAvailability | null;
    sort?: MonitoringSellerSort;
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
  } = {},
) {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.ip_id) params.set("ip_id", opts.ip_id);
  if (opts.availability) params.set("availability", opts.availability);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.cursor) params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 50));
  const path = () =>
    `/api/monitoring/sellers/${encodeURIComponent(sellerKey)}?${params.toString()}`;
  try {
    return await request<MonitoringSellerProfilePage>(path(), { signal: opts.signal });
  } catch (error) {
    // Keep frontend previews usable while the API rollout is in flight. The
    // backend treats `active` as an alias for `open` once it has been updated.
    if (
      opts.status !== "open" ||
      !isApiError(error) ||
      !error.message.toLowerCase().includes("invalid status")
    ) throw error;
    params.delete("status");
    return request<MonitoringSellerProfilePage>(path(), { signal: opts.signal });
  }
}

export function resolveMonitoringFindingTenant(resultId: string) {
  return request<{ tenant_id: string }>(
    `/api/monitoring/findings/${encodeURIComponent(resultId)}/tenant`,
  );
}

export function getMonitoringFindingRelated(resultId: string) {
  return request<{ related: MonitoringRelatedItems }>(
    `/api/monitoring/findings/${encodeURIComponent(resultId)}/related`,
  );
}

export function createMonitoringCampaign(input: {
  source_result_id: string;
  title: string;
  trigger: MonitoringCampaignSuggestion["trigger"];
  reason?: string | null;
  result_ids: string[];
}) {
  return request<{ campaign: MonitoringCampaign }>("/api/monitoring/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function discoverMonitoringCampaigns(opts: { lookback_days?: number; limit?: number } = {}) {
  return request<{ created: number }>("/api/monitoring/campaigns/discover", {
    method: "POST",
    body: JSON.stringify(opts),
  });
}

export function listMonitoringCampaigns(opts: {
  limit?: number;
  include_dismissed?: boolean;
  include_inactive?: boolean;
  ip_id?: string | null;
} = {}) {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  if (opts.include_dismissed) params.set("include_dismissed", "true");
  if (opts.include_inactive) params.set("include_inactive", "true");
  if (opts.ip_id) params.set("ip_id", opts.ip_id);
  return request<{ campaigns: MonitoringCampaignSummary[] }>(
    `/api/monitoring/campaigns?${params.toString()}`,
  );
}

export function getMonitoringCampaign(campaignId: string) {
  return request<{ campaign: MonitoringCampaignDetail }>(
    `/api/monitoring/campaigns/${encodeURIComponent(campaignId)}`,
  );
}

export function dismissMonitoringCampaign(campaignId: string, reason?: string | null) {
  return request<{ campaign: MonitoringCampaignSummary }>(
    `/api/monitoring/campaigns/${encodeURIComponent(campaignId)}/dismiss`,
    {
      method: "POST",
      body: JSON.stringify({ reason: reason ?? null }),
    },
  );
}

export function updateMonitoringCampaignMember(
  campaignId: string,
  resultId: string,
  input: { state: "included" | "excluded"; exception_reason?: string | null },
) {
  return request<{ member: MonitoringCampaignMember }>(
    `/api/monitoring/campaigns/${encodeURIComponent(campaignId)}/members/${encodeURIComponent(resultId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function resortMonitoringFindings(
  resultIds: string[],
  rejectedCandidateOutcome: MonitoringCandidateOutcome,
) {
  return request<{ ok: boolean; updated: number }>(
    "/api/monitoring/findings/resort",
    {
      method: "POST",
      body: JSON.stringify({
        result_ids: resultIds,
        rejected_candidate_outcome: rejectedCandidateOutcome,
      }),
    },
  );
}

/** One monitored IP plus the platforms wired to it. Powers the /monitoring
 *  "Monitored IPs" tab. */
export interface MonitoredIpSummary {
  ip_id: string;
  ip_name: string;
  keywords: string[] | null;
  monitoring_frequency: MonitoringFrequency;
  platforms: {
    id: string;
    domain: string;
    source_type: "domain" | "web_search";
    display_name: string | null;
    source_config: Record<string, unknown>;
    enabled: boolean;
    last_run_at: string | null;
  }[];
}

export function listMonitoredIps() {
  return request<{ ips: MonitoredIpSummary[] }>("/api/monitoring/ips");
}

/** Count of unhandled findings tenant-wide — the nav notification badge. */
export function getMonitoringFindingsCount() {
  return request<{ count: number }>("/api/monitoring/findings/count");
}

/** Dashboard summary: KPIs + per-(seller|platform|IP|country) breakdowns +
 *  findings-per-day time-series. One round-trip for the home page. */
export interface DashboardSummary {
  kpis: {
    to_triage: number;
    triaged: number;
    acknowledged_infringement: number;
    second_hand_market: number;
    legal_queue: number;
    in_progress: number;
    enforced_30d: number;
    high_risk: number;
    ips_monitored: number;
    platforms_monitored: number;
    /** SUM over active monitored listings of (qty × price_usd). */
    total_monitored_market_usd?: number;
    /** @deprecated Backward-compatible alias for total_monitored_market_usd. */
    total_unlicensed_market_usd?: number;
  };
  sellers: Array<{
    seller_name: string;
    domain: string;
    findings: number;
    rating: number | null;
    sales: number | null;
  }>;
  platforms: Array<{ domain: string; findings: number; enforced: number }>;
  ips: Array<{
    ip_id: string;
    ip_name: string;
    findings: number;
    enforced: number;
    monitored_market_usd?: number;
    /** @deprecated Backward-compatible alias for monitored_market_usd. */
    unlicensed_market_usd?: number;
  }>;
  timeseries: Array<{ day: string; findings: number }>;
  countries: Array<{ country: string; findings: number }>;
  days: number;
}

export function getDashboardSummary(days?: number, ipId?: string | null) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (ipId) params.set("ip_id", ipId);
  const qs = params.toString();
  return request<DashboardSummary>(
    `/api/monitoring/dashboard/summary${qs ? `?${qs}` : ""}`,
  );
}

/** Dashboard grouped by IP. Breakdowns are pivoted so IP is the colour
 *  dimension: `counts` maps ip_id → finding count for stacked charts. `ips`
 *  is finding-sorted and fixes the colour order. */
export interface DashboardGroups {
  days: number;
  kpis: DashboardSummary["kpis"];
  ips: Array<{
    ip_id: string;
    ip_name: string | null;
    findings: number;
    to_triage: number;
    triaged: number;
    acknowledged_infringement: number;
    second_hand_market: number;
    legal_queue: number;
    in_progress: number;
    enforced_30d: number;
    high_risk: number;
    ips_monitored: number;
    platforms_monitored: number;
    monitored_market_usd?: number;
    /** @deprecated Backward-compatible alias for monitored_market_usd. */
    unlicensed_market_usd?: number;
  }>;
  timeseries: Array<{ day: string; counts: Record<string, number> }>;
  platforms: Array<{ domain: string; counts: Record<string, number> }>;
  countries: Array<{ country: string; counts: Record<string, number> }>;
  // Monitored $ market (USD) per country, broken down by IP — the money twin
  // of `countries`, used by the market card's country view.
  marketByCountry: Array<{ country: string; counts: Record<string, number> }>;
  sellers: Array<{
    ip_id: string;
    ip_name: string | null;
    seller_key: string | null;
    seller_name: string;
    domain: string;
    findings: number;
    rating: number | null;
    sales: number | null;
  }>;
}

export function getDashboardGroups(days?: number, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  const qs = params.toString();
  return request<DashboardGroups>(
    `/api/monitoring/dashboard/groups${qs ? `?${qs}` : ""}`,
    { signal },
  );
}



export interface SharedListingImage {
  url: string | null;
  content_hash: string;
  source_url: string | null;
  width: number;
  height: number;
}


export interface MonitoringSharedImages {
  status: "not_analyzed" | "partial" | "ready";
  source_captured_at: string | null;
  coverage: {
    source_images: number;
    source_images_checked: number;
    source_copy_fingerprints: number;
    candidate_images: number;
    candidate_images_checked: number;
    candidate_copy_fingerprints: number;
  };
  has_more: boolean;
  matches: Array<{
    result_id: string;
    case_id: string;
    page_url: string;
    domain: string;
    listing_title: string | null;
    seller_name: string | null;
    seller_key: string | null;
    captured_at: string;
    evidence: Array<{
      kind: "exact_image" | "possible_copy";
      source: SharedListingImage;
      target: SharedListingImage;
    }>;
  }>;
}


export function getMonitoringFindingSharedImages(resultId: string, signal?: AbortSignal) {
  return request<{ shared_images: MonitoringSharedImages }>(
    `/api/monitoring/findings/${encodeURIComponent(resultId)}/shared-images`, { signal },
  );
}
