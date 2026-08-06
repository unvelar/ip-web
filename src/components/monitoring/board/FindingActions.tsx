import { useState, type ReactNode } from "react";
import { ComposeModal, ConfirmSendModal } from "../../TakedownPanel";
import {
  addIpLicense,
  autoSendTakedown,
  markIpFindingNeedsReview,
  markIpFindingEnforced,
  markTakedownSentWithoutEmail,
  reenrichIpFinding,
  reopenIpFinding,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringReviewOutcome,
} from "../../../api";
import { useAuth } from "../../../context/AuthContext";
import { ButtonWithShortcut } from "./ButtonWithShortcut";

export type FindingUpdateOptions = {
  completed?: boolean;
};

type RecommendableAction =
  | "false_positive"
  | "second_hand"
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
  onDismiss: (reason: MonitoringReviewOutcome) => void;
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
  const [confirming, setConfirming] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";
  const sellerLicensed = !!f.licensed_seller || f.dismissal_reason === "licensed";

  // Quick path from the confirm dialog: send the pre-filled draft for the
  // suggested route without opening the editor. Falls back to the editor when
  // there's no route/draft to auto-send.
  async function sendDirect(decisionReason: string) {
    if (!f.case_id) return;
    setDirectSending(true);
    setSendErr("");
    try {
      const r = await autoSendTakedown(f.case_id, decisionReason);
      if (r.status === "unconfigured") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(f.case_id, decisionReason);
          setConfirming(false);
          onTakedownSent();
          onActionComplete();
          onUpdated({ completed: true });
          return;
        }
        setSendErr("Email isn't configured yet — contact your administrator.");
        return;
      }
      if (r.status === "needs_compose") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(f.case_id, decisionReason);
          setConfirming(false);
          onTakedownSent();
          onActionComplete();
          onUpdated({ completed: true });
          return;
        }
        setComposeDecisionReason(decisionReason);
        setConfirming(false);
        setComposing(true);
        return;
      }
      setConfirming(false);
      onTakedownSent();
      onActionComplete();
      onUpdated({ completed: true });
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDirectSending(false);
    }
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
          ? "second_hand"
          : f.actionability?.key === "licensed_seller"
            ? "license"
            : f.actionability?.key === "false_positive"
              ? "false_positive"
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
    title: string,
    shortcut: string,
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => onDismiss(reason)}
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
    "False positive",
    "false_positive",
    "Shortcut 1: the detection is wrong or irrelevant",
    "1",
  );
  const dontPursueBtn = outcomeButton(
    "do-not-pursue",
    "do_not_pursue",
    "Don't pursue",
    "do_not_pursue",
    "Shortcut 3: valid detection, intentionally tolerated or not worth enforcement",
    "3",
  );
  const secondHandBtn = outcomeButton(
    "second-hand",
    "second_hand",
    "Second hand",
    "second_hand",
    "Shortcut 2: resale or second-hand item",
    "2",
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
      aria-label={actionAriaLabel("license", compact ? "License seller" : "License this seller")}
      aria-keyshortcuts={recommendedAction === "license" ? "Enter" : undefined}
      data-recommended-action={recommendedAction === "license" ? "Recommended" : undefined}
    >
      {licensing ? "Licensing…" : compact ? "License seller" : "License this seller"}
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
    // Triage decision: send the first takedown (auto-advances to takedown_sent)
    // or choose a non-enforcement outcome. License is the fast-path for a
    // recognised seller. The send is blocked (with a tooltip) until the IP has
    // a takedown signer (signer_ready) — set it on the IP's page. Admins can
    // still move the state forward without sending email.
    const signerReady = f.signer_ready ?? true;
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {dontPursueBtn}
        {needsReviewBtn}
        <button
          type="button"
          disabled={!f.case_id || (!signerReady && !canMarkSentWithoutEmail)}
          title={actionTitle(
            "send_takedown",
            !f.case_id
              ? "Still preparing this case…"
              : !signerReady && !canMarkSentWithoutEmail
                ? "Add this IP's takedown signer (on the IP's page) before sending"
                : !signerReady
                  ? "Admin override: mark sent without sending email"
                  : undefined,
          )}
          onClick={() => {
            setSendErr("");
            setComposeDecisionReason("");
            setConfirming(true);
          }}
          className={actionClass("send_takedown")}
          aria-label={actionAriaLabel("send_takedown", "Send takedown")}
          aria-keyshortcuts={recommendedAction === "send_takedown" ? "Enter T" : "T"}
          data-recommended-action={recommendedAction === "send_takedown" ? "Recommended" : undefined}
        >
          <ButtonWithShortcut
            label="Send takedown"
            shortcut="T"
            dark={recommendedAction === "send_takedown"}
          />
        </button>
      </>
    );
    utilityButtons = licenseBtn;
  } else if (state === "review") {
    const signerReady = f.signer_ready ?? true;
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {dontPursueBtn}
        <button
          type="button"
          disabled={!f.case_id || (!signerReady && !canMarkSentWithoutEmail)}
          title={actionTitle(
            "send_takedown",
            !f.case_id
              ? "Still preparing this case..."
              : !signerReady && !canMarkSentWithoutEmail
                ? "Add this IP's takedown signer (on the IP's page) before sending"
                : !signerReady
                  ? "Admin override: mark sent without sending email"
                  : undefined,
          )}
          onClick={() => {
            setSendErr("");
            setComposeDecisionReason("");
            setConfirming(true);
          }}
          className={actionClass("send_takedown")}
          aria-label={actionAriaLabel("send_takedown", "Send takedown")}
          aria-keyshortcuts={recommendedAction === "send_takedown" ? "Enter T" : "T"}
          data-recommended-action={recommendedAction === "send_takedown" ? "Recommended" : undefined}
        >
          <ButtonWithShortcut
            label="Send takedown"
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
  } else if (state === "takedown_sent") {
    buttons = (
      <>
        {falsePositiveBtn}
        {secondHandBtn}
        {dontPursueBtn}
        <button
          type="button"
          disabled={!ipId || busy === "enforce"}
          onClick={() =>
            ipId &&
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
          noEmailMode={canMarkSentWithoutEmail && f.signer_ready === false}
          onSend={sendDirect}
          onEdit={(decisionReason) => {
            setComposeDecisionReason(decisionReason);
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
          onClose={() => {
            setComposing(false);
            setComposeDecisionReason("");
          }}
          onSent={() => {
            setComposing(false);
            setComposeDecisionReason("");
            onTakedownSent();
            onActionComplete();
            onUpdated({ completed: true }); // case flips to takedown_sent; board refresh re-renders the row
          }}
        />
      )}
    </div>
  );
}
