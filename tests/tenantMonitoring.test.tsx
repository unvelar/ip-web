import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { parseTenantMonitoringSummaries } from "../src/api/tenantMonitoring";
import { TenantMonitoringStats } from "../src/features/adminMonitoring/TenantMonitoringStats";

test("monitoring summaries preserve zero and never, and reject missing or corrupt data", () => {
  const row = { tenant_id: "tenant-a", task_count: 0, pending_task_count: 0, last_monitored_at: null };
  expect(parseTenantMonitoringSummaries({ summaries: [row] })).toEqual([row]);
  for (const summaries of [
    [{ ...row, pending_task_count: 1 }], [{ ...row, pending_task_count: -1 }],
    [{ ...row, task_count: -1 }], [{ ...row, task_count: 1.5 }],
    [{ ...row, task_count: "5" }], [{ ...row, last_monitored_at: "invalid" }],
    [{ tenant_id: "tenant-a" }], [row, row],
  ]) expect(() => parseTenantMonitoringSummaries({ summaries })).toThrow("invalid tenant monitoring summary");
  expect(() => parseTenantMonitoringSummaries({ tenants: [] })).toThrow();
});

test("unavailable or loading summaries never look like zero items or never monitored", () => {
  for (const loading of [true, false]) {
    const html = renderToStaticMarkup(<TenantMonitoringStats loading={loading} />);
    expect(html).toContain(loading ? "Loading…" : "Unavailable");
    expect(html).not.toContain("Never");
    expect(html).not.toContain(">0<");
  }
  expect(renderToStaticMarkup(<TenantMonitoringStats loading={false} summary={{
    tenant_id: "empty", task_count: 0, pending_task_count: 0, last_monitored_at: null,
  }} />)).toContain("Never");
});

test("completed monitoring exposes the exact timestamp and a localized date with time zone", () => {
  const html = renderToStaticMarkup(<TenantMonitoringStats loading={false} summary={{
    tenant_id: "tenant-a", task_count: 200, pending_task_count: 123, last_monitored_at: "2026-09-22T14:30:00Z",
  }} />);
  expect(html).toContain(">77<span");
  expect(html).toContain(">/200<");
  expect(html).toContain("77 completed out of 200 total tasks");
  expect(html).not.toContain("awaiting");
  expect(html).toContain(">Tasks<");
  expect(html).toContain('dateTime="2026-09-22T14:30:00Z"');
  expect(html).toContain("2026");
  expect(html).toContain("successfully completed");
});
