import { useState, type KeyboardEvent } from "react";
import type { IpReviewFinding } from "../../../api";
import { BATCH_META, type BatchAction } from "./batchUtils";

export function BatchConfirmModal({
  action,
  scopeLabel,
  eligible,
  skipped,
  onConfirm,
  onCancel,
}: {
  action: BatchAction;
  scopeLabel?: string;
  eligible: IpReviewFinding[];
  skipped: Record<string, number>;
  onConfirm: (decisionReason?: string) => void;
  onCancel: () => void;
}) {
  const [decisionReason, setDecisionReason] = useState("");
  const meta = BATCH_META[action];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  const reasonValid = action !== "send" || decisionReason.trim().length >= 3;
  const canConfirm = eligible.length > 0 && reasonValid;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing && canConfirm) {
      event.preventDefault();
      onConfirm(action === "send" ? decisionReason.trim() : undefined);
    }
  }

  return (
    <div
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={meta.label}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 max-w-md w-full overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-900">{meta.label}</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-stone-600">
          {eligible.length > 0 ? (
            <p>
              {meta.gerund}{" "}
              <span className="font-semibold text-stone-900">
                {eligible.length} finding{eligible.length === 1 ? "" : "s"}
              </span>
              {scopeLabel && (
                <> from <span className="font-semibold text-stone-900">{scopeLabel}</span></>
              )}
              {action === "send"
                ? ". Listings with an automatic route will be queued now; the rest will move to the legal queue for manual review and submission. Compatible automatic listings share one notice."
                : action === "submit"
                  ? ". Confirm that the takedown was submitted through the marketplace's manual route."
                : "."}
            </p>
          ) : (
            <p>None of the selected findings are eligible for this action.</p>
          )}
          {skipTotal > 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
              <p className="font-semibold text-stone-700">
                Skipping {skipTotal}:
              </p>
              <ul className="mt-1 space-y-0.5 text-stone-500">
                {Object.entries(skipped).map(([reason, n]) => (
                  <li key={reason}>
                    {n} {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {action === "send" && eligible.length > 0 && (
            <div className="space-y-1.5">
              <label
                htmlFor="batch-takedown-decision-reason"
                className="text-xs font-semibold text-stone-800"
              >
                Why is takedown the right decision?
              </label>
              <textarea
                id="batch-takedown-decision-reason"
                value={decisionReason}
                onChange={(event) => setDecisionReason(event.target.value)}
                rows={3}
                maxLength={2000}
                autoFocus
                placeholder="What in these images or listing descriptions made the batch actionable?"
                className="w-full resize-y rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-800 focus:border-stone-400 focus:outline-none"
              />
              <p className="text-[11px] text-stone-500">
                Asked once for this batch. The same internal note teaches each selected IP and is not sent to marketplaces.
              </p>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(action === "send" ? decisionReason.trim() : undefined)}
            disabled={!canConfirm}
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}
