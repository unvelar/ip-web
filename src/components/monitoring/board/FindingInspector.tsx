import { X } from "lucide-react";
import type { IpReviewFinding, MonitoringReviewOutcome } from "../../../api";
import { FindingComparison } from "./FindingComparison";
import type { FindingUpdateOptions } from "./FindingActions";
import { RelatedItemsPanel } from "./RelatedItemsPanel";
import { compactListingTitle } from "./utils";

export function FindingInspector({
  f,
  ipId,
  showIp,
  isDismissed,
  isDismissing,
  onClose,
  onDismiss,
  onActionComplete,
  onNeedsReview,
  onTakedownSent,
  onEnforced,
  onLicensed,
  onUpdated,
  onAddRelatedToBatch,
  showRelatedItems = true,
}: {
  f: IpReviewFinding;
  ipId?: string;
  showIp?: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onClose: () => void;
  onDismiss: (reason: MonitoringReviewOutcome) => void;
  onActionComplete: () => void;
  onNeedsReview: () => void;
  onTakedownSent: () => void;
  onEnforced: () => void;
  onLicensed: (dismissedCount: number) => void;
  onUpdated: (opts?: FindingUpdateOptions) => void;
  onAddRelatedToBatch: (findings: IpReviewFinding[]) => void;
  showRelatedItems?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex justify-end">
      <aside
        data-finding-inspector
        role="dialog"
        aria-modal="false"
        aria-label="Finding details"
        className="pointer-events-auto h-full w-full bg-white shadow-2xl shadow-stone-950/20 border-l border-stone-200 sm:w-[min(92vw,48rem)] xl:w-[min(58vw,60rem)] flex flex-col"
      >
        <div className="h-12 shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur flex items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-stone-900 truncate">
              {compactListingTitle(f)}
            </div>
            <div className="text-[11px] text-stone-400 truncate">{f.domain}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-md inline-flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Close finding details"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <FindingComparison
            key={f.result_id}
            f={f}
            ipId={ipId}
            showIp={showIp}
            isDismissed={isDismissed}
            isDismissing={isDismissing}
            onDismiss={onDismiss}
            onActionComplete={onActionComplete}
            onNeedsReview={onNeedsReview}
            onTakedownSent={onTakedownSent}
            onEnforced={onEnforced}
            onLicensed={onLicensed}
            onUpdated={onUpdated}
          />
          {showRelatedItems && (
            <RelatedItemsPanel
              finding={f}
              onAddToBatch={onAddRelatedToBatch}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
