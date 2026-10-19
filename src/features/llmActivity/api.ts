import { getAdminMonitoringOverview, getAdminMonitoringRun, type AdminMonitoringJob, type AdminMonitoringWorker } from "../../api/admin";
import { request } from "../../api/transport";
import { isRecord, requireResponse } from "../../api/validation";
import { isModelJob, jobActivity, parseLiveJob, type Activity, type LiveJob } from "./model";

export type Snapshot = { jobs: Activity[]; workers: AdminMonitoringWorker[]; asOf: string; warning: string | null };
export type Attempt = { id: string; attempt_number: number; status: string; error: string | null; worker_instance_id: string | null; started_at: string; completed_at: string | null };
export const getLiveJob = async (id: string, signal?: AbortSignal) => parseLiveJob(await request<unknown>(`/api/jobs/${encodeURIComponent(id)}`, { signal }), id);
export async function getAttempts(id: string, signal?: AbortSignal) {
  const value = await request<unknown>(`/api/admin/monitoring/jobs/${encodeURIComponent(id)}/attempts`, { signal });
  requireResponse(isRecord(value) && Array.isArray(value.attempts) && value.attempts.every(row => isRecord(row) && typeof row.id === "string" && Number.isInteger(row.attempt_number) && typeof row.status === "string" && typeof row.started_at === "string" && Number.isFinite(Date.parse(row.started_at)) && (row.completed_at === null || typeof row.completed_at === "string") && (row.error === null || typeof row.error === "string") && (row.worker_instance_id === null || typeof row.worker_instance_id === "string")), "job attempt response");
  return (value as { attempts: Attempt[] }).attempts;
}


export async function getComputeWorkers(signal?: AbortSignal): Promise<AdminMonitoringWorker[]> {
  const value = await request<unknown>("/api/admin/compute/workers", { signal });
  requireResponse(isRecord(value) && Array.isArray(value.workers), "compute fleet response");
  return (value as { workers: unknown[] }).workers.flatMap(raw => {
    requireResponse(isRecord(raw) && typeof raw.id === "string" && typeof raw.pool === "string" && typeof raw.provider === "string" && typeof raw.status === "string" && Array.isArray(raw.job_types) && raw.job_types.every(type => typeof type === "string") && (raw.current_job_id === null || typeof raw.current_job_id === "string") && (raw.last_heartbeat_at === null || typeof raw.last_heartbeat_at === "string"), "compute worker response");
    const row = raw as Record<string, unknown>;
    const lastSeen = Date.parse(typeof row.last_heartbeat_at === "string" ? row.last_heartbeat_at : typeof row.registered_at === "string" ? row.registered_at : "");
    if (!Number.isFinite(lastSeen) || lastSeen < Date.now() - 14 * 86400000) return [];
    const types = row.job_types as string[], execution = typeof row.execution_class === "string" ? row.execution_class : null;
    if (!types.some(type => isModelJob({ type, execution_class: execution })) && !execution) return [];
    const metadata = isRecord(row.metadata) ? row.metadata : {};
    const string = (key: string) => typeof row[key] === "string" ? row[key] as string : null;
    const meta = (key: string) => typeof metadata[key] === "string" ? metadata[key] as string : null;
    const heartbeat = Date.parse(string("last_heartbeat_at") ?? "");
    const age = Number.isFinite(heartbeat) ? Math.max(0, (Date.now() - heartbeat) / 1000) : null;
    const effective = age === null || heartbeat > Date.now() || age > 120 ? "offline" : row.drain_requested_at ? "draining" : String(row.status);
    return [{ id: String(row.id), pool: String(row.pool), provider: String(row.provider), provider_instance_id: string("provider_instance_id"), status: String(row.status), effective_status: effective, job_types: types,
      capabilities: { browser: false, gpu: string("runtime_mode") === "vllm", ml: true }, execution_class: execution, runtime_mode: string("runtime_mode"), profile_revision: typeof row.profile_revision === "number" ? row.profile_revision : null, image_sha: string("image_sha"), current_job_id: string("current_job_id"), current_job_type: string("current_job_type"), current_job_started_at: string("current_job_started_at"), current_work: null, drain_requested_at: string("drain_requested_at"), last_busy_at: string("last_busy_at"), registered_at: string("registered_at") ?? "", last_heartbeat_at: string("last_heartbeat_at"), heartbeat_age_seconds: age,
      hardware: { pod_name: meta("pod_name"), hostname: meta("hostname"), gpu_name: meta("gpu_name"), gpu_total_memory_gib: typeof metadata.gpu_total_memory_gib === "number" ? metadata.gpu_total_memory_gib : null }, startup: { phase: meta("startup_phase"), phase_started_at: meta("startup_phase_started_at"), error: meta("startup_error") } }];
  });
}

