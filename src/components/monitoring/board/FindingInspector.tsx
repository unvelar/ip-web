import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type {
  IpReviewFinding,
  MonitoringDismissReasonCode,
  MonitoringReviewOutcome,
  ProductGroupCorrectionReason,
} from "../../../api";
import CaseComments from "../../CaseComments";
import { FindingComparison, FindingTechnicalDetails } from "./FindingComparison";
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
  productGroupId,
  onCorrectProductGroup,
  showRelatedItems = true,
  taskHref,
  navigation,
}: {
  f: IpReviewFinding;
  ipId?: string;
  showIp?: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onClose: () => void;
  onDismiss: (reason: MonitoringReviewOutcome, reasonCode?: MonitoringDismissReasonCode) => void;
  onActionComplete: () => void;
  onNeedsReview: () => void;
  onTakedownSent: () => void;
  onEnforced: () => void;
  onLicensed: (dismissedCount: number) => void;
  onUpdated: (opts?: FindingUpdateOptions) => void;
  onAddRelatedToBatch: (findings: IpReviewFinding[]) => void;
  productGroupId?: string;
  onCorrectProductGroup?: (reason: ProductGroupCorrectionReason) => Promise<void>;
  showRelatedItems?: boolean;
  /** Optional escape hatch when the inspector is opened outside the Tasks page. */
  taskHref?: string;
  navigation?: {
    position: number;
    total: number;
    onPrevious?: () => void;
    onNext?: () => void;
  };
}) {
  const inspectorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    inspectorRef.current?.focus({ preventScroll: true });
  }, [f.result_id]);

  useEffect(() => {
    function hasNativeKeyboardBehavior(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(target.closest(
        "input, textarea, select, button, a, summary, label, [role='button'], [role='link'], [contenteditable]",
      ));
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || event.isComposing) return;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        hasNativeKeyboardBehavior(event.target)
      ) return;
      if (document.querySelector('[aria-modal="true"]')) return;

      if (event.key === "ArrowLeft" && navigation?.onPrevious) {
        event.preventDefault();
        navigation.onPrevious();
        return;
      }
      if (event.key === "ArrowRight" && navigation?.onNext) {
        event.preventDefault();
        navigation.onNext();
        return;
      }
      if (event.key !== "Enter") return;

      const recommendedButton = inspectorRef.current?.querySelector<HTMLButtonElement>(
        "button[data-recommended-action]",
      );
      if (!recommendedButton || recommendedButton.disabled) return;

      event.preventDefault();
      recommendedButton.click();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigation]);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none flex justify-end">
      <aside
        ref={inspectorRef}
        data-finding-inspector
        role="dialog"
        aria-modal="false"
        aria-label="Finding details"
        tabIndex={-1}
        className="pointer-events-auto h-full w-full bg-white shadow-2xl shadow-stone-950/20 border-l border-stone-200 focus:outline-none sm:w-[min(92vw,48rem)] xl:w-[min(58vw,60rem)] flex flex-col"
      >
        <div className="h-12 shrink-0 border-b border-stone-200 bg-white/95 backdrop-blur flex items-center gap-3 px-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-stone-900 truncate">
              {compactListingTitle(f)}
            </div>
            <div className="text-[11px] text-stone-400 truncate">{f.domain}</div>
          </div>
          {navigation && navigation.total > 1 && (
            <div
              className="flex shrink-0 items-center rounded-md border border-stone-200 bg-white"
              aria-label="Listing navigation"
            >
              <button
                type="button"
                onClick={navigation.onPrevious}
                disabled={!navigation.onPrevious}
                className="inline-flex h-8 w-8 items-center justify-center rounded-l-md text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-white"
                aria-label="Previous listing"
                title="Previous listing (Left arrow)"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-12 border-x border-stone-200 px-2 text-center text-[11px] tabular-nums text-stone-500">
                {navigation.position} / {navigation.total}
              </span>
              <button
                type="button"
                onClick={navigation.onNext}
                disabled={!navigation.onNext}
                className="inline-flex h-8 w-8 items-center justify-center rounded-r-md text-stone-500 hover:bg-stone-50 hover:text-stone-900 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-white"
                aria-label="Next listing"
                title="Next listing (Right arrow)"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          {taskHref && (
            <Link
              to={taskHref}
              className="shrink-0 rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 hover:text-stone-900"
            >
              Open in Tasks
            </Link>
          )}
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
            productGroupId={productGroupId}
            onCorrectProductGroup={onCorrectProductGroup}
          />
          {showRelatedItems && (
            <div className="mt-4 border-t border-stone-200 pt-4">
              <RelatedItemsPanel
                finding={f}
                onAddToBatch={onAddRelatedToBatch}
              />
            </div>
          )}
          <div className="mt-4 space-y-3 border-t border-stone-200 pt-3">
            <FindingTechnicalDetails f={f} />
            {f.case_id && <CaseComments caseId={f.case_id} compact />}
          </div>
        </div>
      </aside>
    </div>
  );
}
