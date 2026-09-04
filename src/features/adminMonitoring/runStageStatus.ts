import type {
  AdminMonitoringOperationState,
  AdminMonitoringRunJobStage,
} from "../../api";

export type MonitoringRunStageStatus = "waiting" | "queued" | "running" | "done" | "failed" | "not_needed" | "not_reached";

export function monitoringRunStageStatus(
  stage: AdminMonitoringRunJobStage | undefined,
  operationState: AdminMonitoringOperationState,
): MonitoringRunStageStatus {
  if (stage) {
    if (stage.failed_jobs > 0) return "failed";
    if (stage.in_progress_jobs > 0) return "running";
    if (stage.pending_jobs + stage.deferred_jobs > 0) return "queued";
    if (stage.completed_jobs > 0) return "done";
  }
  if (operationState === "completed") return "not_needed";
  if (operationState === "failed" || operationState === "removed") return "not_reached";
  return "waiting";
}
