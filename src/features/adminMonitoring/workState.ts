import type { AdminJobQueueState, AdminMonitoringJob } from "../../api";

export const WORK_STATE_COPY: Record<AdminJobQueueState, { label: string; dot: string; text: string }> = {
  running: { label: "Running", dot: "bg-blue-500", text: "text-blue-700" },
  ready: { label: "Ready", dot: "bg-amber-400", text: "text-amber-700" },
  paused: { label: "Paused", dot: "bg-stone-400", text: "text-stone-600" },
  scheduled: { label: "Scheduled", dot: "bg-violet-400", text: "text-violet-700" },
};

export function workStateLabel(job: AdminMonitoringJob): string {
  if (job.queue_state === "scheduled" && (job.attempts > 0 || (job.deferral_count ?? 0) > 0)) return "Retry scheduled";
  if (job.queue_state) return WORK_STATE_COPY[job.queue_state].label;
  return job.status.replaceAll("_", " ").replace(/^./, character => character.toUpperCase());
}

export function workPauseReason(reason: string | null): string {
  const reasons: Record<string, string> = {
    "workload_paused:seller_expansion": "Seller expansion is paused",
    "workload_paused:country_reenrichment": "Country enrichment is paused",
    "workload_paused:product_pair_closure": "Product group follow-ups are paused",
    "workload_paused:runpod_validation": "Paused during worker validation",
    known_canary_failure: "Paused after a known worker failure",
  };
  return (reason && reasons[reason]) || "Work deliberately paused";
}
