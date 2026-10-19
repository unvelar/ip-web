import { expect, test } from "bun:test";
import type { MonitoredDomain, ReverseSearchRun } from "../src/api";
import { monitoringNextLabel, nextMonitoringAt, summarizeMonitoringPulse } from "../src/lib/monitoringPulse";

const source = { id: "a", enabled: true, connected: true, setup_status: "ready", last_run_at: "2026-10-08T13:00:00Z" } as MonitoredDomain;
const run = { id: "one", domain_id: "a", status: "completed", completed_at: "2026-10-08T13:10:00Z", cases_created: 0, results_found: 52 } as ReverseSearchRun;

test("next eligibility uses elapsed days and clamps a calendar month at month end", () => {
  expect(nextMonitoringAt("2026-01-31T15:00:00Z", "monthly")).toBe("2026-02-28T15:00:00.000Z");
  expect(nextMonitoringAt("2028-01-31T15:00:00Z", "monthly")).toBe("2028-02-29T15:00:00.000Z");
  expect(nextMonitoringAt("2026-10-24T15:00:00Z", "daily")).toBe("2026-10-25T15:00:00.000Z");
});

test("last scan counts newly added listings, preserves zero and excludes other sources and unfinished jobs", () => {
  const pulse = summarizeMonitoringPulse(true, "weekly", [source], [
    run,
    { ...run, id: "other", domain_id: "other", completed_at: "2026-10-09T13:10:00Z", cases_created: 99 },
    { ...run, id: "running", status: "running", completed_at: null, cases_created: 7 },
    { ...run, id: "older", completed_at: "2026-10-07T13:10:00Z", cases_created: 8 },
  ]);
  expect(pulse).toEqual({ state: "live", nextAt: "2026-10-15T13:00:00.000Z", latestRun: { completedAt: run.completed_at, newListings: 0 } });
});

test("tenant and IP pauses override source readiness and no ready sources cannot show Live", () => {
  expect(summarizeMonitoringPulse(false, "weekly", [source], [run]).state).toBe("paused");
  expect(summarizeMonitoringPulse(true, "off", [source], [run]).state).toBe("paused");
  expect(summarizeMonitoringPulse(true, "weekly", [{ ...source, connected: false }], []).state).toBe("setup");
  expect(summarizeMonitoringPulse(true, "weekly", [{ ...source, enabled: false }], []).state).toBe("setup");
});

test("earliest ready source wins, overdue scans stay due, and no completed job stays unknown", () => {
  const pulse = summarizeMonitoringPulse(true, "daily", [source, { ...source, id: "b", last_run_at: null }], []);
  expect(pulse.nextAt).toBeNull();
  expect(pulse.latestRun).toBeNull();
  expect(monitoringNextLabel(pulse)).toBe("Next scan due");
  expect(monitoringNextLabel({ ...pulse, nextAt: "2026-10-08T13:00:00Z" }, Date.parse("2026-10-09T13:00:00Z"))).toBe("Next scan due");
});

test("invalid run counts cannot be shown as a successful zero-result scan", () => {
  expect(() => summarizeMonitoringPulse(true, "daily", [source], [{ ...run, cases_created: NaN }])).toThrow("invalid monitoring run");
});
