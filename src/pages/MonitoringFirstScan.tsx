import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Globe2,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Radar,
  Search,
  Store,
} from "lucide-react";
import {
  ApiError,
  getIpFirstScanResults,
  getIpOnboardingStatus,
  getTrademark,
  listIpMonitoringPlatforms,
  listMonitoringFindingsGlobal,
  listMonitoringRuns,
  type IpFirstScanResult,
  type IpFirstScanResultStage,
  type IpOnboardingStatus,
  type IpReviewFinding,
  type MonitoredDomain,
  type MonitoringFindingsPage,
  type Trademark,
} from "../api";
import { useActiveIp } from "../context/ActiveIpContext";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  firstScanResultImage,
  firstScanResultMetadata,
  summarizeFirstScanSource,
  type FirstScanSourceProgress,
  type FirstScanSourceState,
} from "../lib/firstScanProgress";

const POLL_INTERVAL_MS = 5_000;

interface FirstScanSnapshot {
  trademark: Trademark;
  onboarding: IpOnboardingStatus;
  sources: FirstScanSourceProgress[];
  updatedAt: Date;
}

type ResultFilter = "all" | "processing" | "ready" | "filtered" | "failed";

const SOURCE_STATE_COPY: Record<FirstScanSourceState, { label: string; detail: string }> = {
  connecting: { label: "Connecting", detail: "Preparing this website" },
  waiting: { label: "Queued", detail: "Waiting for its first search" },
  scanning: { label: "Scanning", detail: "Looking for listings now" },
  preparing: { label: "Processing", detail: "Filling listing metadata" },
  ready: { label: "Ready", detail: "Latest results processed" },
  failed: { label: "Needs attention", detail: "A real job error was reported" },
};

const RESULT_STATE_COPY: Record<IpFirstScanResultStage, { label: string; detail: string }> = {
  discovered: { label: "Found", detail: "Waiting for image matching" },
  matching: { label: "Comparing", detail: "Checking against reference images" },
  qualifying: { label: "Checking page", detail: "Verifying the listing page" },
  enriching: { label: "Adding details", detail: "Reading seller, price, and location" },
  ready: { label: "Ready for triage", detail: "All required review data is available" },
  filtered: { label: "Not a match", detail: "Screened out by automated checks" },
  failed: { label: "Needs retry", detail: "Processing stopped with an error" },
};

