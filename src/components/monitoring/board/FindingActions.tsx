import { useState, type ReactNode } from "react";
import { ComposeModal, ConfirmSendModal } from "../../TakedownPanel";
import {
  addIpLicense,
  approveTakedown,
  DEFAULT_TAKEDOWN_FEEDBACK_SCOPES,
  markIpFindingNeedsReview,
  markIpFindingEnforced,
  markTakedownsSubmitted,
  openIpFindingTakedownPacket,
  reenrichIpFinding,
  reopenIpFinding,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type TakedownFeedbackAssociationScope,
} from "../../../api";
import { ButtonWithShortcut } from "./ButtonWithShortcut";
import { legalQueueReasonLabel } from "./utils";

export type FindingUpdateOptions = {
  completed?: boolean;
};

type RecommendableAction =
  | "false_positive"
  | "second_hand"
  | "packaging_only"
  | "do_not_pursue"
  | "review"
  | "send_takedown"
  | "license";

export function FindingActions({
  f,
  ipId,
  canLicense,
  isDismissed,
  isDismissing,
  onDismiss,
  onActionComplete,
  onNeedsReview,
  onTakedownSent,
  onEnforced,
  onLicensed,
  onUpdated,
  compact = false,
}: {
  f: IpReviewFinding;
  ipId?: string;
  canLicense: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onDismiss: (reason: MonitoringReviewOutcome, reasonCode?: MonitoringDismissReasonCode) => void;
  onActionComplete: () => void;
  onNeedsReview: () => void;
  onTakedownSent: () => void;
  onEnforced: () => void;
  onLicensed: (dismissedCount: number) => void;
  onUpdated: (opts?: FindingUpdateOptions) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [licensing, setLicensing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composeDecisionReason, setComposeDecisionReason] = useState("");
  const [composeAssociationScopes, setComposeAssociationScopes] = useState<
    TakedownFeedbackAssociationScope[]
  >(() => [...DEFAULT_TAKEDOWN_FEEDBACK_SCOPES]);
  const [confirming, setConfirming] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const sellerLicensed = !!f.licensed_seller || f.dismissal_reason === "licensed";

  // Resolve the reviewer decision through the automatic/manual routing API.
  // Automatic routes submit immediately; everything else enters the legal queue.
  async function sendDirect(
    decisionReason: string,
    associationScopes: TakedownFeedbackAssociationScope[],
  ) {
    if (!f.case_id) return;
    setDirectSending(true);
    setSendErr("");
    try {
      const result = await approveTakedown(
        f.case_id,
        decisionReason,
        associationScopes,
      );
      if (result.status === "automatic") {
        onTakedownSent();
      }
      setConfirming(false);
      onActionComplete();
      onUpdated({ completed: true });
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDirectSending(false);
    }
  }

  function beginTakedown() {
    setSendErr("");
    setComposeDecisionReason("");
    setComposeAssociationScopes([...DEFAULT_TAKEDOWN_FEEDBACK_SCOPES]);
    setConfirming(true);
  }

  async function run(
    label: string,
    fn: () => Promise<unknown>,
    opts: { completeCurrent?: boolean } = {},
  ) {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
      if (opts.completeCurrent) onActionComplete();
      onUpdated(opts.completeCurrent ? { completed: true } : undefined);
    } catch (e) {
      alert(e instanceof Error ? e.message : `Failed: ${label}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleLicense() {
    if (licensing || !ipId) return;
    const seller = f.seller_name?.trim() || f.seller_url?.trim() || "this seller";
    if (!window.confirm(
      `Mark ${seller} as licensed on ${f.domain}? This dismisses current matching tasks and suppresses future findings for this seller on this website.`,
    )) return;
    setLicensing(true);
    try {
      const result = await addIpLicense(ipId, {
        domain: f.domain,
        seller_name: f.seller_name,
        seller_url: f.seller_url,
      });
      onLicensed(result.dismissed);
      onActionComplete();
      onUpdated({ completed: true }); // backfill dismisses this + any sibling finding from the seller
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add license");
    } finally {
      setLicensing(false);
    }
  }

  // Effective status: explicit dismissal collapses to "dismissed".
  const state: CaseReviewStatus = isDismissed
    ? "dismissed"
    : (f.review_status ?? "pending");

  const recommendedAction: RecommendableAction | null =
    state !== "pending" && state !== "review"
      ? null
      : f.actionability?.key === "send_takedown"
        ? "send_takedown"
        : f.actionability?.key === "allowed_resale"
          ? f.offer_subject === "packaging_only"
            ? "packaging_only"
            : "second_hand"
          : f.actionability?.key === "licensed_seller"
            ? "license"
            : f.actionability?.key === "false_positive"
              ? f.offer_subject === "packaging_only"
                ? "packaging_only"
                : "false_positive"
              : "review";
  const recommendationReason = f.actionability?.reason?.trim();

  const primaryCls =
    compact
      ? "h-8 px-2 rounded-md text-[11px] font-semibold leading-none disabled:opacity-50 transition-[background-color,border-color,color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
      : "h-7 px-2.5 rounded-md text-xs font-medium leading-none whitespace-nowrap disabled:opacity-50 transition-[background-color,border-color,color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
  const recommendedPrimary = `${primaryCls} recommended-action bg-blue-600 text-white hover:bg-blue-500`;
  const emerald = `${primaryCls} bg-emerald-600 text-white hover:bg-emerald-500`;
  const ghostStone = `${primaryCls} border border-stone-200 text-stone-700 hover:bg-stone-50 bg-white`;

  function actionClass(action: RecommendableAction) {
    return recommendedAction === action ? recommendedPrimary : ghostStone;
  }

  function actionTitle(action: RecommendableAction, title?: string) {
    if (recommendedAction !== action) return title;
    return [
      recommendationReason
        ? `Recommended action: ${recommendationReason}`
        : "Recommended action",
      "Press Enter to use this recommendation",
      title,
    ].filter(Boolean).join(" · ");
  }

  function actionAriaLabel(action: RecommendableAction, label: string) {
    return recommendedAction === action ? `Recommended action: ${label}` : undefined;
  }

  const outcomeButton = (
    key: string,
    action: RecommendableAction,
    label: string,
    reason: MonitoringReviewOutcome,
    reasonCode: MonitoringDismissReasonCode | undefined,
    title: string,
    shortcut: string,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => onDismiss(reason, reasonCode)}
      disabled={isDismissing}
      title={actionTitle(action, title)}
      className={actionClass(action)}
      aria-label={actionAriaLabel(action, label)}
      aria-keyshortcuts={recommendedAction === action ? `Enter ${shortcut}` : shortcut}
      data-recommended-action={recommendedAction === action ? "Recommended" : undefined}
    >
      {isDismissing ? (
        "Working…"
      ) : (
        <ButtonWithShortcut
          label={label}
          shortcut={shortcut}
          dark={recommendedAction === action}
        />
      )}
    </button>
  );
  const falsePositiveBtn = outcomeButton(
    "false-positive",
    "false_positive",
    "Different product",
    "false_positive",
    "different_product",
    "Shortcut 1: the listing is for a different product",
    "1",
  );
  const dontPursueBtn = outcomeButton(
    "do-not-pursue",
    "do_not_pursue",
    "Mark as OK",
    "do_not_pursue",
    undefined,
    "Shortcut 3: valid detection, intentionally tolerated or not worth enforcement",
    "3",
  );
  const secondHandBtn = outcomeButton(
    "second-hand",
    "second_hand",
    "Second hand",
    "second_hand",
    "genuine_second_hand",
    "Shortcut 2: a likely genuine used or second-hand item",
    "2",
  );
  const packagingOnlyBtn = outcomeButton(
    "packaging-only",
    "packaging_only",
    "Packaging only",
    "second_hand",
    "original_packaging_only",
    "Shortcut 4: original packaging or an empty box only",
    "4",
  );
  const needsReviewBtn = (
    <button
      key="review"
      type="button"
      disabled={!ipId || !f.case_id || busy === "review"}
      title={actionTitle(
        "review",
        !f.case_id
          ? "Still preparing this case..."
          : !ipId
            ? "Cannot update finding: finding has no associated IP"
            : "Shortcut R: move this finding to the Review bucket for lawyer input",
      )}
      onClick={() =>
        ipId &&
        run(
          "review",
          async () => {
            await markIpFindingNeedsReview(ipId, f.result_id);
            onNeedsReview();
          },
          { completeCurrent: true },
        )
      }
      className={actionClass("review")}
      aria-label={actionAriaLabel("review", "Review")}
      aria-keyshortcuts={recommendedAction === "review" ? "Enter R" : "R"}
      data-recommended-action={recommendedAction === "review" ? "Recommended" : undefined}
    >
      {busy === "review" ? (
        "Working..."
      ) : (
        <ButtonWithShortcut
          label="Review"
          shortcut="R"
          dark={recommendedAction === "review"}
        />
      )}
    </button>
  );

  // Always-available — re-scrapes the listing + re-extracts + re-scores
  // gallery photos (incl. bbox localization). Independent of review state.
  const refreshBtn = ipId ? (
    <button
      key="refresh"
      type="button"
      disabled={busy === "refresh"}
      title="Re-scrape the listing and re-run enrichment + bbox localization"
      onClick={() =>
        run("refresh", () => reenrichIpFinding(ipId, f.result_id))
      }
      className={ghostStone}
    >
      {busy === "refresh" ? "Refreshing…" : "Refresh"}
    </button>
  ) : null;

  const licenseBtn = canLicense && !sellerLicensed ? (
    <button
      key="license"
      type="button"
      onClick={handleLicense}
      disabled={licensing}
      title={actionTitle(
        "license",
        "Mark this seller as licensed on this domain — dismisses this and future findings from them",
      )}
      className={
        recommendedAction === "license"
          ? recommendedPrimary
          : compact
            ? "px-1.5 py-1 rounded text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            : "h-7 px-2 rounded-md text-xs font-medium leading-none whitespace-nowrap text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      }
      aria-label={actionAriaLabel("license", "Mark as licensed seller")}
      aria-keyshortcuts={recommendedAction === "license" ? "Enter" : undefined}
      data-recommended-action={recommendedAction === "license" ? "Recommended" : undefined}
    >
      {licensing ? "Marking…" : "Mark as licensed seller"}
    </button>
  ) : null;

  function reopenBtn(label = "Reopen") {
    return (
      <button
        key="reopen"
        type="button"
        disabled={!ipId || busy === "reopen"}
        onClick={() =>
          ipId &&
          run("reopen", () => reopenIpFinding(ipId, f.result_id))
        }
        className={ghostStone}
      >
        {busy === "reopen" ? "Working…" : label}
      </button>
    );
  }

  let buttons: ReactNode = null;
  let utilityButtons: ReactNode = null;
  let stateNote: ReactNode = null;

  if (sellerLicensed && !isDismissed) {
    buttons = (
      <span
        className={
          compact
            ? "col-span-2 px-2 py-1 rounded-md bg-emerald-50 text-[11px] font-semibold text-emerald-700 text-center"
            : "h-7 px-2.5 rounded-md bg-emerald-50 text-xs font-semibold leading-none text-emerald-700 inline-flex items-center"
        }
        title="This seller matches a saved license rule for this IP and platform."
      >
        Licensed seller
      </span>
    );
  } else if (state === "pending") {
    // Triage decision: automatic routes advance to takedown_sent; all other
    // routes enter takedown_pending for legal review and manual submission.
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {f.offer_subject === "packaging_only" && packagingOnlyBtn}
        {dontPursueBtn}
        {needsReviewBtn}
        <button
          type="button"
          disabled={!f.case_id || directSending}
          title={actionTitle(
            "send_takedown",
            !f.case_id
              ? "Still preparing this case…"
              : "Submit automatically when possible; otherwise add to the legal queue",
          )}
          onClick={beginTakedown}
          className={actionClass("send_takedown")}
          aria-label={actionAriaLabel("send_takedown", "Takedown")}
          aria-keyshortcuts={recommendedAction === "send_takedown" ? "Enter T" : "T"}
          data-recommended-action={recommendedAction === "send_takedown" ? "Recommended" : undefined}
        >
          <ButtonWithShortcut
            label={directSending ? "Processing…" : "Takedown"}
            shortcut="T"
            dark={recommendedAction === "send_takedown"}
          />
        </button>
      </>
    );
    utilityButtons = licenseBtn;
  } else if (state === "review") {
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {f.offer_subject === "packaging_only" && packagingOnlyBtn}
        {dontPursueBtn}
        <button
          type="button"
          disabled={!f.case_id || directSending}
          title={actionTitle(
            "send_takedown",
            !f.case_id
              ? "Still preparing this case..."
              : "Submit automatically when possible; otherwise add to the legal queue",
          )}
          onClick={beginTakedown}
          className={actionClass("send_takedown")}
          aria-label={actionAriaLabel("send_takedown", "Takedown")}
          aria-keyshortcuts={recommendedAction === "send_takedown" ? "Enter T" : "T"}
          data-recommended-action={recommendedAction === "send_takedown" ? "Recommended" : undefined}
        >
          <ButtonWithShortcut
            label={directSending ? "Processing…" : "Takedown"}
            shortcut="T"
            dark={recommendedAction === "send_takedown"}
          />
        </button>
      </>
    );
    utilityButtons = (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {licenseBtn}
        {reopenBtn("Move to triage")}
      </div>
    );
  } else if (state === "takedown_pending") {
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {f.offer_subject === "packaging_only" && packagingOnlyBtn}
        {dontPursueBtn}
        <button
          type="button"
          disabled={!f.case_id || busy === "submit"}
          onClick={() => {
            if (
              !f.case_id ||
              !window.confirm("Confirm that this takedown was submitted through the marketplace's manual route.")
            ) return;
            void run(
              "submit",
              async () => {
                const result = await markTakedownsSubmitted([f.case_id as string]);
                if (!result.submitted_case_ids.includes(f.case_id as string)) {
                  throw new Error(result.skipped[0]?.reason ?? "The case is no longer awaiting legal action.");
                }
                onTakedownSent();
              },
              { completeCurrent: true },
            );
          }}
          className={emerald}
        >
          {busy === "submit" ? "Working…" : "Mark submitted"}
        </button>
      </>
    );
    utilityButtons = (
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {ipId && (
          <button
            type="button"
            disabled={busy === "packet"}
            onClick={() => run("packet", () => openIpFindingTakedownPacket(ipId, f.result_id))}
            className={ghostStone}
          >
            {busy === "packet" ? "Opening…" : "Open takedown packet"}
          </button>
        )}
        {reopenBtn("Move to triage")}
      </div>
    );
    stateNote = (
      <p className="col-span-2 mb-1 w-full text-xs text-violet-700">
        Awaiting legal action: {legalQueueReasonLabel(f.takedown_pending_reason)}.
      </p>
    );
  } else if (state === "takedown_sent") {
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {f.offer_subject === "packaging_only" && packagingOnlyBtn}
        {dontPursueBtn}
        <button
          type="button"
          disabled={!ipId || busy === "enforce"}
          onClick={() =>
            ipId && window.confirm(
              "Mark this task as enforced? Use this only after the listing has been removed or enforcement is confirmed.",
            ) &&
            run(
              "enforce",
              async () => {
                await markIpFindingEnforced(ipId, f.result_id);
                onEnforced();
              },
              { completeCurrent: true },
            )
          }
          className={emerald}
        >
          {busy === "enforce" ? "Working…" : "Mark enforced"}
        </button>
      </>
    );
  } else if (state === "enforced") {
    buttons = reopenBtn();
  } else {
    // dismissed
    buttons = reopenBtn();
  }

  return (
    <div
      className={
        compact
          ? "rounded-md border border-stone-200 bg-stone-50 p-2 space-y-1.5"
          : "min-w-0"
      }
    >
      <div className={compact ? "finding-action-buttons grid grid-cols-2 gap-1.5" : "finding-action-buttons flex min-w-0 max-w-full flex-wrap items-center gap-1.5"}>
        {stateNote}
        {buttons}
        {!compact && utilityButtons && (
          <div className="ml-1 flex min-w-0 flex-wrap items-center gap-1.5 border-l border-stone-200 pl-2">
            {utilityButtons}
          </div>
        )}
      </div>
      {compact && (utilityButtons || refreshBtn) && (
        <div
          className="finding-action-utilities relative border-t border-stone-200 pt-1 flex items-center justify-between gap-2 text-[11px] text-stone-400"
        >
          <div>{utilityButtons}</div>
          {refreshBtn && (
            <details className="ml-auto">
              <summary className="cursor-pointer select-none hover:text-stone-600">Advanced</summary>
              <div className="absolute z-10 mt-1 right-0 rounded-md border border-stone-200 bg-white p-1 shadow-sm">
                {refreshBtn}
              </div>
            </details>
          )}
        </div>
      )}
      {confirming && f.case_id && (
        <ConfirmSendModal
          platform={f.domain}
          sending={directSending}
          error={sendErr}
          decisionReasonRequired={f.actionability?.key !== "send_takedown"}
          onSend={sendDirect}
          onEdit={(decisionReason, associationScopes) => {
            setComposeDecisionReason(decisionReason);
            setComposeAssociationScopes(associationScopes);
            setConfirming(false);
            setComposing(true);
          }}
          onCancel={() => {
            if (directSending) return;
            setConfirming(false);
            setSendErr("");
          }}
        />
      )}
      {composing && f.case_id && (
        <ComposeModal
          caseId={f.case_id}
          ipId={f.ip_id}
          initialDecisionReason={composeDecisionReason}
          initialAssociationScopes={composeAssociationScopes}
          onClose={() => {
            setComposing(false);
            setComposeDecisionReason("");
            setComposeAssociationScopes([...DEFAULT_TAKEDOWN_FEEDBACK_SCOPES]);
          }}
          onSent={(outcome) => {
            setComposing(false);
            setComposeDecisionReason("");
            setComposeAssociationScopes([...DEFAULT_TAKEDOWN_FEEDBACK_SCOPES]);
            if (outcome === "sent") {
              onTakedownSent();
            }
            onActionComplete();
            onUpdated({ completed: true }); // case leaves triage for sent or the legal queue
          }}
        />
      )}
    </div>
  );
}
