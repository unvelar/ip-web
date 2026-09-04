import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ScrapeMethodBadge } from "../src/features/adminMonitoring/ScrapeMethodBadge";

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
