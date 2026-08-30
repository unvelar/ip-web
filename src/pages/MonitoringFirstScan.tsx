import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  Globe2,
  LoaderCircle,
  Radar,
  Search,
} from "lucide-react";
import {
  FirstScanResults,
  FirstScanSkeleton,
  PageMessage,
  SummaryMetric,
} from "../features/firstScan/FirstScanResults";
import { formatUpdateTime } from "../features/firstScan/presentation";
import { useFirstScanFeed } from "../features/firstScan/useFirstScanFeed";

export default function MonitoringFirstScan() {
  const [params] = useSearchParams();
  const feed = useFirstScanFeed(params.get("ip_id"));

  if (feed.loading && !feed.snapshot) return <FirstScanSkeleton />;
  if (!feed.ipId) {
    return <PageMessage icon={<Radar className="h-5 w-5" />} title="Choose an IP to watch its first scan" detail="Select a working IP from the top bar, then return to this page." />;
  }
  if (!feed.snapshot) {
    return (
      <PageMessage
        icon={<AlertCircle className="h-5 w-5" />}
        title="Monitoring progress is unavailable"
        detail={feed.error ?? "Try loading this page again."}
        action={<button type="button" onClick={() => void feed.refresh()} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">Try again</button>}
      />
    );
  }

  const { snapshot, totals, ipId } = feed;
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400"><Radar className="h-3.5 w-3.5" /> First scan</div>
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
            {feed.refreshing && <LoaderCircle className="h-3.5 w-3.5 animate-spin text-stone-400" />}
          </div>
          {totals.ready > 0 && (
            <Link to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}`} className="inline-flex items-center gap-2 rounded-lg bg-stone-950 px-3.5 py-2 text-xs font-semibold text-white hover:bg-stone-800">
              Open triage <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px]">{totals.ready}</span><ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </header>

      {feed.error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> The latest refresh failed. Showing the last known progress: {feed.error}
        </div>
      )}

      <section className="mt-4 grid overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:grid-cols-4">
        <SummaryMetric label="Websites" value={`${totals.connected}/${totals.websites}`} detail="connected" icon={<Globe2 className="h-4 w-4" />} />
        <SummaryMetric label="Listings found" value={totals.discovered} detail="stable rows" icon={<Search className="h-4 w-4" />} />
        <SummaryMetric label="Processing" value={totals.processing} detail="metadata filling" icon={<LoaderCircle className="h-4 w-4" />} />
        <SummaryMetric label="Ready for triage" value={totals.ready} detail={`${totals.filtered} screened out`} icon={<Check className="h-4 w-4" />} accent={totals.ready > 0} />
      </section>

      <FirstScanResults
        ipId={ipId}
        sources={snapshot.sources}
        results={feed.visibleResults}
        allResultCount={feed.allResults.length}
        totals={totals}
        query={feed.query}
        resultFilter={feed.resultFilter}
        sourceFilter={feed.sourceFilter}
        onQueryChange={feed.setQuery}
        onResultFilterChange={feed.setResultFilter}
        onSourceFilterChange={feed.setSourceFilter}
      />

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
