import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  getIpFirstScanResults,
  getIpOnboardingStatus,
  getTrademark,
  listIpMonitoringPlatforms,
  listMonitoredDomains,
  listMonitoringFindingsGlobal,
  listMonitoringRuns,
  type IpFirstScanResult,
  type IpFirstScanResultsPage,
  type IpFirstScanResultsOptions,
  type IpFirstScanTotals,
  type IpOnboardingStatus,
  type IpReviewFinding,
  type MonitoredDomain,
  type Trademark,
} from "../../api";
import { useActiveIp } from "../../context/ActiveIpContext";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  isFirstScanSourceConnected,
  summarizeFirstScanSource,
  type FirstScanSourceProgress,
} from "../../lib/firstScanProgress";
import { RequestTimeoutError, withRequestTimeout } from "../../lib/requestTimeout";
import { compareFirstScanResults, emptyFindingsPage, findingToProgressiveResult } from "./adapters";

import { summarizeFirstScanResults } from "./resultTotals";

const POLL_INTERVAL_MS = 5_000;
const FEED_REQUEST_TIMEOUT_MS = 8_000;
const RESULTS_PAGE_SIZE = 100;
const EMPTY_TOTALS: IpFirstScanTotals = { discovered: 0, processing: 0, ready: 0, filtered: 0, failed: 0, qualified: 0 };
const DEGRADED_FEED_MESSAGE = "Showing the 50 most recent monitoring results while the live listing feed recovers.";
const DEGRADED_ONBOARDING_MESSAGE = "Setup status is temporarily unavailable.";
const DEGRADED_SOURCES_MESSAGE = "Live monitoring-source status is temporarily unavailable.";

export interface FirstScanSnapshot {
  trademark: Trademark;
  onboarding: IpOnboardingStatus | null;
  sources: FirstScanSourceProgress[];
  page: IpFirstScanResultsPage | null;
  updatedAt: Date;
}

export type ResultFilter = "all" | "processing" | "ready" | "filtered" | "failed";