export default function MonitoringFirstScan() {
  const [params] = useSearchParams();
  const { activeIpId, loading: loadingActiveIp } = useActiveIp();
  const ipId = params.get("ip_id") ?? activeIpId;
  const [snapshot, setSnapshot] = useState<FirstScanSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!ipId) return;
    setRefreshing(true);

    try {
      const [{ trademark }, { status: onboarding }, { platforms }] = await Promise.all([
        getTrademark(ipId),
        getIpOnboardingStatus(ipId, signal),
        listIpMonitoringPlatforms(ipId),
      ]);

      let progressiveResults: IpFirstScanResult[] | null = null;
      try {
        progressiveResults = (await getIpFirstScanResults(ipId, signal)).results;
      } catch (caught) {
        // Temporary compatibility with the currently deployed API. Once the
        // progressive endpoint lands, the candidate-backed rows are used.
        if (!(caught instanceof ApiError) || caught.status !== 404) throw caught;
      }

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
        return summarizeFirstScanSource(source, runsPage.runs, findingsPage, rows);
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
      discovered: allResults.length > 0
        ? allResults.length
        : sources.reduce((total, source) => total + source.discovered, 0),
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
        if (resultFilter === "all") return true;
        return result.stage === resultFilter;
      })
      .filter((result) => {
        if (!needle) return true;
        return [
          result.listing_title,
          result.candidate_title,
          result.seller_name,
          result.price,
          result.location,
          result.keyword,
          result.source_domain,
          result.page_url,
        ].some((value) => value?.toLocaleLowerCase().includes(needle));
      })
      .sort(compareFirstScanResults);
  }, [allResults, query, resultFilter, sourceFilter]);

  if (loading && !snapshot) return <FirstScanSkeleton />;

  if (!ipId) {
    return <PageMessage icon={<Radar className="h-5 w-5" />} title="Choose an IP to watch its first scan" detail="Select a working IP from the top bar, then return to this page." />;
  }

  if (!snapshot) {
    return (
      <PageMessage
        icon={<AlertCircle className="h-5 w-5" />}
        title="Monitoring progress is unavailable"
        detail={error ?? "Try loading this page again."}
        action={<button type="button" onClick={() => void refresh()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Try again</button>}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
            <Radar className="h-3.5 w-3.5" /> First scan
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950">Watching the web for {snapshot.trademark.name}</h1>
          <p className="mt-0.5 text-sm text-stone-500">Every listing stays in the same row while images, match evidence, and marketplace details arrive.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-500" aria-live="polite">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · {formatUpdateTime(snapshot.updatedAt)}
            {refreshing && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-stone-400" />}
          </div>
          {totals.ready > 0 && (
            <Link to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}`} className="inline-flex items-center gap-2 rounded-lg bg-stone-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800">
              Open triage <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">{totals.ready}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </header>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> The latest refresh failed. Showing the last known progress: {error}
        </div>
      )}

      <section className="mt-4 grid overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:grid-cols-4">
        <SummaryMetric label="Websites" value={`${totals.connected}/${totals.websites}`} detail="connected" icon={<Globe2 className="h-4 w-4" />} />
        <SummaryMetric label="Listings found" value={totals.discovered} detail="stable rows" icon={<Search className="h-4 w-4" />} />
        <SummaryMetric label="Processing" value={totals.processing} detail="metadata filling" icon={<LoaderCircle className="h-4 w-4" />} />
        <SummaryMetric label="Ready for triage" value={totals.ready} detail={`${totals.filtered} screened out`} icon={<Check className="h-4 w-4" />} accent={totals.ready > 0} />
      </section>

      <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-100 px-3 py-2">
          <SourceFilterButton active={sourceFilter === "all"} onClick={() => setSourceFilter("all")} name="All websites" count={totals.discovered} />
          {snapshot.sources.map((source) => (
            <SourceFilterButton
              key={source.source.id}
              active={sourceFilter === source.source.id}
              onClick={() => setSourceFilter(source.source.id)}
              name={source.source.display_name?.trim() || readableDomain(source.source.domain)}
              count={source.discovered}
              state={source.state}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            <ResultFilterButton label="All" count={totals.discovered} active={resultFilter === "all"} onClick={() => setResultFilter("all")} />
            <ResultFilterButton label="Processing" count={totals.processing} active={resultFilter === "processing"} onClick={() => setResultFilter("processing")} />
            <ResultFilterButton label="Ready" count={totals.ready} active={resultFilter === "ready"} onClick={() => setResultFilter("ready")} />
            <ResultFilterButton label="Filtered" count={totals.filtered} active={resultFilter === "filtered"} onClick={() => setResultFilter("filtered")} />
            {totals.failed > 0 && <ResultFilterButton label="Failed" count={totals.failed} active={resultFilter === "failed"} onClick={() => setResultFilter("failed")} />}
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search listings, sellers, or keywords" className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 text-xs text-stone-800 outline-none transition focus:border-stone-400 focus:bg-white" />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] table-fixed text-left">
            <colgroup>
              <col className="w-[31%]" /><col className="w-[15%]" /><col className="w-[22%]" />
              <col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[3%]" />
            </colgroup>
            <thead className="border-b border-stone-200 bg-stone-50/80 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
              <tr>
                <th className="px-3 py-2.5">Listing</th><th className="px-3 py-2.5">Website & search</th>
                <th className="px-3 py-2.5">Marketplace metadata</th><th className="px-3 py-2.5">Match evidence</th>
                <th className="px-3 py-2.5">Pipeline</th><th className="px-2 py-2.5"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visibleResults.map((result) => <ProgressiveResultRow key={result.candidate_id} result={result} ipId={ipId} />)}
            </tbody>
          </table>
        </div>

        {visibleResults.length === 0 && <ResultEmptyState hasAnyResults={allResults.length > 0} sources={snapshot.sources} />}
      </section>

      {snapshot.onboarding.customer_action_required && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div><span className="font-semibold">{snapshot.onboarding.title}.</span> {snapshot.onboarding.message}</div>
        </div>
      )}

      <footer className="mt-4 flex flex-col gap-2 border-t border-stone-200 pt-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <span>You can leave this page — monitoring continues in the background.</span>
        <Link to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}&status=all`} className="inline-flex items-center gap-1 font-semibold text-stone-700 hover:text-stone-950">
          View all monitoring tasks <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </div>
  );
}

function ProgressiveResultRow({ result, ipId }: { result: IpFirstScanResult; ipId: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = firstScanResultImage(result);
  const title = result.listing_title || result.candidate_title || readableListingUrl(result.page_url);
  const progress = firstScanResultMetadata(result);
  const stageCopy = RESULT_STATE_COPY[result.stage];
  const active = FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage);
  const target = result.ready_for_review && result.result_id
    ? `/monitoring/tasks/${encodeURIComponent(result.result_id)}?ip_id=${encodeURIComponent(ipId)}`
    : null;

  return (
    <tr className="group h-[86px] align-middle transition hover:bg-stone-50/70">
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {image && !imageFailed ? <img src={image} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} /> : (
              <div className="flex h-full items-center justify-center text-stone-300">{active ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-stone-900" title={title}>{title}</p>
            <a href={result.page_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-stone-400 hover:text-stone-700" title={result.page_url}>{compactUrl(result.page_url)}</a>
            <p className="mt-1 text-[10px] text-stone-400">Found {formatRelativeTime(result.discovered_at)}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <p className="truncate text-xs font-semibold text-stone-700">{result.source_name || readableDomain(result.source_domain)}</p>
        <p className="mt-1 truncate text-[11px] text-stone-400" title={result.keyword ?? undefined}>{result.keyword || "Default search"}</p>
        <p className="mt-1 truncate text-[10px] text-stone-400">{readableMethod(result.source_method)}</p>
      </td>
      <td className="px-3 py-2.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <MetadataValue icon={<Store className="h-3 w-3" />} value={result.seller_name} pending={active} />
          <MetadataValue value={result.price} pending={active} strong />
          <MetadataValue icon={<MapPin className="h-3 w-3" />} value={result.location} pending={active} />
          <MetadataValue value={result.candidate_page_kind ? readableMethod(result.candidate_page_kind) : null} pending={active} />
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-black tabular-nums text-stone-800">{formatSimilarity(result.similarity_score)}</span>
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-stone-400">{readableMethod(result.match_method) || "Waiting"}</span>
        </div>
        <p className="mt-1.5 truncate text-[11px] text-stone-500" title={result.vlm_reasoning ?? undefined}>
          {result.vlm_verdict ? `${readableMethod(result.vlm_verdict)}${result.vlm_confidence !== null ? ` · ${Math.round(result.vlm_confidence * 100)}%` : ""}` : active ? "Automated checks pending" : "No match evidence"}
        </p>
      </td>
      <td className="px-3 py-2.5">
        <ResultStageBadge stage={result.stage} />
        <p className="mt-1.5 truncate text-[10px] text-stone-400" title={stageCopy.detail}>{stageCopy.detail}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
            <span className={`block rounded-full ${result.stage === "ready" ? "bg-emerald-500" : result.stage === "failed" ? "bg-red-400" : "bg-blue-500"}`} style={{ width: `${Math.max(8, (progress.complete / progress.total) * 100)}%` }} />
          </div>
          <span className="text-[9px] tabular-nums text-stone-400">{progress.complete}/{progress.total}</span>
        </div>
      </td>
      <td className="px-2 py-2.5 text-right">
        {target ? (
          <Link to={target} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-900" aria-label={`Open ${title} in triage`}><ChevronRight className="h-4 w-4" /></Link>
        ) : (
          <a href={result.page_url} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-300 hover:bg-stone-100 hover:text-stone-700" aria-label={`Open ${title} on ${result.source_domain}`}><ExternalLink className="h-3.5 w-3.5" /></a>
        )}
      </td>
    </tr>
  );
}

function ResultStageBadge({ stage }: { stage: IpFirstScanResultStage }) {
  const copy = RESULT_STATE_COPY[stage];
  const classes = stage === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : stage === "filtered" ? "border-stone-200 bg-stone-50 text-stone-500" : stage === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${classes}`}>
      {stage === "ready" ? <Check className="h-3 w-3" /> : stage === "failed" ? <AlertCircle className="h-3 w-3" /> : stage === "filtered" ? <CircleDashed className="h-3 w-3" /> : <LoaderCircle className="h-3 w-3 animate-spin" />}
      <span className="truncate">{copy.label}</span>
    </span>
  );
}

function MetadataValue({ value, icon, pending, strong = false }: { value: string | null; icon?: React.ReactNode; pending: boolean; strong?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 text-[11px] ${strong ? "font-semibold text-stone-700" : "text-stone-500"}`}>
      {icon && <span className="shrink-0 text-stone-300">{icon}</span>}
      {value ? <span className="truncate" title={value}>{value}</span> : <span className={`truncate ${pending ? "text-stone-300" : "text-stone-400"}`}>{pending ? "Waiting…" : "—"}</span>}
    </div>
  );
}

function SourceFilterButton({ active, onClick, name, count, state }: { active: boolean; onClick: () => void; name: string; count: number; state?: FirstScanSourceState }) {
  return (
    <button type="button" onClick={onClick} className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${active ? "border-stone-300 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
      {state && <span className={`h-1.5 w-1.5 rounded-full ${state === "failed" ? "bg-red-500" : state === "ready" ? "bg-emerald-500" : "bg-blue-500"}`} />}
      <span className="font-semibold">{name}</span>
      <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${active ? "bg-white/15 text-white" : "bg-stone-100 text-stone-500"}`}>{count}</span>
    </button>
  );
}

function ResultFilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${active ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}>
      {label}<span className={`rounded px-1 py-0.5 text-[9px] tabular-nums ${active ? "bg-white/15" : "bg-stone-100"}`}>{count}</span>
    </button>
  );
}

function SummaryMetric({ label, value, detail, icon, accent = false }: { label: string; value: number | string; detail: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`border-b border-stone-100 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${accent ? "bg-emerald-50/50" : ""}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-500"><span className={accent ? "text-emerald-600" : "text-stone-400"}>{icon}</span>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2"><span className={`text-xl font-black tabular-nums ${accent ? "text-emerald-700" : "text-stone-950"}`}>{value}</span><span className="text-[10px] text-stone-400">{detail}</span></div>
    </div>
  );
}

function ResultEmptyState({ hasAnyResults, sources }: { hasAnyResults: boolean; sources: FirstScanSourceProgress[] }) {
  const activeSource = sources.find((source) => source.state !== "ready" && source.state !== "failed");
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      {hasAnyResults ? <Search className="h-5 w-5 text-stone-300" /> : <LoaderCircle className="h-5 w-5 animate-spin text-blue-500" />}
      <p className="mt-3 text-sm font-semibold text-stone-800">{hasAnyResults ? "No rows match these filters" : "Waiting for the first listing"}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">
        {hasAnyResults ? "Clear the search or select another pipeline stage." : activeSource ? `${SOURCE_STATE_COPY[activeSource.state].label}: ${activeSource.source.display_name || readableDomain(activeSource.source.domain)}. Rows appear here as soon as the scraper saves a result.` : "The scan is running in the background and this table updates automatically."}
      </p>
    </div>
  );
}

function FirstScanSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] animate-pulse px-4 py-5 sm:px-6">
      <div className="h-3 w-20 rounded bg-stone-200" /><div className="mt-3 h-7 w-80 max-w-full rounded bg-stone-200" />
      <div className="mt-2 h-4 w-[34rem] max-w-full rounded bg-stone-100" /><div className="mt-5 h-24 rounded-xl border border-stone-200 bg-white" />
      <div className="mt-3 h-[30rem] rounded-xl border border-stone-200 bg-white" />
    </div>
  );
}

