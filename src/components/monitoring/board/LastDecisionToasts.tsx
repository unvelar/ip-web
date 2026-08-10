import { useEffect } from "react";
import { CircleCheck, X } from "lucide-react";

export type LastDecisionUndo = {
  kind: "undismiss" | "reopen";
  ipId: string;
  resultId: string;
};

export type LastDecisionAction = {
  id: number;
  expiresAt: number;
  label: string;
  detail?: string;
  undo?: LastDecisionUndo | LastDecisionUndo[];
};

export const LAST_DECISION_TOAST_VISIBLE_MS = 5000;

function hasUndo(action: LastDecisionAction) {
  if (!action.undo) return false;
  return Array.isArray(action.undo) ? action.undo.length > 0 : true;
}

function editableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}

export function LastDecisionToasts({
  actions,
  undoingIds,
  onUndo,
  onDismiss,
}: {
  actions: LastDecisionAction[];
  undoingIds: Set<number>;
  onUndo: (action: LastDecisionAction) => void;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.shiftKey || event.altKey) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      if (editableTarget(event.target)) return;
      const action = [...actions]
        .reverse()
        .find((candidate) => hasUndo(candidate) && !undoingIds.has(candidate.id));
      if (!action) return;
      event.preventDefault();
      onUndo(action);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, onUndo, undoingIds]);

  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-h-[min(calc(100vh-2rem),32rem)] w-[min(calc(100vw-2rem),19rem)] flex-col gap-2 overflow-y-auto">
      {actions.map((action) => {
        const undoing = undoingIds.has(action.id);
        return (
          <div
            key={action.id}
            role="status"
            aria-live="polite"
            className="rounded-lg border border-stone-200 bg-white text-stone-900 shadow-[0_12px_32px_rgba(28,25,23,0.14)]"
          >
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold leading-4 text-stone-900">
                    {action.label}
                  </div>
                  {action.detail && (
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-stone-500">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-dashed border-stone-300" aria-hidden />
                      <span className="truncate">{action.detail}</span>
                    </div>
                  )}
                  {hasUndo(action) && (
                    <button
                      type="button"
                      disabled={undoing}
                      onClick={() => onUndo(action)}
                      title="Undo (Cmd+Z)"
                      aria-keyshortcuts="Meta+Z Control+Z"
                      className="mt-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {undoing ? "Undoing..." : "Undo"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(action.id)}
                  className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
