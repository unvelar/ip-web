import type { MonitoredDomain, MonitoringFrequency, ReverseSearchRun } from "../api";
import { requireResponse } from "../api/validation";

export interface MonitoringPulse {
  state: "live" | "paused" | "setup";
  nextAt: string | null;
  latestRun: { completedAt: string; newListings: number } | null;
}

/** Mirror the scheduler's elapsed-day and calendar-month cadence in UTC.
 * This is the next eligibility time; worker availability can delay execution. */
export function nextMonitoringAt(lastRunAt: string, frequency: Exclude<MonitoringFrequency, "off">): string {
  const date = new Date(lastRunAt);
  requireResponse(Number.isFinite(date.getTime()), "monitoring schedule");
  if (frequency === "monthly") {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  } else {
    date.setUTCDate(date.getUTCDate() + (frequency === "daily" ? 1 : 7));
  }
  return date.toISOString();
}

export function summarizeMonitoringPulse(
  enabled: boolean,
  frequency: MonitoringFrequency,
  platforms: MonitoredDomain[],
  runs: ReverseSearchRun[],
): MonitoringPulse {
  requireResponse(typeof enabled === "boolean" && ["daily", "weekly", "monthly", "off"].includes(frequency), "monitoring settings");
  const sources = platforms.filter(source => source.enabled);
  const sourceIds = new Set(platforms.map(source => source.id));
  const completed = runs.filter(run => sourceIds.has(run.domain_id ?? "") && run.status === "completed" && run.completed_at);
  for (const run of completed) {
    requireResponse(Number.isFinite(Date.parse(run.completed_at!)) && Number.isSafeInteger(run.cases_created) && run.cases_created >= 0, "monitoring run");
  }
  completed.sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!));
  const latest = completed[0];
  const latestRun = latest ? { completedAt: latest.completed_at!, newListings: latest.cases_created } : null;
  if (!enabled || frequency === "off") return { state: "paused", nextAt: null, latestRun };
  const ready = sources.filter(source => source.connected === true && source.setup_status === "ready");
  if (!ready.length) return { state: "setup", nextAt: null, latestRun };
  const dates = ready.map(source => source.last_run_at ? nextMonitoringAt(source.last_run_at, frequency) : null);
  return { state: "live", nextAt: dates.includes(null) ? null : dates.sort()[0], latestRun };
}

export function monitoringNextLabel(pulse: MonitoringPulse, now = Date.now()): string {
  if (pulse.state === "paused") return "Monitoring paused";
  if (pulse.state === "setup") return "Preparing monitoring";
  if (!pulse.nextAt || Date.parse(pulse.nextAt) <= now) return "Next scan due";
  const date = new Date(pulse.nextAt);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === today.toDateString()) return `Next ~${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Next tomorrow, ~${time}`;
  return `Next ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ~${time}`;
}
