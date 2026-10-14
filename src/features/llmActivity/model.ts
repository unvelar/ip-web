import type { AdminMonitoringJob, AdminMonitoringWorker } from "../../api/admin";
import { isRecord, requireResponse } from "../../api/validation";

export type ActivityState = "running" | "succeeded" | "failed" | "queued" | "held" | "cancelled" | "unknown";
export const stateLabels: Record<ActivityState, string> = { running: "Working", succeeded: "Succeeded", failed: "Failed", queued: "Queued", held: "On hold", cancelled: "Cancelled", unknown: "Worker unavailable" };
export type Activity = {
  id: string; worker: string; provider: string; type: string; title: string; tenant: string;
  context: string; model: string | null; state: ActivityState; phase: string; started: number | null;
  updated: number; elapsed: number | null; attempt: number; completedUnits: number | null;
  totalUnits: number | null; unit: string; input: Record<string, unknown>; raw: Record<string, unknown> | null;
  output: { label: string; value: string; detail: string }[]; summary: string;
  events: { label: string; detail: string; seconds: number | null }[];
};
export type LiveJob = {
  id: string; type: string; status: string; payload: Record<string, unknown>; result: Record<string, unknown> | null;
  error: string | null; attempts: number; max_attempts: number; worker_instance_id: string | null; tenant_id: string | null;
  created_at: string; started_at: string | null; completed_at: string | null; hold_reason: string | null;
  execution_class: string | null;
};
export const modelJobTypes = new Set(["monitor_strategy_infer", "monitor_score", "monitor_visual_check", "case_analyze", "index", "allow_product_image", "product_profile", "product_pair_rerank", "product_semantics", "product_authenticity", "review_playbook_consolidate", "caption_index_batch", "caption_reembed", "lawyer_view_index_batch", "clearance_review", "monitor_discover_strategy"]);
export function providerLabel(provider: string): string {
  const labels: Record<string, string> = { runpod: "RunPod", hivenet: "Hivenet", coordinator: "Coordinator", static: "Static" };
  return Object.hasOwn(labels, provider) ? labels[provider] : provider;
}
export const isModelJob = (job: { type: string; execution_class: string | null }) => Boolean(job.execution_class) || modelJobTypes.has(job.type);
export function parseLiveJob(value: unknown, id: string): LiveJob {
  requireResponse(isRecord(value) && value.id === id && typeof value.type === "string" && typeof value.status === "string" && ["pending", "in_progress", "completed", "failed", "cancelled"].includes(value.status)
    && isRecord(value.payload) && (value.result === null || isRecord(value.result)) && (value.error === null || typeof value.error === "string")
    && Number.isInteger(value.attempts) && typeof value.created_at === "string" && Number.isFinite(Date.parse(value.created_at))
    && [value.started_at, value.completed_at].every(date => date === null || (typeof date === "string" && Number.isFinite(Date.parse(date))))
    && (value.worker_instance_id === null || typeof value.worker_instance_id === "string")
    && (value.tenant_id === null || typeof value.tenant_id === "string")
    && (value.execution_class === null || typeof value.execution_class === "string"), "LLM job response");
  return value as unknown as LiveJob;
}

