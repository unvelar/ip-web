import { Check, LoaderCircle, Pause } from "lucide-react";
import { useRef } from "react";
import type { TaskSearchResult } from "../api/taskQueue";
import { useOutsideDismiss } from "../hooks/useOutsideDismiss";

export default function TaskSearchStatus({
  search, starting, queueTotal, queueLabel, stopping, onStop, onReturn,
}: {
  search: TaskSearchResult | null;
  starting: boolean;
  queueTotal?: number;
  queueLabel: string;
  stopping: boolean;
  onStop: () => void;
  onReturn: () => void;
}) {
  const scope = useRef<HTMLDetailsElement>(null);
  useOutsideDismiss(scope, () => { if (scope.current) scope.current.open = false; });
  const active = starting || search?.state === "pending" || search?.state === "running";
  const complete = !starting && search?.state === "completed";
  const partial = !starting && search && ["cancelled", "limited", "failed"].includes(search.state);
  const label = starting || search?.state === "pending" ? "Starting…"
    : search?.state === "running" ? "Searching"
    : search?.state === "completed" ? "Complete"
    : search?.state === "cancelled" ? "Stopped"
    : search?.state === "limited" ? "Work limit reached" : "Search failed";
  const scanned = Number(search?.scanned ?? 0).toLocaleString();
  const failedBeforeScan = search?.state === "failed" && Number(search.scanned) === 0;
  return (
    <>
      <div className="task-search-status" role="status" aria-live="polite">
        <span className="task-search-matches">
          {search?.requires_complete && !complete ? search.completion_reason==="priority_order"?(partial?"Priority order unavailable":"Ordering matching items…"):partial ? "Seller counts unavailable" : "Counting seller matches…" : starting || failedBeforeScan ? "Results" : `${search?.matched.toLocaleString() ?? 0} ${search?.matched === 1 ? "match" : "matches"}`}
          {!starting && !complete && !failedBeforeScan && !search?.requires_complete && <> <span>{partial ? "partial" : "so far"}</span></>}
        </span>
        <div className="task-search-progress">
          <span className="task-search-phase">
            {active ? <LoaderCircle size={13} aria-hidden="true" />
              : complete ? <Check size={13} aria-hidden="true" />
                : <Pause size={13} aria-hidden="true" />}
            {label}
          </span>
          {!starting && search && (
            <details ref={scope} className="task-search-progress-scope" onKeyDown={(event) => {
              if (event.key === "Escape" && scope.current) {
                scope.current.open = false;
                scope.current.querySelector("summary")?.focus();
              }
            }}>
              <summary>{scanned} checked</summary>
              <div className="task-search-scope-detail">
                <strong>Search scope</strong>
                {queueTotal !== undefined && <p>{queueTotal.toLocaleString()} tasks in {queueLabel}</p>}
                <p>Queue size before date and search filters. {scanned} candidates checked within your search.</p>
                {partial && <p>Results are incomplete.</p>}
              </div>
            </details>
          )}
          {active && !starting && search?.id && (
            <button type="button" disabled={stopping} onClick={onStop}>
              {stopping ? "Stopping…" : "Stop"}
            </button>
          )}
          {!starting && <button type="button" onClick={onReturn}>Return to queue</button>}
        </div>
      </div>
      {active && <div className="task-search-activity" role="progressbar" aria-label={label} />}
      {search?.error && !starting && <p className="task-search-failure" role="alert">{search.error}</p>}
    </>
  );
}
