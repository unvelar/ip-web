import { Shuffle } from "lucide-react";
import { ButtonWithShortcut } from "./ButtonWithShortcut";
import type { BatchAction } from "./batchUtils";

export function BatchOperationBar({
  selectedCount,
  selectedSummary,
  batchProgress,
  onAction,
  onResort,
  resortDisabled,
  resortTooltip,
  onClear,
  showResort = true,
  showTakedown = true,
  showMarkSubmitted = false,
  placement = "fixed",
  showShortcuts = true,
  disabled = false,
  statusMessage,
}: {
  selectedCount: number;
  selectedSummary: string[];
  batchProgress: { done: number; total: number } | null;
  onAction: (action: BatchAction) => void;
  onResort?: () => void;
  resortDisabled?: boolean;
  resortTooltip?: string;
  onClear?: () => void;
  showResort?: boolean;
  showTakedown?: boolean;
  showMarkSubmitted?: boolean;
  placement?: "fixed" | "inline";
  showShortcuts?: boolean;
  disabled?: boolean;
  statusMessage?: string | null;
}) {
  if (selectedCount <= 0) return null;

  const wrapperClass = placement === "fixed"
    ? "fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 lg:left-64 pointer-events-none"
    : "mt-4 pointer-events-none";
  const panelClass = placement === "fixed"
    ? "mx-auto max-w-7xl pointer-events-auto max-h-[45vh] overflow-y-auto rounded-lg border border-stone-200 bg-white/95 px-4 py-3 shadow-[0_16px_48px_-20px_rgba(28,25,23,0.45)] backdrop-blur"
    : "pointer-events-auto rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-2";
  const actionDisabled = disabled || Boolean(statusMessage);
  const shortcutLabel = (label: string, shortcut: string, dark = false) =>
    showShortcuts
      ? <ButtonWithShortcut label={label} shortcut={shortcut} dark={dark} />
      : <span className="whitespace-nowrap">{label}</span>;

  return (
    <div className={wrapperClass} data-batch-operation-bar={placement}>
      <div className={panelClass}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-stone-700 shrink-0">
              {selectedCount} selected
            </span>
            {selectedSummary.map((part) => (
              <span
                key={part}
                className="h-5 px-1.5 inline-flex items-center rounded-[5px] bg-white border border-stone-200 text-[10px] font-medium text-stone-500"
              >
                {part}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {statusMessage ? (
              <span className="text-xs text-stone-500">{statusMessage}</span>
            ) : batchProgress ? (
              <span className="text-xs text-stone-500">
                Working... ({batchProgress.done}/{batchProgress.total})
              </span>
            ) : (
              <>
                {showTakedown && (
                  <button
                    type="button"
                    data-batch-action="send"
                    onClick={() => onAction("send")}
                    disabled={actionDisabled}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {shortcutLabel("Takedown", "T", true)}
                  </button>
                )}
                {showMarkSubmitted && (
                  <button
                    type="button"
                    data-batch-action="submit"
                    onClick={() => onAction("submit")}
                    disabled={actionDisabled}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-600 text-white hover:bg-amber-500 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark submitted
                  </button>
                )}
                <button
                  type="button"
                  data-batch-action="enforce"
                  onClick={() => onAction("enforce")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Mark enforced
                </button>
                <button
                  type="button"
                  data-batch-action="false_positive"
                  onClick={() => onAction("false_positive")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shortcutLabel("Different product", "1")}
                </button>
                <button
                  type="button"
                  data-batch-action="do_not_pursue"
                  onClick={() => onAction("do_not_pursue")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shortcutLabel("Don't pursue", "3")}
                </button>
                <button
                  type="button"
                  data-batch-action="second_hand"
                  onClick={() => onAction("second_hand")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shortcutLabel("Second hand", "2")}
                </button>
                <button
                  type="button"
                  data-batch-action="packaging_only"
                  onClick={() => onAction("packaging_only")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shortcutLabel("Packaging only", "4")}
                </button>
                <button
                  type="button"
                  data-batch-action="review"
                  onClick={() => onAction("review")}
                  disabled={actionDisabled}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-sky-200 text-sky-700 bg-white hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {shortcutLabel("Review", "R")}
                </button>
                {showResort && (
                  <span
                    className={`relative inline-flex group ${resortDisabled ? "cursor-not-allowed" : ""}`}
                    title={resortTooltip}
                  >
                    <button
                      type="button"
                      onClick={onResort}
                      disabled={resortDisabled || actionDisabled}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50 disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-white"
                    >
                      <Shuffle size={13} aria-hidden="true" />
                      <span>Resort selected</span>
                    </button>
                    {resortDisabled && resortTooltip && (
                      <span className="pointer-events-none absolute right-0 bottom-full z-50 mb-1 w-60 rounded-md bg-stone-900 px-2 py-1.5 text-[11px] font-medium leading-snug text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                        {resortTooltip}
                      </span>
                    )}
                  </span>
                )}
                {onClear && (
                  <button
                    type="button"
                    onClick={onClear}
                    disabled={actionDisabled}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-stone-500 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