function safeText(text: string): string {
  return text.slice(0, 4000).replace(/https?:\/\/[^\s<>"']+/g, value => {
    try { const url = new URL(value); url.username = ""; url.password = ""; url.hash = ""; for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[redacted]"); return url.toString(); } catch { return "[redacted URL]"; }
  }).replace(/\b(bearer\s+|(?:token|secret|password|api[_-]?key|session)\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{12,}(?:\.[A-Za-z0-9_-]+){1,2}/g, "[redacted]");
}
/** Bounded display projection: large model vectors and credentials never enter the inspector. */
export function preview(value: Record<string, unknown>): Record<string, unknown> {
  let remaining = 24000;
  const visit = (item: unknown, depth: number): unknown => {
    if (remaining <= 0 || depth > 6) return "[preview truncated]";
    remaining -= 16;
    if (typeof item === "string") { const text = safeText(item).slice(0, Math.max(0, remaining)); remaining -= text.length; return text; }
    if (Array.isArray(item)) return [...item.slice(0, 20).map(child => visit(child, depth + 1)), ...(item.length > 20 ? [`[${item.length - 20} more items]`] : [])];
    if (isRecord(item)) return Object.fromEntries(Object.entries(item).slice(0, 40).map(([key, child]) => {
      const name = key.slice(0, 100); remaining -= name.length;
      return [name, /secret|password|token|cookie|authorization|credential|api.?key|database.?url|connection.?string/i.test(name) ? "[redacted]" : /embedding|vector|image_base64|screenshot_b64/i.test(name) ? "[large binary / vector omitted]" : visit(child, depth + 1)];
    }));
    return typeof item === "number" || typeof item === "boolean" || item === null ? item : null;
  };
  return visit(value, 0) as Record<string, unknown>;
}
function rows(result: Record<string, unknown>) {
  return Object.entries(result).slice(0, 6).map(([label, value]) => ({ label: label.replaceAll("_", " "), value: Array.isArray(value) ? `${value.length} items` : isRecord(value) ? `${Object.keys(value).length} fields` : String(value ?? "—").slice(0, 180), detail: Array.isArray(value) || isRecord(value) ? "Open JSON to inspect the bounded saved response." : "Recorded in the job result." }));
}
export function jobActivity(job: AdminMonitoringJob | LiveJob, workers: AdminMonitoringWorker[], context: { tenant?: string; context?: string } = {}, now = Date.now()): Activity {
  const worker = workers.find(item => item.id === job.worker_instance_id);
  const state: ActivityState = job.status === "completed" ? "succeeded" : job.status === "failed" ? "failed" : job.status === "cancelled" ? "cancelled" : job.status === "in_progress" ? (!worker || ["offline", "error", "drained"].includes(worker.effective_status) ? "unknown" : "running") : job.hold_reason ? "held" : "queued";
  const started = job.started_at ? Date.parse(job.started_at) : null;
  const completed = job.completed_at ? Date.parse(job.completed_at) : null;
  const payload = "payload" in job ? preview(job.payload) : {};
  // Results may belong to a previous claim while a job is retried. Display only a committed terminal result.
  const result = "result" in job && job.status === "completed" && job.result ? preview(job.result) : null;
  const output = result ? rows(result) : [];
  const model = result && typeof result.model === "string" ? result.model : null;
  const phase = state === "running" ? "Worker holds this job · output pending" : state === "unknown" ? "Claimed, but worker availability is unknown" : state === "held" ? `On hold: ${job.hold_reason}` : stateLabels[state];
  const summary = result ? (output.map(row => `${row.label}: ${row.value}`).join(" · ") || "Job completed with an empty result.") : state === "failed" ? safeText(job.error ?? "Job failed; no accepted output was saved.") : state === "succeeded" ? ("result" in job ? "Job completed, but no saved output is available." : "Job completed. Open the inspector to load its saved output.") : state === "running" ? "Processing input. No partial model response is exposed by the current API." : phase;
  return { id: job.id, type: job.type, worker: job.worker_instance_id ?? "Unassigned", provider: worker ? providerLabel(worker.provider) : "Unrecorded", tenant: context.tenant ?? "Tenant not recorded", title: job.type.replaceAll("_", " ").replace(/^./, text => text.toUpperCase()), context: context.context ?? (worker ? `${worker.pool} · ${job.execution_class ?? "CPU / remote model"}` : job.execution_class ?? "Execution location not recorded"), model, state, phase, started, updated: completed ?? started ?? Date.parse("created_at" in job ? job.created_at : job.queued_at), elapsed: started ? Math.max(0, Math.round(((completed ?? now) - started) / 1000)) : null, attempt: job.attempts,
    completedUnits: null, totalUnits: "capacity_units" in job ? job.capacity_units : null, unit: "capacity units", input: payload, raw: result, output, summary,
    events: [{ label: "Job queued", detail: "Recorded job creation", seconds: null }, ...(started ? [{ label: "Job claimed", detail: `Attempt ${job.attempts} · ${job.worker_instance_id ?? "unrecorded worker"}`, seconds: 0 }] : []), ...(completed ? [{ label: state === "succeeded" ? "Result accepted" : stateLabels[state], detail: job.error ? safeText(job.error) : "Recorded job completion", seconds: started ? Math.max(0, Math.round((completed - started) / 1000)) : null }] : [])],
  };
}
