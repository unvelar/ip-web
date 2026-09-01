import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Check,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Search,
  Store,
} from "lucide-react";
import type { IpFirstScanResult, IpFirstScanResultStage } from "../../api";
import {
  FIRST_SCAN_ACTIVE_RESULT_STAGES,
  firstScanResultImage,
  firstScanResultMetadata,
  type FirstScanSourceProgress,
  type FirstScanSourceState,
} from "../../lib/firstScanProgress";
import type { ResultFilter } from "./useFirstScanFeed";
import {
  ACCESS_BLOCKED_RESULT_COPY,
  RESULT_STATE_COPY,
  SOURCE_STATE_COPY,
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
  results,
  allResultCount,
  totals,
  query,
  resultFilter,
  sourceFilter,
  onQueryChange,
  onResultFilterChange,
  onSourceFilterChange,
}: {
  ipId: string;
  sources: FirstScanSourceProgress[];
  results: IpFirstScanResult[];
  allResultCount: number;
  totals: FirstScanTotals;
  query: string;
  resultFilter: ResultFilter;
  sourceFilter: string;
  onQueryChange: (value: string) => void;
  onResultFilterChange: (value: ResultFilter) => void;
  onSourceFilterChange: (value: string) => void;
}) {
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto border-b border-stone-100 px-3 py-2">
        <SourceFilterButton active={sourceFilter === "all"} onClick={() => onSourceFilterChange("all")} name="All websites" count={totals.discovered} />
        {sources.map((source) => (
          <SourceFilterButton
            key={source.source.id}
            active={sourceFilter === source.source.id}
            onClick={() => onSourceFilterChange(source.source.id)}
            name={source.source.display_name?.trim() || readableDomain(source.source.domain)}
            count={source.discovered}
            state={source.state}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-b border-stone-200 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          <ResultFilterButton label="All" count={totals.discovered} value="all" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Processing" count={totals.processing} value="processing" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Ready" count={totals.ready} value="ready" active={resultFilter} onChange={onResultFilterChange} />
          <ResultFilterButton label="Filtered" count={totals.filtered} value="filtered" active={resultFilter} onChange={onResultFilterChange} />
          {totals.failed > 0 && <ResultFilterButton label="Failed" count={totals.failed} value="failed" active={resultFilter} onChange={onResultFilterChange} />}
        </div>
        <label className="relative block w-full lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search listings, sellers, or keywords" className="h-8 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 text-xs text-stone-800 outline-none transition focus:border-stone-400 focus:bg-white" />
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
            {results.map((result) => <ProgressiveResultRow key={result.candidate_id} result={result} ipId={ipId} />)}
          </tbody>
        </table>
      </div>

      {results.length === 0 && <ResultEmptyState hasAnyResults={allResultCount > 0} sources={sources} />}
    </section>
  );
}

function ProgressiveResultRow({ result, ipId }: { result: IpFirstScanResult; ipId: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = firstScanResultImage(result);
  const title = result.listing_title || result.candidate_title || readableListingUrl(result.page_url);
  const progress = firstScanResultMetadata(result);
  const accessBlocked = result.qualification_access_blocked;
  const stageCopy = accessBlocked ? ACCESS_BLOCKED_RESULT_COPY : RESULT_STATE_COPY[result.stage];
  const active = FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage);
  const target = result.ready_for_review && result.result_id
    ? `/monitoring/tasks/${encodeURIComponent(result.result_id)}?ip_id=${encodeURIComponent(ipId)}`
    : null;

  return (
    <tr className="group h-[86px] align-middle transition hover:bg-stone-50/70">
      <td className="px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
            {image && !imageFailed
              ? <img src={image} alt="" className="h-full w-full object-cover" onError={() => setImageFailed(true)} />
              : <div className="flex h-full items-center justify-center text-stone-300">{active ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}</div>}
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
          {result.vlm_verdict ? `${readableMethod(result.vlm_verdict)}${result.vlm_confidence !== null ? ` · ${Math.round(result.vlm_confidence * 100)}%` : ""}` : accessBlocked ? "Match found; page check blocked" : active ? "Automated checks pending" : "No match evidence"}
        </p>
      </td>
      <td className="px-3 py-2.5">
        <ResultStageBadge stage={result.stage} accessBlocked={accessBlocked} />
        <p className="mt-1.5 truncate text-[10px] text-stone-400" title={stageCopy.detail}>{stageCopy.detail}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-stone-100">
            <span className={`block rounded-full ${result.stage === "ready" ? "bg-emerald-500" : accessBlocked ? "bg-amber-500" : result.stage === "failed" ? "bg-red-400" : "bg-blue-500"}`} style={{ width: `${Math.max(8, (progress.complete / progress.total) * 100)}%` }} />
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

function ResultStageBadge({ stage, accessBlocked }: { stage: IpFirstScanResultStage; accessBlocked: boolean }) {
  const copy = accessBlocked ? ACCESS_BLOCKED_RESULT_COPY : RESULT_STATE_COPY[stage];
  const classes = accessBlocked
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : stage === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : stage === "filtered"
        ? "border-stone-200 bg-stone-50 text-stone-500"
        : stage === "failed"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${classes}`}>
      {stage === "ready" ? <Check className="h-3 w-3" /> : accessBlocked || stage === "failed" ? <AlertCircle className="h-3 w-3" /> : stage === "filtered" ? <CircleDashed className="h-3 w-3" /> : <LoaderCircle className="h-3 w-3 animate-spin" />}
      <span className="truncate">{copy.label}</span>
    </span>
  );
}

function MetadataValue({ value, icon, pending, strong = false }: { value: string | null; icon?: ReactNode; pending: boolean; strong?: boolean }) {
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

function ResultFilterButton({ label, count, value, active, onChange }: { label: string; count: number; value: ResultFilter; active: ResultFilter; onChange: (value: ResultFilter) => void }) {
  const selected = value === active;
  return (
    <button type="button" onClick={() => onChange(value)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition ${selected ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"}`}>
      {label}<span className={`rounded px-1 py-0.5 text-[9px] tabular-nums ${selected ? "bg-white/15" : "bg-stone-100"}`}>{count}</span>
    </button>
  );
}

function ResultEmptyState({ hasAnyResults, sources }: { hasAnyResults: boolean; sources: FirstScanSourceProgress[] }) {
  const activeSource = sources.find((source) => source.state !== "ready" && source.state !== "failed");
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
      {hasAnyResults ? <Search className="h-5 w-5 text-stone-300" /> : <LoaderCircle className="h-5 w-5 animate-spin text-blue-500" />}
      <p className="mt-3 text-sm font-semibold text-stone-800">{hasAnyResults ? "No rows match these filters" : "Waiting for the first listing"}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">
        {hasAnyResults
          ? "Clear the search or select another pipeline stage."
          : activeSource
            ? `${SOURCE_STATE_COPY[activeSource.state].label}: ${activeSource.source.display_name || readableDomain(activeSource.source.domain)}. Rows appear here as soon as the scraper saves a result.`
            : "The scan is running in the background and this table updates automatically."}
      </p>
    </div>
  );
}

export function SummaryMetric({ label, value, detail, icon, accent = false }: { label: string; value: number | string; detail: string; icon: ReactNode; accent?: boolean }) {
  return (
    <div className={`border-b border-stone-100 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${accent ? "bg-emerald-50/50" : ""}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-500"><span className={accent ? "text-emerald-600" : "text-stone-400"}>{icon}</span>{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2"><span className={`text-xl font-black tabular-nums ${accent ? "text-emerald-700" : "text-stone-950"}`}>{value}</span><span className="text-[10px] text-stone-400">{detail}</span></div>
    </div>
  );
}

export function FirstScanSkeleton() {
  return (
    <div className="mx-auto max-w-[1500px] animate-pulse px-4 py-5 sm:px-6">
      <div className="h-3 w-20 rounded bg-stone-200" /><div className="mt-3 h-7 w-80 max-w-full rounded bg-stone-200" />
      <div className="mt-2 h-4 w-[34rem] max-w-full rounded bg-stone-100" /><div className="mt-5 h-24 rounded-xl border border-stone-200 bg-white" />
      <div className="mt-3 h-[30rem] rounded-xl border border-stone-200 bg-white" />
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
