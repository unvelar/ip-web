import { useEffect, useState } from "react";
import { dismissIpFinding, getMonitoringFinding, type IpReviewFinding } from "../../../api";
import { monitoringRecommendation } from "../../../lib/monitoringRecommendation";
import type { TaskSummary } from "../../../api/taskQueue";
import { FindingActions, type FindingUpdateOptions } from "./FindingActions";

const noop = () => undefined;

/** Load the current decision evidence on intent, never submit from a queue summary. */
export function TaskRowActions({ row, ipId, active, onUpdated }: {
  row: TaskSummary;
  ipId: string;
  active: boolean;
  onUpdated: (options?: FindingUpdateOptions) => void;
}) {
  const [finding, setFinding] = useState<IpReviewFinding | null>(null);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const [retry, setRetry] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const load = active || requested;

  useEffect(() => {
    if (!load || finding) return;
    let current = true;
    setError("");
    setFinding(null);
    void getMonitoringFinding(row.result_id).then(({ finding }) => {
      if (!current) return;
      if (finding.result_id !== row.result_id || (finding.ip_id && finding.ip_id !== ipId)) {
        throw new Error("Listing evidence does not match this task. Refresh and try again.");
      }
      setFinding(finding);
    }).catch(error => {
      if (current) setError(error instanceof Error ? error.message : "Could not load listing actions.");
    });
    return () => { current = false; };
  }, [load, row.result_id, ipId, retry, finding]);

  const recommendation = monitoringRecommendation(row);
  return <div className="task-row-decision" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
    <span className="task-row-suggestion" title={recommendation.reason}>{recommendation.label}</span>
    <div className="task-row-actions" role="group" aria-label={`Quick decisions: ${row.listing_title ?? row.domain}`}>
      {error && <div className="task-row-action-error" role="alert">{error}<button type="button" onClick={() => { setFinding(null); setRequested(true); setRetry(value => value + 1); }}>Retry actions</button></div>}
      {!error && !finding && (load ? <span role="status">Loading actions…</span> : <button type="button" onClick={() => setRequested(true)}>Show actions</button>)}
      {!error && finding && <FindingActions
        inline grouped f={finding} ipId={finding.ip_id ?? ipId}
        canLicense={Boolean((finding.seller_name || finding.seller_url) && !finding.licensed_seller && finding.dismissal_reason !== "licensed")}
        isDismissed={Boolean(finding.dismissed_at)} isDismissing={dismissing}
        onDismiss={async (reason, reasonCode) => {
          if (dismissing) return;
          setDismissing(true); setError("");
          try {
            await dismissIpFinding(finding.ip_id ?? ipId, finding.result_id, { reason, reason_code: reasonCode });
            onUpdated({ completed: true });
          } catch (error) {
            setError(error instanceof Error ? error.message : "Could not dismiss this listing.");
          } finally { setDismissing(false); }
        }}
        onActionComplete={noop} onNeedsReview={noop} onTakedownSent={noop}
        onEnforced={noop} onLicensed={noop} onUpdated={onUpdated}
      />}
    </div>
  </div>;
}
