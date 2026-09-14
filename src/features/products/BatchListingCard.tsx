import { Check, Square } from "lucide-react";
import type { IpReviewFinding } from "../../api/reviews";
import { AssigneeAvatar } from "../../components/monitoring/board/AssigneeAvatar";
import { findingPlatformLabel, formatMoney } from "../../components/monitoring/board/utils";
import { REVIEW_BUCKETS, reviewBucket } from "./labDomain";

export function BatchListingCard({
  finding,
  selected,
  disabled,
  onToggle,
  onOpen,
}: {
  finding: IpReviewFinding;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const bucket = reviewBucket(finding);
  const bucketMeta = REVIEW_BUCKETS.find((candidate) => candidate.key === bucket)!;
  const price = finding.price_value_usd != null
    ? formatMoney(finding.price_value_usd, "USD")
    : finding.price || "Price unavailable";

  return (
    <article className={`group relative overflow-hidden rounded-md border bg-white transition ${
      selected ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-300"
    }`}>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="absolute inset-0 z-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-500 disabled:cursor-wait"
      >
        <span className="sr-only">Open {finding.listing_title ?? "listing"}</span>
      </button>
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {finding.image_url ? (
          <img src={finding.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full place-items-center text-[10px] text-stone-400">No image</span>
        )}
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${finding.listing_title ?? "listing"}`}
          disabled={disabled}
          onClick={onToggle}
          className={`absolute left-2 top-2 z-20 grid size-7 place-items-center rounded-md border shadow-sm transition ${
          selected ? "border-stone-900 bg-stone-900 text-white" : "border-white/80 bg-white/95 text-stone-400"
        }`}
        >
          {selected ? <Check size={15} strokeWidth={3} /> : <Square size={14} />}
        </button>
        {finding.assigned_to_account_id && (
          <span className="pointer-events-none absolute right-2 top-2 z-20">
            <AssigneeAvatar
              accountId={finding.assigned_to_account_id}
              displayName={finding.assignee_display_name}
              email={finding.assignee_email}
              pictureUrl={finding.assignee_picture_url}
              size={24}
            />
          </span>
        )}
        <span className={`absolute bottom-2 left-2 rounded border px-1.5 py-0.5 text-[8px] font-semibold ${bucketMeta.badge}`}>
          {bucketMeta.label}
        </span>
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-2 min-h-8 text-[11px] font-medium leading-4 text-stone-800">
          {finding.listing_title || "Untitled listing"}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-stone-400">
          <div className="flex min-w-0 items-center gap-1.5">
            {finding.seller_name && <span className="truncate">{finding.seller_name}</span>}
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">
              {findingPlatformLabel(finding)}
            </span>
          </div>
          <span className="shrink-0 font-mono font-medium text-stone-600">{price}</span>
        </div>
        <p className="mt-2 text-[9px] font-medium text-stone-400 group-hover:text-stone-700">
          Open details
        </p>
      </div>
    </article>
  );
}
