import { Link } from "react-router-dom";
import {
  AlertCircle,
  ChevronRight,
  Radar,
} from "lucide-react";
import {
  FirstScanResults,
  FirstScanSkeleton,
  PageMessage,
} from "../features/firstScan/FirstScanResults";
import { TenantMonitoringSetupNotice } from "../components/monitoring/TenantMonitoringSetupNotice";
import { useFirstScanFeed } from "../features/firstScan/useFirstScanFeed";

export default function MonitoringFirstScan() {
  const feed = useFirstScanFeed(null);

  if (feed.loading && !feed.snapshot) return <FirstScanSkeleton />;
  if (!feed.ipId) {
    return <PageMessage icon={<Radar className="h-5 w-5" />} title="Choose a brand or product to watch its first scan" detail="Select a brand or product from the top bar." />;
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
    <div className="mx-auto max-w-[1500px] px-4 py-3 sm:px-6">
      <h1 className="sr-only">Monitoring listings for {snapshot.trademark.name}</h1>

      {feed.error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" /> Some live progress is temporarily unavailable. {feed.error}
        </div>
      )}

      {snapshot.onboarding?.customer_action_required && (
        <div className="mb-3">
          <TenantMonitoringSetupNotice ipId={ipId} status={snapshot.onboarding} />
        </div>
      )}

      <FirstScanResults
        ipId={ipId}
        sources={snapshot.sources}
        recovery={snapshot.onboarding?.recovery?.sources}
        results={feed.visibleResults}
        health={snapshot.page?.source_health}
        allResultCount={totals.discovered}
        totals={totals}
        resultFilterTotals={feed.resultFilterTotals}
        filteredTotal={feed.filteredTotal}
        hasMore={feed.hasMore}
        loadingMore={feed.loadingMore}
        refreshing={feed.refreshing}
        onLoadMore={() => void feed.loadMore()}
        query={feed.query}
        resultFilter={feed.resultFilter}
        sourceFilter={feed.sourceFilter}
        onQueryChange={feed.setQuery}
        onResultFilterChange={feed.setResultFilter}
        onSourceFilterChange={feed.setSourceFilter}
      />

      <footer className="mt-4 flex flex-col gap-2 border-t border-stone-200 pt-3 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between">
        <span>{totals.websites === 0 ? "Select websites in monitoring setup to start monitoring." : snapshot.onboarding?.recovery?.enabled === false ? "Monitoring is off. Existing results remain available." : "You can leave this page. Monitoring continues in the background."}</span>
        <Link to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}&status=all`} className="inline-flex items-center gap-1 font-semibold text-stone-700 hover:text-stone-950">
          View all monitoring tasks <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </footer>
    </div>
  );
}
