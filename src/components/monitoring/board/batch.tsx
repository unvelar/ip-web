import type { IpReviewFinding } from "../../../api";
import { BATCH_META, type BatchAction } from "./batchUtils";

export function BatchConfirmModal({
  action,
  eligible,
  skipped,
  onConfirm,
  onCancel,
}: {
  action: BatchAction;
  eligible: IpReviewFinding[];
  skipped: Record<string, number>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = BATCH_META[action];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  return (
    <div
      onClick={onCancel}
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
              {action === "send"
                ? ". Each uses the suggested route + pre-filled draft for its platform."
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
            onClick={onConfirm}
            disabled={eligible.length === 0}
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}
