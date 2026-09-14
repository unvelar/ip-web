import type { AdminMonitoringJob, AdminMonitoringRunJobStage } from "../../api";
import { jobExecutionKind, type ExecutionKind } from "./executions";
import { WORKER_KIND_COPY } from "./workerKinds";

export function WorkerTypeBadge({ kind, compact = false }: { kind: ExecutionKind; compact?: boolean }) {
  const copy = WORKER_KIND_COPY[kind];
  const Icon = copy.icon;
  return (
    <span title={copy.detail} aria-label={`${kind === "scrapfly" ? "Execution" : "Worker type"}: ${copy.label}`} className={`inline-flex shrink-0 items-center gap-1 rounded border ${compact ? "px-1" : "px-1.5"} py-0.5 text-[9px] font-semibold ${copy.style}`}>
      {!compact && <Icon className="h-3 w-3" />}{copy.label}
    </span>
  );
}

export function RunStageExecutionBadges({ stage }: {
  stage: Pick<AdminMonitoringRunJobStage, "worker_kind" | "execution_kinds">;
}) {
  const kinds = stage.execution_kinds?.length ? stage.execution_kinds : [stage.worker_kind];
  return <div className="mt-1 flex flex-wrap gap-1">
    {kinds.map(kind => <WorkerTypeBadge key={kind} kind={kind} compact />)}
  </div>;
}

export function JobExecutionBadge({ job }: { job: Pick<AdminMonitoringJob, "worker_kind" | "worker_instance_id" | "status"> }) {
  return <WorkerTypeBadge kind={jobExecutionKind(job)} />;
}
