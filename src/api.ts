const API = import.meta.env.VITE_API_URL || "";

let token: string | null = localStorage.getItem("auth_token");

export function getToken() {
  return token;
}

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem("auth_token", t);
  else localStorage.removeItem("auth_token");
}

// --- Acting tenant (admin "operate as any tenant") ---
// When an admin selects a tenant in the switcher we persist its id and send it
// as `X-Acting-Tenant` on every request. The API honors it only for admins and
// scopes the whole request to that tenant. Non-admins never set this.
let actingTenant: string | null = localStorage.getItem("acting_tenant");

export function getActingTenant() {
  return actingTenant;
}

export function setActingTenant(t: string | null) {
  actingTenant = t;
  if (t) localStorage.setItem("acting_tenant", t);
  else localStorage.removeItem("acting_tenant");
}

/** Attach the Bearer token and (when set) the acting-tenant override. */
function authHeaders(headers: Record<string, string>) {
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (actingTenant) headers["X-Acting-Tenant"] = actingTenant;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  authHeaders(headers);
  if (init?.body && typeof init.body === "string") headers["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// --- Auth ---

export interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
  picture_url: string | null;
  tenant_id: string;
  role?: "user" | "admin";
}

/** URL the browser navigates to in order to start a WorkOS AuthKit sign-in.
 *  Optional `returnTo` is a same-origin path the backend will echo back to
 *  the SPA as `?next=…` after the OAuth round-trip succeeds. */
export function workosLoginUrl(returnTo?: string): string {
  const params = new URLSearchParams({ origin: window.location.origin });
  if (returnTo) params.set("return_to", returnTo);
  return `${API}/api/auth/workos/start?${params.toString()}`;
}

export function getMe() {
  return request<{ user: AuthUser | null }>("/api/auth/me");
}

export async function logout() {
  try {
    await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

// --- Trademarks ---

export interface BaselineConfig {
  identity_match?: { min_score?: number; min_confidence?: "LOW" | "MEDIUM" | "HIGH" };
  style_fidelity?: { min_similarity?: number; warn_below?: number };
  canonical_proximity?: { k?: number; min_proximity?: number; calibration_percentile?: string };
}

export interface Trademark {
  id: string;
  name: string;
  description: string | null;
  /** Monitoring keywords proposed by the wizard's VLM step + user edits. */
  keywords: string[];
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

export function listTrademarks() {
  return request<{ trademarks: Trademark[] }>("/api/ip");
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

export function getTrademark(id: string) {
  return request<{ trademark: Trademark; images: TrademarkImage[] }>(`/api/ip/${id}`);
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
  }
) {
  return request<{ trademark: Trademark }>(`/api/ip/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function uploadTrademarkImages(trademarkId: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("images", f);

  const headers: Record<string, string> = {};
  authHeaders(headers);

  const res = await fetch(`${API}/api/ip/${trademarkId}/images`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<{ job_id: string; images_uploaded: number }>;
}

export function deleteTrademarkImage(trademarkId: string, imageId: string) {
  return request<{ ok: boolean }>(`/api/ip/${trademarkId}/images/${imageId}`, { method: "DELETE" });
}

// --- Detection ---

export interface Detection {
  ip: string;
  score: number;
  semantic_score: number;
  structural_score: number;
  bbox: [number, number, number, number]; // x, y, w, h
  confidence: string;
  method?: "visual" | "text" | "template" | "sift";
  text_found?: string;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  result: { detections?: Detection[] } | null;
  error: string | null;
}

export function getJob(id: string) {
  return request<Job>(`/api/jobs/${id}`);
}

// --- Rule graphs ---

export type PrimitiveName =
  | "identity_match"
  | "style_fidelity"
  | "palette"
  | "ocr_contains"
  | "manual_check"
  | "canonical_proximity"
  | "vlm_check"
  | "vlm_infringement_check";

export type RuleSeverity = "fail" | "fail_hard" | "note";

export interface Rule {
  id?: string;
  name: string;
  description?: string;
  primitive: PrimitiveName;
  config: Record<string, unknown>;
  on_fail: RuleSeverity;
}

// --- Submissions (licensee pre-flight checks) ---

export type Verdict = "pass" | "pass_w_note" | "fail" | "fail_hard";

/**
 * One reference image surfaced by canonical_proximity's evidence so the report
 * card can show "closest references" thumbnails. The API decorates each entry
 * with a presigned `image_url` before returning the submission payload.
 */
export interface CanonicalRefMatch {
  similarity: number;
  image_id: string | null;
  storage_path: string | null;
  image_url?: string;
}

export interface RuleResult {
  rule_id: string;
  rule_name: string;
  primitive: PrimitiveName;
  state: "pass" | "fail" | "uncertain";
  observed: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  on_fail: RuleSeverity;
}

export interface PrimitiveResultsBlob {
  rule_results: RuleResult[];
  verdict: Verdict;
}

// --- Cases (persistent scan-pipeline output) ---

export type CaseReviewStatus =
  | "pending"
  | "takedown_sent"
  | "enforced"
  | "dismissed";

export interface CaseComment {
  id: string;
  case_id: string;
  body: string;
  created_at: string;
  author: {
    id: string;
    display_name: string | null;
    picture_url: string | null;
  };
}

export type LicenseStatus = "likely_licensed" | "likely_unlicensed" | "unclear";
export type InfringementType =
  | "full_copy"
  | "derivative"
  | "different_class"
  | "unclear";
export type CreatorType = "individual" | "company" | "unknown";

export interface CaseEnrichment {
  case_id: string;
  seller_name: string | null;
  seller_profile_url: string | null;
  listing_title: string | null;
  price: string | null;
  location: string | null;
  description_summary: string | null;
  platform: string | null;
  notes: string | null;
  match_explanation: string | null;
  license_status: LicenseStatus | string | null;
  license_confidence: number | null;
  license_reasoning: string | null;
  infringement_type: InfringementType | string | null;
  infringement_reasoning: string | null;
  creator_type: CreatorType | string | null;
  error: string | null;
  enriched_at: string;
}

// --- Case comments ---

export function listCaseComments(caseId: string) {
  return request<{ comments: CaseComment[] }>(`/api/cases/${caseId}/comments`);
}

export function postCaseComment(caseId: string, body: string) {
  return request<{ comment: CaseComment }>(`/api/cases/${caseId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteCaseComment(caseId: string, commentId: string) {
  return request<{ ok: boolean }>(`/api/cases/${caseId}/comments/${commentId}`, {
    method: "DELETE",
  });
}

// --- Takedown email ---
// Sends the takedown to the platform's intake address (e.g. Etsy's legal@) and
// tracks the reply thread. Replaces the old PDF-download + mark-sent flow.

export type TakedownRequestStatus =
  | "queued"
  | "sent"
  | "failed"
  | "replied"
  | "closed";

export interface TakedownRequiredField {
  key: string;
  label: string;
}

/** A user-selectable intake route (only `ip_owner` routes are returned). */
export interface TakedownRouteOption {
  id: string;
  label: string;
  to_email: string;
  is_default: boolean;
  required_fields: TakedownRequiredField[];
}

export interface TakedownDraft {
  subject: string;
  body: string;
  /** Required-field labels the signer profile still has to fill in. */
  missing_fields: string[];
}

/** Per-IP signer details that populate every notice for that IP. */
export interface TakedownProfile {
  legal_name: string | null;
  organization: string | null;
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
}

export interface TakedownDraftResponse {
  /** False when Postmark env isn't set — the UI disables sending. */
  configured: boolean;
  routes: TakedownRouteOption[];
  suggested_target_id: string | null;
  profile: TakedownProfile | null;
  draft: TakedownDraft | null;
}

export interface TakedownRequest {
  id: string;
  case_id: string;
  target_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: TakedownRequestStatus;
  provider_message_id: string | null;
  error: string | null;
  reply_to: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface TakedownMessage {
  id: string;
  request_id: string;
  case_id: string;
  direction: "outbound" | "inbound";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body: string;
  created_at: string;
}

export interface TakedownThread {
  request: TakedownRequest;
  messages: TakedownMessage[];
}

export function getTakedownThread(caseId: string) {
  return request<{ takedown: TakedownThread | null }>(
    `/api/cases/${caseId}/takedown`,
  );
}

export function getTakedownDraft(caseId: string) {
  return request<TakedownDraftResponse>(`/api/cases/${caseId}/takedown/draft`);
}

export function sendTakedown(
  caseId: string,
  payload: { target_id: string; subject: string; body: string },
) {
  return request<{ request: TakedownRequest }>(
    `/api/cases/${caseId}/takedown/send`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function markTakedownSentWithoutEmail(caseId: string) {
  return request<{ ok: boolean; emailed: false }>(
    `/api/cases/${caseId}/takedown/mark-sent`,
    { method: "POST" },
  );
}

/** Send the suggested-route takedown draft for a case without opening the
 *  editor — the quick path shared by the single-row "Send takedown" and the
 *  board's batch send. Returns a discriminated status so callers can fall back
 *  to manual compose (no route/draft) or surface "email not configured". */
export async function autoSendTakedown(
  caseId: string,
): Promise<
  | { status: "sent"; request: TakedownRequest }
  | { status: "needs_compose" }
  | { status: "unconfigured" }
> {
  const d = await getTakedownDraft(caseId);
  if (!d.configured) return { status: "unconfigured" };
  const target_id = d.suggested_target_id ?? d.routes[0]?.id ?? "";
  if (!target_id || !d.draft) return { status: "needs_compose" };
  const { request } = await sendTakedown(caseId, {
    target_id,
    subject: d.draft.subject,
    body: d.draft.body,
  });
  return { status: "sent", request };
}

export function replyTakedown(caseId: string, body: string) {
  return request<{ message: TakedownMessage }>(
    `/api/cases/${caseId}/takedown/reply`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

export function getIpTakedownProfile(ipId: string) {
  return request<{ profile: TakedownProfile | null }>(
    `/api/ip/${ipId}/takedown/profile`,
  );
}

export function updateIpTakedownProfile(
  ipId: string,
  patch: Partial<TakedownProfile>,
) {
  return request<{ profile: TakedownProfile }>(
    `/api/ip/${ipId}/takedown/profile`,
    { method: "PUT", body: JSON.stringify(patch) },
  );
}

// --- Giantbomb catalog browse (standalone Pop-Culture catalog page) ---
//
// The catalog-browse + categories endpoints live on /api/giantbomb-match
// because they're pop-culture-specific.

/** Indexed entity types + counts. UI uses this to drive chip availability. */
export interface GiantbombCategory {
  entity_type: string;
  count: number;
}
export function getGiantbombCategories() {
  return request<{ categories: GiantbombCategory[] }>("/api/giantbomb-match/categories");
}

export interface GiantbombCatalogItem {
  id: string;
  giantbomb_id: string;
  source_id: string;
  entity_type: string;
  name: string;
  aliases: string[];
  summary: string | null;
  source_url: string | null;
  image_count: number;
  image_url: string | null;
}
export function browseGiantbombCatalog(opts: {
  q?: string;
  entityType?: string;
  limit: number;
  offset: number;
}) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set("q", opts.q);
  if (opts.entityType) qs.set("entity_type", opts.entityType);
  qs.set("limit", String(opts.limit));
  qs.set("offset", String(opts.offset));
  return request<{
    items: GiantbombCatalogItem[];
    total: number;
    limit: number;
    offset: number;
    entity_type: string | null;
    q: string;
  }>(`/api/giantbomb-match/catalog/browse?${qs.toString()}`);
}

// --- Admin (unified cross-source IP catalog management) ---

export interface AdminIpSummary {
  id: string;
  source: string;
  name: string | null;
  entity_type: string | null;
  image_count: number;
  indexed_count: number;
  centroid_ready: boolean;
  has_caption: boolean;
  updated_at: string;
}

export interface AdminIpImage {
  key: string;
  url: string;
  image_id: string | null;
  status: string;
  indexed: boolean;
}

export interface AdminIpDetail {
  id: string;
  source: string;
  name: string | null;
  description: string | null;
  guidelines: string | null;
  entity_type: string | null;
  aliases: string[];
  caption_text: string | null;
  caption_model: string | null;
  centroid_ready: boolean;
  tenant_id: string | null;
  images: AdminIpImage[];
  created_at: string;
  updated_at: string;
}

/** Catalog sources the admin can filter by. */
export const ADMIN_SOURCES = [
  "tenant_trademark",
  "euipo_trademark",
  "wipo_design",
  "giantbomb",
  "anilist",
] as const;
export type AdminSource = (typeof ADMIN_SOURCES)[number];

export interface Tenant {
  id: string;
  name: string | null;
  email_domain: string | null;
  owner_workos_user_id: string | null;
  created_at: string;
}

/** Human label for a tenant in the admin switcher. */
export function tenantLabel(t: Tenant): string {
  return t.name || t.email_domain || t.id;
}

/** All tenants, for the admin "operate as any tenant" switcher. Admin-only. */
export function listTenants() {
  return request<{ tenants: Tenant[] }>(`/api/admin/tenants`);
}

export function searchAdminIps(opts: {
  source?: string;
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (opts.source) qs.set("source", opts.source);
  if (opts.q) qs.set("q", opts.q);
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ ips: AdminIpSummary[]; total: number; limit: number; offset: number }>(
    `/api/admin/ips${suffix}`
  );
}

export function getAdminIp(id: string) {
  return request<AdminIpDetail>(`/api/admin/ips/${encodeURIComponent(id)}`);
}

export function patchAdminIp(
  id: string,
  patch: { description?: string | null; guidelines?: string | null; caption_text?: string | null }
) {
  return request<{ id: string; caption_reembed_job_id: string | null }>(
    `/api/admin/ips/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
}

export function deleteAdminIp(id: string) {
  return request<{ ok: boolean; deleted_uploads: number }>(
    `/api/admin/ips/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export async function uploadAdminImages(id: string, files: File[]) {
  const form = new FormData();
  for (const f of files) form.append("images", f);

  const headers: Record<string, string> = {};
  authHeaders(headers);

  const res = await fetch(`${API}/api/admin/ips/${encodeURIComponent(id)}/images`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<{ uploaded: number; job_id: string }>;
}

export function deleteAdminImage(id: string, imageId: string) {
  return request<{ ok: boolean }>(
    `/api/admin/ips/${encodeURIComponent(id)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE" }
  );
}

// --- Brand monitoring (scrape target sites for IP infringements) ---

export type MonitoringFrequency = "daily" | "weekly";

export interface MonitoredDomain {
  id: string;
  tenant_id: string;
  domain: string;
  /** Linked IP — keywords for the scrape come from the IP, not this row. */
  ip_catalog_id: string | null;
  /** Convenience fields surfaced by GET /api/monitoring/domains (JOINed). */
  ip_name: string | null;
  ip_keywords: string[] | null;
  recipe: Record<string, unknown> | null;
  recipe_updated_at: string | null;
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
  monitoring_frequency: MonitoringFrequency | string;
}

export function listMonitoredDomains() {
  return request<{ domains: MonitoredDomain[] }>("/api/monitoring/domains");
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

export function listMonitoringRuns(opts: { domain_id?: string; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.domain_id) params.set("domain_id", opts.domain_id);
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return request<{ runs: ReverseSearchRun[] }>(
    `/api/monitoring/runs${qs ? `?${qs}` : ""}`,
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
  frequency?: MonitoringFrequency;
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

// --- API keys ---

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function listApiKeys() {
  return request<{ keys: ApiKey[] }>("/api/api-keys");
}

export function createApiKey(name: string) {
  return request<{ key: ApiKey; token: string }>("/api/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function revokeApiKey(id: string) {
  return request<{ ok: boolean }>(`/api/api-keys/${id}`, {
    method: "DELETE",
  });
}

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
  dismissed_at: string | null;
  availability: string | null;
  dismissal_reason: string | null;
  last_checked_at: string | null;
  source_method: string | null;
  /** How the match fired: 'visual', 'name', or 'both'. Null on legacy rows. */
  match_method: string | null;
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
  screenshot_url: string | null;
  enrichment_error: string | null;
  ready_for_review: boolean;
  // Enforcement-pipeline status (from cases LEFT JOIN). null when the finding
  // hasn't graduated to a case yet — UI treats null as 'pending'.
  review_status: CaseReviewStatus | null;
  takedown_sent_at: string | null;
  enforced_at: string | null;
  // Round-3 dashboard metadata — all nullable (only populated when visible on
  // the listing page during enrichment). Typed for filter/sort/aggregation.
  published_at: string | null;
  shipping_price: string | null;
  description_full: string | null;
  item_details: Record<string, unknown> | null;
  image_urls: string[] | null;
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
  seller_years_active: number | null;
  seller_rating: number | null;
  seller_rating_count: number | null;
  quantity_available: number | null;
  quantity_in_carts: number | null;
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
  description_risk_breakdown: Record<string, unknown> | null;
  marketplace_condition: "new" | "second_hand" | "unknown";
  manual_candidate_outcome: MonitoringCandidateOutcome | null;
  suggested_review_outcome:
    | "false_positive"
    | "do_not_pursue"
    | "takedown"
    | "second_hand"
    | "none";
  suggested_review_reason: string | null;
  // Present on tenant-wide findings (GET /api/monitoring/findings) so a
  // multi-IP board can key per-finding actions off the finding's own IP and
  // render an IP chip. Absent on per-IP findings (the IP is implied).
  ip_id?: string;
  ip_name?: string | null;
  /** True when the finding's IP has a complete takedown signer profile. The
   *  board disables "Send takedown" until it's set. Tenant-wide board only. */
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
}

export async function getIpMonitoringAudit(ipId: string) {
  return request<{ runs: MonitorAuditRun[] }>(`/api/ip/${ipId}/monitoring/audit`);
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

// --- IP-scoped monitoring (platforms + findings live under the IP) ---

/** Platforms (monitored domains) wired to a single IP. */
export function listIpMonitoringPlatforms(ipId: string) {
  return request<{ platforms: MonitoredDomain[] }>(
    `/api/ip/${ipId}/monitoring/platforms`,
  );
}

/** Add a platform by bare host or full URL — the backend normalises it.
 *  `country` (ISO-2) optionally routes scrapes through a residential proxy in
 *  that country; omit/empty for the default egress. */
export function addIpMonitoringPlatform(ipId: string, domain: string, country?: string | null) {
  return request<{ platform: MonitoredDomain; jobs_enqueued: number }>(
    `/api/ip/${ipId}/monitoring/platforms`,
    { method: "POST", body: JSON.stringify({ domain, country: country ?? null }) },
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

export function dismissIpFinding(
  ipId: string,
  resultId: string,
  opts: { reason?: MonitoringReviewOutcome; reason_notes?: string | null } = {},
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
  }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/allow-product-image`,
    { method: "POST", body: JSON.stringify(opts) },
  );
}

export function undismissIpFinding(ipId: string, resultId: string) {
  return request<{ ok: boolean; restored: number }>(
    `/api/ip/${ipId}/monitoring/findings/${resultId}/undismiss`,
    { method: "POST" },
  );
}

/** Enforcement-pipeline transitions for a finding (all require the finding to
 *  have a linked case). Triage goes pending → takedown_sent (on send) → enforced;
 *  reopen jumps any state back to pending. */
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
  | "pending" | "takedown_sent" | "enforced" | "dismissed";
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

/** Full-tenant facet counts returned alongside every findings page. */
export interface MonitoringFacets {
  statuses: Record<string, number>;
  priorities: { high: number; med: number; low: number };
  platforms: Array<{ domain: string; n: number }>;
  ips: Array<{ ip_id: string; name: string | null; n: number }>;
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

export interface MonitoringFindingsQuery {
  priority?: MonitoringPriorityBand | null;
  status?: MonitoringStatusFilter | null;
  ip_id?: string | null;
  platform?: string | null;
  seller?: string | null;
  dismissal_reason?: MonitoringDismissalReasonFilter | null;
  candidate_outcome?: MonitoringCandidateOutcome | null;
  show_dismissed?: boolean;
  sort?: MonitoringSortMode;
  cursor?: string | null;
  limit?: number;
}

/**
 * One page of the tenant-wide monitoring findings feed. All filtering,
 * sorting, and keyset pagination happens server-side; the response also
 * carries the full-tenant facet counts so dropdowns stay accurate without
 * the client needing the whole result set.
 */
export function listMonitoringFindingsGlobal(
  opts: MonitoringFindingsQuery = {},
) {
  const params = new URLSearchParams();
  if (opts.priority)     params.set("priority", opts.priority);
  if (opts.status)       params.set("status", opts.status);
  if (opts.ip_id)        params.set("ip_id", opts.ip_id);
  if (opts.platform)     params.set("platform", opts.platform);
  if (opts.seller)       params.set("seller", opts.seller);
  if (opts.dismissal_reason) params.set("dismissal_reason", opts.dismissal_reason);
  if (opts.candidate_outcome) params.set("candidate_outcome", opts.candidate_outcome);
  if (opts.show_dismissed) params.set("show_dismissed", "true");
  if (opts.sort)         params.set("sort", opts.sort);
  if (opts.cursor)       params.set("cursor", opts.cursor);
  params.set("limit", String(opts.limit ?? 50));
  const qs = params.toString();
  return request<MonitoringFindingsPage>(
    `/api/monitoring/findings${qs ? `?${qs}` : ""}`,
  );
}

export function resortMonitoringFindings(
  resultIds: string[],
  candidateOutcome: MonitoringCandidateOutcome | null,
) {
  return request<{ ok: boolean; updated: number }>(
    "/api/monitoring/findings/resort",
    {
      method: "POST",
      body: JSON.stringify({
        result_ids: resultIds,
        candidate_outcome: candidateOutcome,
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
  platforms: {
    id: string;
    domain: string;
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
    in_progress: number;
    enforced_30d: number;
    high_risk: number;
    ips_monitored: number;
    platforms_monitored: number;
    /** SUM over open findings of (qty × price_usd). Pitch headline. */
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
    unlicensed_market_usd: number;
  }>;
  timeseries: Array<{ day: string; counts: Record<string, number> }>;
  platforms: Array<{ domain: string; counts: Record<string, number> }>;
  countries: Array<{ country: string; counts: Record<string, number> }>;
  // Unlicensed $ market (USD) per country, broken down by IP — the money twin
  // of `countries`, used by the market card's country view.
  marketByCountry: Array<{ country: string; counts: Record<string, number> }>;
  sellers: Array<{
    ip_id: string;
    ip_name: string | null;
    seller_name: string;
    domain: string;
    findings: number;
    rating: number | null;
    sales: number | null;
  }>;
}

export function getDashboardGroups(days?: number) {
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  const qs = params.toString();
  return request<DashboardGroups>(
    `/api/monitoring/dashboard/groups${qs ? `?${qs}` : ""}`,
  );
}
