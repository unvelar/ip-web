import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDashed,
  Clock3,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Pause,
  Search,
  Store,
} from "lucide-react";
import type { IpFirstScanResult, IpFirstScanResultStage, MonitoringSourceRecovery } from "../../api";
import type { MonitoringSourceHealth } from "../../api/monitoringSettings";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  firstScanResultImage,
  firstScanResultMetadata,
  type FirstScanSourceProgress,
  type FirstScanSourceState,
} from "../../lib/firstScanProgress";
import type { FirstScanResultTotals } from "./resultTotals";
import type { ResultFilter } from "./useFirstScanFeed";
import {
  SOURCE_STATE_COPY,
  resultPresentation,
  type ResultPresentation,
  compactUrl,
  formatRelativeTime,
  formatSimilarity,
  readableDomain,
  readableListingUrl,
  readableMethod,
} from "./presentation";

export interface FirstScanTotals {
  websites: number;
  connected: number;
  discovered: number;
  processing: number;
  ready: number;
  filtered: number;
  failed: number;
}

export function FirstScanResults({
  ipId,
  sources,
  recovery = [],
  results,
  health = [],
  allResultCount,
  totals,
  resultFilterTotals,
  filteredTotal,
  hasMore,
  loadingMore,
  refreshing,
  onLoadMore,
  query,
  resultFilter,
  sourceFilter,
  onQueryChange,
  onResultFilterChange,
  onSourceFilterChange,
}: {
  ipId: string;
  sources: FirstScanSourceProgress[];
  recovery?: MonitoringSourceRecovery[];
  results: IpFirstScanResult[];
  health?: MonitoringSourceHealth[];
  allResultCount: number;
  totals: FirstScanTotals;
  resultFilterTotals: FirstScanResultTotals;
  filteredTotal: number;
  hasMore: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  onLoadMore: () => void;
  query: string;
  resultFilter: ResultFilter;
  sourceFilter: string;
  onQueryChange: (value: string) => void;
  onResultFilterChange: (value: ResultFilter) => void;
  onSourceFilterChange: (value: string) => void;
}) {
  const selectedHealth = health.filter(item => sources.some(source => source.source.id === item.source_id)
    && (sourceFilter === "all" || item.source_id === sourceFilter));
  const delayed = selectedHealth.filter(item => item.state === "delayed");
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-stone-100 px-3 py-1.5">
        <SourceFilterButton active={sourceFilter === "all"} onClick={() => onSourceFilterChange("all")} name="All websites" count={totals.discovered} />
        {sources.map((source) => (
          <SourceFilterButton
            key={source.source.id}
            active={sourceFilter === source.source.id}
            onClick={() => onSourceFilterChange(source.source.id)}
            name={source.source.display_name?.trim() || readableDomain(source.source.domain)}
            count={source.discovered}
            state={source.state}
            enabled={source.source.enabled}
            country={source.source.country}
            recovery={recovery.find(item => item.source_id === source.source.id)}
            health={health.find(item => item.source_id === source.source.id)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          <ResultFilterButton label="All" count={resultFilterTotals.discovered} value="all" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Pending" count={resultFilterTotals.processing} value="processing" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Ready" count={resultFilterTotals.ready} value="ready" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Filtered" count={resultFilterTotals.filtered} value="filtered" active={resultFilter} onChange={onResultFilterChange} />
          {resultFilterTotals.failed > 0 && <ResultFilterButton label="Failed" count={resultFilterTotals.failed} value="failed" active={resultFilter} onChange={onResultFilterChange} />}
        </div>
        <label className="relative block w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input value={query} maxLength={500} onChange={(event) => onQueryChange(event.target.value)} aria-label="Search all listings" placeholder="Search all listings, sellers, or keywords" className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 text-xs text-stone-800 outline-none transition focus:border-stone-400 focus:bg-white" />
        </label>
      </div>

      {delayed.length > 0 && <p role="status" className="border-b border-stone-100 px-3 py-2 text-xs text-stone-500">
        Updates from {delayed.map(item => item.label).join(", ")} are delayed. Saved listings remain available.
      </p>}
      {sourceFilter !== "all" && selectedHealth[0]?.last_checked_at && <p className="border-b border-stone-100 px-3 py-1.5 text-[11px] text-stone-400">
        Last checked {new Date(selectedHealth[0].last_checked_at).toLocaleString()}
      </p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] table-fixed text-left">
          <colgroup>
            <col className="w-[31%]" /><col className="w-[15%]" /><col className="w-[22%]" />
            <col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[3%]" />
          </colgroup>
          <thead className="border-b border-stone-200 bg-stone-50/80 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
            <tr>
              <th className="px-3 py-2">Listing</th><th className="px-3 py-2">Website & search</th>
              <th className="px-3 py-2">Marketplace metadata</th><th className="px-3 py-2">Match evidence</th>
              <th className="px-3 py-2">Pipeline</th><th className="px-2 py-2"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {results.map((result) => <ProgressiveResultRow key={result.candidate_id} result={result} ipId={ipId} />)}
          </tbody>
        </table>
      </div>

      {results.length === 0 && <ResultEmptyState recovery={recovery} loading={refreshing} hasAnyResults={allResultCount > 0}
        health={selectedHealth}
        sources={sourceFilter === "all" ? sources : sources.filter(source => source.source.id === sourceFilter)} />}
      <div className="flex items-center justify-between gap-3 border-t border-stone-200 px-4 py-3">
        <p className="text-xs tabular-nums text-stone-500" aria-live="polite">
          {refreshing && results.length === 0 ? "Loading listings…" : `Showing ${results.length.toLocaleString()} of ${filteredTotal.toLocaleString()} listings`}
        </p>
        {hasMore && (
          <button type="button" onClick={onLoadMore} disabled={loadingMore || refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-wait disabled:opacity-50">
            {loadingMore && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            {loadingMore ? "Loading listings…" : "Load more listings"}
          </button>
        )}
      </div>
    </section>
  );
}

function ProgressiveResultRow({ result, ipId }: { result: IpFirstScanResult; ipId: string }) {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const image = firstScanResultImage(result);
  const title = result.listing_title || result.candidate_title || readableListingUrl(result.page_url);
  const progress = firstScanResultMetadata(result);
  const accessBlocked = result.qualification_access_blocked;
  const stageCopy = resultPresentation(result);
  const active = FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage);
  const target = result.ready_for_review && result.result_id
    ? `/monitoring/tasks/${encodeURIComponent(result.result_id)}?ip_id=${encodeURIComponent(ipId)}`
    : null;

  return (
    <tr className="group h-[72px] align-middle transition hover:bg-stone-50/70">
      <td className="px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {image && failedImage !== image
              ? <img src={image} alt="" loading="lazy" decoding="async" fetchPriority="low" className="h-full w-full object-cover"
                  onError={() => setFailedImage(image)}
                  onLoad={event => {
                    const { naturalWidth, naturalHeight } = event.currentTarget;
                    if (Math.min(naturalWidth, naturalHeight) < 16) setFailedImage(image);
                  }} />
              : <div className="flex h-full items-center justify-center text-stone-300">{stageCopy.activity === "running" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</div>}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-stone-900" title={title}>{title}</p>
            <a href={result.page_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[11px] text-stone-400 hover:text-stone-700" title={result.page_url}>{compactUrl(result.page_url)}</a>
            <p className={`mt-1 text-[10px] ${result.previous_result ? "text-amber-700" : "text-stone-400"}`} title={new Date(result.discovered_at).toLocaleString()}>
              {result.previous_result ? "Earlier scan · found " : "Found "}{formatRelativeTime(result.discovered_at)}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <p className="truncate text-xs font-semibold text-stone-700">{result.source_name || readableDomain(result.source_domain)}</p>
        <p className="mt-1 truncate text-[11px] text-stone-400" title={result.keyword ?? undefined}>{result.keyword || "Default search"}</p>
        <p className="mt-1 truncate text-[10px] text-stone-400">{readableMethod(result.source_method)}</p>
      </td>
      <td className="px-3 py-2">
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <MetadataValue icon={<Store className="h-3 w-3" />} value={result.seller_name} pending={active} />
          <MetadataValue value={result.price} pending={active} strong />
          <MetadataValue icon={<MapPin className="h-3 w-3" />} value={result.location} pending={active} />
          <MetadataValue value={result.candidate_page_kind ? readableMethod(result.candidate_page_kind) : null} pending={active} />
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-black tabular-nums text-stone-800">{formatSimilarity(result.similarity_score)}</span>
          <span className="truncate text-[10px] font-medium uppercase tracking-wide text-stone-400">{readableMethod(result.match_method) || (active ? "Waiting" : "Not checked")}</span>
        </div>
        <p className="mt-1 truncate text-[11px] text-stone-500" title={result.vlm_reasoning ?? undefined}>
          {result.matching_error ? "Match check incomplete" : result.vlm_verdict ? `${readableMethod(result.vlm_verdict)}${result.vlm_confidence !== null ? ` · ${Math.round(result.vlm_confidence * 100)}%` : ""}` : accessBlocked ? "Match found; page check blocked" : result.result_id ? "Match found" : active ? "Automated checks pending" : "No match evidence"}
        </p>
        {(result.matching_error || result.vlm_reasoning) && <p className="mt-1 line-clamp-2 text-[10px] text-stone-500" title={result.matching_error || result.vlm_reasoning || undefined}>
          {result.matching_error || result.vlm_reasoning}
        </p>}
      </td>
      <td className="px-3 py-2">
        <ResultStageBadge stage={result.stage} copy={stageCopy} />
        <p className="mt-1 line-clamp-2 text-[10px] text-stone-400" title={stageCopy.detail}>{stageCopy.detail}</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
            <span className={`block rounded-full ${result.stage === "ready" ? "bg-emerald-500" : accessBlocked ? "bg-amber-500" : result.stage === "failed" ? "bg-red-400" : "bg-blue-500"}`} style={{ width: `${Math.max(8, (progress.complete / progress.total) * 100)}%` }} />
          </div>
          <span className="text-[9px] tabular-nums text-stone-400">{progress.complete}/{progress.total}</span>
        </div>
      </td>
      <td className="px-2 py-2 text-right">
        {target ? (
          <Link to={target} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-900" aria-label={`Open ${title} in triage`}><ChevronRight className="h-4 w-4" /></Link>
        ) : (
          <a href={result.page_url} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-300 hover:bg-stone-100 hover:text-stone-700" aria-label={`Open ${title} on ${result.source_domain}`}><ExternalLink className="h-3.5 w-3.5" /></a>
        )}
      </td>
    </tr>
  );
}

function ResultStageBadge({ stage, copy }: { stage: IpFirstScanResultStage; copy: ResultPresentation }) {
  const classes = copy.activity === "blocked"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : copy.activity === "paused"
      ? "border-stone-200 bg-stone-50 text-stone-600"
      : copy.activity === "scheduled"
        ? "border-violet-200 bg-violet-50 text-violet-700"
        : stage === "ready"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : stage === "filtered" || stage === "cancelled"
            ? "border-stone-200 bg-stone-50 text-stone-500"
            : stage === "failed"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-blue-200 bg-blue-50 text-blue-700";
  const Icon = stage === "ready" ? Check
    : copy.activity === "blocked" || stage === "failed" ? AlertCircle
      : stage === "filtered" || stage === "cancelled" ? CircleDashed
        : copy.activity === "paused" ? Pause
          : copy.activity === "queued" || copy.activity === "scheduled" ? Clock3 : LoaderCircle;
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${classes}`}>
      <Icon className={`h-3 w-3 ${copy.activity === "running" ? "animate-spin" : ""}`} />
      <span className="truncate">{copy.label}</span>
    </span>
  );
}

function MetadataValue({ value, icon, pending, strong = false }: { value: string | null; icon?: ReactNode; pending: boolean; strong?: boolean }) {
  return (
    <div className={`flex min-w-0 items-center gap-1 text-[11px] ${strong ? "font-semibold text-stone-700" : "text-stone-500"}`}>
      {icon && <span className="shrink-0 text-stone-300">{icon}</span>}
      {value ? <span className="truncate" title={value}>{value}</span> : <span className={`truncate ${pending ? "text-stone-300" : "text-stone-400"}`}>{pending ? "Waiting…" : "Unavailable"}</span>}
    </div>
  );
}

function SourceFilterButton({ active, onClick, name, count, state, recovery, enabled, country, health }: { active: boolean; onClick: () => void; name: string; count: number; state?: FirstScanSourceState; recovery?: MonitoringSourceRecovery; enabled?: boolean; country?: string | null; health?: MonitoringSourceHealth }) {
  const paused = enabled === false || state === "paused" || recovery?.state === "off" || health?.state === "paused";
  const selectedCountry = health?.country ?? country;
  const delayed = !paused && health?.state === "delayed";
  const updating = !paused && !delayed && (health?.state === "updating" || state === "setup_processing" || state === "connecting" || state === "scanning");
  const label = paused ? "Paused" : delayed ? "Delayed" : updating ? "Updating" : null;
  const checked = health?.last_checked_at ? `Last checked ${new Date(health.last_checked_at).toLocaleString()}` : "";
  return (
    <button type="button" onClick={onClick} title={[name, selectedCountry, checked].filter(Boolean).join(" · ")} className={`flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${active ? "border-stone-300 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"}`}>
      {state && <span className={`h-1.5 w-1.5 rounded-full ${paused || delayed ? "bg-stone-400" : updating ? "bg-blue-500" : "bg-stone-400"}`} />}
      <span className="font-semibold">{name}</span>
      {selectedCountry && <span className={`text-[10px] ${active ? "text-white/70" : "text-stone-400"}`}>{selectedCountry}</span>}
      <span className={`rounded px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-stone-100 tabular-nums text-stone-500"}`}>
        {count.toLocaleString()}
      </span>
      {label && <span className={`text-[10px] ${active ? "text-white/70" : "text-stone-400"}`}>{label}</span>}
    </button>
  );
}

function ResultFilterButton({ label, count, value, active, onChange }: { label: string; count: number; value: ResultFilter; active: ResultFilter; onChange: (value: ResultFilter) => void }) {
  const selected = value === active;
  return (
    <button type="button" onClick={() => onChange(value)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${selected ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}>
      {label}<span className={`rounded px-1 py-0.5 text-[9px] tabular-nums ${selected ? "bg-white/15" : "bg-stone-100"}`}>{count}</span>
    </button>
  );
}

function ResultEmptyState({ recovery, loading, hasAnyResults, sources, health }: { recovery: MonitoringSourceRecovery[]; loading: boolean; hasAnyResults: boolean; sources: FirstScanSourceProgress[]; health: MonitoringSourceHealth[] }) {
  const noSelection = sources.length === 0;
  const paused = sources.length > 0 && sources.every(source => source.source.enabled === false
    || health.some(item => item.source_id === source.source.id && item.state === "paused"));
  const activeSource = sources.find((source) => source.source.enabled !== false && source.state !== "ready" && source.state !== "failed");
  const failedSetup = sources.length === 1 && sources[0].discovered === 0
    ? recovery.find(item => item.source_id === sources[0].source.id && item.reason
      && ["scheduled", "due", "blocked", "needed"].includes(item.state)) : null;
  if (failedSetup && !paused && !loading) return <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
    <Search className="h-5 w-5 text-stone-400" />
    <p className="mt-3 text-sm font-semibold text-stone-800">Waiting for updates from {failedSetup.label}</p>
    <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">New listings will appear here as monitoring updates.</p>
  </div>;
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      {paused && !loading ? <Pause className="h-5 w-5 text-stone-400" /> : (noSelection || hasAnyResults) && !loading ? <Search className="h-5 w-5 text-stone-300" /> : <LoaderCircle className="h-5 w-5 animate-spin text-blue-500" />}
      <p className="mt-3 text-sm font-semibold text-stone-800">{loading ? "Loading listings…" : noSelection ? "No websites selected" : paused ? "Website monitoring is paused" : hasAnyResults ? "No rows match these filters" : "Waiting for the first listing"}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">
        {loading ? "Updating results for the selected filters." : noSelection ? "Choose websites in monitoring setup to start searches." : paused
          ? "Enable this website in monitoring setup to resume searches. Saved listings remain available."
          : hasAnyResults
          ? "Clear the search or select another pipeline stage."
          : activeSource
            ? `${SOURCE_STATE_COPY[activeSource.state].label}: ${activeSource.source.display_name || readableDomain(activeSource.source.domain)}. Listings appear as monitoring finds them.`
            : "Monitoring adds listings here as updates become available."}
      </p>
      {noSelection && !loading && (
        <Link to="/monitoring/setup" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-stone-700 hover:text-stone-950">
          Choose websites <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

export function FirstScanSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] animate-pulse px-4 py-3 sm:px-6" role="status" aria-label="Loading monitoring listings">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <div className="flex gap-2 border-b border-stone-100 px-3 py-1.5">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-8 w-24 rounded-lg bg-stone-100" />)}
        </div>
        <div className="h-12 border-b border-stone-200 bg-stone-50" />
        <div className="h-[30rem]" />
      </div>
    </div>
  );
}

export function PageMessage({ icon, title, detail, action }: { icon: ReactNode; title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[55vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500">{icon}</div>
      <h1 className="mt-4 text-lg font-bold text-stone-900">{title}</h1>
      <p className="mt-1 text-sm leading-6 text-stone-500">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
