import type {
  AdminMonitoringOperationState,
  AdminMonitoringRunJobStage,
} from "../../api";

export type MonitoringRunStageStatus = "waiting" | "queued" | "paused" | "scheduled" | "running" | "done" | "failed" | "not_needed" | "not_reached";

export function monitoringRunStageStatus(
  stage: AdminMonitoringRunJobStage | undefined,
  operationState: AdminMonitoringOperationState,
): MonitoringRunStageStatus {
  if (stage) {
    if (stage.failed_jobs > 0) return "failed";
    if (stage.in_progress_jobs > 0) return "running";
    if (stage.pending_jobs > 0) return "queued";
    if (stage.scheduled_jobs > 0) return "scheduled";
    if (stage.paused_jobs > 0) return "paused";
    if (stage.completed_jobs > 0) return "done";
  }
  if (operationState === "completed") return "not_needed";
  if (operationState === "failed" || operationState === "removed") return "not_reached";
  return "waiting";
}