function PageMessage({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500">{icon}</div>
      <h1 className="mt-4 text-lg font-bold text-stone-900">{title}</h1><p className="mt-1 text-sm leading-6 text-stone-500">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function emptyFindingsPage(): MonitoringFindingsPage {
  return {
    findings: [], next_cursor: null,
    facets: {
      statuses: {}, priorities: { high: 0, med: 0, low: 0 }, platforms: [], ips: [], product_groups: [], sellers: [], dismissal_reasons: {},
      candidate_outcomes: { false_positive: 0, do_not_pursue: 0, takedown: 0, second_hand: 0, none: 0 }, total: 0,
    },
  };
}

function findingToProgressiveResult(finding: IpReviewFinding, source: MonitoredDomain): IpFirstScanResult {
  return {
    candidate_id: `finding:${finding.result_id}`, run_id: finding.run_id, source_id: source.id, source_domain: source.domain, source_name: source.display_name,
    keyword: null, run_status: "completed", run_error: null, score_job_status: "completed", score_job_error: null, page_url: finding.page_url,
    image_url: finding.image_url, candidate_title: finding.listing_title, source_method: finding.source_method, discovered_at: finding.found_at,
    candidate_page_kind: null, candidate_actionability: null, qualification_confidence: null, qualification_classifier: null, qualified_at: null,
    result_id: finding.result_id, lifecycle_state: finding.ready_for_review ? "promoted" : "qualifying", similarity_score: finding.similarity_score,
    match_method: finding.match_method, vlm_verdict: finding.vlm_verdict, vlm_confidence: finding.vlm_confidence, vlm_reasoning: finding.vlm_reasoning,
    case_id: finding.case_id, listing_title: finding.listing_title, seller_name: finding.seller_name, seller_url: finding.seller_url, price: finding.price,
    location: finding.location, description_summary: finding.description_summary, image_urls: finding.image_urls, enrichment_error: finding.enrichment_error,
    ready_for_review: finding.ready_for_review, review_status: finding.review_status, updated_at: finding.updated_at,
    stage: finding.ready_for_review ? "ready" : "enriching",
  };
}

function compareFirstScanResults(left: IpFirstScanResult, right: IpFirstScanResult): number {
  const rank: Record<IpFirstScanResultStage, number> = { matching: 0, qualifying: 1, enriching: 2, discovered: 3, ready: 4, failed: 5, filtered: 6 };
  const byStage = rank[left.stage] - rank[right.stage];
  return byStage !== 0 ? byStage : Date.parse(right.discovered_at) - Date.parse(left.discovered_at);
}

function readableDomain(domain: string): string {
  return domain.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function readableMethod(value: string | null): string {
  return value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "";
}

function readableListingUrl(value: string): string {
  try {
    const url = new URL(value); const part = url.pathname.split("/").filter(Boolean).pop();
    return part ? decodeURIComponent(part).replace(/[-_]+/g, " ") : readableDomain(url.hostname);
  } catch { return value; }
}

function compactUrl(value: string): string {
  try { const url = new URL(value); return `${url.hostname.replace(/^www\./, "")}${url.pathname}`; } catch { return value; }
}

function formatSimilarity(value: number | null): string { return value === null ? "—" : `${Math.round(value * 100)}%`; }
function formatUpdateTime(value: Date): string { return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function formatRelativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 10) return "just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const minutes = Math.floor(elapsedSeconds / 60); if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}
