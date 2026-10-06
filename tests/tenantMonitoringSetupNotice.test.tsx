import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { IpOnboardingStatus } from "../src/api";
import { TenantMonitoringSetupNotice } from "../src/components/monitoring/TenantMonitoringSetupNotice";

const status = {
  state: "needs_attention",
  customer_action_required: false,
  title: "Monitoring needs attention",
  message: "Automatic retries have stopped until the cause is resolved.",
  checks: [{
    key: "monitoring_sources", label: "Monitoring sources", status: "attention",
    detail: "A website needs a system retry.",
  }],
  recovery: {
    enabled: true, scheduled: 1, due: 0, processing: 0, off: 0, blocked: 1, needed: 0,
    next_retry_at: "2026-10-06T18:22:00Z",
    sources: [{ source_id: "market", label: "Market", state: "blocked", next_retry_at: null, reason: "capture_unavailable" }],
  },
} as IpOnboardingStatus;

function render(value: IpOnboardingStatus | null) {
  return renderToStaticMarkup(<MemoryRouter><TenantMonitoringSetupNotice ipId="ip" status={value} /></MemoryRouter>);
}

describe("tenant monitoring setup notices", () => {
  test("system recovery and progress never ask a tenant to act", () => {
    for (const state of ["needs_attention", "delayed", "processing", "active", "paused"] as const) {
      expect(render({ ...status, state })).toBe("");
    }
    expect(render(null)).toBe("");
  });

  test("missing tenant setup items have direct actions without system retry details", () => {
    const html = render({
      ...status, state: "setup_required", customer_action_required: true,
      checks: [
        { key: "reference_images", label: "Reference images", status: "missing", detail: "Add a reference image or protected term." },
        { key: "keywords", label: "Keywords", status: "missing", detail: "Add a keyword or protected term." },
        { key: "monitoring_sources", label: "Monitoring sources", status: "missing", detail: "Add at least one monitoring source." },
        { key: "first_scan", label: "First scan", status: "attention", detail: "The rest need a retry." },
      ],
    });
    expect(html).toContain("Finish monitoring setup");
    expect(html).toContain('href="/ips/ip#reference-images"');
    expect(html).toContain('href="/ips/ip#keywords"');
    expect(html).toContain('href="/monitoring/setup"');
    expect(html).not.toContain("retry");
    expect(html).not.toContain("Monitoring needs attention");
    expect(html).not.toContain("capture_unavailable");
  });

  test("a customer action without an item still offers a setup destination", () => {
    const html = render({ ...status, customer_action_required: true, checks: [] });
    expect(html).toContain("Review IP setup");
    expect(html).toContain('href="/ips/ip"');
  });
});
