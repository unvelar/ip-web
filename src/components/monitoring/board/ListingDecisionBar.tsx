import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { BatchDecisionButton } from "../../../features/products/BatchDecisionButton";
import { BATCH_META, type BatchAction } from "./batchUtils";

export function ListingDecisionBar<Action extends BatchAction>({
  selectedCount, actions, recommendedAction, progress, onAction, onClear, disabled = false, placement = "bottom", primaryAction,
}: {
  placement?: "bottom" | "toolbar";
  primaryAction?: BatchAction | null;
  selectedCount: number;
  actions: readonly Action[];
  recommendedAction?: BatchAction | null;
  progress: { done: number; total: number } | null;
  onAction: (action: Action) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  if (selectedCount === 0 && !progress) return null;
  if (placement === "toolbar") {
    const primary = actions.find((action) => action === primaryAction) ?? actions[0];
    const remaining = actions.filter((action) => action !== primary);
    return (
      <div className="listing-decision-toolbar" role="region" aria-label="Selected listing actions">
        <span className="listing-selection-count"><Check size={13} aria-hidden />{selectedCount} selected</span>
        {progress ? (
          <span className="listing-selection-progress" role="status"><LoaderCircle size={13} className="animate-spin" aria-hidden />
            {progress.total === 0 ? "Refreshing listings…" : `Processing ${progress.done}/${progress.total}`}
          </span>
        ) : (
          <div className="listing-selection-actions">
            {primary && <BatchDecisionButton label={BATCH_META[primary].label} emphasis primary={recommendedAction === primary} disabled={disabled} onClick={() => onAction(primary)} />}
            {remaining.length > 0 && <MoreListingActions actions={remaining} disabled={disabled} onAction={onAction} />}
            {onClear && <button type="button" className="listing-selection-clear" disabled={disabled} onClick={onClear} aria-label="Clear selection" title="Clear selection"><X size={15} aria-hidden /><span>Clear</span></button>}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="sticky bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-2.5 shadow-[0_-12px_28px_-24px_rgba(28,25,23,0.8)] backdrop-blur sm:px-7" role="region" aria-label="Selected listing actions">
      <div className="flex min-w-0 items-center gap-2">
        <div className="shrink-0 border-r border-stone-200 pr-2">
          <p className="whitespace-nowrap text-[10px] font-semibold text-stone-700">{selectedCount} selected</p>
        </div>
        {progress ? (
          <span className="inline-flex items-center gap-2 text-[11px] text-stone-500" role="status">
            <LoaderCircle size={13} className="animate-spin" /> {progress.total === 0 ? "Refreshing listings…" : `Processing ${progress.done}/${progress.total}`}
          </span>
        ) : (
          <>
            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5">
              <div className="flex min-w-max items-center gap-1">
                {actions.map((action) => <BatchDecisionButton key={action} disabled={disabled} label={BATCH_META[action].label} primary={recommendedAction === action} onClick={() => onAction(action)} />)}
              </div>
            </div>
            {onClear && <button type="button" disabled={disabled} onClick={onClear} className="shrink-0 rounded px-2 py-1 text-[11px] text-stone-500 hover:bg-stone-100">Clear</button>}
          </>
        )}
      </div>
    </div>
  );
}


function MoreListingActions<Action extends BatchAction>({ actions, disabled, onAction }: {
  actions: readonly Action[];
  disabled: boolean;
  onAction: (action: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="listing-actions-more" ref={root} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button type="button" ref={trigger} disabled={disabled} aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
        More <ChevronDown size={12} aria-hidden />
      </button>
      {open && <div id={id} className="listing-actions-popover" role="group" aria-label="More listing actions">
        {actions.map((action) => <button key={action} type="button" disabled={disabled} onClick={() => { setOpen(false); onAction(action); }}>{BATCH_META[action].label}</button>)}
      </div>}
    </div>
  );
}
