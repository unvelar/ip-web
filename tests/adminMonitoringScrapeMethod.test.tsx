import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JobScrapeMethodBadge, ScrapeMethodBadge } from "../src/features/adminMonitoring/ScrapeMethodBadge";

test("renders a scrape fallback sequence for active and terminal jobs", () => {
  for (const status of ["in_progress", "completed", "failed"]) {
    const html = renderToStaticMarkup(<ScrapeMethodBadge status={status} scrape={{
      source: "worker", steps: [
        { method: "nodriver", role: "primary", provider: null, recorded_at: null },
        { method: "scrapfly", role: "fallback", provider: null, recorded_at: null },
      ],
    }} />);
    expect(html).toContain("Nodriver");
    expect(html).toContain("Scrapfly");
    expect(html).toContain("fallback method recorded by the worker");
  }
});

test("does not invent a method for legacy rows or jobs that have not started", () => {
  expect(renderToStaticMarkup(<ScrapeMethodBadge status="completed" />)).toContain("Method not recorded");
  expect(renderToStaticMarkup(<ScrapeMethodBadge status="pending" />)).toContain("Method selected on start");
});

test("page verification uses the shared job badge in every job state", () => {
  for (const status of ["pending", "in_progress", "completed", "failed"]) {
    const html = renderToStaticMarkup(<JobScrapeMethodBadge job={{ type: "finding_qualify", status, scrape: {
      source: "worker", steps: [
        { method: "nodriver", role: "primary", provider: null, recorded_at: null, outcome: "skipped", reason: "local cooldown" },
        { method: "scrapfly", role: "fallback", provider: null, recorded_at: null, outcome: "started" },
      ],
    } }} />);
    expect(html).toContain("Nodriver");
    expect(html).toContain("skipped");
    expect(html).toContain("local cooldown");
    expect(html).toContain("Scrapfly");
    expect(html).toContain(status === "in_progress" ? "running" : "attempted");
    if (status === "pending") expect(html).toContain("Previous attempt:");
  }
  expect(renderToStaticMarkup(<JobScrapeMethodBadge job={{ type: "finding_qualify", status: "failed" }} />)).toContain("Method not recorded");
  expect(renderToStaticMarkup(<JobScrapeMethodBadge job={{ type: "monitor_score", status: "in_progress" }} />)).toBe("");
});
