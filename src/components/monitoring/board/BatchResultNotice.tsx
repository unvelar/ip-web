import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, ImageOff, X } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { BatchResult, TakedownBatchSummary } from "./batchUtils";

const OUTCOME_LABELS = {
  queued: "Email queued",
  legal_queue: "Legal queue",
  skipped: "Skipped",
  failed: "Not processed",
};

function isTakedownSummary(result: BatchResult): result is TakedownBatchSummary {
  return typeof result !== "string" && result.kind === "takedown_batch";
}

function BatchListingThumbnail({ urls, title, taskHref }: { urls: string[]; title: string; taskHref: string }) {
  const [index, setIndex] = useState(0);
  const src = urls[index];
  const className = "grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded border border-stone-200 bg-white";
  return (
    <Link to={taskHref} className={className} aria-label={`Open details for ${title}`}>
      {src ? (
        <img src={src} alt={`${title} listing image`} className="h-full w-full object-contain"
          loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setIndex((current) => current + 1)} />
      ) : <ImageOff size={20} className="text-stone-300" aria-label="No listing image" />}
    </Link>
  );
}

export function BatchResultNotice({
  result,
  onDismiss,
  profileIpId,
  className = "",
}: {
  result: BatchResult;
  onDismiss: () => void;
  profileIpId?: string | null;
  className?: string;
}) {
  const location = useLocation();
  const summary = isTakedownSummary(result) ? result : null;
  const warning = summary?.tone === "warning" || (
    typeof result === "string" && result.startsWith("Nothing")
  );
  const legalQueueHref = `/monitoring/tasks?status=takedown_pending${
    profileIpId ? `&ip_id=${encodeURIComponent(profileIpId)}` : ""
  }`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        warning
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-stone-200 bg-stone-50 text-stone-700"
      } ${className}`}
    >
      {warning ? (
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      ) : (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {summary ? (
          <>
            <p className="text-sm font-bold">{summary.title}</p>
            {summary.details.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed">
                {summary.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
            {summary.listings.length > 0 && (
              <details open className="mt-3">
                <summary className="cursor-pointer text-xs font-bold">
                  Results for {summary.listings.length} selected listing{summary.listings.length === 1 ? "" : "s"}
                </summary>
                <ul aria-label="Listing takedown results" className="mt-2 max-h-80 space-y-2 overflow-y-auto pr-1 text-xs">
                  {summary.listings.map((listing) => {
                    const params = location.pathname.startsWith("/monitoring/tasks")
                      ? new URLSearchParams(location.search)
                      : new URLSearchParams();
                    if (listing.ipId) params.set("ip_id", listing.ipId);
                    const query = params.toString();
                    const taskHref = `/monitoring/tasks/${encodeURIComponent(listing.resultId)}${query ? `?${query}` : ""}`;
                    return (
                      <li key={listing.resultId} className="rounded-md border border-current/15 bg-white/60 p-3">
                        <div className="flex items-start gap-3">
                          <BatchListingThumbnail key={listing.imageUrls.join("|")} urls={listing.imageUrls} title={listing.title} taskHref={taskHref} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                              <div className="min-w-0 flex-1 basis-64">
                                <Link to={taskHref} className="font-semibold underline underline-offset-2 hover:text-violet-700">
                                  {listing.title}
                                </Link>
                                <p className="mt-1 opacity-75">{[listing.seller, listing.domain].filter(Boolean).join(" · ")}</p>
                                {listing.url && (
                                  <a href={listing.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block break-all underline underline-offset-2 opacity-75 hover:text-violet-700" aria-label={`Open original listing: ${listing.title}`}>
                                    {listing.url} <ExternalLink size={12} className="inline" aria-hidden />
                                  </a>
                                )}
                              </div>
                              <span className="shrink-0 rounded border border-current/15 px-2 py-0.5 font-bold">{OUTCOME_LABELS[listing.outcome]}</span>
                            </div>
                            <p className="mt-2">{listing.reason}</p>
                            {listing.needsProfile && listing.ipId && (
                              <Link to={`/ips/${encodeURIComponent(listing.ipId)}#takedown-signer`} className="mt-1 inline-flex font-bold underline underline-offset-2 hover:text-violet-700">
                                Complete the IP takedown profile
                              </Link>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}
            {(summary.showLegalQueueLink || (summary.needsProfile && profileIpId)) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {summary.showLegalQueueLink && (
                  <Link
                    to={legalQueueHref}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    View legal queue
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                )}
                {summary.needsProfile && profileIpId && summary.listings.length === 0 && (
                  <Link
                    to={`/ips/${encodeURIComponent(profileIpId)}#takedown-signer`}
                    className="inline-flex text-xs font-bold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-700"
                  >
                    Complete the IP takedown profile
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs leading-relaxed">
            {typeof result === "string" ? result : result.title}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${
          warning
            ? "text-amber-600 hover:bg-amber-100 hover:text-amber-900"
            : "text-stone-400 hover:bg-stone-200 hover:text-stone-700"
        }`}
        aria-label="Dismiss batch result"
      >
        <X size={14} />
      </button>
    </div>
  );
}
