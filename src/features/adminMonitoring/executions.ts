import type { AdminMonitoringExecutionKind, AdminMonitoringJob, AdminMonitoringWorker, AdminMonitoringQueueStage, AdminMonitoringWorkerCapacity, AdminMonitoringWorkerDemand } from "../../api";

export type ExecutionKind = AdminMonitoringExecutionKind;
export type ExecutionDemand = Omit<AdminMonitoringWorkerDemand, "kind"> & { kind: ExecutionKind };

// The API reserves these identities for its one-job managed scraping processes and uses
// them to fence their claims. A scrape method alone never identifies an executor.
export function isManagedScrapeTask(workerId: string | null | undefined): boolean {
  return managedExecutionProvider(workerId) !== null;
}

function managedExecutionProvider(workerId: string | null | undefined): "scrapfly" | "scrapedo" | null {
  if (workerId?.startsWith("api-scrapedo-")) return "scrapedo";
  if (workerId?.startsWith("api-scrapfly-")) return "scrapfly";
  return null;
}

export function managedProviderLabel(workerId: string | null | undefined): string {
  const provider = managedExecutionProvider(workerId);
  return provider === "scrapedo" ? "Scrape.do" : provider === "scrapfly" ? "Scrapfly" : "Managed scraping";
}

export function jobExecutionKind(job: Pick<AdminMonitoringJob, "worker_kind" | "worker_instance_id" | "status">): ExecutionKind {
  return job.status !== "pending" ? managedExecutionProvider(job.worker_instance_id) ?? job.worker_kind : job.worker_kind;
}

export function managedExecutionName(job: Pick<AdminMonitoringJob, "id" | "attempts" | "worker_instance_id">): string {
  return `${managedProviderLabel(job.worker_instance_id)} task ${job.id.slice(0, 8)} · attempt ${job.attempts}`;
}

export function splitExecutionCapacity(capacity: AdminMonitoringWorkerCapacity, workers: AdminMonitoringWorker[], queues: AdminMonitoringQueueStage[]) {
  const tasks = workers.filter(worker => isManagedScrapeTask(worker.id) && !worker.drain_requested_at
    && queues.some(queue => queue.execution_routes.some(route => route.execution_class === worker.execution_class)
      && (worker.job_types.length === 0 || worker.job_types.includes(queue.type))));
  const busyTasks = tasks.filter(worker => worker.effective_status === "busy").length;
  const idleTasks = tasks.filter(worker => worker.effective_status === "idle").length;
  return {
    ...capacity,
    busy_workers: Math.max(0, capacity.busy_workers - busyTasks),
    idle_workers: Math.max(0, capacity.idle_workers - idleTasks),
    managed_tasks: busyTasks,
  };
}

// Ready jobs have no executor yet. Move only claimed tasks into the separate
// live-feed filter; never invent a second provider queue or duplicate its jobs.
export function executionDemand(demand: AdminMonitoringWorkerDemand[], jobs: AdminMonitoringJob[]): ExecutionDemand[] {
  const tasks = jobs.filter(job => job.queue_state === "running" && isManagedScrapeTask(job.worker_instance_id));
  return [
    ...demand.map(row => ({
      ...row,
      running_jobs: Math.max(0, row.running_jobs - tasks.filter(job => job.worker_kind === row.kind).length),
    })),
    ...(["scrapedo", "scrapfly"] as const).map(kind => ({
      kind, running_jobs: tasks.filter(job => jobExecutionKind(job) === kind).length, ready_jobs: 0, paused_jobs: 0,
      scheduled_jobs: 0, oldest_queued_at: null, busy_workers: 0, idle_workers: 0, unserved_ready_jobs: 0,
    })),
  ];
}
