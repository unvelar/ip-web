import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ImageOff, Images, Loader2, RefreshCw } from "lucide-react";
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
            className="aspect-square w-full object-contain p-2 transition-transform group-hover:scale-[1.03]"
            loading="lazy"
            onError={() => setFailed(true)}
          />
        </a>
      ) : (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 rounded-md border border-dashed border-stone-200 bg-stone-50 text-center text-xs text-stone-500">
          <ImageOff size={20} aria-hidden />
          Archived photo unavailable
        </div>
      )}
    </div>
  );
}

function captureDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

export function SharedImagesEvidence({ shared }: { shared: MonitoringSharedImages }) {
  const coverage = shared.coverage;
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-stone-500">
        Shared photos do not prove the same seller. Catalog photos can appear in unrelated shops.
      </p>
      {shared.status === "not_analyzed" ? (
        <p className="rounded-lg bg-stone-50 px-3 py-2.5 text-xs leading-5 text-stone-600">
          No current archived images are available for comparison yet. This is not a check for the absence of shared images.
        </p>
      ) : (
        <>
          {shared.status === "partial" && (
            <p className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs leading-5 text-amber-900">
              Partial coverage. Some images have not been checked for edited copies, or fall outside this search. Matches may be missing.
            </p>
          )}
          {shared.matches.length === 0 ? (
            <p className="py-1 text-sm text-stone-500">No shared-image candidates found in the images checked.</p>
          ) : (
            <div className="space-y-3">
              {shared.matches.map((match) => (
                <article key={match.result_id} className="rounded-lg border border-stone-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/monitoring/tasks/${match.result_id}`}
                        className="line-clamp-2 text-sm font-semibold leading-5 text-stone-900 hover:underline"
                      >
                        {match.listing_title || match.domain || "Related listing"}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs text-stone-500">
                        <span>{match.domain}</span>
                        {match.seller_name && <span aria-hidden>·</span>}
                        {match.seller_name && (match.seller_key ? (
                          <Link to={sellerProfilePath(match.seller_key)!} className="text-stone-700 hover:underline">
                            {match.seller_name}
                          </Link>
                        ) : <span>{match.seller_name}</span>)}
                      </div>
                    </div>
                    <a href={match.page_url} target="_blank" rel="noreferrer"
                      className="shrink-0 rounded-md p-1.5 text-stone-400 hover:bg-stone-50 hover:text-stone-700"
                      aria-label={`Open listing on ${match.domain}`} title="Open marketplace listing">
                      <ExternalLink size={15} aria-hidden />
                    </a>
                  </div>
                  {match.evidence.map((pair, index) => (
                    <div key={`${pair.source.content_hash}-${pair.target.content_hash}`} className="mt-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${pair.kind === "exact_image" ? "bg-blue-50 text-blue-700" : "bg-stone-100 text-stone-600"}`}>
                          {pair.kind === "exact_image" ? "Identical archived image" : "Possible edited copy"}
                        </span>
                        {index === 0 && <span className="text-[10px] text-stone-400">Compare the photos</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <EvidencePhoto key={pair.source.url} image={pair.source} label="This listing" />
                        <EvidencePhoto key={pair.target.url} image={pair.target} label="Related listing" />
                      </div>
                    </div>
                  ))}
                  <p className="mt-2 text-[10px] leading-4 text-stone-400">
                    Archived {shared.source_captured_at ? captureDate(shared.source_captured_at) : "earlier"}
                    {" · "}Related listing archived {captureDate(match.captured_at)}
                  </p>
                </article>
              ))}
            </div>
          )}
          {shared.has_more && <p className="text-xs text-stone-500">Showing the strongest matches. More candidates may be available.</p>}
          <details className="text-[11px] leading-5 text-stone-500">
            <summary className="cursor-pointer select-none hover:text-stone-700">What was checked?</summary>
            <p className="mt-1.5">
              Compared {coverage.source_images_checked.toLocaleString()} of {coverage.source_images.toLocaleString()} archived images from this listing with {coverage.candidate_images_checked.toLocaleString()} of {coverage.candidate_images.toLocaleString()} current archived images from other listings in your organization.
            </p>
            <p className="mt-1">
              Edited-copy analysis is available for {coverage.source_copy_fingerprints.toLocaleString()} of the source images and {coverage.candidate_copy_fingerprints.toLocaleString()} of the other images checked. The remaining images are checked only for identical archived files. Up to three paired views are shown per listing. This does not cover the whole marketplace.
            </p>
          </details>
        </>
      )}
    </div>
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

  return (
    <section aria-label="Shared images">
      <div className="mb-2.5 flex items-center gap-2">
        <Images size={15} className="text-stone-400" aria-hidden />
        <h3 className="text-sm font-bold text-stone-900">Shared images</h3>
        <span className="rounded border border-stone-200 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">Preview</span>
        {state.kind === "loaded" && state.shared.matches.length > 0 && (
          <span className="ml-auto text-xs tabular-nums text-stone-500">
            {state.shared.matches.length} related {state.shared.matches.length === 1 ? "listing" : "listings"}
          </span>
        )}
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
      {state.kind === "loaded" && <SharedImagesEvidence shared={state.shared} />}
    </section>
  );
}
