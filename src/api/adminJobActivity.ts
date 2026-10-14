import type { AdminMonitoringWorkerKind } from "./admin";
import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

export const JOB_ACTIVITY_KINDS = ["ml", "browser", "hybrid", "unknown"] as const;
export type JobActivityCounts = Record<AdminMonitoringWorkerKind, number>;
export type JobActivityWindow = 1 | 6 | 24 | 72 | 168;

export interface AdminJobActivity {
  as_of: string;
  since: string;
  window_hours: JobActivityWindow;
  bucket_minutes: number;
  recent_minutes: number;
  summary: Array<{
    kind: AdminMonitoringWorkerKind;
    completed_jobs: number;
    average_jobs_per_minute: number;
    recent_jobs_per_minute: number;
  }>;
  series: Array<{
    started_at: string;
    ended_at: string;
    completed: JobActivityCounts;
    per_minute: JobActivityCounts;
  }>;
}

const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const nonNegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const count = (value: unknown): value is number => nonNegative(value) && Number.isSafeInteger(value);
const counts = (value: unknown, integers: boolean) => isRecord(value)
  && JOB_ACTIVITY_KINDS.every(kind => integers ? count(value[kind]) : nonNegative(value[kind]));

export async function getAdminJobActivity(windowHours: JobActivityWindow, signal?: AbortSignal): Promise<AdminJobActivity> {
  const data = await request<unknown>(`/api/admin/monitoring/job-activity?window_hours=${windowHours}`, { signal });
  const context = "job activity history";
  requireResponse(isRecord(data), context);
  requireResponse(timestamp(data.as_of) && timestamp(data.since)
    && Date.parse(data.as_of) - Date.parse(data.since) === windowHours * 3_600_000
    && data.window_hours === windowHours
    && nonNegative(data.bucket_minutes) && data.bucket_minutes > 0
    && nonNegative(data.recent_minutes) && data.recent_minutes > 0, context);
  const summary = data.summary;
  requireResponse(Array.isArray(summary) && summary.length === JOB_ACTIVITY_KINDS.length
    && JOB_ACTIVITY_KINDS.every(kind => summary.filter((row: unknown) => isRecord(row) && row.kind === kind).length === 1)
    && summary.every(row => isRecord(row) && count(row.completed_jobs)
      && nonNegative(row.average_jobs_per_minute) && nonNegative(row.recent_jobs_per_minute)), context);
  requireResponse(Array.isArray(data.series) && data.series.length > 0 && data.series.length <= 400, context);
  let previousEnd = data.since;
  for (const point of data.series) {
    requireResponse(isRecord(point) && timestamp(point.started_at) && timestamp(point.ended_at)
      && point.started_at === previousEnd && Date.parse(point.ended_at) > Date.parse(point.started_at)
      && counts(point.completed, true) && counts(point.per_minute, false), context);
    previousEnd = point.ended_at;
  }
  requireResponse(previousEnd === data.as_of, context);
  return data as unknown as AdminJobActivity;
}
