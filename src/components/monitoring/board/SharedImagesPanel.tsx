import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ExternalLink, ImageOff, Images, Loader2, RefreshCw } from "lucide-react";
import {
  getMonitoringFindingSharedImages,
  type MonitoringSharedImages,
  type SharedListingImage,
} from "../../../api";
import { sellerProfilePath } from "../../../lib/sellers";

function EvidencePhoto({ image, label }: { image: SharedListingImage; label: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-medium text-stone-500">{label}</div>
      {image.url && !failed ? (
        <a
          href={image.url}
          target="_blank"
          rel="noreferrer"
          className="group block overflow-hidden rounded-md border border-stone-200 bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label={`Enlarge ${label.toLowerCase()} photo`}
        >
          <img
            src={image.url}
            alt={`${label} archived listing photo`}
            className="h-40 w-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </a>
      ) : (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed border-stone-200 bg-stone-50 text-center text-xs text-stone-500">
          <ImageOff size={20} aria-hidden />
          Archived photo unavailable
        </div>
      )}
    </div>
  );
}

function MatchThumbnail({ image }: { image: SharedListingImage | undefined }) {
  const [failed, setFailed] = useState(false);
  return image?.url && !failed ? (
    <img
      src={image.url}
      alt=""
      className="h-12 w-12 shrink-0 rounded-md border border-stone-200 bg-stone-50 object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-dashed border-stone-200 bg-stone-50 text-stone-400">
      <ImageOff size={16} aria-hidden />
    </span>
  );
}

function captureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function SharedImagesEvidence({ shared }: { shared: MonitoringSharedImages }) {
  const coverage = shared.coverage;
  const coverageDetails = (
    <details className={`text-xs leading-5 ${shared.status === "partial"
      ? "rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-amber-900"
      : "text-stone-500"}`}>
      <summary className="cursor-pointer select-none font-medium hover:underline">
        {shared.status === "partial" ? "Limited search · More matches may exist" : "Search scope and coverage"}
      </summary>
      <div className="mt-2 space-y-1.5">
        <p>
          Photos compared: {coverage.source_images_checked.toLocaleString()}/{coverage.source_images.toLocaleString()} from this listing · {coverage.candidate_images_checked.toLocaleString()}/{coverage.candidate_images.toLocaleString()} from other listings.
        </p>
        <p>
          Edited-copy checks: {coverage.source_copy_fingerprints.toLocaleString()}/{coverage.source_images_checked.toLocaleString()} here · {coverage.candidate_copy_fingerprints.toLocaleString()}/{coverage.candidate_images_checked.toLocaleString()} elsewhere. Other checked photos could match only if identical.
        </p>
        <p>Only archived listings in your organization were searched, not the whole marketplace.</p>
      </div>
    </details>
  );
  return (
    <div className="space-y-3">
      {shared.status === "not_analyzed" ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-5 text-stone-600">
          No archived photos are available to compare yet. This does not mean there are no photo matches.
        </p>
      ) : (
        <>
          {shared.matches.length > 0 && (
            <p className="text-xs leading-5 text-stone-600">
              Compare the products and sellers before acting; catalog photos alone do not link accounts.
            </p>
          )}
          {shared.matches.length === 0 ? (
            <p className="py-1 text-sm text-stone-500">No photo matches found in the images checked.</p>
          ) : (
            <div className="space-y-2">
              {shared.matches.map((match) => {
                const hasExactImage = match.evidence.some((pair) => pair.kind === "exact_image");
                return (
                  <details key={match.result_id} className="group/match min-w-0 rounded-lg border border-stone-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                      <MatchThumbnail image={(match.evidence.find((pair) => pair.kind === "exact_image") ?? match.evidence[0])?.target} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-stone-900">
                          {match.listing_title || match.domain || "Other listing"}
                        </span>
                        <span className="block truncate text-xs text-stone-500">
                          {[match.seller_name, match.domain].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-medium text-stone-500">
                        {hasExactImage ? "Exact photo" : "Possible edit"}
                      </span>
                      <ChevronDown size={14} className="shrink-0 text-stone-400 transition-transform group-open/match:rotate-180" aria-hidden />
                    </summary>
                    <div className="border-t border-stone-100 px-3 pb-3 pt-2.5">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium">
                        <Link to={`/monitoring/tasks/${match.result_id}`} className="text-stone-700 hover:underline">
                          Open listing details
                        </Link>
                        {match.seller_key && (
                          <Link to={sellerProfilePath(match.seller_key)!} className="text-stone-700 hover:underline">
                            Seller history
                          </Link>
                        )}
                        <a href={match.page_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-stone-700 hover:underline"
                          aria-label={`Open listing on ${match.domain}`}>
                          Marketplace <ExternalLink size={12} aria-hidden />
                        </a>
                      </div>
                      {match.evidence.map((pair) => (
                        <div key={`${pair.source.content_hash}-${pair.target.content_hash}`} className="mt-3">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${pair.kind === "exact_image" ? "bg-blue-50 text-blue-700" : "bg-stone-100 text-stone-600"}`}>
                            {pair.kind === "exact_image" ? "Identical archived image" : "Possible edited copy"}
                          </span>
                          <div className="mt-2 grid grid-cols-2 gap-2.5">
                            <EvidencePhoto key={pair.source.url} image={pair.source} label="This listing" />
                            <EvidencePhoto key={pair.target.url} image={pair.target} label="Other listing" />
                          </div>
                        </div>
                      ))}
                      <p className="mt-2 text-[10px] leading-4 text-stone-400">
                        Archived {shared.source_captured_at ? captureDate(shared.source_captured_at) : "earlier"}
                        {" · "}Other listing archived {captureDate(match.captured_at)}
                      </p>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
          {shared.has_more && <p className="text-xs text-stone-500">Showing the strongest matches only.</p>}
          {coverageDetails}
        </>
      )}
    </div>
  );
}

export function SharedImagesResult({ shared }: { shared: MonitoringSharedImages }) {
  const count = shared.matches.length;
  return (
    <section aria-label="Photo matches">
      {count > 0 ? (
        <details className="group/photo">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <Images size={15} className="shrink-0 text-stone-400" aria-hidden />
              <span className="text-sm font-bold text-stone-900">Photo matches</span>
              <span className="ml-auto truncate text-xs tabular-nums text-stone-500">
                {count} {shared.has_more ? "shown" : count === 1 ? "other listing" : "other listings"}
                {shared.status === "partial" && " · Limited search"}
              </span>
              <ChevronDown size={14} className="shrink-0 text-stone-400 transition-transform group-open/photo:rotate-180" aria-hidden />
            </span>
            <span className="mt-1 block text-xs text-stone-600">Check for repeat listings and seller patterns</span>
          </summary>
          <div className="mt-3"><SharedImagesEvidence shared={shared} /></div>
        </details>
      ) : (
        <>
          <div className="mb-2.5 flex items-center gap-2">
            <Images size={15} className="text-stone-400" aria-hidden />
            <h3 className="text-sm font-bold text-stone-900">Photo matches</h3>
          </div>
          <SharedImagesEvidence shared={shared} />
        </>
      )}
    </section>
  );
}

export function SharedImagesPanel({ resultId }: { resultId: string }) {
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "error" } |
    { kind: "loaded"; shared: MonitoringSharedImages }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getMonitoringFindingSharedImages(resultId, controller.signal)
      .then(({ shared_images }) => {
        if (!controller.signal.aborted) setState({ kind: "loaded", shared: shared_images });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      });
    return () => controller.abort();
  }, [resultId, attempt]);

  if (state.kind === "loaded") return <SharedImagesResult shared={state.shared} />;

  return (
    <section aria-label="Photo matches">
      <div className="mb-2.5 flex items-center gap-2">
        <Images size={15} className="text-stone-400" aria-hidden />
        <h3 className="text-sm font-bold text-stone-900">Photo matches</h3>
      </div>
      {state.kind === "loading" && (
        <p role="status" className="flex items-center gap-2 py-2 text-xs text-stone-500">
          <Loader2 size={13} className="animate-spin" aria-hidden /> Checking archived images...
        </p>
      )}
      {state.kind === "error" && (
        <div className="rounded-lg bg-stone-50 px-3 py-2.5">
          <p role="status" className="text-xs leading-5 text-stone-600">Shared-image evidence is unavailable. No comparison result is shown.</p>
          <button type="button" onClick={() => { setState({ kind: "loading" }); setAttempt((n) => n + 1); }}
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-stone-900">
            <RefreshCw size={12} aria-hidden /> Try again
          </button>
        </div>
      )}
    </section>
  );
}
