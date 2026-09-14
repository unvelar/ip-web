import type { AdminMonitoringExecutionKind, AdminMonitoringJob, AdminMonitoringWorker, AdminMonitoringQueueStage, AdminMonitoringWorkerCapacity, AdminMonitoringWorkerDemand } from "../../api";

export type ExecutionKind = AdminMonitoringExecutionKind;
export type ExecutionDemand = Omit<AdminMonitoringWorkerDemand, "kind"> & { kind: ExecutionKind };

// The API reserves this identity for its one-job Scrapfly processes and uses
// it to fence their claims. A scrape method alone never identifies an executor.
export function isScrapflyTask(workerId: string | null | undefined): boolean {
  return workerId?.startsWith("api-scrapfly-") === true;
}

export function jobExecutionKind(job: Pick<AdminMonitoringJob, "worker_kind" | "worker_instance_id" | "status">): ExecutionKind {
  return job.status !== "pending" && isScrapflyTask(job.worker_instance_id) ? "scrapfly" : job.worker_kind;
}

export function scrapflyExecutionName(job: Pick<AdminMonitoringJob, "id" | "attempts">): string {
  return `Scrapfly task ${job.id.slice(0, 8)} · attempt ${job.attempts}`;
}

export function splitExecutionCapacity(capacity: AdminMonitoringWorkerCapacity, workers: AdminMonitoringWorker[], queues: AdminMonitoringQueueStage[]) {
  const tasks = workers.filter(worker => isScrapflyTask(worker.id) && !worker.drain_requested_at
    && queues.some(queue => queue.execution_routes.some(route => route.execution_class === worker.execution_class)
      && (worker.job_types.length === 0 || worker.job_types.includes(queue.type))));
  const busyTasks = tasks.filter(worker => worker.effective_status === "busy").length;
  const idleTasks = tasks.filter(worker => worker.effective_status === "idle").length;
  return {
    ...capacity,
    busy_workers: Math.max(0, capacity.busy_workers - busyTasks),
    idle_workers: Math.max(0, capacity.idle_workers - idleTasks),
    scrapfly_tasks: busyTasks,
  };
}

// Ready jobs have no executor yet. Move only claimed tasks into the separate
// live-feed filter; never invent a second Scrapfly queue or duplicate its jobs.
export function executionDemand(demand: AdminMonitoringWorkerDemand[], jobs: AdminMonitoringJob[]): ExecutionDemand[] {
  const tasks = jobs.filter(job => job.queue_state === "running" && jobExecutionKind(job) === "scrapfly");
  return [
    ...demand.map(row => ({
      ...row,
      running_jobs: Math.max(0, row.running_jobs - tasks.filter(job => job.worker_kind === row.kind).length),
    })),
    {
      kind: "scrapfly", running_jobs: tasks.length, ready_jobs: 0, paused_jobs: 0,
      scheduled_jobs: 0, oldest_queued_at: null, busy_workers: 0, idle_workers: 0, unserved_ready_jobs: 0,
    },
  ];
}