/** Uses deployed read-only endpoints; tracks non-monitoring jobs across worker release. */
export function createActivityReader() {
  const jobs = new Map<string, { job: AdminMonitoringJob | LiveJob; tenant: string; context: string }>();
  const workerHistory = new Map<string, AdminMonitoringWorker>();
  const runCache = new Map<string, number>();
  let hydrationOffset = 0;
  let historyWarning: string | null = null;
  const remember = (job: AdminMonitoringJob | LiveJob, tenant: string, context: string) => {
      if (!isModelJob(job)) return;
      if (["completed", "failed", "cancelled"].includes(job.status) && job.completed_at && Date.parse(job.completed_at) < Date.now() - 86400000) return;
      const previous = jobs.get(job.id);
      if (previous && (job.attempts < previous.job.attempts || (job.started_at && previous.job.started_at && Date.parse(job.started_at) < Date.parse(previous.job.started_at)))) return;
      if (previous && "result" in previous.job && !("result" in job) && previous.job.attempts === job.attempts && previous.job.started_at === job.started_at) {
        jobs.set(job.id, { ...previous, tenant, context }); return;
      }
      // Keep hydrated completed results when overview returns the same thinner row.
      jobs.set(job.id, { job: previous && "result" in previous.job && !('result' in job) && previous.job.status === job.status && previous.job.attempts === job.attempts && previous.job.started_at === job.started_at ? previous.job : job, tenant, context });
    };
  const loadHistory = async (signal: AbortSignal) => {
    try {
    const overview = await getAdminMonitoringOverview({ windowHours: 24, limit: 12, signal });
    for (const job of overview.active_work) remember(job, job.tenant_name ?? "Tenant not recorded", [job.ip_name, job.source_domain, job.candidate_title].filter(Boolean).join(" · "));
    const failures: string[] = [];
    const runs = overview.runs.filter(run => run.jobs.some(job => job.worker_kind === "ml" || job.worker_kind === "hybrid"))
      .filter(run => Date.now() - (runCache.get(run.run_id) ?? 0) > 60000).slice(0, 2);
    const histories = await Promise.allSettled(runs.map(run => getAdminMonitoringRun(run.run_id, signal)));
    histories.forEach((result, index) => {
      if (result.status === "rejected") { failures.push("Some recent run history could not be loaded."); return; }
      const run = runs[index]; runCache.set(run.run_id, Date.now());
      for (const job of result.value.jobs) remember(job, run.tenant_name ?? "Tenant not recorded", [run.ip_name, run.source_domain, run.keyword].filter(Boolean).join(" · "));
    });
    historyWarning = failures.length ? "Some recent monitoring history is unavailable; current worker activity is still shown." : null;
    } catch { if (!signal.aborted) historyWarning = "Recent monitoring history is unavailable; current worker activity is still shown."; }
  };
  const read = async (signal: AbortSignal): Promise<Snapshot> => {
    const fleet = await getComputeWorkers(signal);
    for (const worker of fleet) workerHistory.set(worker.id, worker);
    const failures: string[] = [];
    const activeIds = new Set(fleet.filter(worker => worker.effective_status === "busy" || (worker.current_job_started_at && Date.parse(worker.current_job_started_at) >= Date.now() - 86400000)).map(worker => worker.current_job_id).filter((id): id is string => Boolean(id)));
    for (const [id, record] of jobs) if (record.job.status === "in_progress") activeIds.add(id);
    const missingOutputs = [...jobs.values()].filter(record => record.job.status === "completed" && !("result" in record.job)).sort((a, b) => Date.parse(b.job.completed_at ?? "") - Date.parse(a.job.completed_at ?? ""));
    const ids = [...activeIds].slice(hydrationOffset, hydrationOffset + 8);
    hydrationOffset = activeIds.size > hydrationOffset + 8 ? hydrationOffset + 8 : 0;
    ids.push(...missingOutputs.slice(0, 2).map(record => record.job.id));
    // Bounded parallel reads; older observed work remains visible until its terminal status is fetched.
    const rawJobs = await Promise.allSettled([...new Set(ids)].map(id => getLiveJob(id, signal)));
    rawJobs.forEach(result => {
      if (result.status === "rejected") { failures.push("Some job outputs could not be refreshed."); return; }
      const job = result.value, previous = jobs.get(job.id), worker = workerHistory.get(job.worker_instance_id ?? "");
      remember(job, previous?.tenant ?? (job.tenant_id ? `Tenant ${job.tenant_id.slice(0, 8)}` : "System / shared catalog"), previous?.context || worker?.pool || "Model work");
    });
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const sorted = [...jobs.values()].sort((a, b) => Date.parse(b.job.completed_at ?? b.job.started_at ?? ("created_at" in b.job ? b.job.created_at : b.job.queued_at)) - Date.parse(a.job.completed_at ?? a.job.started_at ?? ("created_at" in a.job ? a.job.created_at : a.job.queued_at)));
    const retained = [...sorted.filter(row => row.job.status === "in_progress"), ...sorted.filter(row => row.job.status !== "in_progress")].slice(0, 100);
    const retainedIds = new Set(retained.map(row => row.job.id)); for (const id of jobs.keys()) if (!retainedIds.has(id)) jobs.delete(id);
    const observedWorkers = [...workerHistory.values()].map(worker => fleet.some(row => row.id === worker.id) ? worker : { ...worker, effective_status: "offline" });
    return { jobs: retained.map(record => jobActivity(record.job, observedWorkers, record)), workers: fleet, asOf: new Date().toISOString(), warning: [...new Set([...failures, ...(historyWarning ? [historyWarning] : [])])].join(" ") || null };
  };
  return Object.assign(read, { loadHistory });
}
