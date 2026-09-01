import { describe, expect, test } from "bun:test";
import type {
  IpFirstScanResult,
  IpReviewFinding,
  MonitoredDomain,
  MonitoringFindingsPage,
  ReverseSearchRun,
} from "../src/api";
import {
  firstScanResultMetadata,
  latestRunsByKeyword,
  summarizeFirstScanSource,
} from "../src/lib/firstScanProgress";

const source = {
  id: "source-1",
  tenant_id: "tenant-1",
  domain: "market.example",
  source_type: "domain",
  display_name: "Market",
  source_config: {},
  ip_catalog_id: "ip-1",
  ip_name: "Brand",
  ip_keywords: ["Brand bag"],
  recipe: { selectors: {} },
  recipe_updated_at: "2026-08-28T10:00:00.000Z",
  last_run_at: "2026-08-28T10:10:00.000Z",
  enabled: true,
  zero_yield_streak: 0,
  country: null,
  created_at: "2026-08-28T10:00:00.000Z",
} satisfies MonitoredDomain;

function run(overrides: Partial<ReverseSearchRun>): ReverseSearchRun {
  return {
    id: "run-1",
    tenant_id: "tenant-1",
    trademark_id: "ip-1",
    domain_id: source.id,
    keyword: "Brand bag",
    job_id: "job-1",
    status: "completed",
    images_searched: 1,
    results_found: 7,
    results_after_filter: 4,
    cases_created: 3,
    error: null,
    started_at: "2026-08-28T10:05:00.000Z",
    completed_at: "2026-08-28T10:06:00.000Z",
    created_at: "2026-08-28T10:04:00.000Z",
    ...overrides,
  };
}

function findingsPage(statuses: Record<string, number>): MonitoringFindingsPage {
  return {
    findings: [] as IpReviewFinding[],
    next_cursor: null,
    facets: {
      statuses,
      priorities: { high: 0, med: 0, low: 0 },
      platforms: [],
      ips: [],
      product_groups: [],
      sellers: [],
      dismissal_reasons: {},
      candidate_outcomes: { false_positive: 0, do_not_pursue: 0, takedown: 0, second_hand: 0, none: 0 },
      total: (statuses.preparing ?? 0) + (statuses.pending ?? 0),
    },
  };
}

function result(overrides: Partial<IpFirstScanResult> = {}): IpFirstScanResult {
  return {
    candidate_id: "candidate-1",
    run_id: "run-1",
    source_id: source.id,
    source_domain: source.domain,
    source_name: source.display_name,
    keyword: "Brand bag",
    run_status: "running",
    run_error: null,
    score_job_status: "pending",
    score_job_error: null,
    page_url: "https://market.example/listing/1",
    image_url: "https://images.example/listing.jpg",
    candidate_title: "Brand bag listing",
    source_method: "direct",
    discovered_at: "2026-08-28T10:05:00.000Z",
    candidate_page_kind: null,
    candidate_actionability: null,
    qualification_confidence: null,
    qualification_classifier: null,
    qualified_at: null,
    result_id: null,
    lifecycle_state: null,
    similarity_score: null,
    match_method: null,
    vlm_verdict: null,
    vlm_confidence: null,
    vlm_reasoning: null,
    case_id: null,
    listing_title: null,
    seller_name: null,
    seller_url: null,
    price: null,
    location: null,
    description_summary: null,
    image_urls: null,
    enrichment_error: null,
    ready_for_review: false,
    review_status: null,
    updated_at: "2026-08-28T10:05:00.000Z",
    stage: "discovered",
    ...overrides,
  };
}

