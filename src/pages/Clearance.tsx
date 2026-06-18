import { Link } from "react-router-dom";
import { type IpReview } from "../api";

const DECISION_LABEL: Record<string, { label: string; cls: string }> = {
  cleared: { label: "Cleared", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  not_cleared: { label: "Not cleared", cls: "bg-red-50 text-red-700 border-red-100" },
};

/**
 * Compact single-line task row, Gmail/Linear-inspired. Borders come from
 * the parent's `divide-y` so rows pack tightly without doubling lines.
 */
export function TaskRow({ review, muted = false }: { review: IpReview; muted?: boolean }) {
  const primary = primarySignal(review);
  const when = relativeDate(review.created_at);
  return (
    <Link
      to={`/ip-reviews/${review.id}`}
      className={`group flex items-center gap-3 px-2 py-1.5 hover:bg-stone-50 transition-colors ${
        muted ? "opacity-70" : ""
      }`}
    >
      {review.asset_image_url ? (
        <img
          src={review.asset_image_url}
          alt=""
          className="w-8 h-8 rounded object-cover border border-stone-200 shrink-0"
        />
      ) : (
        <div className="w-8 h-8 rounded bg-stone-100 shrink-0" />
      )}
      <span
        className="text-[10px] font-semibold uppercase tracking-wider text-stone-400 shrink-0 w-20"
        title={review.mode}
      >
        {review.mode === "monitoring" ? "Monitor" : "Clearance"}
      </span>
      <span className="flex-1 min-w-0 text-sm text-stone-900 font-medium truncate">
        {review.title}
      </span>
      <span
        className={`hidden sm:inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase whitespace-nowrap shrink-0 ${primary.cls}`}
      >
        {primary.label}
      </span>
      <span className="text-[11px] text-stone-400 tabular-nums shrink-0 w-14 text-right">
        {when}
      </span>
    </Link>
  );
}

function primarySignal(r: IpReview): { label: string; cls: string } {
  if (r.status === "processing") {
    return { label: "Processing", cls: "bg-blue-50 text-blue-700 border-blue-100" };
  }
  if (r.status === "failed") {
    return { label: "Failed", cls: "bg-red-50 text-red-700 border-red-100" };
  }
  if (r.mode === "monitoring") {
    const n = r.open_findings_count ?? 0;
    if (n === 0) return { label: "0 findings", cls: "bg-stone-50 text-stone-500 border-stone-100" };
    return { label: `${n} finding${n === 1 ? "" : "s"}`, cls: "bg-red-50 text-red-700 border-red-100" };
  }
  // clearance
  if (r.decision) {
    return DECISION_LABEL[r.decision] ?? { label: r.decision, cls: "bg-stone-50 text-stone-600 border-stone-100" };
  }
  return { label: "Awaiting review", cls: "bg-stone-50 text-stone-600 border-stone-100" };
}

/** Linear-style short relative time: "5m", "3h", "2d", "Mar 14". */
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
