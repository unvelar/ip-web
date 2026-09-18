import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, LoaderCircle, X } from "lucide-react";
import { BatchDecisionButton } from "../products/BatchDecisionButton";
import { BATCH_META, type BatchAction } from "../../components/monitoring/board/batchUtils";

export function SellerListingActions({
  selectedCount, actions, recommendedAction, progress, onAction, onClear, disabled = false, primaryAction,
}: {
  primaryAction?: BatchAction | null;
  selectedCount: number;
  actions: readonly BatchAction[];
  recommendedAction?: BatchAction | null;
  progress: { done: number; total: number } | null;
  onAction: (action: BatchAction) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  if (selectedCount === 0 && !progress) return null;
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


function MoreListingActions({ actions, disabled, onAction }: {
  actions: readonly BatchAction[];
  disabled: boolean;
  onAction: (action: BatchAction) => void;
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