export function useFirstScanFeed(requestedIpId: string | null) {
  const { activeIpId, loading: loadingActiveIp } = useActiveIp();
  const ipId = requestedIpId ?? activeIpId;
  const [snapshot, setSnapshot] = useState<FirstScanSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedPages = useRef(1);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async (parentSignal?: AbortSignal, pageCount = loadedPages.current) => {
    if (!ipId) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
    setRefreshing(true);
    try {
      const [{ trademark }, onboardingFeed, platformFeed, progressiveFeed] = await Promise.all([
        withRequestTimeout((requestSignal) => getTrademark(ipId, requestSignal), {
          signal,
          timeoutMs: FEED_REQUEST_TIMEOUT_MS,
          timeoutMessage: "Loading the intellectual property timed out.",
        }),
        loadOnboardingStatus(ipId, signal),
        loadMonitoringPlatforms(ipId, signal),
        loadProgressiveResults(ipId, {
          source_id: sourceFilter === "all" ? undefined : sourceFilter,
          stage: resultFilter,
          query: debouncedQuery,
        }, pageCount, signal),
      ]);

      const degradedReasons = new Set<string>();
      if (onboardingFeed.degradedReason) degradedReasons.add(onboardingFeed.degradedReason);
      if (platformFeed.degradedReason) degradedReasons.add(platformFeed.degradedReason);
      if (progressiveFeed.degradedReason) degradedReasons.add(progressiveFeed.degradedReason);
      let legacyFindingsPage = emptyFindingsPage();
      if (progressiveFeed.results === null) {
        try {
          legacyFindingsPage = await withRequestTimeout((requestSignal) => listMonitoringFindingsGlobal({
            ip_id: ipId,
            status: "all",
            sort: "found_desc",
            limit: 50,
            signal: requestSignal,
          }), {
            signal,
            timeoutMs: FEED_REQUEST_TIMEOUT_MS,
            timeoutMessage: "Loading recent monitoring results timed out.",
          });
        } catch (caught) {
          if (signal?.aborted) throw caught;
          if (!isRecoverableFeedError(caught)) throw caught;
          degradedReasons.add(DEGRADED_FEED_MESSAGE);
        }
      }

      const platforms = supplementMonitoringPlatforms(
        platformFeed.platforms,
        progressiveFeed.results ?? [],
        legacyFindingsPage.findings,
        ipId,
        progressiveFeed.page,
      );
      const sources = await Promise.all(platforms.map(async (source) => {
        const findingsPage = progressiveFeed.results === null
          ? {
              ...legacyFindingsPage,
              findings: legacyFindingsPage.findings.filter((finding) =>
                finding.domain_id ? finding.domain_id === source.id : finding.domain === source.domain,
              ),
            }
          : emptyFindingsPage();
        const sourceResults = progressiveFeed.results?.filter((result) => result.source_id === source.id) ?? null;
        let runsPage: Awaited<ReturnType<typeof listMonitoringRuns>> = { runs: [] };
        if (!progressiveFeed.degradedReason) {
          try {
            runsPage = await withRequestTimeout(
              (requestSignal) => listMonitoringRuns({ domain_id: source.id, limit: 100 }, requestSignal),
              {
                signal,
                timeoutMs: FEED_REQUEST_TIMEOUT_MS,
                timeoutMessage: `Loading progress for ${source.display_name ?? source.domain} timed out.`,
              },
            );
          } catch (caught) {
            if (signal?.aborted) throw caught;
            if (!isRecoverableFeedError(caught)) throw caught;
            degradedReasons.add(DEGRADED_FEED_MESSAGE);
          }
        }
        const rows = sourceResults ?? findingsPage.findings.map((finding) => findingToProgressiveResult(finding, source));
        // A source may have no rows on this page. Only the complete server
        // summary can determine its count or progress in a paginated feed.
        return summarizeFirstScanSource(
          source,
          runsPage.runs,
          findingsPage,
          rows,
          true,
          progressiveFeed.page
            ? progressiveFeed.page.source_totals.find((totals) => totals.source_id === source.id) ?? EMPTY_TOTALS
            : undefined,
        );
      }));

      if (signal?.aborted) return;
      loadedPages.current = pageCount;
      setSnapshot({ trademark, onboarding: onboardingFeed.status, sources, page: progressiveFeed.page, updatedAt: new Date() });
      setError([...degradedReasons].join(" ") || null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Unable to load monitoring progress");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, [ipId, sourceFilter, resultFilter, debouncedQuery]);

  useEffect(() => {
    if (!ipId) {
      if (!loadingActiveIp) setLoading(false);
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    loadedPages.current = 1;
    const poll = async () => {
      if (!activeRequest.current || activeRequest.current.signal.aborted) {
        controller = new AbortController();
        await refresh(controller.signal);
      }
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
      activeRequest.current?.abort();
    };
  }, [ipId, loadingActiveIp, refresh]);

  const allResults = useMemo(
    () => snapshot?.sources.flatMap((source) => source.results) ?? [],
    [snapshot?.sources],
  );

  const totals = useMemo(() => {
    const sources = snapshot?.sources ?? [];
    return {
      websites: sources.length,
      connected: sources.filter(isFirstScanSourceConnected).length,
      discovered: sources.reduce((total, source) => total + source.discovered, 0),
      processing: sources.reduce((total, source) => total + source.preparing, 0),
      ready: sources.reduce((total, source) => total + source.ready, 0),
      filtered: sources.reduce((total, source) => total + source.filtered, 0),
      failed: sources.reduce((total, source) => total + source.failed, 0),
    };
  }, [snapshot?.sources]);

  const loadMore = useCallback(async () => {
    if (!snapshot?.page?.next_cursor || refreshing || loadingMore) return;
    setLoadingMore(true);
    // Refresh the loaded prefix together, keeping new rows and progress
    // consistent across pages. Polling preserves this depth afterward.
    await refresh(undefined, loadedPages.current + 1);
  }, [snapshot?.page?.next_cursor, refreshing, loadingMore, refresh]);

  const sourceResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...allResults]
      .filter((result) => sourceFilter === "all" || result.source_id === sourceFilter)
      .filter((result) => !needle || [
        result.listing_title,
        result.candidate_title,
        result.seller_name,
        result.price,
        result.location,
        result.keyword,
        result.source_domain,
        result.page_url,
      ].some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [allResults, query, sourceFilter]);

  const resultFilterTotals = useMemo(
    () => snapshot?.page?.filter_totals ?? summarizeFirstScanResults(sourceResults),
    [snapshot?.page?.filter_totals, sourceResults],
  );
  const visibleResults = useMemo(() => sourceResults
    .filter((result) => resultFilter === "processing"
      ? FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage)
      : resultFilter === "all" || result.stage === resultFilter)
    .sort(compareFirstScanResults), [sourceResults, resultFilter]);

  return {
    ipId,
    snapshot,
    loading,
    refreshing,
    error,
    query,
    setQuery,
    resultFilter,
    setResultFilter,
    sourceFilter,
    setSourceFilter,
    allResults,
    visibleResults,
    totals,
    resultFilterTotals,
    filteredTotal: snapshot?.page?.total ?? visibleResults.length,
    hasMore: Boolean(snapshot?.page?.next_cursor),
    loadingMore,
    loadMore,
    refresh,
  };
}

async function loadProgressiveResults(
  ipId: string,
  filters: IpFirstScanResultsOptions,
  pageCount: number,
  signal?: AbortSignal,
): Promise<{ results: IpFirstScanResult[] | null; page: IpFirstScanResultsPage | null; degradedReason: string | null }> {
  try {
    let combined: IpFirstScanResultsPage | null = null;
    for (let index = 0; index < pageCount; index++) {
      const page: IpFirstScanResultsPage = await withRequestTimeout(
        (requestSignal) => getIpFirstScanResults(ipId, {
          ...filters, limit: RESULTS_PAGE_SIZE, cursor: combined?.next_cursor ?? undefined,
        }, requestSignal),
        {
          signal,
          timeoutMs: FEED_REQUEST_TIMEOUT_MS,
          timeoutMessage: "Loading the live listing feed timed out.",
        },
      );
      // During a mixed-version deployment, do not claim a limited legacy
      // response represents the whole scan.
      if (!page.source_totals || !page.filter_totals) {
        return { results: page.results, page: null, degradedReason: "Complete listing counts are temporarily unavailable." };
      }
      if (combined === null) combined = page;
      else {
        combined.results.push(...page.results);
        combined.next_cursor = page.next_cursor;
      }
      if (!combined.next_cursor) break;
    }
    return { results: combined?.results ?? [], page: combined, degradedReason: null };
  } catch (caught) {
    if (signal?.aborted) throw caught;
    // Compatibility while the progressive backend endpoint rolls out.
    if (caught instanceof ApiError && caught.status === 404) {
      return { results: null, page: null, degradedReason: null };
    }
    if (isRecoverableFeedError(caught)) {
      // Keep previously loaded pages on a pagination failure so a transient
      // timeout cannot silently replace them with a shorter legacy feed.
      if (pageCount > 1) throw caught;
      return { results: null, page: null, degradedReason: DEGRADED_FEED_MESSAGE };
    }
    throw caught;
  }
}

async function loadMonitoringPlatforms(
  ipId: string,
  signal?: AbortSignal,
): Promise<{ platforms: MonitoredDomain[]; degradedReason: string | null }> {
  try {
    const response = await withRequestTimeout(
      (requestSignal) => listIpMonitoringPlatforms(ipId, requestSignal),
      {
        signal,
        timeoutMs: FEED_REQUEST_TIMEOUT_MS,
        timeoutMessage: "Loading monitoring sources timed out.",
      },
    );
    return { platforms: response.platforms, degradedReason: null };
  } catch (caught) {
    if (signal?.aborted) throw caught;
    const scopedEndpointUnavailable =
      (caught instanceof ApiError && caught.status === 404) || isRecoverableFeedError(caught);
    if (!scopedEndpointUnavailable) throw caught;
  }

  try {
    const response = await withRequestTimeout(
      (requestSignal) => listMonitoredDomains(requestSignal),
      {
        signal,
        timeoutMs: FEED_REQUEST_TIMEOUT_MS,
        timeoutMessage: "Loading the tenant monitoring sources timed out.",
      },
    );
    return {
      platforms: response.domains.filter((domain) => domain.ip_catalog_id === ipId),
      degradedReason: DEGRADED_SOURCES_MESSAGE,
    };
  } catch (caught) {
    if (signal?.aborted) throw caught;
    if (isRecoverableFeedError(caught)) {
      return { platforms: [], degradedReason: DEGRADED_SOURCES_MESSAGE };
    }
    throw caught;
  }
}

async function loadOnboardingStatus(
  ipId: string,
  signal?: AbortSignal,
): Promise<{ status: IpOnboardingStatus | null; degradedReason: string | null }> {
  try {
    const response = await withRequestTimeout(
      (requestSignal) => getIpOnboardingStatus(ipId, requestSignal),
      {
        signal,
        timeoutMs: FEED_REQUEST_TIMEOUT_MS,
        timeoutMessage: "Loading setup status timed out.",
      },
    );
    return { status: response.status, degradedReason: null };
  } catch (caught) {
    if (signal?.aborted) throw caught;
    if (caught instanceof ApiError && caught.status === 404) {
      return { status: null, degradedReason: DEGRADED_ONBOARDING_MESSAGE };
    }
    if (isRecoverableFeedError(caught)) {
      return { status: null, degradedReason: DEGRADED_ONBOARDING_MESSAGE };
    }
    throw caught;
  }
}

function supplementMonitoringPlatforms(
  platforms: MonitoredDomain[],
  progressiveResults: IpFirstScanResult[],
  findings: IpReviewFinding[],
  ipId: string,
  page: IpFirstScanResultsPage | null,
): MonitoredDomain[] {
  const byId = new Map(platforms.map((platform) => [platform.id, platform]));

  for (const totals of page?.source_totals ?? []) {
    if (byId.has(totals.source_id)) continue;
    byId.set(totals.source_id, syntheticMonitoringPlatform({
      id: totals.source_id, domain: totals.source_domain, displayName: totals.source_name,
      ipId, createdAt: page!.as_of,
    }));
  }

  for (const result of progressiveResults) {
    if (byId.has(result.source_id)) continue;
    byId.set(result.source_id, syntheticMonitoringPlatform({
      id: result.source_id,
      domain: result.source_domain,
      displayName: result.source_name,
      ipId,
      createdAt: result.discovered_at,
    }));
  }

  for (const finding of findings) {
    const id = finding.domain_id ?? `domain:${finding.domain}`;
    if (byId.has(id)) continue;
    byId.set(id, syntheticMonitoringPlatform({
      id,
      domain: finding.domain,
      displayName: null,
      ipId,
      createdAt: finding.found_at,
    }));
  }

  return [...byId.values()];
}

function syntheticMonitoringPlatform(input: {
  id: string;
  domain: string;
  displayName: string | null;
  ipId: string;
  createdAt: string;
}): MonitoredDomain {
  return {
    id: input.id,
    tenant_id: "",
    domain: input.domain,
    source_type: "domain",
    display_name: input.displayName,
    source_config: {},
    ip_catalog_id: input.ipId,
    ip_name: null,
    ip_keywords: null,
    recipe: null,
    recipe_updated_at: null,
    last_run_at: null,
    enabled: true,
    zero_yield_streak: 0,
    country: null,
    created_at: input.createdAt,
  };
}

function isRecoverableFeedError(caught: unknown): boolean {
  return caught instanceof RequestTimeoutError ||
    caught instanceof TypeError ||
    (caught instanceof ApiError && caught.status >= 500);
}
