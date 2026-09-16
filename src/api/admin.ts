import { computeRuntimeSettingsPatchBody } from "../computeRuntimeSettings";
import { API, authHeaders, request } from "./transport";

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

export interface ComputeRuntimeSettings {
  maxPods: number;
  jobsPerPodTarget: number;
  firstPodQueueThreshold: number;
  minimumPods?: number;
  minimumPodsUntil?: string | null;
  executionClass: string;
  runtimeMode: "vllm";
  minimumGpuMemoryGb: number;
  gpuTypeIds: string[];
}

export interface ComputeRuntimeSettingsRecord {
  pool: string;
  version: number;
  profile_revision: number;
  settings: ComputeRuntimeSettings;
  updated_at: string;
}

export function getComputeRuntimeSettings() {
  return request<ComputeRuntimeSettingsRecord>("/api/admin/compute/settings");
}

export function patchComputeRuntimeSettings(
  expectedVersion: number,
  settings: Partial<Pick<
    ComputeRuntimeSettings,
    "maxPods" | "firstPodQueueThreshold" | "jobsPerPodTarget" | "minimumPods" | "minimumPodsUntil"
  >>,
  minimumPodsDurationHours?: 4 | 8 | 24,
) {
  return request<ComputeRuntimeSettingsRecord>("/api/admin/compute/settings", {
    method: "PATCH",
    body: JSON.stringify(computeRuntimeSettingsPatchBody(
      expectedVersion,
      settings,
      minimumPodsDurationHours,
    )),
  });
}

export interface ComputeJobRoute {
  job_type: string;
  execution_class: string;
  capacity_units: number;
  version: number;
  updated_at: string;
}

export interface ComputeProfileRecord extends ComputeRuntimeSettingsRecord {
  job_types: string[];
  status: {
    pending_jobs: number;
    in_progress_jobs: number;
    desired_instances: number;
    on_instances: number;
    provisioning_instances: number;
    ready_instances: number;
    busy_workers: number;
    idle_workers: number;
    last_decision: string | null;
    last_reason: string | null;
    last_error: string | null;
    metadata: Record<string, unknown>;
  } | null;
  workers: Array<{
    id: string;
    status: string;
    execution_class: string | null;
    runtime_mode: string | null;
    profile_revision: number | null;
    image_sha: string | null;
    metadata: Record<string, unknown>;
  }>;
}

export function getComputeProfiles() {
  return request<{ profiles: ComputeProfileRecord[]; routes: ComputeJobRoute[] }>(
    "/api/admin/compute/profiles",
  );
}

export function patchComputeProfileSettings(
  pool: string,
  expectedVersion: number,
  settings: Pick<ComputeRuntimeSettings, "gpuTypeIds" | "minimumGpuMemoryGb">,
) {
  return request<ComputeRuntimeSettingsRecord>("/api/admin/compute/settings", {
    method: "PATCH",
    body: JSON.stringify(
      computeRuntimeSettingsPatchBody(expectedVersion, settings, undefined, pool),
    ),
  });
}

