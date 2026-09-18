import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, PanelRight, X } from "lucide-react";
import type {
  IpReviewFinding,
  MonitoringDismissReasonCode,
  MonitoringReviewOutcome,
  ProductGroupCorrectionReason,
} from "../../../api";
import CaseComments from "../../CaseComments";
import { FindingComparison, FindingTechnicalDetails } from "./FindingComparison";
import { FindingActions, type FindingUpdateOptions } from "./FindingActions";
import { RelatedItemsPanel } from "./RelatedItemsPanel";
import { SharedImagesPanel } from "./SharedImagesPanel";
import { TaskAssigneeControl } from "./TaskAssigneeControl";
import { APP_SHELL_OVERLAY_TOP } from "../../appShellLayout";
import { useOutsideDismiss } from "../../../hooks/useOutsideDismiss";
import "./FindingInspector.css";

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
  error,
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
  error?: string | null;
  navigation?: {
    position: number;
    total: number;
    onPrevious?: () => void;
    onNext?: () => void;
  };
}) {
  const inspectorRef = useRef<HTMLElement>(null);
  useOutsideDismiss(inspectorRef, onClose);

  useEffect(() => {
    const trigger = document.activeElement;
    const panel = inspectorRef.current;
    return () => {
      if (
        trigger instanceof HTMLElement && trigger.isConnected &&
        (document.activeElement === document.body || panel?.contains(document.activeElement))
      ) trigger.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    inspectorRef.current?.focus({ preventScroll: true });
  }, [f.result_id]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      // Let an open native select or disclosure consume Escape first.
      if (event.target instanceof Element && event.target.closest('select, details[open]')) return;
      event.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

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
    <div
      className="fixed inset-x-0 bottom-0 z-40 pointer-events-none flex justify-end"
      style={{ top: APP_SHELL_OVERLAY_TOP }}
    >
      <aside
        ref={inspectorRef}
        data-finding-inspector
        role="dialog"
        aria-modal="false"
        aria-label="Finding details"
        tabIndex={-1}
        className="finding-inspector pointer-events-auto focus:outline-none"
      >
        <div className="finding-inspector-header">
          <div className="finding-inspector-label">
            <PanelRight size={16} aria-hidden="true" />
            <span>Listing details</span>
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
            className="finding-inspector-close"
            aria-label="Close finding details"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>
        <div className="finding-inspector-scroll">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}
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
            showActions={false}
          />
          <div className="finding-inspector-section">
            <SharedImagesPanel key={f.result_id} resultId={f.result_id} />
          </div>
          {showRelatedItems && (
            <details className="finding-inspector-section">
              <summary className="cursor-pointer text-sm font-semibold text-stone-700">Related items</summary>
              <div className="mt-3">
              <RelatedItemsPanel
                finding={f}
                onAddToBatch={onAddRelatedToBatch}
                hideHeading
              />
              </div>
            </details>
          )}
          <div className="finding-inspector-section space-y-3">
            <FindingTechnicalDetails f={f} />
            {f.case_id && <CaseComments caseId={f.case_id} compact />}
          </div>
        </div>
        <footer className="finding-inspector-footer" aria-label="Listing review actions">
          <FindingActions
            grouped
            key={f.result_id}
            f={f}
            ipId={ipId}
            canLicense={!!ipId && (!!f.seller_name || !!f.seller_url) && !f.licensed_seller && f.dismissal_reason !== "licensed"}
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
          <div className="finding-inspector-footer-heading">
            <TaskAssigneeControl finding={f} onUpdated={onUpdated} />
          </div>
        </footer>
      </aside>
    </div>
  );
}
