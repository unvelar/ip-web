import { expect, test } from "bun:test";
import { Window } from "happy-dom";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import type { IpFirstScanResult, MonitoredDomain } from "../src/api";
import { FirstScanResults } from "../src/features/firstScan/FirstScanResults";
import { summarizeFirstScanResults } from "../src/features/firstScan/resultTotals";
import { summarizeFirstScanSource } from "../src/lib/firstScanProgress";
import { emptyFindingsPage } from "../src/features/firstScan/adapters";

function result(patch: Partial<IpFirstScanResult>): IpFirstScanResult {
  return {
    candidate_id: "candidate", run_id: "run", source_id: "source", source_domain: "market.example",
    source_name: "Market", keyword: "Brand", run_status: "running", run_error: null,
    score_job_status: "pending", score_job_error: null, qualification_job_status: null,
    qualification_job_error: null, qualification_access_blocked: false,
    page_url: "https://market.example/listing/1", image_url: null, candidate_title: "Brand listing",
    source_method: "listing_related", discovered_at: "2026-10-01T11:00:00Z",
    candidate_page_kind: null, candidate_actionability: null, qualification_confidence: null,
    qualification_classifier: null, qualified_at: null, result_id: null, lifecycle_state: null,
    similarity_score: null, match_method: null, vlm_verdict: null, vlm_confidence: null, vlm_reasoning: null,
    case_id: null, listing_title: null, seller_name: null, seller_url: null, price: null, location: null,
    description_summary: null, image_urls: null, enrichment_error: null, ready_for_review: false,
    review_status: null, updated_at: "2026-10-01T11:00:00Z", stage: "matching", ...patch,
  };
}

function renderRow(row: IpFirstScanResult) {
  const counts = summarizeFirstScanResults([row]);
  const html = renderToStaticMarkup(<MemoryRouter><FirstScanResults
    ipId="ip" sources={[]} results={[row]} allResultCount={1}
    totals={{ ...counts, websites: 1, connected: 1 }} resultFilterTotals={counts}
    filteredTotal={1} hasMore={false} loadingMore={false} refreshing={false}
    query="" resultFilter="all" sourceFilter="all" onLoadMore={() => {}}
    onQueryChange={() => {}} onResultFilterChange={() => {}} onSourceFilterChange={() => {}}
  /></MemoryRouter>);
  const window = new Window();
  window.document.body.innerHTML = html;
  return window.document.querySelector("tbody tr")!;
}

test("waiting listings explain their blocker without pretending a worker is comparing", () => {
  for (const [state, label] of [
    ["paused", "Paused"], ["blocked", "References needed"], ["scheduled", "Scheduled"], ["ready", "Queued"],
  ] as const) {
    const row = renderRow(result({score_job_queue_state: state}));
    expect(row.querySelectorAll("td")[4]!.textContent).toContain(label);
    expect(row.textContent).not.toContain("Comparing");
    expect(row.querySelectorAll(".animate-spin")).toHaveLength(0);
  }
  const oldApi = renderRow(result({}));
  expect(oldApi.querySelectorAll("td")[4]!.textContent).toContain("Queued");
  expect(oldApi.querySelectorAll(".animate-spin")).toHaveLength(0);
  const running = renderRow(result({score_job_queue_state: "running", score_job_status: "in_progress"}));
  expect(running.querySelectorAll("td")[4]!.textContent).toContain("Comparing");
  expect(running.querySelectorAll(".animate-spin").length).toBeGreaterThan(0);
});

test("cancelled discoveries remain visible without promising a matching check", () => {
  const cancelled = result({stage: "cancelled", score_job_status: "cancelled", run_status: "cancelled"});
  const row = renderRow(cancelled);
  expect(row.querySelectorAll("td")[4]!.textContent).toContain("Cancelled");
  expect(row.textContent).not.toContain("Waiting for image matching");
  expect(row.querySelectorAll(".animate-spin")).toHaveLength(0);
  expect(summarizeFirstScanResults([cancelled]).processing).toBe(0);
});

