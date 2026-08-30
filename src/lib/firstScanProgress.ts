import type {
  IpFirstScanResult,
  IpReviewFinding,
  MonitoredDomain,
  MonitoringFindingsPage,
  ReverseSearchRun,
} from "../api";

export type FirstScanSourceState =
  | "connecting"
  | "scanning"
  | "preparing"
  | "ready"
  | "failed"
  | "waiting";

export interface FirstScanSourceProgress {
  source: MonitoredDomain;
  runs: ReverseSearchRun[];
  findings: IpReviewFinding[];
  results: IpFirstScanResult[];
  discovered: number;
  qualified: number;
  casesCreated: number;
  findingsTotal: number;
  preparing: number;
  ready: number;
  filtered: number;
  state: FirstScanSourceState;
  error: string | null;
}

const ACTIVE_RUN_STATUSES = new Set([
  "pending",
  "queued",
  "running",
  "in_progress",
  "processing",
]);

const FAILED_RUN_STATUSES = new Set(["failed", "error", "cancelled"]);

export function isActiveMonitoringRun(status: string): boolean {
  return ACTIVE_RUN_STATUSES.has(status.trim().toLowerCase());
}

function runTime(run: ReverseSearchRun): number {
  const value = run.started_at ?? run.created_at;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * A source can run repeatedly. The first-scan UI reports the newest attempt
 * for each search term so retries and future monitoring cycles do not inflate
 * the counts shown to the user.
 */
export function latestRunsByKeyword(runs: ReverseSearchRun[]): ReverseSearchRun[] {
  const sorted = [...runs].sort((left, right) => runTime(right) - runTime(left));
  const newest = new Map<string, ReverseSearchRun>();

  for (const run of sorted) {
    const key = run.keyword?.trim().toLocaleLowerCase() || `run:${run.id}`;
    if (!newest.has(key)) newest.set(key, run);
  }

  return [...newest.values()];
}

export function listingImage(finding: IpReviewFinding): string | null {
  return (
    finding.image_url ??
    finding.image_urls?.find((url) => Boolean(url)) ??
    finding.screenshot_url ??
    null
  );
}

export function firstScanResultImage(result: IpFirstScanResult): string | null {
  return result.image_urls?.find((url) => Boolean(url)) ?? result.image_url ?? null;
}

export const FIRST_SCAN_ACTIVE_RESULT_STAGES = new Set<IpFirstScanResult["stage"]>([
  "discovered",
  "matching",
  "qualifying",
  "enriching",
]);

export function firstScanResultMetadata(result: IpFirstScanResult) {
  const fields = [
    Boolean(result.candidate_title || result.listing_title),
    Boolean(firstScanResultImage(result)),
    Boolean(result.seller_name),
    Boolean(result.price),
    Boolean(result.location),
    result.similarity_score !== null,
    Boolean(result.match_method || result.vlm_verdict),
    Boolean(result.description_summary),
  ];
  const complete = fields.filter(Boolean).length;
  return { complete, total: fields.length };
}

export function summarizeFirstScanSource(
  source: MonitoredDomain,
  allRuns: ReverseSearchRun[],
  findingsPage: MonitoringFindingsPage,
  results: IpFirstScanResult[] = [],
): FirstScanSourceProgress {
  const runs = latestRunsByKeyword(allRuns);
  const runDiscovered = runs.reduce((total, run) => total + Math.max(0, run.results_found), 0);
  const runQualified = runs.reduce((total, run) => total + Math.max(0, run.results_after_filter), 0);
  const discovered = results.length > 0 ? results.length : runDiscovered;
  const qualifiedFromRows = results.filter((result) => result.result_id && result.stage !== "filtered").length;
  const qualified = results.length > 0 ? qualifiedFromRows : runQualified;
  const casesCreated = runs.reduce((total, run) => total + Math.max(0, run.cases_created), 0);
  const preparingFromRows = results.filter((result) => FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage)).length;
  const readyFromRows = results.filter((result) => result.stage === "ready").length;
  const filtered = results.filter((result) => result.stage === "filtered").length;
  const preparing = results.length > 0
    ? preparingFromRows
    : (findingsPage.facets.statuses.preparing ?? 0);
  const ready = results.length > 0
    ? readyFromRows
    : (findingsPage.facets.statuses.pending ?? 0);
  const findingsTotal = results.length > 0 ? results.length - filtered : findingsPage.facets.total;
  const running = runs.some((run) => isActiveMonitoringRun(run.status));
  const failures = runs.filter((run) => FAILED_RUN_STATUSES.has(run.status.trim().toLowerCase()));
  const sourceConnected = source.source_type === "web_search" || Boolean(source.recipe);

  let state: FirstScanSourceState;
  if (!sourceConnected) {
    state = "connecting";
  } else if (running && results.length === 0) {
    state = "scanning";
  } else if (preparing > 0 || results.some((result) => FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage))) {
    state = "preparing";
  } else if (ready > 0) {
    state = "ready";
  } else if (runs.length > 0 && failures.length === runs.length) {
    state = "failed";
  } else if (runs.length > 0) {
    state = "ready";
  } else {
    state = "waiting";
  }

  return {
    source,
    runs,
    findings: findingsPage.findings,
    results,
    discovered,
    qualified,
    casesCreated,
    findingsTotal,
    preparing,
    ready,
    filtered,
    state,
    error:
      results.find((result) => result.stage === "failed")?.score_job_error ??
      failures.find((run) => run.error)?.error ??
      null,
  };
}
