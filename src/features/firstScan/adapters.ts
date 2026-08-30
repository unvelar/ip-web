import type {
  IpFirstScanResult,
  IpFirstScanResultStage,
  IpReviewFinding,
  MonitoredDomain,
  MonitoringFindingsPage,
} from "../../api";

export function emptyFindingsPage(): MonitoringFindingsPage {
  return {
    findings: [],
    next_cursor: null,
    facets: {
      statuses: {},
      priorities: { high: 0, med: 0, low: 0 },
      platforms: [],
      ips: [],
      product_groups: [],
      sellers: [],
      dismissal_reasons: {},
      candidate_outcomes: { false_positive: 0, do_not_pursue: 0, takedown: 0, second_hand: 0, none: 0 },
      total: 0,
    },
  };
}

/** Normalize the legacy finding feed into the stable progressive-row contract. */
export function findingToProgressiveResult(
  finding: IpReviewFinding,
  source: MonitoredDomain,
): IpFirstScanResult {
  return {
    candidate_id: `finding:${finding.result_id}`,
    run_id: finding.run_id,
    source_id: source.id,
    source_domain: source.domain,
    source_name: source.display_name,
    keyword: null,
    run_status: "completed",
    run_error: null,
    score_job_status: "completed",
    score_job_error: null,
    page_url: finding.page_url,
    image_url: finding.image_url,
    candidate_title: finding.listing_title,
    source_method: finding.source_method,
    discovered_at: finding.found_at,
    candidate_page_kind: null,
    candidate_actionability: null,
    qualification_confidence: null,
    qualification_classifier: null,
    qualified_at: null,
    result_id: finding.result_id,
    lifecycle_state: finding.ready_for_review ? "promoted" : "qualifying",
    similarity_score: finding.similarity_score,
    match_method: finding.match_method,
    vlm_verdict: finding.vlm_verdict,
    vlm_confidence: finding.vlm_confidence,
    vlm_reasoning: finding.vlm_reasoning,
    case_id: finding.case_id,
    listing_title: finding.listing_title,
    seller_name: finding.seller_name,
    seller_url: finding.seller_url,
    price: finding.price,
    location: finding.location,
    description_summary: finding.description_summary,
    image_urls: finding.image_urls,
    enrichment_error: finding.enrichment_error,
    ready_for_review: finding.ready_for_review,
    review_status: finding.review_status,
    updated_at: finding.updated_at,
    stage: finding.ready_for_review ? "ready" : "enriching",
  };
}

export function compareFirstScanResults(left: IpFirstScanResult, right: IpFirstScanResult): number {
  const rank: Record<IpFirstScanResultStage, number> = {
    matching: 0,
    qualifying: 1,
    enriching: 2,
    discovered: 3,
    ready: 4,
    failed: 5,
    filtered: 6,
  };
  const byStage = rank[left.stage] - rank[right.stage];
  return byStage !== 0 ? byStage : Date.parse(right.discovered_at) - Date.parse(left.discovered_at);
}
