import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getIpFirstScanResults,
  getIpOnboardingStatus,
  getTrademark,
  listIpMonitoringPlatforms,
  listMonitoringFindingsGlobal,
  listMonitoringRuns,
  type IpFirstScanResult,
  type IpOnboardingStatus,
  type Trademark,
} from "../../api";
import { useActiveIp } from "../../context/ActiveIpContext";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  summarizeFirstScanSource,
  type FirstScanSourceProgress,
} from "../../lib/firstScanProgress";
import { compareFirstScanResults, emptyFindingsPage, findingToProgressiveResult } from "./adapters";

const POLL_INTERVAL_MS = 5_000;

export interface FirstScanSnapshot {
  trademark: Trademark;
  onboarding: IpOnboardingStatus;
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
      const [{ trademark }, { status: onboarding }, { platforms }] = await Promise.all([
        getTrademark(ipId),
        getIpOnboardingStatus(ipId, signal),
        listIpMonitoringPlatforms(ipId),
      ]);

      const progressiveResults = await loadProgressiveResults(ipId, signal);
      const sources = await Promise.all(platforms.map(async (source) => {
        const runsPage = await listMonitoringRuns({ domain_id: source.id, limit: 100 });
        const sourceResults = progressiveResults?.filter((result) => result.source_id === source.id) ?? null;
        const findingsPage = sourceResults === null
          ? await listMonitoringFindingsGlobal({
              ip_id: ipId,
              platform: source.domain,
              status: "all",
              sort: "found_desc",
              limit: 200,
              signal,
            })
          : emptyFindingsPage();
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
      setSnapshot({ trademark, onboarding, sources, updatedAt: new Date() });
      setError(null);
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
): Promise<IpFirstScanResult[] | null> {
  try {
    return (await getIpFirstScanResults(ipId, signal)).results;
  } catch (caught) {
    // Compatibility while the progressive backend endpoint rolls out.
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
  }
}
