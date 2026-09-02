import { useCallback, useEffect, useMemo, useState } from "react";
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
  type IpOnboardingStatus,
  type IpReviewFinding,
  type MonitoredDomain,
  type Trademark,
} from "../../api";
import { useActiveIp } from "../../context/ActiveIpContext";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  summarizeFirstScanSource,
  type FirstScanSourceProgress,
} from "../../lib/firstScanProgress";
import { RequestTimeoutError, withRequestTimeout } from "../../lib/requestTimeout";
import { compareFirstScanResults, emptyFindingsPage, findingToProgressiveResult } from "./adapters";

const POLL_INTERVAL_MS = 5_000;
const FEED_REQUEST_TIMEOUT_MS = 8_000;
const DEGRADED_FEED_MESSAGE = "Showing the 50 most recent monitoring results while the live listing feed recovers.";
const DEGRADED_ONBOARDING_MESSAGE = "Setup status is temporarily unavailable.";
const DEGRADED_SOURCES_MESSAGE = "Live monitoring-source status is temporarily unavailable.";

export interface FirstScanSnapshot {
  trademark: Trademark;
  onboarding: IpOnboardingStatus | null;
  sources: FirstScanSourceProgress[];
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
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [sourceFilter, setSourceFilter] = useState("all");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!ipId) return;
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
        loadProgressiveResults(ipId, signal),
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
        // Both the progressive feed and the legacy findings fallback are now
        // normalized to the rows rendered for this source. Their count is
        // authoritative; an older run total must not replace an empty list.
        return summarizeFirstScanSource(
          source,
          runsPage.runs,
          findingsPage,
          rows,
          true,
        );
      }));

      if (signal?.aborted) return;
      setSnapshot({ trademark, onboarding: onboardingFeed.status, sources, updatedAt: new Date() });
      setError([...degradedReasons].join(" ") || null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Unable to load monitoring progress");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [ipId]);

  useEffect(() => {
    if (!ipId) {
      if (!loadingActiveIp) setLoading(false);
      return;
    }

    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const poll = async () => {
      controller = new AbortController();
      await refresh(controller.signal);
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
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
      connected: sources.filter((source) => source.source.source_type === "web_search" || source.source.recipe).length,
      discovered: allResults.length > 0 ? allResults.length : sources.reduce((total, source) => total + source.discovered, 0),
      processing: allResults.filter((result) => FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage)).length,
      ready: allResults.filter((result) => result.stage === "ready").length,
      filtered: allResults.filter((result) => result.stage === "filtered").length,
      failed: allResults.filter((result) => result.stage === "failed").length,
    };
  }, [allResults, snapshot?.sources]);

  const visibleResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...allResults]
      .filter((result) => sourceFilter === "all" || result.source_id === sourceFilter)
      .filter((result) => {
        if (resultFilter === "processing") return FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage);
        return resultFilter === "all" || result.stage === resultFilter;
      })
      .filter((result) => !needle || [
        result.listing_title,
        result.candidate_title,
        result.seller_name,
        result.price,
        result.location,
        result.keyword,
        result.source_domain,
        result.page_url,
      ].some((value) => value?.toLocaleLowerCase().includes(needle)))
      .sort(compareFirstScanResults);
  }, [allResults, query, resultFilter, sourceFilter]);

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
    refresh,
  };
}

async function loadProgressiveResults(
  ipId: string,
  signal?: AbortSignal,
): Promise<{ results: IpFirstScanResult[] | null; degradedReason: string | null }> {
  try {
    return {
      results: (await withRequestTimeout(
        (requestSignal) => getIpFirstScanResults(ipId, requestSignal),
        {
          signal,
          timeoutMs: FEED_REQUEST_TIMEOUT_MS,
          timeoutMessage: "Loading the live listing feed timed out.",
        },
      )).results,
      degradedReason: null,
    };
  } catch (caught) {
    if (signal?.aborted) throw caught;
    // Compatibility while the progressive backend endpoint rolls out.
    if (caught instanceof ApiError && caught.status === 404) {
      return { results: null, degradedReason: null };
    }
    if (isRecoverableFeedError(caught)) {
      return { results: null, degradedReason: DEGRADED_FEED_MESSAGE };
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
): MonitoredDomain[] {
  const byId = new Map(platforms.map((platform) => [platform.id, platform]));

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
