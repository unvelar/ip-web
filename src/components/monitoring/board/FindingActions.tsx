import { useState, type ReactNode } from "react";
import { ComposeModal, ConfirmSendModal } from "../../TakedownPanel";
import {
  addIpLicense,
  autoSendTakedown,
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

export function FindingActions({
  f,
  ipId,
  canLicense,
  isDismissed,
  isDismissing,
  onDismiss,
  onActionComplete,
  onTakedownSent,
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
  onTakedownSent: () => void;
  onUpdated: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [licensing, setLicensing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [sendErr, setSendErr] = useState("");
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";

  // Quick path from the confirm dialog: send the pre-filled draft for the
  // suggested route without opening the editor. Falls back to the editor when
  // there's no route/draft to auto-send.
  async function sendDirect() {
    if (!f.case_id) return;
    setDirectSending(true);
    setSendErr("");
    try {
      const r = await autoSendTakedown(f.case_id);
      if (r.status === "unconfigured") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(f.case_id);
          setConfirming(false);
          onTakedownSent();
          onActionComplete();
          onUpdated();
          return;
        }
        setSendErr("Email isn't configured yet — contact your administrator.");
        return;
      }
      if (r.status === "needs_compose") {
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(f.case_id);
          setConfirming(false);
          onTakedownSent();
          onActionComplete();
          onUpdated();
          return;
        }
        setConfirming(false);
        setComposing(true);
        return;
      }
      setConfirming(false);
      onTakedownSent();
      onActionComplete();
      onUpdated();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDirectSending(false);
    }
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
      onUpdated();
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
      await addIpLicense(ipId, {
        domain: f.domain,
        seller_name: f.seller_name,
        seller_url: f.seller_url,
      });
      onUpdated(); // backfill dismisses this + any sibling finding from the seller
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

  const primaryCls =
    compact
      ? "h-8 px-2 rounded-md text-[11px] font-semibold leading-none disabled:opacity-50"
      : "h-7 px-2.5 rounded-md text-xs font-medium leading-none whitespace-nowrap disabled:opacity-50";
  const blue = `${primaryCls} bg-blue-600 text-white hover:bg-blue-500`;
  const emerald = `${primaryCls} bg-emerald-600 text-white hover:bg-emerald-500`;
  const ghostStone = `${primaryCls} border border-stone-200 text-stone-700 hover:bg-stone-50 bg-white`;

  const outcomeButton = (
    key: string,
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
      title={title}
      className={ghostStone}
      aria-keyshortcuts={shortcut}
    >
      {isDismissing ? "Working…" : <ButtonWithShortcut label={label} shortcut={shortcut} />}
    </button>
  );
  const falsePositiveBtn = outcomeButton(
    "false-positive",
    "False positive",
    "false_positive",
    "Shortcut 1: the detection is wrong or irrelevant",
    "1",
  );
  const dontPursueBtn = outcomeButton(
    "do-not-pursue",
    "Don't pursue",
    "do_not_pursue",
    "Shortcut 3: valid detection, intentionally tolerated or not worth enforcement",
    "3",
  );
  const secondHandBtn = outcomeButton(
    "second-hand",
    "Resale",
    "second_hand",
    "Shortcut 2: resale or second-hand item",
    "2",
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

  const licenseBtn = canLicense ? (
    <button
      key="license"
      type="button"
      onClick={handleLicense}
      disabled={licensing}
      title="Mark this seller as licensed on this domain — dismisses this and future findings from them"
      className={
        compact
          ? "px-1.5 py-1 rounded text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          : "h-7 px-2 rounded-md text-xs font-medium leading-none whitespace-nowrap text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
      }
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

  if (state === "pending") {
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
        <button
          type="button"
          disabled={!f.case_id || (!signerReady && !canMarkSentWithoutEmail)}
          title={
            !f.case_id
              ? "Still preparing this case…"
              : !signerReady && !canMarkSentWithoutEmail
                ? "Add this IP's takedown signer (on the IP's page) before sending"
                : !signerReady
                  ? "Admin override: mark sent without sending email"
                : undefined
          }
          onClick={() => {
            setSendErr("");
            setConfirming(true);
          }}
          className={blue}
          aria-keyshortcuts="T"
        >
          <ButtonWithShortcut label="Send takedown" shortcut="T" dark />
        </button>
      </>
    );
    utilityButtons = licenseBtn;
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
            run("enforce", () => markIpFindingEnforced(ipId, f.result_id))
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
      <div className={compact ? "grid grid-cols-2 gap-1.5" : "flex items-center gap-1.5 flex-nowrap whitespace-nowrap"}>
        {buttons}
        {!compact && utilityButtons && (
          <div className="ml-1 pl-2 border-l border-stone-200 flex items-center">
            {utilityButtons}
          </div>
        )}
        {!compact && refreshBtn && (
          <details className="relative shrink-0 ml-auto">
            <summary className="h-7 px-2 rounded-md text-xs font-medium leading-none text-stone-500 hover:bg-stone-50 hover:text-stone-700 cursor-pointer select-none list-none flex items-center">
              Advanced
            </summary>
            <div className="absolute z-10 mt-1 right-0 rounded-md border border-stone-200 bg-white p-1 shadow-sm">
              {refreshBtn}
            </div>
          </details>
        )}
      </div>
      {compact && (utilityButtons || refreshBtn) && (
        <div
          className="relative border-t border-stone-200 pt-1 flex items-center justify-between gap-2 text-[11px] text-stone-400"
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
          onEdit={() => {
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
          onClose={() => setComposing(false)}
          onSent={() => {
            setComposing(false);
            onTakedownSent();
            onActionComplete();
            onUpdated(); // case flips to takedown_sent; board refresh re-renders the row
          }}
        />
      )}
    </div>
  );
}