test("paused website filters override stale retry schedules and retain listing totals", () => {
  const source: MonitoredDomain = {
    id: "source", tenant_id: "tenant", domain: "market.example", source_type: "domain",
    display_name: "Market", source_config: {}, ip_catalog_id: "ip", recipe: null,
    recipe_updated_at: null, last_run_at: null, enabled: false, zero_yield_streak: 0,
    country: null, created_at: "2026-09-20T11:00:00Z", setup_status: "retry_needed",
  };
  const counts = summarizeFirstScanResults([]);
  for (const discovered of [0, 30]) {
    const progress = summarizeFirstScanSource(source, [], emptyFindingsPage(), [], true, { ...counts, discovered });
    const html = renderToStaticMarkup(<MemoryRouter><FirstScanResults
      ipId="ip" sources={[progress]} results={[]} allResultCount={discovered}
      recovery={[{ source_id: "source", source_label: "Market", state: "scheduled", next_retry_at: "2026-10-05T19:00:00Z", failure_reason: "capture_unavailable" }]}
      totals={{ ...counts, websites: 1, connected: 0 }} resultFilterTotals={counts}
      filteredTotal={0} hasMore={false} loadingMore={false} refreshing={false}
      query="" resultFilter="all" sourceFilter="all" onLoadMore={() => {}}
      onQueryChange={() => {}} onResultFilterChange={() => {}} onSourceFilterChange={() => {}}
    /></MemoryRouter>);
    const window = new Window(); window.document.body.innerHTML = html;
    const button = [...window.document.querySelectorAll("button")].find(button => button.textContent?.includes("Market"))!;
    expect(button.textContent).toContain("Paused");
    expect(button.textContent).not.toContain("Retry");
    expect(button.querySelector(".bg-red-500")).toBeNull();
    expect(window.document.body.textContent).toContain("Website monitoring is paused");
    expect(window.document.querySelectorAll(".animate-spin")).toHaveLength(0);
    expect(progress.discovered).toBe(discovered);
  }
});

test("an empty website selection shows setup instead of a waiting scan or old coverage warning", () => {
  const counts = summarizeFirstScanResults([]);
  const html = renderToStaticMarkup(<MemoryRouter><FirstScanResults
    ipId="ip" sources={[]} results={[]} allResultCount={0}
    coverage={[{ source_id: "unselected", keyword: "Brand", status: "partial", checked_at: "2026-10-01T11:00:00Z", previous_checked_at: null }]}
    totals={{ ...counts, websites: 0, connected: 0 }} resultFilterTotals={counts}
    filteredTotal={0} hasMore={false} loadingMore={false} refreshing={false}
    query="" resultFilter="all" sourceFilter="all" onLoadMore={() => {}}
    onQueryChange={() => {}} onResultFilterChange={() => {}} onSourceFilterChange={() => {}}
  /></MemoryRouter>);
  const window = new Window(); window.document.body.innerHTML = html;
  expect(window.document.body.textContent).toContain("No websites selected");
  expect(window.document.body.textContent).not.toContain("Search coverage is incomplete");
  expect(window.document.body.textContent).not.toContain("Waiting for the first listing");
  expect(window.document.querySelector('a[href="/monitoring/setup"]')).not.toBeNull();
  expect(window.document.querySelectorAll(".animate-spin")).toHaveLength(0);
});

test("a later page rejection does not erase confirmed match evidence", () => {
  const row = renderRow(result({
    stage: "filtered", score_job_status: "completed", qualification_job_status: "completed",
    vlm_verdict: "present", vlm_confidence: 0.98, lifecycle_state: "rejected",
    candidate_actionability: "non_actionable", qualified_at: "2026-10-01T11:05:00Z",
  }));
  expect(row.querySelectorAll("td")[3]!.textContent).toContain("Present");
  expect(row.querySelectorAll("td")[4]!.textContent).toContain("Screened out");
  expect(row.textContent).toContain("A match was found");
  expect(row.textContent).not.toContain("Not a match");
  expect(row.querySelectorAll(".animate-spin")).toHaveLength(0);

  const absent = renderRow(result({ stage: "filtered", vlm_verdict: "absent" }));
  expect(absent.querySelectorAll("td")[4]!.textContent).toContain("Not a match");
  const unclear = renderRow(result({ stage: "filtered", vlm_verdict: "unclear" }));
  expect(unclear.querySelectorAll("td")[4]!.textContent).toContain("Match unclear");
});
