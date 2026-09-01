import { AlertTriangle, ArrowRight, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { IpOnboardingStatus } from "../../api";
import type { FirstScanSourceProgress } from "../../lib/firstScanProgress";
import { readableDomain } from "./presentation";

function sourceLabel(source: FirstScanSourceProgress) {
  return source.source.display_name?.trim() || readableDomain(source.source.domain);
}

export function FirstScanSetupNotice({
  onboarding,
  sources,
  ipId,
}: {
  onboarding: IpOnboardingStatus;
  sources: FirstScanSourceProgress[];
  ipId: string;
}) {
  const sourceStatuses = new Map(
    onboarding.progress.monitoring_sources.source_statuses.map((source) => [
      source.source_id,
      source.status,
    ]),
  );
  const incompleteSources = sources.filter(
    (source) => sourceStatuses.get(source.source.id) !== "ready",
  );
  if (incompleteSources.length === 0) return null;

  const retrySources = incompleteSources.filter(
    (source) => sourceStatuses.get(source.source.id) === "retry_needed",
  );
  const needsRetry = retrySources.length > 0;
  const namedSources = needsRetry ? retrySources : incompleteSources;
  const singleSource = namedSources.length === 1 ? namedSources[0] : null;
  const setupDetail = onboarding.checks.find(
    (check) => check.key === "monitoring_sources",
  )?.detail;
  const title = needsRetry
    ? singleSource
      ? `${sourceLabel(singleSource)} needs a system retry`
      : `${namedSources.length} websites need a system retry`
    : singleSource
      ? `${sourceLabel(singleSource)} is still being prepared`
      : `${namedSources.length} websites are still being prepared`;
  const targetHash = singleSource
    ? `monitoring-source-${singleSource.source.id}`
    : "monitoring";
  const actionLabel = singleSource
    ? `View ${sourceLabel(singleSource)} setup`
    : "View monitoring setup";

  return (
    <section
      className={`mt-4 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center ${
        needsRetry
          ? "border-rose-200 bg-rose-50"
          : "border-amber-200 bg-amber-50"
      }`}
      aria-label={needsRetry ? "Monitoring setup needs attention" : "Monitoring source setup in progress"}
      aria-live="polite"
    >
      {needsRetry
        ? <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700" aria-hidden="true" />
        : <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-amber-700" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <h2 className={`text-sm font-bold ${needsRetry ? "text-rose-950" : "text-amber-950"}`}>{title}</h2>
        {setupDetail && (
          <p className={`mt-0.5 text-xs leading-5 ${needsRetry ? "text-rose-800" : "text-amber-800"}`}>
            {setupDetail}
          </p>
        )}
        <p className={`mt-0.5 text-[11px] leading-4 ${needsRetry ? "text-rose-700" : "text-amber-700"}`}>
          {onboarding.message}
        </p>
      </div>
      <Link
        to={`/ips/${encodeURIComponent(ipId)}#${targetHash}`}
        className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border bg-white px-3 py-2 text-xs font-semibold sm:self-center ${
          needsRetry
            ? "border-rose-200 text-rose-800 hover:border-rose-300 hover:bg-rose-100"
            : "border-amber-200 text-amber-900 hover:border-amber-300 hover:bg-amber-100"
        }`}
      >
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </section>
  );
}