describe("first scan progress", () => {
  test("does not revive an old run count when the progressive feed has zero rows", () => {
    const summary = summarizeFirstScanSource(
      source,
      [run({ results_found: 41, results_after_filter: 0 })],
      findingsPage({}),
      [],
      true,
    );

    expect(summary.discovered).toBe(0);
    expect(summary.results).toEqual([]);
  });

  test("uses only the newest run for each keyword", () => {
    const oldRun = run({ id: "old", results_found: 50, started_at: "2026-08-28T09:00:00.000Z" });
    const newRun = run({ id: "new", results_found: 7, started_at: "2026-08-28T11:00:00.000Z" });

    expect(latestRunsByKeyword([oldRun, newRun])).toEqual([newRun]);
  });

  test("keeps discovered, preparing, and triage-ready counts distinct", () => {
    const progress = summarizeFirstScanSource(
      source,
      [run({ results_found: 12, results_after_filter: 6, cases_created: 5 })],
      findingsPage({ preparing: 3, pending: 2 }),
    );

    expect(progress.discovered).toBe(12);
    expect(progress.qualified).toBe(6);
    expect(progress.casesCreated).toBe(5);
    expect(progress.preparing).toBe(3);
    expect(progress.ready).toBe(2);
    expect(progress.state).toBe("preparing");
  });

  test("a running retry remains live even if earlier results are ready", () => {
    const progress = summarizeFirstScanSource(
      source,
      [run({ status: "running", completed_at: null })],
      findingsPage({ preparing: 0, pending: 2 }),
    );

    expect(progress.state).toBe("scanning");
  });

  test("keeps candidate rows stable while progressive metadata fills", () => {
    const discovered = result();
    const enriched = result({
      result_id: "result-1",
      lifecycle_state: "promoted",
      similarity_score: 0.91,
      match_method: "both",
      vlm_verdict: "accept",
      seller_name: "Example seller",
      price: "$25.00",
      location: "Amsterdam",
      description_summary: "A detailed listing",
      listing_title: "Brand bag — red",
      stage: "ready",
      ready_for_review: true,
    });

    expect(enriched.candidate_id).toBe(discovered.candidate_id);
    expect(firstScanResultMetadata(discovered)).toEqual({ complete: 2, total: 8 });
    expect(firstScanResultMetadata(enriched)).toEqual({ complete: 8, total: 8 });
  });

  test("reports real progressive stages instead of treating queued rows as failed", () => {
    const progress = summarizeFirstScanSource(
      source,
      [run({ status: "running", completed_at: null, results_found: 2 })],
      findingsPage({}),
      [result(), result({ candidate_id: "candidate-2", stage: "matching", score_job_status: "in_progress" })],
    );

    expect(progress.discovered).toBe(2);
    expect(progress.preparing).toBe(2);
    expect(progress.state).toBe("preparing");
    expect(progress.error).toBeNull();
  });

  test("shows connecting until a non-web source has a recipe", () => {
    const progress = summarizeFirstScanSource(
      { ...source, recipe: null },
      [],
      findingsPage({}),
    );

    expect(progress.state).toBe("connecting");
  });

  test("surfaces a terminal source setup retry instead of generic connecting", () => {
    const progress = summarizeFirstScanSource(
      { ...source, recipe: null, setup_status: "retry_needed" },
      [],
      findingsPage({}),
    );

    expect(progress.state).toBe("retry_needed");
  });

  test("surfaces active source setup instead of generic connecting", () => {
    const progress = summarizeFirstScanSource(
      { ...source, recipe: null, setup_status: "processing" },
      [],
      findingsPage({}),
    );

    expect(progress.state).toBe("setup_processing");
  });

  test("shows waiting after connection and before the first run", () => {
    const progress = summarizeFirstScanSource(source, [], findingsPage({}));

    expect(progress.state).toBe("waiting");
  });

  test("reports a failed run and preserves its actionable error", () => {
    const progress = summarizeFirstScanSource(
      source,
      [run({ status: "failed", error: "Marketplace refused the request" })],
      findingsPage({}),
    );

    expect(progress.state).toBe("failed");
    expect(progress.error).toBe("Marketplace refused the request");
  });

  test("derives filtered and qualified totals from progressive rows", () => {
    const progress = summarizeFirstScanSource(
      source,
      [run({})],
      findingsPage({ pending: 99 }),
      [
        result({ candidate_id: "filtered", stage: "filtered" }),
        result({ candidate_id: "ready", result_id: "result-2", stage: "ready", ready_for_review: true }),
      ],
    );

    expect(progress.discovered).toBe(2);
    expect(progress.filtered).toBe(1);
    expect(progress.qualified).toBe(1);
    expect(progress.findingsTotal).toBe(1);
    expect(progress.ready).toBe(1);
    expect(progress.state).toBe("ready");
  });
});
