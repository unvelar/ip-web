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
}: {
  selectedCount: number;
  selectedSummary: string[];
  batchProgress: { done: number; total: number } | null;
  onAction: (action: BatchAction) => void;
  onResort?: () => void;
  resortDisabled?: boolean;
  resortTooltip?: string;
  onClear: () => void;
  showResort?: boolean;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-4 sm:px-6 lg:left-64 pointer-events-none">
      <div className="mx-auto max-w-7xl pointer-events-auto max-h-[45vh] overflow-y-auto rounded-lg border border-stone-200 bg-white/95 px-4 py-3 shadow-[0_16px_48px_-20px_rgba(28,25,23,0.45)] backdrop-blur">
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
            {batchProgress ? (
              <span className="text-xs text-stone-500">
                Working... ({batchProgress.done}/{batchProgress.total})
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onAction("send")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-500"
                >
                  <ButtonWithShortcut label="Send takedowns" shortcut="T" dark />
                </button>
                <button
                  type="button"
                  onClick={() => onAction("enforce")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500 whitespace-nowrap"
                >
                  Mark enforced
                </button>
                <button
                  type="button"
                  onClick={() => onAction("false_positive")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                >
                  <ButtonWithShortcut label="False positive" shortcut="1" />
                </button>
                <button
                  type="button"
                  onClick={() => onAction("do_not_pursue")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                >
                  <ButtonWithShortcut label="Don't pursue" shortcut="3" />
                </button>
                <button
                  type="button"
                  onClick={() => onAction("second_hand")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                >
                  <ButtonWithShortcut label="Second hand" shortcut="2" />
                </button>
                <button
                  type="button"
                  onClick={() => onAction("review")}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-sky-200 text-sky-700 bg-white hover:bg-sky-50"
                >
                  <ButtonWithShortcut label="Review" shortcut="R" />
                </button>
                {showResort && (
                  <span
                    className={`relative inline-flex group ${resortDisabled ? "cursor-not-allowed" : ""}`}
                    title={resortTooltip}
                  >
                    <button
                      type="button"
                      onClick={onResort}
                      disabled={resortDisabled}
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
                <button
                  type="button"
                  onClick={onClear}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-stone-500 hover:text-stone-700"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