export function patchComputeJobRoute(
  jobType: string,
  executionClass: string,
  expectedVersion: number,
) {
  return request<{ route: ComputeJobRoute }>(
    `/api/admin/compute/routes/${encodeURIComponent(jobType)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ executionClass, expectedVersion }),
    },
  );
}

export type AdminMonitoringRunFilter = "all" | "active" | "completed" | "cancelled" | "failed" | "attention";
export type AdminMonitoringOperationState = "queued" | "processing" | "paused" | "scheduled" | "completed" | "cancelled" | "failed" | "stalled" | "removed";

export interface AdminMonitoringQueueStage {
  type: string;
  execution_routes: Array<{ execution_class: string | null; pending_jobs: number }>;
  worker_kind: AdminMonitoringWorkerKind;
  worker_capacity: AdminMonitoringWorkerCapacity;
  pending_jobs: number;
  deferred_jobs: number;
  paused_jobs: number;
  scheduled_jobs: number;
  in_progress_jobs: number;
  pending_units: number;
  in_progress_units: number;
  oldest_queued_at: string | null;
  timing?: {
    average_seconds: number | null;
    sample_size: number;
    window_hours: number;
  };
}

export interface AdminMonitoringRunJobStage {
  type: string;
  worker_kind: AdminMonitoringWorkerKind;
  execution_kinds?: AdminMonitoringExecutionKind[];
  pending_jobs: number;
  deferred_jobs: number;
  paused_jobs: number;
  scheduled_jobs: number;
  in_progress_jobs: number;
  completed_jobs: number;
  cancelled_jobs?: number;
  failed_jobs: number;
  pending_units: number;
  in_progress_units: number;
  oldest_queued_at: string | null;
  latest_error: string | null;
}

export interface AdminMonitoringScrapeEvidence {
  source: "worker" | "candidates" | "job_result" | "page_capture" | "not_recorded";
  steps: Array<{
    method: "marketplace_specific" | "nodriver" | "scrapfly" | "web_search";
    role: "primary" | "fallback" | "shadow" | "reused";
    provider: string | null;
    recorded_at: string | null;
    outcome?: "started" | "ready" | "unavailable" | "failed" | "blocked" | "skipped" | null;
    reason?: string | null;
    diagnostics?: CaptureDiagnostics | null;
  }>;
}

export interface AdminMonitoringRunActivity {
  scrape?: AdminMonitoringScrapeEvidence;
  run_id: string;
  tenant_id: string;
  tenant_name: string | null;
  ip_catalog_id: string | null;
  ip_name: string | null;
  ip_retired_at: string | null;
  domain_id: string | null;
  source_domain: string | null;
  source_name: string | null;
  source_type: string | null;
  keyword: string | null;
  source_kind: string | null;
  status: string;
  error: string | null;
  images_searched: number;
  results_found: number;
  results_after_filter: number;
  cases_created: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  candidate_count: number;
  finding_count: number;
  page_event_count: number;
  decision_event_count: number;
  confirmed_check_count: number;
  rejected_check_count: number;
  screened_out_check_count: number;
  suppressed_check_count: number;
  not_evaluated_check_count: number;
  evidence_conflict_count: number;
  jobs: AdminMonitoringRunJobStage[];
  operation: {
    state: AdminMonitoringOperationState;
    label: string;
    detail: string;
  };
}

export interface AdminMonitoringWorker {
  id: string;
  pool: string;
  provider: string;
  provider_instance_id: string | null;
  status: string;
  effective_status: string;
  job_types: string[];
  capabilities: { browser: boolean; gpu: boolean; ml: boolean };
  execution_class: string | null;
  runtime_mode: string | null;
  profile_revision: number | null;
  image_sha: string | null;
  current_job_id: string | null;
  current_job_type: string | null;
  current_job_started_at: string | null;
  current_work: AdminMonitoringActiveWorkItem | null;
  drain_requested_at: string | null;
  last_busy_at: string | null;
  registered_at: string;
  last_heartbeat_at: string | null;
  heartbeat_age_seconds: number | null;
  hardware: {
    pod_name: string | null;
    hostname: string | null;
    gpu_name: string | null;
    gpu_total_memory_gib: number | null;
  };
  startup: {
    phase: string | null;
    phase_started_at: string | null;
    error: string | null;
  };
}

export interface AdminMonitoringOverview {
  generated_at: string;
  window_hours: number;
  summary: {
    attention_runs: number;
    failed_work_runs: number;
    active_runs: number;
    completed_runs: number;
    cancelled_runs?: number;
    failed_runs: number;
    candidates: number;
    findings: number;
    not_evaluated_checks: number;
    evidence_conflicts: number;
    queued_jobs: number;
    deferred_jobs: number;
    paused_jobs: number;
    scheduled_jobs: number;
    queued_units: number;
    running_jobs: number;
    workers: { busy: number; idle: number; starting: number; offline: number };
  };
  queue: AdminMonitoringQueueStage[];
  worker_demand: AdminMonitoringWorkerDemand[];
  workers: AdminMonitoringWorker[];
  runpod: {
    coordinators: AdminMonitoringRunpodCoordinator[];
    instances: AdminMonitoringRunpodInstance[];
  };
  active_work: AdminMonitoringActiveWorkItem[];
  runs: AdminMonitoringRunActivity[];
}

export interface AdminMonitoringJob {
  scrape?: AdminMonitoringScrapeEvidence | null;
  id: string;
  type: string;
  worker_kind: AdminMonitoringWorkerKind;
  status: string;
  queue_state: AdminJobQueueState | null;
  hold_reason: string | null;
  held_at: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  deferral_count?: number;
  access_wait_only?: boolean;
  access_cooling_down?: boolean;
  capacity_units: number;
  execution_class: string | null;
  queued_at: string;
  available_at: string;
  started_at: string | null;
  completed_at: string | null;
  worker_instance_id: string | null;
  worker_status: string | null;
  worker_image_sha: string | null;
  worker_last_heartbeat_at: string | null;
  batch_index: number | null;
  batch_count: number | null;
}

export interface AdminMonitoringActiveWorkItem extends AdminMonitoringJob {
  queue_state: AdminJobQueueState;
  case_id: string | null;
  run_id: string | null;
  tenant_id: string | null;
  tenant_name: string | null;
  monitor_candidate_id: string | null;
  candidate_title: string | null;
  candidate_page_url: string | null;
  candidate_image_url: string | null;
  ip_catalog_id: string | null;
  ip_name: string | null;
  domain_id: string | null;
  source_domain: string | null;
  source_name: string | null;
  keyword: string | null;
  scope_count: number;
  deferred: boolean;
}

export interface AdminMonitoringRunpodCoordinator {
  pool: string;
  enabled: boolean;
  dry_run: boolean;
  pending_jobs: number;
  in_progress_jobs: number;
  oldest_queued_at: string | null;
  desired_instances: number;
  active_instances: number;
  provisioning_instances: number;
  on_instances: number;
  ready_instances: number;
  preparing_instances: number;
  draining_instances: number;
  busy_workers: number;
  idle_workers: number;
  last_decision: string | null;
  last_reason: string | null;
  last_error: string | null;
  last_reconciled_at: string | null;
}

export interface AdminMonitoringRunpodInstance {
  id: string;
  pool: string;
  provider: string;
  provider_instance_id: string;
  worker_instance_id: string | null;
  name: string;
  status: string;
  requested_at: string;
  started_at: string | null;
  stopped_at: string | null;
  last_observed_at: string;
}

export interface AdminMonitoringAuditEvidence {
  id: string;
  disposition: string | null;
  top_ip: string | null;
  similarity_score: number | null;
  inliers: number | null;
  match_method: string | null;
  vlm_verdict: string | null;
  vlm_confidence: number | null;
  vlm_reasoning: string | null;
  ip_catalog_id: string | null;
  reference_image_id: string | null;
  created_at: string;
  repair?: { reason: string; created_at: string; original_row: Record<string, unknown> } | null;
}

export interface AdminMonitoringCandidate {
  id: string;
  run_id: string;
  tenant_id: string;
  page_url: string;
  page_url_key: string | null;
  image_url: string | null;
  title: string | null;
  domain: string;
  source_method: string | null;
  marketplace_snapshot_id: string | null;
  source_provider: string | null;
  source_transport: string | null;
  page_kind: string | null;
  actionability: string | null;
  qualification_confidence: number | null;
  qualification_classifier: string | null;
  qualification_evidence: unknown;
  qualification_policy_version: string | null;
  capture_ref: Record<string, unknown> | null;
  qualified_at: string | null;
  created_at: string;
  debug: {
    pipeline: {
      state: string;
      label: string;
      detail: string;
    };
    decision: {
      state: "pending" | "confirmed" | "rejected" | "screened_out" | "suppressed" | "not_evaluated" | "cancelled" | "failed";
      label: string;
      code: string | null;
      phase: "pipeline" | "matching" | "visual" | "qualification";
      explanation: string;
      integrity: "consistent" | "missing" | "conflict";
      audit_id: string | null;
      vlm_verdict: string | null;
      vlm_confidence: number | null;
      vlm_reasoning: string | null;
      similarity_score: number | null;
      inliers: number | null;
      match_method: string | null;
      ip_catalog_id: string | null;
      reference_image_id: string | null;
    };
  };
  audits: AdminMonitoringAuditEvidence[];
  comparisons?: Array<{
    ip_catalog_id: string | null;
    top_ip: string | null;
    reference_image_id: string | null;
    decision: AdminMonitoringCandidate["debug"]["decision"];
  }>;
  results: Array<{
    id: string;
    run_id: string;
    monitor_candidate_id: string | null;
    source_image_id: string;
    lifecycle_state: string;
    current_disposition: string | null;
    current_reason_code: string | null;
    similarity_score: number | null;
    match_method: string | null;
    vlm_verdict: string | null;
    vlm_confidence: number | null;
    vlm_reasoning: string | null;
    case_id: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  references: Array<{
    id: string;
    ip_catalog_id: string;
    status: string;
    url: string | null;
  }>;
  jobs: {
    score: AdminMonitoringJob[];
    visual: Array<AdminMonitoringJob & {
      task: {
        candidate_id: string;
        ip_catalog_id: string;
        reference_image_id: string;
        top_ip: string | null;
        similarity_score: number | null;
        match_method: string | null;
        check_kind: string | null;
      };
    }>;
    qualification: AdminMonitoringJob[];
  };
}

export interface AdminMonitoringRunDetail {
  generated_at: string;
  run: Omit<AdminMonitoringRunActivity, "jobs" | "operation">;
  jobs: AdminMonitoringJob[];
  pages: Array<{
    id: string;
    source_method: string | null;
    url: string | null;
    http_status: number | null;
    blocked: boolean | null;
    harvested_count: number | null;
    disposition: string | null;
    screenshot_url: string | null;
    created_at: string;
  }>;
  candidates: AdminMonitoringCandidate[];
  unmatched_candidate_audits: Array<{
    id: string;
    url: string | null;
    disposition: string | null;
    vlm_verdict: string | null;
    created_at: string;
  }>;
}

export async function getAdminMonitoringOverview(opts: {
  windowHours?: 1 | 6 | 24 | 72 | 168;
  status?: AdminMonitoringRunFilter;
  query?: string;
  limit?: number;
  signal?: AbortSignal;
} = {}) {
  const qs = new URLSearchParams();
  if (opts.windowHours) qs.set("window_hours", String(opts.windowHours));
  if (opts.status) qs.set("status", opts.status);
  if (opts.query) qs.set("q", opts.query);
  if (opts.limit) qs.set("limit", String(opts.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const overview = await request<AdminMonitoringOverview>(`/api/admin/monitoring/overview${suffix}`, {
    signal: opts.signal,
  });
  if (!Number.isFinite(overview.summary.paused_jobs)
    || !Number.isFinite(overview.summary.scheduled_jobs)
    || !Array.isArray(overview.worker_demand)
    || overview.runs.some(run => run.jobs.some(stage => stage.execution_kinds !== undefined
      && (!Array.isArray(stage.execution_kinds) || stage.execution_kinds.some(kind =>
        kind !== "scrapfly" && !isAdminMonitoringWorkerKind(kind)))))
    || overview.worker_demand.some(row => !isAdminMonitoringWorkerKind(row.kind))
    || overview.queue.some(queue => !isAdminMonitoringWorkerKind(queue.worker_kind) || !queue.worker_capacity)
    || overview.active_work.some(job => !isAdminMonitoringWorkerKind(job.worker_kind)
      || !["running", "ready", "paused", "scheduled"].includes(job.queue_state))) {
    throw new Error("The server has not provided complete worker and queue status yet. This page will retry automatically.");
  }
  return overview;
}

export async function getAdminMonitoringRun(runId: string, signal?: AbortSignal) {
  const detail = await request<AdminMonitoringRunDetail>(
    `/api/admin/monitoring/runs/${encodeURIComponent(runId)}`,
    { signal },
  );
  if (detail.jobs.some(job => !isAdminMonitoringWorkerKind(job.worker_kind))
    || detail.candidates.some(candidate => Object.values(candidate.jobs).flat().some(job => !isAdminMonitoringWorkerKind(job.worker_kind)))) {
    throw new Error("Worker details are still updating. This page will retry automatically.");
  }
  return detail;
}

export interface TenantUsageStats {
  accounts: number;
  ips: number;
  ip_images: number;
  cases: number;
  case_comments: number;
  jobs: number;
  monitored_domains: number;
  reverse_search_runs: number;
  monitor_candidates: number;
  monitor_audit: number;
  ip_reviews: number;
  takedown_requests: number;
  visual_match_feedback: number;
  api_keys: number;
  ip_licenses: number;
  cleared_listings: number;
  allowed_product_images: number;
  monitoring_campaigns: number;
  monitoring_campaign_findings: number;
  public_intakes: number;
}

export interface Tenant {
  id: string;
  name: string | null;
  public_slug: string | null;
  email_domain: string | null;
  owner_workos_user_id: string | null;
  created_at: string;
  usage?: TenantUsageStats;
  usage_total?: number;
}

/** Human label for a tenant in the admin switcher. */
export function tenantLabel(t: Tenant): string {
  return t.name || t.email_domain || t.id;
}

/** All tenants, for the admin "operate as any tenant" switcher. Admin-only. */
export function listTenants(opts: { includeUsage?: boolean } = {}) {
  const qs = new URLSearchParams();
  if (opts.includeUsage) qs.set("include_usage", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ tenants: Tenant[] }>(`/api/admin/tenants${suffix}`);
}

export function createTenant(name: string) {
  return request<{ tenant: Tenant }>(`/api/admin/tenants`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function simulateSuccessfulLogin(email: string) {
  return request<{
    tenant: Tenant;
    user: { id: string; email: string; tenant_id: string };
    token: string;
    start_path: string;
  }>(`/api/admin/tenants/simulate-login`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function deleteTenant(id: string) {
  return request<{
    ok: boolean;
    tenant: Tenant;
    deleted: TenantUsageStats;
    deleted_total: number;
    storage_deleted: number;
    storage_failed: number;
  }>(`/api/admin/tenants/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
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
  return request<{ ok: boolean; cleanup_queued: number }>(
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


export type AdminMonitoringWorkerKind = "ml" | "browser" | "hybrid" | "unknown";

export type AdminMonitoringExecutionKind = AdminMonitoringWorkerKind | "scrapfly";


export interface AdminMonitoringWorkerCapacity {
  busy_workers: number;
  idle_workers: number;
  unserved_ready_jobs: number;
}


export interface AdminMonitoringWorkerDemand extends AdminMonitoringWorkerCapacity {
  kind: AdminMonitoringWorkerKind;
  ready_jobs: number;
  running_jobs: number;
  paused_jobs: number;
  scheduled_jobs: number;
  oldest_queued_at: string | null;
}


export interface CaptureDiagnostics {
  version: 1;
  code: string;
  message: string;
  requested_url: string | null;
  final_url: string | null;
  source_url: string | null;
  http_status: number | null;
  provider_status: number | null;
  title: string | null;
  html_length: number | null;
  document_sha256: string | null;
  content_contract_passed: boolean | null;
  contract_code: string | null;
  page_kind: string | null;
  signals: string[];
  page_url_hints: string[];
  parser_errors: string[];
  exception_type: string | null;
  challenge: { family: string | null; provider: string | null; variant: string | null; signals: string[] } | null;
}


export interface AdminCaptureAttempt {
  id: string;
  attempt_number: number;
  status: string;
  error: string | null;
  worker_instance_id: string | null;
  worker_image_sha: string | null;
  scrapfly_overflow: boolean;
  started_at: string;
  completed_at: string | null;
  scrape: AdminMonitoringScrapeEvidence;
}


export function getAdminCaptureAttempts(jobId: string, before?: string | null) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return request<{ attempts: AdminCaptureAttempt[]; next_cursor: string | null }>(
    `/api/admin/monitoring/jobs/${encodeURIComponent(jobId)}/attempts${query}`,
  );
}


export type AdminJobQueueState = "running" | "ready" | "paused" | "scheduled";


function isAdminMonitoringWorkerKind(kind: unknown): kind is AdminMonitoringWorkerKind {
  return typeof kind === "string" && ["ml", "browser", "hybrid", "unknown"].includes(kind);
}
