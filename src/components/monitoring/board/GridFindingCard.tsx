import type { IpReviewFinding, MonitoringReviewOutcome } from "../../../api";
import { FindingActions } from "./FindingActions";
import { ListingCarousel } from "./ListingCarousel";
import {
  findingChips,
  findingStatusBadge,
  formatAgo,
  suggestionMeta,
  suggestionTitle,
} from "./utils";

export function GridFindingCard({
  f,
  ipId,
  showIp,
  active,
  selected,
  isDismissed,
  isDismissing,
  onSelect,
  onActivate,
  onOpen,
  onDismiss,
  onActionComplete,
  onTakedownSent,
  onUpdated,
}: {
  f: IpReviewFinding;
  ipId?: string;
  showIp?: boolean;
  active: boolean;
  selected: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onOpen: () => void;
  onDismiss: (reason: MonitoringReviewOutcome) => void;
  onActionComplete: () => void;
  onTakedownSent: () => void;
  onUpdated: () => void;
}) {
  const status = findingStatusBadge(f);
  const suggestion = suggestionMeta(f.suggested_review_outcome);
  const chips = findingChips(f, showIp);
  const detailCount = [
    f.listing_title,
    f.description_summary,
    f.description_full,
    f.match_explanation,
    f.infringement_reasoning,
    f.seller_name,
    f.price,
  ].filter(Boolean).length;

  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden flex flex-col transition-colors ${
        active ? "border-blue-500 ring-2 ring-blue-100" : "border-stone-200"
      } ${isDismissed ? "opacity-60" : ""}`}
    >
      <div className="relative p-3 pb-0">
        <ListingCarousel f={f} ipId={ipId} compact />
        <label className="absolute left-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/90 border border-stone-200 shadow-sm cursor-pointer">
          <input
            type="checkbox"
            aria-label="Select finding"
            checked={selected}
            onChange={onSelect}
            className="h-4 w-4"
          />
        </label>
        <span className="absolute right-5 top-5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-bold text-stone-800 shadow-sm">
          {f.enforcement_priority.toFixed(2)}
        </span>
        {active && (
          <span className="absolute left-16 top-5 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase text-white shadow-sm">
            Active
          </span>
        )}
      </div>
      <div className="p-3 space-y-2 flex flex-col grow">
        <div className="flex items-center gap-1 flex-wrap min-h-6">
          {suggestion && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${suggestion.cls}`}
              title={suggestionTitle(f, suggestion.shortcut)}
            >
              {suggestion.label}
            </span>
          )}
          {f.manual_candidate_outcome && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {chips.slice(0, 5).map((chip) => (
            <span
              key={chip}
              className="max-w-[9rem] truncate px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-semibold"
              title={chip}
            >
              {chip}
            </span>
          ))}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${status.cls}`}>
            {status.label}
          </span>
        </div>
        <div className="text-[11px] text-stone-500 truncate">
          {f.seller_name || "Unknown seller"} - found {formatAgo(f.found_at) ?? "-"}
        </div>
        <details className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <summary className="cursor-pointer select-none font-semibold text-stone-700">
            Details{detailCount > 0 ? ` (${detailCount})` : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {f.listing_title && (
              <p>
                <span className="font-semibold text-stone-500">Title: </span>
                <span className="text-stone-800">{f.listing_title}</span>
              </p>
            )}
            {f.description_summary && (
              <p>
                <span className="font-semibold text-stone-500">Summary: </span>
                {f.description_summary}
              </p>
            )}
            {f.description_full && f.description_full !== f.description_summary && (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-stone-500">Description: </span>
                {f.description_full}
              </p>
            )}
            {(f.match_explanation || f.infringement_reasoning || f.vlm_reasoning) && (
              <p>
                <span className="font-semibold text-stone-500">Why flagged: </span>
                {f.match_explanation || f.infringement_reasoning || f.vlm_reasoning}
              </p>
            )}
            {(f.seller_name || f.seller_url || f.price || f.location) && (
              <p className="text-stone-500">
                {[f.seller_name, f.price, f.location].filter(Boolean).join(" - ")}
                {f.seller_url && (
                  <>
                    {" - "}
                    <a href={f.seller_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                      seller
                    </a>
                  </>
                )}
              </p>
            )}
            <a href={f.page_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
              Open listing
            </a>
            {detailCount === 0 && (
              <p className="italic text-stone-400">Listing details still being analysed.</p>
            )}
          </div>
        </details>
        <div className="grow" />
        {active ? (
          <FindingActions
            f={f}
            ipId={ipId}
            canLicense={!!ipId && !!(f.seller_name || f.seller_url)}
            isDismissed={isDismissed}
            isDismissing={isDismissing}
            onDismiss={onDismiss}
            onActionComplete={onActionComplete}
            onTakedownSent={onTakedownSent}
            onUpdated={onUpdated}
            compact
          />
        ) : (
          <button
            type="button"
            onClick={onActivate}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[12px] font-semibold text-stone-700 hover:bg-stone-50"
          >
            Review this card
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          {active ? (
            <span className="text-[11px] font-semibold text-blue-700">
              Shortcuts apply to this card
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-stone-400">
              Activate to use shortcuts
            </span>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] font-semibold text-stone-400 hover:text-blue-700"
          >
            Open full review
          </button>
        </div>
      </div>
    </div>
  );
}
