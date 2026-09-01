import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type {
  BatchTakedownPreflightResponse,
  IpReviewFinding,
  TakedownFeedbackAssociationScope,
} from "../../../api";
import { DEFAULT_TAKEDOWN_FEEDBACK_SCOPES, preflightTakedownBatch } from "../../../api";
import { TakedownFeedbackScopeFields } from "../../TakedownFeedbackScopeFields";
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
  onConfirm: (
    decisionReason?: string,
    associationScopes?: TakedownFeedbackAssociationScope[],
  ) => void;
  onCancel: () => void;
}) {
  const [decisionReason, setDecisionReason] = useState("");
  const [associationScopes, setAssociationScopes] = useState<
    TakedownFeedbackAssociationScope[]
  >(() => [...DEFAULT_TAKEDOWN_FEEDBACK_SCOPES]);
  const [preflight, setPreflight] = useState<BatchTakedownPreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const meta = BATCH_META[action];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  const reasonValid = action !== "send" || (
    decisionReason.trim().length >= 3 && associationScopes.length > 0
  );
  const canConfirm = eligible.length > 0 && reasonValid;
  const platformCounts = useMemo(() => {
    const counts = new Map<string, number>();
    eligible.forEach((finding) => {
      const platform = finding.domain || "Unknown website";
      counts.set(platform, (counts.get(platform) ?? 0) + 1);
    });
    return [...counts.entries()].sort((left, right) => right[1] - left[1]);
  }, [eligible]);
  const recommendedCount = eligible.filter((finding) => {
    const key = finding.actionability?.key;
    if (action === "send") return key === "send_takedown";
    if (action === "false_positive") return key === "false_positive";
    if (action === "second_hand") return key === "allowed_resale";
    if (action === "review") return key === "needs_review";
    return false;
  }).length;

  useEffect(() => {
    if (action !== "send") return;
    const caseIds = eligible.flatMap((finding) => finding.case_id ? [finding.case_id] : []);
    if (caseIds.length === 0) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPreflight(null);
      setPreflightError("");
      setPreflightLoading(true);
    });
    void preflightTakedownBatch(caseIds)
      .then((result) => {
        if (active) setPreflight(result);
      })
      .catch((caught: unknown) => {
        if (active) {
          setPreflightError(caught instanceof Error ? caught.message : "Route check failed");
        }
      })
      .finally(() => {
        if (active) setPreflightLoading(false);
      });
    return () => {
      active = false;
    };
  }, [action, eligible]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key === "Enter" && !event.nativeEvent.isComposing && canConfirm) {
      event.preventDefault();
      onConfirm(
        action === "send" ? decisionReason.trim() : undefined,
        action === "send" ? associationScopes : undefined,
      );
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
        className="bg-white rounded-2xl border border-stone-200 max-w-md w-full max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-900">{meta.label}</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-stone-600 overflow-y-auto">
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
                  : action === "allow_product"
                    ? ". These findings will be marked OK now, the strongest eligible product image from each listing will be saved, and future visually similar findings for this IP will be ignored."
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
          {eligible.length > 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs">
              <p className="font-semibold text-stone-800">Selection preflight</p>
              <div className={`mt-1.5 grid gap-2 ${action === "allow_product" ? "grid-cols-1" : "grid-cols-2"}`}>
                {action !== "allow_product" && (
                  <div>
                    <span className="block text-[10px] uppercase tracking-wide text-stone-400">Recommendation</span>
                    <span className="font-semibold text-stone-700">
                      {recommendedCount} aligned · {eligible.length - recommendedCount} conflicting
                    </span>
                  </div>
                )}
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-stone-400">Websites</span>
                  <span className="font-semibold text-stone-700">
                    {platformCounts.map(([platform, count]) => `${platform} ${count}`).join(" · ")}
                  </span>
                </div>
              </div>
              {action === "send" && (
                <div className="mt-2 border-t border-stone-200 pt-2">
                  <span className="block text-[10px] uppercase tracking-wide text-stone-400">Delivery route</span>
                  {preflightLoading ? (
                    <span className="text-stone-500">Checking automatic and legal routes…</span>
                  ) : preflight ? (
                    <div className="mt-1 space-y-1 text-stone-700">
                      <p>
                        <strong>{preflight.automatic_case_ids.length}</strong> automatic ·{" "}
                        <strong>{preflight.legal_queue.length}</strong> legal queue ·{" "}
                        <strong>{preflight.skipped.length}</strong> skipped
                      </p>
                      {preflight.route_groups.map((route) => (
                        <p key={`${route.domain}:${route.label}`} className="text-[11px] text-stone-500">
                          {route.case_count} via {route.label} ({route.domain})
                        </p>
                      ))}
                      {Object.entries(preflight.legal_queue.reduce<Record<string, number>>(
                        (counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] ?? 0) + 1 }),
                        {},
                      )).map(([reason, count]) => (
                        <p key={reason} className="text-[11px] text-stone-500">
                          {count} legal queue: {reason.replace(/_/g, " ")}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <span className="text-amber-700">
                      Route check unavailable{preflightError ? `: ${preflightError}` : "."}
                    </span>
                  )}
                </div>
              )}
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
                Asked once for this batch. The note stays linked to every selected finding.
              </p>
              <TakedownFeedbackScopeFields
                idPrefix="batch-takedown-feedback"
                scopes={associationScopes}
                onChange={setAssociationScopes}
              />
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
            onClick={() => onConfirm(
              action === "send" ? decisionReason.trim() : undefined,
              action === "send" ? associationScopes : undefined,
            )}
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
