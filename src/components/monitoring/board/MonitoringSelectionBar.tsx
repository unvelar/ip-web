import { BATCH_META, type BatchAction } from "./batchUtils";
import { FindingActionPopover } from "./FindingActionPopover";

/** Selection controls stay with the queue; actions still open the board's confirmations. */
export function MonitoringSelectionBar({
  selectedCount, actions, progress, onAction, onReview, onClear,
  assignees, onAssign, onResort, loading = false, disabled = false,
}: {
  selectedCount: number;
  loading?: boolean;
  disabled?: boolean;
  actions: readonly BatchAction[];
  progress: { done: number; total: number } | null;
  onAction: (action: BatchAction) => void;
  onReview: () => void;
  onClear: () => void;
  assignees: Array<{ id: string; label: string }>;
  onAssign: (assigneeId: string | null) => void;
  onResort?: () => void;
}) {
  if (selectedCount === 0) return null;
  const busy = Boolean(progress) || loading || disabled;
  const primary = actions.includes("do_not_pursue") ? "do_not_pursue" : actions[0];
  const remaining = actions.filter((action) => action !== primary);

  return (
    <div className="monitoring-selection-bar" role="region" aria-label="Selected listings">
      <span aria-live="polite">{selectedCount} {selectedCount === 1 ? "listing" : "listings"} selected</span>
      {loading && <span role="status">Loading selected listings…</span>}
      {progress && <span className="monitoring-selection-progress" role="status">
        {progress.total === 0 ? "Refreshing listings…" : `Processing ${progress.done}/${progress.total}`}
      </span>}
      <div className="monitoring-selection-actions">
        <button type="button" disabled={Boolean(progress)} onClick={onClear}>Deselect</button>
        <button type="button" disabled={busy} onClick={onReview}>Review individually</button>
        {primary && <button type="button" className="monitoring-selection-primary" disabled={busy}
          onClick={() => onAction(primary)}>{BATCH_META[primary].label}</button>}
        <FindingActionPopover label="More decisions" description="Apply a decision to the selected listings."
          disabled={busy}>
          {remaining.map((action) => <button key={action} type="button" disabled={busy}
            onClick={() => onAction(action)}>{action === "review" ? "Move to in review" : BATCH_META[action].label}</button>)}
          <div className="monitoring-selection-tools">
            <label>Assign selected listings
              <select aria-label="Assign selected listings" defaultValue="" disabled={busy}
                onKeyDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) return;
                  onAssign(value === "unassigned" ? null : value);
                  event.target.value = "";
                }}>
                <option value="">Assign…</option>
                <option value="unassigned">Unassign</option>
                {assignees.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
              </select>
            </label>
            {onResort && <button type="button" disabled={busy} onClick={onResort}>Resort selected</button>}
          </div>
        </FindingActionPopover>
      </div>
    </div>
  );
}
