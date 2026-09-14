import { LoaderCircle, RotateCcw } from "lucide-react";
import type { IpReviewFinding } from "../../api/reviews";
import { AssigneeAvatar } from "../../components/monitoring/board/AssigneeAvatar";
import { findingPlatformLabel } from "../../components/monitoring/board/utils";
import { decisionExactTime, decisionTime, recentDecisionPresentation } from "./labDomain";
import { recentDecisionCanUndo, recentDecisionTimestamp } from "./reviewDecisions";

export function RecentDecisionRow({
  finding,
  selected,
  undoing,
  onOpen,
  onUndo,
}: {
  finding: IpReviewFinding;
  selected: boolean;
  undoing: boolean;
  onOpen: () => void;
  onUndo: () => void;
}) {
  const presentation = recentDecisionPresentation(finding);
  const canUndo = recentDecisionCanUndo(finding);
  const title = finding.listing_title?.trim() || "Untitled listing";
  const decisionAuthor = finding.decision_by_display_name?.trim() ||
    finding.decision_by_email?.trim() || null;
  const decisionReason = finding.decision_reason?.trim() || null;
  const decisionBatchSize = Math.max(1, finding.decision_batch_size ?? 1);
  return (
    <div
      role="option"
      aria-selected={selected}
      className={`flex items-center gap-2 border-b border-stone-200/70 px-4 py-3 sm:px-6 lg:px-4 ${
        selected ? "bg-stone-100/90" : "hover:bg-stone-50"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
      >
        <div className="size-12 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
          {finding.image_url ? (
            <img src={finding.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="grid h-full place-items-center text-[14px] font-semibold text-stone-400">
              {title.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-medium tracking-[-0.01em] text-stone-900">
            {title}
          </h2>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-stone-400">
            <span className={`shrink-0 rounded border px-1.5 py-0.5 font-medium ${presentation.badge}`}>
              {presentation.label}
            </span>
            <span className="truncate">{findingPlatformLabel(finding)}</span>
            <span>·</span>
            <span
              className="shrink-0"
              title={decisionTime(recentDecisionTimestamp(finding))}
            >
              {decisionExactTime(recentDecisionTimestamp(finding))}
            </span>
          </div>
          {(decisionAuthor || decisionReason || decisionBatchSize > 1) && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-stone-500">
              {finding.decision_by_account_id && (
                <AssigneeAvatar
                  accountId={finding.decision_by_account_id}
                  displayName={finding.decision_by_display_name}
                  email={finding.decision_by_email}
                  pictureUrl={finding.decision_by_picture_url}
                  size={16}
                />
              )}
              <span className="shrink-0">{decisionAuthor ?? "Legacy or system action"}</span>
              {decisionBatchSize > 1 && (
                <span className="shrink-0 rounded bg-stone-100 px-1 py-0.5">
                  Batch of {decisionBatchSize}
                </span>
              )}
              {decisionReason && (
                <span className="truncate" title={decisionReason}>· {decisionReason}</span>
              )}
            </div>
          )}
        </div>
      </button>
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoing}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
        >
          {undoing ? <LoaderCircle size={11} className="animate-spin" /> : <RotateCcw size={11} />}
          {undoing ? "Undoing…" : presentation.undoLabel}
        </button>
      )}
    </div>
  );
}
