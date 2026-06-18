import { Fragment, type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import TakedownPanel, { ComposeModal, ConfirmSendModal } from "../TakedownPanel";
import CaseComments from "../CaseComments";
import {
  addIpLicense,
  allowIpFindingProductImage,
  dismissIpFinding,
  markIpFindingEnforced,
  markTakedownSentWithoutEmail,
  reenrichIpFinding,
  resortMonitoringFindings,
  reopenIpFinding,
  undismissIpFinding,
  autoSendTakedown,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringCandidateOutcome,
  type MonitoringFacets,
  type MonitoringDismissalReasonFilter,
  type MonitoringPriorityBand,
  type MonitoringReviewOutcome,
  type MonitoringSortMode,
  type MonitoringStatusFilter,
} from "../../api";
import { useAuth } from "../../context/AuthContext";

/** Shape pushed up to the parent — must match Findings.tsx::InboxFilters. */
export interface BoardFilters {
  status: MonitoringStatusFilter | null;
  priority: MonitoringPriorityBand | null;
  ip_id: string | null;
  platform: string | null;
  seller: string | null;
  dismissal_reason: MonitoringDismissalReasonFilter | null;
  candidate_outcome: MonitoringCandidateOutcome | null;
  show_dismissed: boolean;
  sort: MonitoringSortMode;
}

// Shared clean style for the filter-bar dropdowns (IP / platform).
const FILTER_SELECT =
  "px-2.5 py-1.5 rounded-lg border border-stone-200 text-[11px] bg-white text-stone-700 " +
  "max-w-[14rem] focus:outline-none focus:ring-1 focus:ring-stone-300";

const DISMISSAL_REASON_LABELS: Record<MonitoringDismissalReasonFilter, string> = {
  false_positive: "False positive",
  do_not_pursue: "Don't pursue",
  second_hand: "Resale / second hand",
  licensed: "Licensed",
  allowed_product: "Allowed product",
  dead: "Dead link",
  manual_cleared: "Manual clear",
};

const CANDIDATE_OUTCOME_LABELS: Record<MonitoringCandidateOutcome, string> = {
  second_hand: "Resale / second hand",
  takedown: "Review for takedown",
  do_not_pursue: "Don't pursue",
  false_positive: "False positive",
  none: "Unsorted",
};

const CANDIDATE_OUTCOME_ORDER: MonitoringCandidateOutcome[] = [
  "second_hand",
  "takedown",
  "do_not_pursue",
  "false_positive",
  "none",
];

type ResortTarget = MonitoringCandidateOutcome | null;

function ShortcutKey({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <kbd
      className={
        `inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 text-[10px] font-bold leading-none ${
          dark
            ? "border-white/40 bg-white/20 text-white"
            : "border-stone-300 bg-stone-100 text-stone-600"
        }`
      }
    >
      {value}
    </kbd>
  );
}

function ButtonWithShortcut({
  label,
  shortcut,
  dark = false,
}: {
  label: string;
  shortcut: string;
  dark?: boolean;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
      <ShortcutKey value={shortcut} dark={dark} />
      <span>{label}</span>
    </span>
  );
}

type LastReviewAction =
  | { kind: "dismiss"; ipId: string; resultId: string; label: string }
  | { kind: "takedown"; ipId: string; resultId: string; label: string };

function hasReviewAnalysis(f: IpReviewFinding) {
  return Boolean(
    f.listing_title?.trim() ||
    f.seller_name?.trim() ||
    f.match_explanation?.trim() ||
    f.description_summary?.trim() ||
    f.license_status?.trim() ||
    f.infringement_type?.trim(),
  );
}

/** Compact relative-time formatter for "last checked"/"found" meta lines.
 *  Falls back to null when the input is missing/invalid. */
function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

// --- Batch operations (multi-select) ---------------------------------------

type BatchAction = "send" | "false_positive" | "do_not_pursue" | "second_hand" | "enforce";

const BATCH_META: Record<
  BatchAction,
  { label: string; verb: string; gerund: string }
> = {
  send: { label: "Send takedowns", verb: "Sent", gerund: "Send takedowns for" },
  false_positive: { label: "False positive", verb: "Cleared", gerund: "Mark false positive for" },
  do_not_pursue: { label: "Don't pursue", verb: "Cleared", gerund: "Don't pursue" },
  second_hand: { label: "Resale / second hand", verb: "Marked resale", gerund: "Mark resale / second hand for" },
  enforce: { label: "Mark enforced", verb: "Marked enforced", gerund: "Mark enforced" },
};

/** Run `worker` over `items` with at most `concurrency` in flight. */
async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
) {
  let cursor = 0;
  const pull = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, pull),
  );
}

/** "Sent 9 · skipped 3: 2 missing signer, 1 already sent · 1 failed" */
function summarizeBatch(
  action: BatchAction,
  ok: number,
  skipped: Record<string, number>,
  failed: number,
): string {
  const parts = [`${BATCH_META[action].verb} ${ok}`];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (skipTotal > 0) {
    const detail = Object.entries(skipped)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(", ");
    parts.push(`skipped ${skipTotal}: ${detail}`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

function summarizeResort(
  target: ResortTarget,
  ok: number,
  skipped: Record<string, number>,
  failed: number,
): string {
  const label = target ? CANDIDATE_OUTCOME_LABELS[target] : "Auto bucket";
  const parts = [`Moved ${ok} to ${label}`];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (skipTotal > 0) {
    const detail = Object.entries(skipped)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(", ");
    parts.push(`skipped ${skipTotal}: ${detail}`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

/**
 * Tenant-wide findings board. Filter state lives in the URL (managed by
 * Findings.tsx); the board is a "dumb" renderer that consumes the page of
 * findings + facet counts and emits filter changes back up. Server handles
 * filtering + sorting + keyset pagination — the "Load more" footer appends
 * the next page in place.
 */
export function MonitoringBoard({
  findings,
  facets,
  filters,
  onFiltersChange,
  nextCursor,
  loadingMore,
  onLoadMore,
  ipId,
  runInProgress,
  onRefresh,
  onDismiss,
  showIpColumn,
}: {
  findings: IpReviewFinding[];
  facets: MonitoringFacets;
  filters: BoardFilters;
  onFiltersChange: (next: Partial<BoardFilters>) => void;
  nextCursor: string | null;
  loadingMore: boolean;
  onLoadMore: () => void;
  /**
   * Fallback IP for per-finding actions when a finding doesn't carry its own
   * `ip_id` (single-IP usage). On the global board each finding ships `ip_id`.
   */
  ipId?: string;
  /** A monitor run is currently pending/executing — tweaks the empty state. */
  runInProgress: boolean;
  /** Re-fetch the first page (e.g. after a dismiss / license backfill). */
  onRefresh: () => void;
  /** Optional post-dismiss notification with the dismissed result_id. */
  onDismiss?: (resultId: string) => void;
  /** Render the IP-name chip + IP filter dropdown. */
  showIpColumn?: boolean;
}) {
  const ipAware = showIpColumn ?? findings.some((f) => !!f.ip_id);
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";
  // Optimistically-dismissed result_ids — the next refetch replaces these
  // once `dismissed_at` lands in the payload.
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  // Inline-expanded finding (Gmail-row accordion). null = all collapsed.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [lastAction, setLastAction] = useState<LastReviewAction | null>(null);
  const [undoing, setUndoing] = useState(false);

  // Stale entries in `dismissing` for findings that have since been removed
  // from the page are harmless — they're never queried after the row goes
  // away — so we don't bother clearing them on each refetch.

  const counts = facets.priorities;
  const total = facets.total;
  const displayFindings = useMemo(
    () =>
      filters.status === "pending"
        ? findings.filter(
            (f) =>
              f.ready_for_review &&
              hasReviewAnalysis(f) &&
              !f.dismissed_at &&
              (f.review_status ?? "pending") === "pending",
          )
        : findings,
    [filters.status, findings],
  );

  // Collapse the expanded row when filters drop it from the visible set —
  // derived during render rather than synced via effect so we don't trigger
  // a cascading re-render.
  const effectiveActiveId =
    activeId && displayFindings.some((f) => f.result_id === activeId) ? activeId : null;

  const visibleActionableFindings = useMemo(
    () =>
      displayFindings.filter((f) => {
        const state: CaseReviewStatus = f.dismissed_at
          ? "dismissed"
          : (f.review_status ?? "pending");
        return state === "pending" && f.ready_for_review && hasReviewAnalysis(f) && !dismissing.has(f.result_id);
      }),
    [displayFindings, dismissing],
  );

  const advanceAfterAction = useCallback((resultId: string) => {
    const currentIndex = visibleActionableFindings.findIndex((f) => f.result_id === resultId);
    const next =
      currentIndex >= 0
        ? visibleActionableFindings
            .slice(currentIndex + 1)
            .find((f) => f.result_id !== resultId) ??
          visibleActionableFindings
            .slice(0, currentIndex)
            .find((f) => f.result_id !== resultId)
        : visibleActionableFindings.find((f) => f.result_id !== resultId);
    setActiveId(next?.result_id ?? null);
  }, [visibleActionableFindings]);

  const handleDismiss = useCallback(async (
    f: IpReviewFinding,
    reason: MonitoringReviewOutcome = "false_positive",
  ) => {
    if (dismissing.has(f.result_id)) return;
    const fipId = f.ip_id ?? ipId;
    if (!fipId) {
      alert("Cannot update finding: finding has no associated IP.");
      return;
    }
    setDismissing((prev) => new Set(prev).add(f.result_id));
    try {
      await dismissIpFinding(fipId, f.result_id, { reason });
      onDismiss?.(f.result_id);
      setLastAction({
        kind: "dismiss",
        ipId: fipId,
        resultId: f.result_id,
        label: DISMISSAL_REASON_LABELS[(reason === "resale" ? "second_hand" : reason === "manual_cleared" || reason === "licensed" ? reason : reason) as MonitoringDismissalReasonFilter] ?? "Review action",
      });
      advanceAfterAction(f.result_id);
      onRefresh();
    } catch (e) {
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(f.result_id);
        return next;
      });
      alert(e instanceof Error ? e.message : "Failed to update finding");
    }
  }, [advanceAfterAction, dismissing, ipId, onDismiss, onRefresh]);

  const rememberTakedownAction = useCallback((f: IpReviewFinding) => {
    const fipId = f.ip_id ?? ipId;
    if (!fipId) return;
    setLastAction({
      kind: "takedown",
      ipId: fipId,
      resultId: f.result_id,
      label: "Takedown",
    });
  }, [ipId]);

  async function undoLastAction() {
    if (!lastAction || undoing) return;
    setUndoing(true);
    try {
      if (lastAction.kind === "dismiss") {
        await undismissIpFinding(lastAction.ipId, lastAction.resultId);
      } else {
        await reopenIpFinding(lastAction.ipId, lastAction.resultId);
      }
      setLastAction(null);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to undo action");
    } finally {
      setUndoing(false);
    }
  }

  // --- Multi-select + batch operations -------------------------------------
  // Selection is keyed by result_id and page-local (covers loaded rows only).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Reset selection when the filter set changes — the rows it referenced are
  // gone. (Pruning on every refetch isn't needed: stale ids are simply ignored.)
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setSelected(new Set());
    setBatchResult(null);
  }, [filterKey]);

  function toggleSelect(resultId: string) {
    setBatchResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(resultId)) next.delete(resultId);
      else next.add(resultId);
      return next;
    });
  }
  function toggleSelectAll() {
    setBatchResult(null);
    setSelected((prev) =>
      prev.size === displayFindings.length
        ? new Set()
        : new Set(displayFindings.map((f) => f.result_id)),
    );
  }

  // Split the current selection for an action into rows to act on vs.
  // skip-reason counts to report. `state` mirrors FindingActions' derivation.
  function partitionSelection(action: BatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (r: string) => {
      skipped[r] = (skipped[r] ?? 0) + 1;
    };
    for (const f of displayFindings) {
      if (!selected.has(f.result_id)) continue;
      const state: CaseReviewStatus = f.dismissed_at
        ? "dismissed"
        : (f.review_status ?? "pending");
      if (action === "send") {
        if (state !== "pending") skip("already sent or closed");
        else if (!f.case_id) skip("still preparing");
        else if (f.signer_ready === false && !canMarkSentWithoutEmail) skip("missing signer information");
        else eligible.push(f);
      } else if (action === "false_positive" || action === "do_not_pursue" || action === "second_hand") {
        if (f.dismissed_at) skip("already dismissed");
        else if (!(f.ip_id ?? ipId)) skip("no associated IP");
        else eligible.push(f);
      } else {
        if (state !== "takedown_sent") skip("not awaiting enforcement");
        else if (!(f.ip_id ?? ipId)) skip("no associated IP");
        else eligible.push(f);
      }
    }
    return { eligible, skipped };
  }

  function partitionResort() {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (r: string) => {
      skipped[r] = (skipped[r] ?? 0) + 1;
    };
    for (const f of displayFindings) {
      if (!selected.has(f.result_id)) continue;
      const state: CaseReviewStatus = f.dismissed_at
        ? "dismissed"
        : (f.review_status ?? "pending");
      if (state !== "pending") skip("already sent or closed");
      else if (!f.ready_for_review || !hasReviewAnalysis(f)) skip("still preparing");
      else eligible.push(f);
    }
    return { eligible, skipped };
  }

  async function runBatch(action: BatchAction) {
    const { eligible, skipped } = partitionSelection(action);
    const skipCounts: Record<string, number> = { ...skipped };
    let ok = 0;
    let failed = 0;
    if (eligible.length === 0) {
      setBatchResult(summarizeBatch(action, 0, skipCounts, 0));
      return;
    }
    setBatchProgress({ done: 0, total: eligible.length });
    const bump = (reason: string) => {
      skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
    };
    await runPool(
      eligible,
      async (f) => {
        try {
          if (action === "send") {
            const r = await autoSendTakedown(f.case_id as string);
            if (r.status === "sent") ok++;
            else if (canMarkSentWithoutEmail) {
              await markTakedownSentWithoutEmail(f.case_id as string);
              ok++;
            } else if (r.status === "needs_compose") bump("needs manual compose");
            else bump("email not configured");
          } else if (action === "false_positive" || action === "do_not_pursue" || action === "second_hand") {
            await dismissIpFinding((f.ip_id ?? ipId) as string, f.result_id, { reason: action });
            ok++;
          } else {
            await markIpFindingEnforced((f.ip_id ?? ipId) as string, f.result_id);
            ok++;
          }
        } catch {
          failed++;
        } finally {
          setBatchProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      },
      4,
    );
    setBatchProgress(null);
    setSelected(new Set());
    setBatchResult(summarizeBatch(action, ok, skipCounts, failed));
    onRefresh();
  }

  async function runResort(target: ResortTarget) {
    const { eligible, skipped } = partitionResort();
    if (eligible.length === 0) {
      setBatchResult(summarizeResort(target, 0, skipped, 0));
      return;
    }
    setBatchProgress({ done: 0, total: eligible.length });
    let failed = 0;
    try {
      await resortMonitoringFindings(eligible.map((f) => f.result_id), target);
    } catch {
      failed = eligible.length;
    } finally {
      setBatchProgress((p) => (p ? { ...p, done: p.total } : p));
    }
    setBatchProgress(null);
    setSelected(new Set());
    setBatchResult(summarizeResort(target, failed > 0 ? 0 : eligible.length, skipped, failed));
    onRefresh();
  }

  const [shortcutBusy, setShortcutBusy] = useState(false);

  const runShortcutAction = useCallback(async (action: "false_positive" | "do_not_pursue" | "send" | "second_hand") => {
    if (shortcutBusy) return;
    if (selected.size > 0) {
      setConfirmAction(action);
      return;
    }
    if (viewMode === "grid" && !effectiveActiveId) return;
    const activeFinding =
      (effectiveActiveId && displayFindings.find((f) => f.result_id === effectiveActiveId)) ||
      visibleActionableFindings[0];
    if (!activeFinding) return;

    const state: CaseReviewStatus = activeFinding.dismissed_at
      ? "dismissed"
      : (activeFinding.review_status ?? "pending");
    if (state !== "pending") return;

    setShortcutBusy(true);
    try {
      if (action === "send") {
        if (!activeFinding.case_id) throw new Error("Finding is still preparing.");
        const r = await autoSendTakedown(activeFinding.case_id);
        if (r.status === "sent") {
          rememberTakedownAction(activeFinding);
          advanceAfterAction(activeFinding.result_id);
          onRefresh();
          return;
        }
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(activeFinding.case_id);
          rememberTakedownAction(activeFinding);
          advanceAfterAction(activeFinding.result_id);
          onRefresh();
          return;
        }
        throw new Error(
          r.status === "needs_compose"
            ? "This takedown needs manual compose."
            : "Email is not configured.",
        );
      }
      await handleDismiss(activeFinding, action);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update finding");
    } finally {
      setShortcutBusy(false);
    }
  }, [
    advanceAfterAction,
    canMarkSentWithoutEmail,
    effectiveActiveId,
    displayFindings,
    handleDismiss,
    onRefresh,
    rememberTakedownAction,
    selected,
    shortcutBusy,
    visibleActionableFindings,
    viewMode,
  ]);

  useEffect(() => {
    function editableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (editableTarget(e.target)) return;
      const action =
        e.key === "0" ? "false_positive" :
        e.key === "1" ? "do_not_pursue" :
        e.key === "2" ? "send" :
        e.key === "3" ? "second_hand" :
        null;
      if (!action) return;
      e.preventDefault();
      void runShortcutAction(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runShortcutAction]);

  const allSelected = displayFindings.length > 0 && selected.size === displayFindings.length;
  const someSelected = selected.size > 0 && !allSelected;
  const activeCandidateLabel = filters.candidate_outcome
    ? CANDIDATE_OUTCOME_LABELS[filters.candidate_outcome]
    : "All candidates";

  return (
    <>
      {/* Secondary toolbar — priority + facet filters. Status lives in the
          tabs on the table; sorting lives in the sortable column headers. */}
      <div className="flex items-center justify-end gap-2 flex-wrap mb-3">
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
              viewMode === "table" ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
              viewMode === "grid" ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            Card
          </button>
        </div>
        <div className="relative">
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-stone-400">
            <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor" aria-hidden>
              <rect x="0.5" y="5" width="2.5" height="6" rx="0.5" />
              <rect x="4.75" y="3" width="2.5" height="8" rx="0.5" />
              <rect x="9" y="1" width="2.5" height="10" rx="0.5" />
            </svg>
          </span>
          <select
            value={filters.priority ?? "all"}
            onChange={(e) =>
              onFiltersChange({
                priority:
                  e.target.value === "all"
                    ? null
                    : (e.target.value as MonitoringPriorityBand),
              })
            }
            title="Filter by priority"
            className={`${FILTER_SELECT} pl-7`}
          >
            <option value="all">All priorities ({total})</option>
            <option value="high">High ({counts.high})</option>
            <option value="med">Medium ({counts.med})</option>
            <option value="low">Low ({counts.low})</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ipAware && facets.ips.length > 1 && (
            <select
              value={filters.ip_id ?? "all"}
              onChange={(e) =>
                onFiltersChange({
                  ip_id: e.target.value === "all" ? null : e.target.value,
                })
              }
              title="Filter by IP"
              className={FILTER_SELECT}
            >
              <option value="all">All IPs ({facets.ips.reduce((s, ip) => s + ip.n, 0)})</option>
              {facets.ips.map((ip) => (
                <option key={ip.ip_id} value={ip.ip_id}>
                  {ip.name ?? "—"} ({ip.n})
                </option>
              ))}
            </select>
          )}
          {facets.platforms.length > 1 && (
            <select
              value={filters.platform ?? "all"}
              onChange={(e) =>
                onFiltersChange({
                  platform: e.target.value === "all" ? null : e.target.value,
                })
              }
              title="Filter by platform"
              className={FILTER_SELECT}
            >
              <option value="all">All platforms ({facets.platforms.reduce((s, p) => s + p.n, 0)})</option>
              {facets.platforms.map((p) => (
                <option key={p.domain} value={p.domain}>
                  {p.domain} ({p.n})
                </option>
              ))}
            </select>
          )}
          {(filters.seller || (facets.sellers && facets.sellers.length > 0)) && (
            <select
              value={filters.seller ?? "all"}
              onChange={(e) =>
                onFiltersChange({
                  seller: e.target.value === "all" ? null : e.target.value,
                })
              }
              title="Filter by seller"
              className={FILTER_SELECT}
            >
              <option value="all">All sellers ({(facets.sellers ?? []).reduce((s, x) => s + x.n, 0)})</option>
              {/* Ensure the active filter is selectable even if facets dropped it
                  (e.g. tenant has many sellers and the active one fell off the
                  top-50 list, or the seller has zero current findings). */}
              {filters.seller && !(facets.sellers ?? []).some((x) => x.seller_name === filters.seller) && (
                <option value={filters.seller}>{filters.seller}</option>
              )}
              {(facets.sellers ?? []).map((s) => (
                <option key={s.seller_name} value={s.seller_name}>
                  {s.seller_name} ({s.n})
                </option>
              ))}
            </select>
          )}
          {(filters.status === "dismissed" || filters.dismissal_reason) && (
            <select
              value={filters.dismissal_reason ?? "all"}
              onChange={(e) =>
                onFiltersChange({
                  status: "dismissed",
                  dismissal_reason:
                    e.target.value === "all"
                      ? null
                      : (e.target.value as MonitoringDismissalReasonFilter),
                  show_dismissed: true,
                })
              }
              title="Filter dismissed findings by outcome"
              className={FILTER_SELECT}
            >
              <option value="all">All dismissed ({facets.statuses.dismissed ?? 0})</option>
              {Object.entries(DISMISSAL_REASON_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label} ({facets.dismissal_reasons?.[key] ?? 0})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => onFiltersChange({ candidate_outcome: null })}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
              !filters.candidate_outcome ? "bg-stone-900 text-white" : "text-stone-500 hover:text-stone-800"
            }`}
          >
            All ({facets.statuses.pending ?? 0})
          </button>
          {CANDIDATE_OUTCOME_ORDER.map((outcome) => (
            <button
              key={outcome}
              type="button"
              onClick={() => onFiltersChange({ candidate_outcome: outcome, status: "pending" })}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                filters.candidate_outcome === outcome
                  ? "bg-stone-900 text-white"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {CANDIDATE_OUTCOME_LABELS[outcome]} ({facets.candidate_outcomes?.[outcome] ?? 0})
            </button>
          ))}
        </div>
        <div className="text-[11px] font-semibold text-stone-500">
          {activeCandidateLabel}
          {selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </div>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
        <StatusTabs
          counts={facets.statuses}
          active={filters.status}
          onSelect={(s) =>
            onFiltersChange({
              status: s as MonitoringStatusFilter | null,
              dismissal_reason: s === "dismissed" ? filters.dismissal_reason : null,
              show_dismissed: s === "dismissed" ? true : filters.show_dismissed,
            })
          }
        />
        {lastAction && (
          <div className="px-4 py-2 border-b border-stone-100 bg-blue-50 text-xs text-blue-900 flex items-center justify-between gap-3">
            <span>
              {lastAction.label} applied.
            </span>
            <button
              type="button"
              disabled={undoing}
              onClick={undoLastAction}
              className="px-2.5 py-1 rounded-md bg-white border border-blue-200 text-blue-700 font-semibold hover:bg-blue-100 disabled:opacity-50"
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          </div>
        )}
        {selected.size > 0 && (
          <div className="px-4 py-2 border-b border-stone-100 bg-stone-50 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-stone-600">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {batchProgress ? (
                <span className="text-xs text-stone-500">
                  Working… ({batchProgress.done}/{batchProgress.total})
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("send")}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-500"
                  >
                    <ButtonWithShortcut label="Send takedowns" shortcut="2" dark />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("enforce")}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    Mark enforced
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("false_positive")}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                  >
                    <ButtonWithShortcut label="False positive" shortcut="0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("do_not_pursue")}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                  >
                    <ButtonWithShortcut label="Don't pursue" shortcut="1" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAction("second_hand")}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                  >
                    <ButtonWithShortcut label="Resale" shortcut="3" />
                  </button>
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value;
                      e.currentTarget.value = "";
                      if (!value) return;
                      void runResort(value as MonitoringCandidateOutcome);
                    }}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 bg-white hover:bg-stone-50"
                    title="Move selected findings to a candidate bucket"
                  >
                    <option value="" disabled>Move to…</option>
                    {CANDIDATE_OUTCOME_ORDER.filter((outcome) => outcome !== filters.candidate_outcome).map((outcome) => (
                      <option key={outcome} value={outcome}>
                        {CANDIDATE_OUTCOME_LABELS[outcome]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-stone-500 hover:text-stone-700"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        {batchResult && (
          <div className="px-5 py-2 border-b border-stone-100 bg-stone-50 text-xs text-stone-600 flex items-center justify-between gap-3">
            <span>{batchResult}</span>
            <button
              type="button"
              onClick={() => setBatchResult(null)}
              className="text-stone-400 hover:text-stone-600 font-semibold shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        {displayFindings.length === 0 ? (
          <div className="px-5 py-8 text-sm text-stone-400 text-center">
            {runInProgress
              ? "Waiting for the first findings to arrive…"
              : (
                <>
                  No findings match the current filters.
                </>
              )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="p-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {displayFindings.map((f) => {
              const rowDismissed = !!f.dismissed_at || dismissing.has(f.result_id);
              return (
                <GridFindingCard
                  key={f.result_id}
                  f={f}
                  ipId={f.ip_id ?? ipId}
                  showIp={ipAware}
                  active={effectiveActiveId === f.result_id}
                  selected={selected.has(f.result_id)}
                  isDismissed={rowDismissed}
                  isDismissing={dismissing.has(f.result_id) && !f.dismissed_at}
                  onSelect={() => toggleSelect(f.result_id)}
                  onActivate={() => setActiveId(f.result_id)}
                  onOpen={() => {
                    setActiveId(f.result_id);
                    setViewMode("table");
                  }}
                  onDismiss={(reason) => handleDismiss(f, reason)}
                  onActionComplete={() => advanceAfterAction(f.result_id)}
                  onTakedownSent={() => rememberTakedownAction(f)}
                  onUpdated={onRefresh}
                />
              );
            })}
          </div>
        ) : (
          /* Columnar findings table. Sortable headers drive the server sort;
             clicking a row still expands the inline comparison panel (only one
             row open at a time). */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/60 text-[10px] uppercase tracking-wide text-stone-400">
                  <th className="w-11 pl-3 pr-1 py-2 align-middle">
                    <label className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="Select all loaded findings"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 align-middle"
                      />
                    </label>
                  </th>
                  <SortHeader label="Rate" col="rate" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="w-14" />
                  <th className="py-2 px-2 font-semibold">Image</th>
                  <th className="py-2 px-2 font-semibold">Description</th>
                  <SortHeader label="Seller" col="seller" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="hidden md:table-cell" />
                  <SortHeader label="Platform" col="platform" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="hidden lg:table-cell" />
                  <th className="hidden sm:table-cell py-2 px-2 font-semibold">Status</th>
                  <SortHeader label="Price" col="price" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} align="right" className="hidden md:table-cell" />
                  <SortHeader label="Days" col="days" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {displayFindings.map((f) => {
                  const expanded = f.result_id === effectiveActiveId;
                  const rowDismissed = !!f.dismissed_at || dismissing.has(f.result_id);
                  return (
                    <Fragment key={f.result_id}>
                      <tr
                        onClick={() =>
                          setActiveId((prev) => (prev === f.result_id ? null : f.result_id))
                        }
                        className={`cursor-pointer transition-colors ${
                          expanded ? "bg-stone-50" : "hover:bg-stone-50"
                        } ${rowDismissed ? "opacity-50" : ""}`}
                      >
                        <td
                          className="w-11 pl-3 pr-1 align-middle"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-stone-100 cursor-pointer">
                            <input
                              type="checkbox"
                              aria-label="Select finding"
                              checked={selected.has(f.result_id)}
                              onChange={() => toggleSelect(f.result_id)}
                              className="h-4 w-4"
                            />
                          </label>
                        </td>
                        <FindingRow f={f} expanded={expanded} showIp={ipAware} />
                      </tr>
                      {expanded && (
                        <tr>
                          <td
                            colSpan={9}
                            className="bg-stone-50 border-t border-stone-100 px-4 py-3"
                          >
                            <FindingComparison
                              key={f.result_id}
                              f={f}
                              ipId={f.ip_id ?? ipId}
                              showIp={ipAware}
                              isDismissed={rowDismissed}
                              isDismissing={dismissing.has(f.result_id) && !f.dismissed_at}
                              onDismiss={(reason) => handleDismiss(f, reason)}
                              onActionComplete={() => advanceAfterAction(f.result_id)}
                              onTakedownSent={() => rememberTakedownAction(f)}
                              onUpdated={onRefresh}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* Pagination footer: Load more when the server says there's another
            page, end-of-list marker otherwise. Hidden when there are no rows. */}
        {displayFindings.length > 0 && (
          <div className="border-t border-stone-100 px-5 py-3 text-center">
            {nextCursor ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={onLoadMore}
                className="px-3 py-1.5 rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : (
              <span className="text-[11px] text-stone-400">End of list.</span>
            )}
          </div>
        )}
      </div>

      {confirmAction && (
        <BatchConfirmModal
          action={confirmAction}
          {...partitionSelection(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            const a = confirmAction;
            setConfirmAction(null);
            void runBatch(a);
          }}
        />
      )}
    </>
  );
}

/** Confirm dialog for a bulk action — previews how many of the selection will
 *  be acted on vs. skipped (and why) before running. */
function BatchConfirmModal({
  action,
  eligible,
  skipped,
  onConfirm,
  onCancel,
}: {
  action: BatchAction;
  eligible: IpReviewFinding[];
  skipped: Record<string, number>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = BATCH_META[action];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  return (
    <div
      onClick={onCancel}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 max-w-md w-full overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-900">{meta.label}</h3>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm text-stone-600">
          {eligible.length > 0 ? (
            <p>
              {meta.gerund}{" "}
              <span className="font-semibold text-stone-900">
                {eligible.length} finding{eligible.length === 1 ? "" : "s"}
              </span>
              {action === "send"
                ? ". Each uses the suggested route + pre-filled draft for its platform."
                : "."}
            </p>
          ) : (
            <p>None of the selected findings are eligible for this action.</p>
          )}
          {skipTotal > 0 && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
              <p className="font-semibold text-stone-700">
                Skipping {skipTotal}:
              </p>
              <ul className="mt-1 space-y-0.5 text-stone-500">
                {Object.entries(skipped).map(([reason, n]) => (
                  <li key={reason}>
                    {n} {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={eligible.length === 0}
            className="px-3 py-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-xs font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {meta.label}
          </button>
        </div>
      </div>
    </div>
  );
}

// Sortable table columns → their asc/desc server sort modes. Clicking a header
// applies `desc` first, then toggles. `score_desc` (the default) mirrors the
// backend ORDER BY (priority desc, found_at desc).
type SortCol = "rate" | "seller" | "platform" | "price" | "days";
const SORT_COLS: Record<SortCol, { asc: MonitoringSortMode; desc: MonitoringSortMode }> = {
  rate: { desc: "score_desc", asc: "score_asc" },
  seller: { desc: "seller_desc", asc: "seller_asc" },
  platform: { desc: "platform_desc", asc: "platform_asc" },
  price: { desc: "price_desc", asc: "price_asc" },
  days: { desc: "found_desc", asc: "found_asc" },
};

// Slim status pipeline pills. `null` is rendered as "pending".
const STATUS_FILTERS: Array<{ key: string; label: string }> = [
  { key: "pending", label: "To triage" },
  { key: "takedown_sent", label: "Sent" },
  { key: "enforced", label: "Enforced" },
  { key: "dismissed", label: "Dismissed" },
];

function statusBadge(s: CaseReviewStatus | null | undefined) {
  const status = (s ?? "pending") as CaseReviewStatus | "pending";
  switch (status) {
    case "takedown_sent":
      return { label: "Takedown sent", cls: "bg-amber-100 text-amber-700" };
    case "enforced":
      return { label: "Enforced", cls: "bg-emerald-100 text-emerald-700" };
    case "dismissed":
      return { label: "Dismissed", cls: "bg-stone-200 text-stone-600" };
    case "pending":
    default:
      return { label: "To triage", cls: "bg-stone-100 text-stone-700" };
  }
}

function findingStatusBadge(f: IpReviewFinding) {
  if (f.dismissed_at) return dismissalBadge(f.dismissal_reason);
  if ((!f.ready_for_review || !hasReviewAnalysis(f)) && (f.review_status ?? "pending") === "pending") {
    return { label: "Preparing", cls: "bg-stone-100 text-stone-500" };
  }
  return statusBadge(f.review_status);
}

function dismissalBadge(reason: string | null) {
  switch (reason) {
    case "false_positive":
      return { label: "false positive", cls: "bg-stone-200 text-stone-600" };
    case "do_not_pursue":
      return { label: "don't pursue", cls: "bg-sky-100 text-sky-700" };
    case "second_hand":
    case "resale":
      return { label: "resale", cls: "bg-purple-100 text-purple-700" };
    case "licensed":
      return { label: "licensed", cls: "bg-emerald-100 text-emerald-700" };
    case "allowed_product":
      return { label: "allowed product", cls: "bg-teal-100 text-teal-700" };
    default:
      return reason?.startsWith("dead_link")
        ? { label: "dead link", cls: "bg-orange-100 text-orange-700" }
        : { label: "dismissed", cls: "bg-stone-200 text-stone-600" };
  }
}

// Status pipeline as connected folder tabs along the top of the results card.
// Tabs sit on a tinted strip; the active tab is "raised" — white with rounded
// top corners and an open bottom edge (-mb-px erases the baseline under it) so
// it reads as physically continuous with the white panel below. Inactive tabs
// stay recessed on the strip, so the row clearly looks like clickable tabs.
function StatusTabs({
  counts,
  active,
  onSelect,
}: {
  counts: Record<string, number>;
  active: string | null;
  onSelect: (s: string | null) => void;
}) {
  const total = counts.pending + counts.takedown_sent + counts.enforced;
  const tab = (key: string | null, label: string, n: number) => {
    const isActive = active === key;
    return (
      <button
        key={key ?? "all"}
        type="button"
        onClick={() => onSelect(key)}
        aria-pressed={isActive}
        className={`relative -mb-px rounded-t-lg border border-stone-200 text-[13px] font-semibold whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-inset ${
          isActive
            ? "z-10 bg-white text-stone-900 border-b-white px-4 py-2.5"
            : "bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-800 px-4 py-2"
        }`}
      >
        {label}
        <span
          className={`ml-1.5 text-[11px] font-bold tabular-nums ${
            isActive ? "text-stone-500" : "text-stone-400"
          }`}
        >
          {n}
        </span>
      </button>
    );
  };
  return (
    <div className="flex items-end gap-1.5 px-3 pt-2 border-b border-stone-200 bg-stone-50">
      {tab(null, "All", total)}
      {STATUS_FILTERS.map((s) => tab(s.key, s.label, counts[s.key] ?? 0))}
    </div>
  );
}

// Sortable column header. First click sorts desc, subsequent clicks toggle.
// A subtle ↕ marks sortable columns; the active column shows the direction.
function SortHeader({
  label,
  col,
  sort,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  col: SortCol;
  sort: MonitoringSortMode;
  onSort: (next: MonitoringSortMode) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const { asc, desc } = SORT_COLS[col];
  const active = sort === asc || sort === desc;
  const isAsc = sort === asc;
  const next = sort === desc ? asc : desc;
  return (
    <th className={`py-2 px-2 font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-stone-700 ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-stone-700" : ""}`}
      >
        <span>{label}</span>
        <span className={`text-[8px] leading-none ${active ? "opacity-100" : "opacity-30"}`} aria-hidden>
          {active ? (isAsc ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

// Short, highlighted label for the scrape method that surfaced a finding.
function methodChip(method: string): { label: string; cls: string } {
  switch (method) {
    case "nodriver_direct":
      return { label: "direct", cls: "bg-violet-100 text-violet-700" };
    case "serper_google":
      return { label: "google", cls: "bg-blue-100 text-blue-700" };
    case "brave_sidestep":
      return { label: "brave", cls: "bg-teal-100 text-teal-700" };
    case "scrapfly_direct":
      return { label: "scrapfly", cls: "bg-orange-100 text-orange-700" };
    default:
      return { label: method, cls: "bg-stone-100 text-stone-600" };
  }
}

// Why this finding fired: visual similarity, IP-name mention in the
// listing title, or both. Different dimension from `methodChip` (which
// scrape strategy surfaced the page).
function matchMethodChip(
  method: string,
): { label: string; cls: string; title: string } {
  switch (method) {
    case "visual":
      return {
        label: "visual",
        cls: "bg-sky-100 text-sky-700",
        title: "Image embedding matched a protected IP",
      };
    case "name":
      return {
        label: "name",
        cls: "bg-amber-100 text-amber-800",
        title: "IP name found in the listing title",
      };
    case "both":
      return {
        label: "name + visual",
        cls: "bg-emerald-100 text-emerald-700",
        title: "IP name in the title AND image visually similar",
      };
    default:
      return {
        label: method,
        cls: "bg-stone-100 text-stone-600",
        title: method,
      };
  }
}

/** Modern "detected region" overlay: four rounded corner brackets in an
 *  indigo→fuchsia gradient with a soft glow, plus a near-invisible fill tint
 *  inside the box. The brackets stay short relative to the bbox so they
 *  read as focal markers (not a frame), and the gradient + glow lift the
 *  feel from a "red rectangle" alarm to a quiet annotation. */
function BboxOverlay({
  naturalW,
  naturalH,
  bbox,
}: {
  naturalW: number;
  naturalH: number;
  bbox: [number, number, number, number];
}) {
  const [x, y, w, h] = bbox;
  const longSide = Math.max(naturalW, naturalH);
  // Scale visuals to the image's pixel space so they read the same regardless
  // of how the SVG is letterboxed by the surrounding container.
  const sw = Math.max(3, longSide / 220);
  const radius = Math.max(6, longSide / 120);
  const armLen = Math.max(Math.min(w, h) * 0.22, longSide / 35);
  const arm = Math.min(armLen, Math.min(w, h) / 2.2);
  const x2 = x + w;
  const y2 = y + h;
  // Path per corner: arm in along the long edge → quarter-arc → arm in along
  // the short edge. Stroke-linecap=round softens the cut ends.
  const corners = [
    // top-left
    `M ${x} ${y + arm} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + arm} ${y}`,
    // top-right
    `M ${x2 - arm} ${y} L ${x2 - radius} ${y} Q ${x2} ${y} ${x2} ${y + radius} L ${x2} ${y + arm}`,
    // bottom-right
    `M ${x2} ${y2 - arm} L ${x2} ${y2 - radius} Q ${x2} ${y2} ${x2 - radius} ${y2} L ${x2 - arm} ${y2}`,
    // bottom-left
    `M ${x + arm} ${y2} L ${x + radius} ${y2} Q ${x} ${y2} ${x} ${y2 - radius} L ${x} ${y2 - arm}`,
  ];
  return (
    <svg
      viewBox={`0 0 ${naturalW} ${naturalH}`}
      className="absolute inset-0 w-full h-full pointer-events-none"
    >
      <defs>
        <linearGradient id="bbox-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="60%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#ec4899" />
        </linearGradient>
        <filter
          id="bbox-glow"
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur stdDeviation={sw * 1.2} result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      {/* Quiet area tint — same gradient, near-invisible. Rounded so the
          fill never escapes the corner brackets. */}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill="url(#bbox-grad)"
        fillOpacity={0.06}
      />
      <g
        stroke="url(#bbox-grad)"
        strokeWidth={sw}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#bbox-glow)"
      >
        {corners.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  );
}

/** Hero-with-thumbstrip carousel for the listing's product photos. When
 *  `gallery_scores` is present (worker scored each photo against the IP), the
 *  best-matched image is the default hero, marked MATCHED, and each thumb
 *  shows its similarity %. Falls back to discovery `image_url` only when the
 *  gallery is empty. The page screenshot is rendered separately below. */
function ListingCarousel({
  f,
  ipId,
  compact = false,
}: {
  f: IpReviewFinding;
  ipId?: string;
  compact?: boolean;
}) {
  const scored = useMemo(() => f.gallery_scores ?? [], [f.gallery_scores]);
  const scoredByUrl = new Map(scored.map((s) => [s.url, s.similarity]));
  // Per-URL bbox in gallery-image pixel coords from the worker's keypoint
  // localizer. Drawn as an SVG overlay on the hero so the reviewer can see
  // where on the photo the IP (logo/label) was found.
  const bboxByUrl = new Map(
    scored.filter((s) => s.bbox).map((s) => [s.url, s.bbox!]),
  );
  // Order: page screenshot first (when captured — wide page context the lawyer
  // anchors on), then scored gallery (best-matched first), then any unscored
  // gallery URL, then the discovery thumbnail. Dedupe by URL.
  const urls = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (u: string | null | undefined) => {
      if (u && !seen.has(u)) {
        out.push(u);
        seen.add(u);
      }
    };
    add(f.screenshot_url);
    for (const s of scored) add(s.url);
    for (const u of f.image_urls ?? []) add(u);
    add(f.image_url);
    return out;
  }, [f.screenshot_url, scored, f.image_urls, f.image_url]);

  const [idx, setIdx] = useState(0);
  const [allowingUrl, setAllowingUrl] = useState<string | null>(null);
  const [allowedUrls, setAllowedUrls] = useState<Set<string>>(new Set());
  // Natural dimensions of the active hero image — needed so the SVG bbox
  // overlay (in pixel coords) lines up under the same `object-contain`
  // letterboxing as the <img>. Keyed by URL so switching slides invalidates a
  // stale measurement during render (no setState-in-effect). Switching finding
  // remounts the whole panel via the `key` on <FindingComparison>, so `idx`
  // resets to 0 on its own — no reset effect needed.
  const [natural, setNatural] = useState<{ url: string; w: number; h: number } | null>(null);

  const active = urls[Math.min(idx, urls.length - 1)];

  if (urls.length === 0) {
    return (
      <div className="w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg flex items-center justify-center text-xs text-stone-400">
        No image
      </div>
    );
  }

  const activeSim = scoredByUrl.get(active);
  const activeBbox = bboxByUrl.get(active);
  const bestUrl = scored[0]?.url;
  // Only honor the measurement when it belongs to the current slide.
  const activeNatural = natural?.url === active ? natural : null;
  const canAllowImage = !!ipId && !!active && active !== f.screenshot_url && !f.dismissed_at;
  const activeAllowed = active ? allowedUrls.has(active) : false;

  async function allowImageUrl(e: MouseEvent, imageUrl: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!ipId || !imageUrl || allowingUrl) return;
    setAllowingUrl(imageUrl);
    try {
      await allowIpFindingProductImage(ipId, f.result_id, { image_url: imageUrl });
      setAllowedUrls((prev) => new Set(prev).add(imageUrl));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to allow product image");
    } finally {
      setAllowingUrl(null);
    }
  }

  return (
    <div className="space-y-2">
      {/* Hero */}
      <a
        href={active}
        target="_blank"
        rel="noreferrer"
        title="Open full size"
        className={`block w-full aspect-square bg-stone-50 border border-stone-200 rounded-lg overflow-hidden relative ${
          compact ? "max-h-[300px]" : "max-h-[480px]"
        }`}
      >
        <img
          src={active}
          alt=""
          className="w-full h-full object-contain"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNatural({ url: active, w: img.naturalWidth, h: img.naturalHeight });
          }}
        />
        {activeBbox && activeNatural && (
          // SVG laid over the container with its viewBox = the image's natural
          // pixel space. Default preserveAspectRatio ("xMidYMid meet") matches
          // <img>'s `object-contain` letterboxing, so the overlay lands on the
          // same pixels regardless of the container's aspect ratio.
          <BboxOverlay
            naturalW={activeNatural.w}
            naturalH={activeNatural.h}
            bbox={activeBbox}
          />
        )}
        {activeSim != null && (
          <span
            className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-bold ${
              active === bestUrl
                ? "bg-emerald-600 text-white"
                : "bg-stone-900/80 text-white"
            }`}
            title={`Similarity to the protected IP: ${Math.round(activeSim * 100)}%`}
          >
            {active === bestUrl ? "MATCHED · " : ""}
            {Math.round(activeSim * 100)}%
          </span>
        )}
        {urls.length > 1 && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-900/70 text-white">
            {idx + 1} / {urls.length}
          </span>
        )}
        {canAllowImage && (
          <button
            type="button"
            onClick={(e) => allowImageUrl(e, active)}
            disabled={!!allowingUrl || activeAllowed}
            title="Allow this product image — future similar images for this IP will be ignored"
            className={`absolute bottom-2 left-2 rounded-md font-semibold shadow-sm disabled:opacity-60 ${
              compact
                ? "px-1.5 py-1 text-[10px] bg-white/95 text-teal-700"
                : "px-2.5 py-1.5 text-xs bg-white/95 text-teal-700 hover:bg-teal-50"
            }`}
          >
            {allowingUrl === active ? "Queuing…" : activeAllowed ? "Ignored going forward" : compact ? "Allow" : "Allow this image"}
          </button>
        )}
      </a>
      {allowedUrls.size > 0 && (
        <div className="rounded-md border border-teal-200 bg-teal-50 px-2.5 py-2 text-xs font-medium text-teal-800">
          Similar products will be ignored going forward.
        </div>
      )}

      {/* Thumb strip — horizontal scroll on overflow, matched thumb framed emerald. */}
      {urls.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {urls.map((u, i) => {
            const sim = scoredByUrl.get(u);
            const isActive = i === idx;
            const isBest = u === bestUrl;
            return (
              <button
                key={`${u}-${i}`}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  setIdx(i);
                }}
                className={`relative shrink-0 ${compact ? "w-11 h-11" : "w-14 h-14"} rounded overflow-hidden border-2 transition-colors ${
                  isActive
                    ? "border-stone-900"
                    : isBest
                      ? "border-emerald-500"
                      : "border-stone-200 hover:border-stone-400"
                }`}
                title={sim != null ? `${Math.round(sim * 100)}% match` : undefined}
              >
                <img src={u} alt="" className="w-full h-full object-cover" loading="lazy" />
                {sim != null && (
                  <span className="absolute bottom-0 right-0 px-1 py-px bg-stone-900/80 text-white text-[9px] font-bold leading-tight">
                    {Math.round(sim * 100)}
                  </span>
                )}
                {ipId && u !== f.screenshot_url && !f.dismissed_at && (
                  <span
                    onClick={(e) => allowImageUrl(e, u)}
                    className={`absolute top-0 left-0 px-1 py-px text-[9px] font-bold leading-tight rounded-br ${
                      allowedUrls.has(u)
                        ? "bg-teal-600 text-white"
                        : "bg-white/90 text-teal-700 hover:bg-teal-50"
                    }`}
                    title="Allow this individual product image"
                  >
                    {allowingUrl === u ? "..." : allowedUrls.has(u) ? "OK" : "Allow"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Top matched gallery image (highest similarity). Falls back to the
// discovery image when the gallery wasn't enriched.
function topImageUrl(f: IpReviewFinding): string | null {
  const top = f.gallery_scores?.[0]?.url;
  return top ?? f.image_url ?? null;
}

// Fallback quantity when the listing didn't expose stock — most marketplaces
// hide it, so a flat 10 keeps the KPI honest as a rough upper bound rather
// than the per-listing `1` that systematically under-counts.
const QTY_FALLBACK = 10;

// Per-row "Estimated unlicensed market" = USD unit price × quantity. Uses the
// server-converted `price_value_usd` so every row reads in one currency (USD),
// regardless of the listing's native currency. Returns null when no price.
function estimatedMarket(
  f: IpReviewFinding,
): { value: number; currency: string } | null {
  // Coerce: Postgres NUMERIC arrives as a string when not cast to float8.
  const price = f.price_value_usd == null ? null : Number(f.price_value_usd);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const qty = f.quantity_available && f.quantity_available > 0
    ? f.quantity_available
    : QTY_FALLBACK;
  return { value: price * qty, currency: "USD" };
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function detailValue(details: Record<string, unknown> | null, names: string[]) {
  if (!details) return null;
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(details)) {
    if (wanted.has(key.toLowerCase()) && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

function inferCondition(f: IpReviewFinding): "new" | "second hand" | null {
  if (f.marketplace_condition === "new") return "new";
  if (f.marketplace_condition === "second_hand") return "second hand";
  if (f.dismissal_reason === "second_hand" || f.dismissal_reason === "resale") return "second hand";
  const detail = detailValue(f.item_details, ["condition", "item condition"]);
  const haystack = [
    detail,
    f.license_status,
    f.description_risk_breakdown ? JSON.stringify(f.description_risk_breakdown) : null,
    f.description_summary,
    f.description_full,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(pre[-\s]?owned|pre[-\s]?loved|used|second[-\s]?hand|vintage|resale)\b/.test(haystack)) {
    return "second hand";
  }
  if (/\b(new|brand new|unused|made to order)\b/.test(haystack)) return "new";
  return null;
}

function suggestionMeta(outcome: IpReviewFinding["suggested_review_outcome"]) {
  switch (outcome) {
    case "false_positive":
      return { label: "False positive", shortcut: "0", cls: "bg-stone-800 text-white" };
    case "do_not_pursue":
      return { label: "Don't pursue", shortcut: "1", cls: "bg-sky-700 text-white" };
    case "takedown":
      return { label: "Takedown", shortcut: "2", cls: "bg-blue-700 text-white" };
    case "second_hand":
      return { label: "Resale", shortcut: "3", cls: "bg-purple-700 text-white" };
    default:
      return null;
  }
}

function suggestionTitle(f: IpReviewFinding, shortcut: string) {
  return [
    f.suggested_review_reason,
    `Shortcut ${shortcut}`,
  ].filter(Boolean).join(" · ");
}

function compactListingTitle(f: IpReviewFinding) {
  if (f.listing_title?.trim()) return f.listing_title.trim();
  try {
    const u = new URL(f.page_url);
    return `${u.hostname.replace(/^www\./, "")} listing`;
  } catch {
    return "Marketplace listing";
  }
}

function findingChips(f: IpReviewFinding, showIp?: boolean) {
  const priceUsd =
    f.price_value_usd != null ? formatMoney(Number(f.price_value_usd), "USD") : null;
  const priceText = priceUsd ?? f.price ?? null;
  const category =
    detailValue(f.item_details, ["category", "type", "department"]) ||
    f.infringement_type ||
    null;
  return [
    showIp && f.ip_name ? f.ip_name : null,
    category,
    inferCondition(f),
    priceText,
    f.domain,
  ].filter(Boolean) as string[];
}

function GridFindingCard({
  f,
  ipId,
  showIp,
  active,
  selected,
  isDismissed,
  isDismissing,
  onSelect,
  onActivate,
  onOpen,
  onDismiss,
  onActionComplete,
  onTakedownSent,
  onUpdated,
}: {
  f: IpReviewFinding;
  ipId?: string;
  showIp?: boolean;
  active: boolean;
  selected: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onSelect: () => void;
  onActivate: () => void;
  onOpen: () => void;
  onDismiss: (reason: MonitoringReviewOutcome) => void;
  onActionComplete: () => void;
  onTakedownSent: () => void;
  onUpdated: () => void;
}) {
  const sb = findingStatusBadge(f);
  const suggestion = suggestionMeta(f.suggested_review_outcome);
  const chips = findingChips(f, showIp);
  const detailCount = [
    f.listing_title,
    f.description_summary,
    f.description_full,
    f.match_explanation,
    f.infringement_reasoning,
    f.seller_name,
    f.price,
  ].filter(Boolean).length;
  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden flex flex-col transition-colors ${
        active ? "border-blue-500 ring-2 ring-blue-100" : "border-stone-200"
      } ${isDismissed ? "opacity-60" : ""}`}
    >
      <div className="relative p-3 pb-0">
        <ListingCarousel f={f} ipId={ipId} compact />
        <label className="absolute left-5 top-5 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/90 border border-stone-200 shadow-sm cursor-pointer">
          <input
            type="checkbox"
            aria-label="Select finding"
            checked={selected}
            onChange={onSelect}
            className="h-4 w-4"
          />
        </label>
        <span className="absolute right-5 top-5 rounded-md bg-white/90 px-2 py-1 text-[11px] font-bold text-stone-800 shadow-sm">
          {f.enforcement_priority.toFixed(2)}
        </span>
        {active && (
          <span className="absolute left-16 top-5 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-bold uppercase text-white shadow-sm">
            Active
          </span>
        )}
      </div>
      <div className="p-3 space-y-2 flex flex-col grow">
        <div className="flex items-center gap-1 flex-wrap min-h-6">
          {suggestion && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${suggestion.cls}`}
              title={suggestionTitle(f, suggestion.shortcut)}
            >
              {suggestion.label}
            </span>
          )}
          {f.manual_candidate_outcome && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {chips.slice(0, 5).map((chip) => (
            <span
              key={chip}
              className="max-w-[9rem] truncate px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-semibold"
              title={chip}
            >
              {chip}
            </span>
          ))}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${sb.cls}`}>
            {sb.label}
          </span>
        </div>
        <div className="text-[11px] text-stone-500 truncate">
          {f.seller_name || "Unknown seller"} · found {formatAgo(f.found_at) ?? "—"}
        </div>
        <details className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
          <summary className="cursor-pointer select-none font-semibold text-stone-700">
            Details{detailCount > 0 ? ` (${detailCount})` : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {f.listing_title && (
              <p>
                <span className="font-semibold text-stone-500">Title: </span>
                <span className="text-stone-800">{f.listing_title}</span>
              </p>
            )}
            {f.description_summary && (
              <p>
                <span className="font-semibold text-stone-500">Summary: </span>
                {f.description_summary}
              </p>
            )}
            {f.description_full && f.description_full !== f.description_summary && (
              <p className="whitespace-pre-wrap">
                <span className="font-semibold text-stone-500">Description: </span>
                {f.description_full}
              </p>
            )}
            {(f.match_explanation || f.infringement_reasoning || f.vlm_reasoning) && (
              <p>
                <span className="font-semibold text-stone-500">Why flagged: </span>
                {f.match_explanation || f.infringement_reasoning || f.vlm_reasoning}
              </p>
            )}
            {(f.seller_name || f.seller_url || f.price || f.location) && (
              <p className="text-stone-500">
                {[f.seller_name, f.price, f.location].filter(Boolean).join(" · ")}
                {f.seller_url && (
                  <>
                    {" · "}
                    <a href={f.seller_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                      seller
                    </a>
                  </>
                )}
              </p>
            )}
            <a href={f.page_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
              Open listing
            </a>
            {detailCount === 0 && (
              <p className="italic text-stone-400">Listing details still being analysed.</p>
            )}
          </div>
        </details>
        <div className="grow" />
        {active ? (
          <FindingActions
            f={f}
            ipId={ipId}
            canLicense={!!ipId && !!(f.seller_name || f.seller_url)}
            isDismissed={isDismissed}
            isDismissing={isDismissing}
            onDismiss={onDismiss}
            onActionComplete={onActionComplete}
            onTakedownSent={onTakedownSent}
            onUpdated={onUpdated}
            compact
          />
        ) : (
          <button
            type="button"
            onClick={onActivate}
            className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-[12px] font-semibold text-stone-700 hover:bg-stone-50"
          >
            Review this card
          </button>
        )}
        <div className="flex items-center justify-between gap-2">
          {active ? (
            <span className="text-[11px] font-semibold text-blue-700">
              Shortcuts apply to this card
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-stone-400">
              Activate to use shortcuts
            </span>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="text-[11px] font-semibold text-stone-400 hover:text-blue-700"
          >
            Open full review
          </button>
        </div>
      </div>
    </div>
  );
}

/** Table cells (columns 2-9) for one finding. The enclosing <tr> owns the
 *  click-to-expand + selection styling. Columns:
 *  rate · image · description · seller · platform · status · price · days.
 *  Seller/platform/status/price progressively hide on narrower viewports;
 *  seller·platform then fold into the description cell's secondary line. */
function FindingRow({
  f,
  expanded,
  showIp,
}: {
  f: IpReviewFinding;
  expanded: boolean;
  showIp?: boolean;
}) {
  const priorityBg =
    f.enforcement_priority >= 0.75
      ? "bg-red-100 text-red-700"
      : f.enforcement_priority >= 0.5
        ? "bg-amber-100 text-amber-700"
        : "bg-stone-100 text-stone-600";
  const thumb = topImageUrl(f);
  const market = estimatedMarket(f);
  const sb = findingStatusBadge(f);
  const foundAgo = formatAgo(f.found_at) ?? "—";
  const updatedAgo = formatAgo(f.last_checked_at);
  const title = compactListingTitle(f);
  const sellerLine = f.seller_name || "—";
  // Show the USD-normalized price so the Price column reads monotonically when
  // sorted (the sort key is USD across mixed currencies). Native price + est.
  // market live in the tooltip.
  const priceUsd =
    f.price_value_usd != null ? formatMoney(Number(f.price_value_usd), "USD") : null;
  const priceText = priceUsd ?? f.price ?? null;
  const chips = findingChips(f, showIp);
  const suggestion = suggestionMeta(f.suggested_review_outcome);

  return (
    <>
      {/* Rate — caret + colored priority pill. */}
      <td className="py-2 px-2 align-middle whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`text-stone-400 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden
          >
            ▸
          </span>
          <span
            className={`text-[11px] font-bold tabular-nums rounded px-1.5 py-0.5 ${priorityBg}`}
            title="Enforcement priority"
          >
            {f.enforcement_priority.toFixed(2)}
          </span>
        </span>
      </td>

      {/* Image. */}
      <td className="py-2 px-2 align-middle">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="w-14 h-14 rounded-md object-cover border border-stone-200"
          />
        ) : (
          <div className="w-14 h-14 rounded-md bg-stone-100" />
        )}
      </td>

      {/* Description — title + IP chip; folds seller·platform in on small screens. */}
      <td className="py-2 px-2 align-middle max-w-0 w-full">
        <div className="min-w-0">
          <span className="block text-[13px] font-semibold text-stone-900 truncate">
            {title}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            {suggestion && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${suggestion.cls}`}
                title={suggestionTitle(f, suggestion.shortcut)}
              >
                {suggestion.label}
              </span>
            )}
            {f.manual_candidate_outcome && (
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700"
                title="Manually moved during grouped triage"
              >
                Moved
              </span>
            )}
            {chips.slice(0, 5).map((chip) => (
              <span
                key={chip}
                className="max-w-[10rem] truncate px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[10px] font-semibold"
                title={chip}
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        <div className="md:hidden text-[11px] text-stone-500 truncate">
          <span className="font-medium">{sellerLine}</span>
          <span className="mx-1.5 text-stone-300">·</span>
          <span>{f.domain}</span>
        </div>
      </td>

      {/* Seller. */}
      <td className="hidden md:table-cell py-2 px-2 align-middle max-w-[10rem] truncate text-[12px] text-stone-600">
        {sellerLine}
      </td>

      {/* Platform. */}
      <td className="hidden lg:table-cell py-2 px-2 align-middle whitespace-nowrap text-[12px] text-stone-600">
        {f.domain}
      </td>

      {/* Status. */}
      <td className="hidden sm:table-cell py-2 px-2 align-middle">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${sb.cls}`}
        >
          {sb.label}
        </span>
      </td>

      {/* Price — listing price; tooltip carries the estimated unlicensed market. */}
      <td
        className="hidden md:table-cell py-2 px-2 align-middle text-right whitespace-nowrap text-[12px] font-semibold tabular-nums text-stone-800"
        title={
          [
            f.price ? `Listed ${f.price}` : null,
            market
              ? `Est. market ${formatMoney(market.value, market.currency)} (unit × qty ${f.quantity_available && f.quantity_available > 0 ? f.quantity_available : QTY_FALLBACK})`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No structured price yet"
        }
      >
        {priceText ?? <span className="text-stone-300">—</span>}
      </td>

      {/* Days — found relative; tooltip carries last-checked. */}
      <td
        className="py-2 px-2 align-middle text-right whitespace-nowrap text-[11px] text-stone-500 tabular-nums"
        title={updatedAgo ? `Updated ${updatedAgo}` : undefined}
      >
        {foundAgo}
      </td>
    </>
  );
}

// Center-stage comparison: the protected IP reference next to the marketplace
// listing image, large and object-contained so a reviewer can adjudicate
// infringement at a glance — mirroring the clearance comparison UX.
function FindingComparison({
  f,
  ipId,
  showIp,
  isDismissed,
  isDismissing,
  onDismiss,
  onActionComplete,
  onTakedownSent,
  onUpdated,
}: {
  f: IpReviewFinding;
  /** Resolved IP id for this finding (`f.ip_id ?? boardIpId`). */
  ipId?: string;
  /** Render the IP-name chip on the comparison header. */
  showIp?: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onDismiss: (reason: MonitoringReviewOutcome) => void;
  onActionComplete: () => void;
  onTakedownSent: () => void;
  onUpdated: () => void;
}) {
  const priorityCls =
    f.enforcement_priority >= 0.75
      ? "text-red-700"
      : f.enforcement_priority >= 0.5
        ? "text-amber-700"
        : "text-stone-700";
  const canLicense = !!ipId && (!!f.seller_name || !!f.seller_url);
  // Enrichment hit a reCAPTCHA / bot-wall — the screenshot is the challenge
  // page, not the listing.
  const isChallenge = /recaptcha|bot-wall/i.test(f.enrichment_error || "");

  const sb = findingStatusBadge(f);
  const suggestion = suggestionMeta(f.suggested_review_outcome);

  return (
    // Cap + center the content so the panel doesn't sprawl edge-to-edge on wide
    // monitors (which left short text lines + the comment box floating in white).
    <div className="space-y-2.5 max-w-6xl mx-auto">
      {/* Top meta strip — priority · status · IP · source · key flags on the
          left; the state-driven action group pinned right. Merges what used to
          be a header row + a separate priority/method chip strip. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap">
          <span className={`text-base font-bold ${priorityCls}`}>{f.enforcement_priority.toFixed(2)}</span>
          <span className="text-[9px] uppercase tracking-wider text-stone-400">priority</span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sb.cls}`}>
            {sb.label}
          </span>
          {suggestion && (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${suggestion.cls}`}
              title={suggestionTitle(f, suggestion.shortcut)}
            >
              {suggestion.label}
            </span>
          )}
          {f.manual_candidate_outcome && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {showIp && f.ip_name && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
              {f.ip_name}
            </span>
          )}
          <span className="text-[11px] text-stone-500 truncate">
            <span className="uppercase tracking-wide text-stone-400">on </span>
            <span className="font-semibold text-stone-700">{f.domain}</span>
          </span>
          {isChallenge && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-100 text-red-700"
              title="Listing-page enrichment was blocked by a bot-wall / reCAPTCHA — details deferred to a later run"
            >
              challenge
            </span>
          )}
          {isDismissed && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${dismissalBadge(f.dismissal_reason).cls}`}>
              {dismissalBadge(f.dismissal_reason).label}
            </span>
          )}
        </div>
      </div>

      {/* Two-column body: bounded image left, enrichment data right. Collapses
          to a single column below lg. */}
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-4 gap-y-3 lg:items-stretch">
        {/* LEFT — single image carousel. Page screenshot is the first slide
            when captured; product photos follow (best-matched marked).
            min-w-0 so the thumb strip scrolls instead of widening the track. */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <ListingCarousel f={f} ipId={ipId} />
        </div>

        {/* RIGHT — enrichment data. */}
        <div className="flex flex-col space-y-2.5 min-w-0">

      {/* Listing context (from VLM enrichment) — what's on sale, type, where */}
      {f.listing_title && (
        <h3 className="text-base font-bold text-stone-900 leading-snug">{f.listing_title}</h3>
      )}

      <div className="flex items-center gap-2 flex-wrap text-sm">
        {(f.price_value_usd != null || f.price) && (
          <span className="px-1.5 py-0.5 rounded bg-stone-900 text-white font-semibold">
            {f.price_value_usd != null ? formatMoney(Number(f.price_value_usd), "USD") : f.price}
            {f.price_value_usd != null && f.price && (
              <span className="ml-1 font-normal text-stone-400">({f.price})</span>
            )}
          </span>
        )}
        {f.shipping_price && (
          <span className="text-stone-500" title="Shipping">+ {f.shipping_price}</span>
        )}
        {f.infringement_type && (
          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 uppercase tracking-wide font-semibold">
            {f.infringement_type.replace(/_/g, " ")}
          </span>
        )}
        {(f.country || f.location) && (
          <span
            className="text-stone-500"
            title={f.location && f.country && f.location !== f.country ? f.location : undefined}
          >
            📍 {f.country || f.location}
          </span>
        )}
        {f.license_status && (
          <span
            className={`px-1.5 py-0.5 rounded font-semibold ${
              f.license_status === "likely_licensed"
                ? "bg-emerald-100 text-emerald-700"
                : f.license_status === "likely_unlicensed"
                  ? "bg-red-100 text-red-700"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            {f.license_status.replace(/_/g, " ")}
          </span>
        )}
        {f.quantity_available != null && f.quantity_available > 0 && (
          f.quantity_available <= 5 ? (
            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold" title="Stock left">
              Only {f.quantity_available} left
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600" title="Stock available">
              {f.quantity_available.toLocaleString()} in stock
            </span>
          )
        )}
        {f.quantity_in_carts != null && f.quantity_in_carts > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold" title="Active demand">
            {f.quantity_in_carts} in carts
          </span>
        )}
      </div>

      {(f.seller_name || f.seller_url) && (
        <div className="text-sm text-stone-500 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span>
            <span className="text-stone-400">Seller: </span>
            {f.seller_url ? (
              <a href={f.seller_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-medium">
                {f.seller_name || f.seller_url}
              </a>
            ) : (
              <span className="font-medium text-stone-600">{f.seller_name}</span>
            )}
          </span>
          {f.seller_rating != null && (
            <span>
              ★ <span className="font-semibold text-stone-600">{Number(f.seller_rating).toFixed(1)}</span>
              {f.seller_rating_count != null && f.seller_rating_count > 0 && (
                <span className="text-stone-400"> ({Number(f.seller_rating_count).toLocaleString()})</span>
              )}
            </span>
          )}
          {f.seller_sales != null && f.seller_sales > 0 && (
            <span>· {f.seller_sales.toLocaleString()} sales</span>
          )}
          {f.seller_years_active != null && f.seller_years_active > 0 && (
            <span>· {f.seller_years_active}y</span>
          )}
        </div>
      )}

      {(f.match_explanation || f.infringement_reasoning || f.vlm_reasoning) && (
        <div className="text-sm text-stone-600 leading-relaxed border-l-2 border-amber-300 pl-2">
          <span className="font-semibold text-stone-500">Why flagged: </span>
          {f.match_explanation || f.infringement_reasoning || f.vlm_reasoning}
        </div>
      )}

      {f.description_summary && (
        <p className="text-sm text-stone-500 leading-relaxed">{f.description_summary}</p>
      )}

      {f.description_full && f.description_full !== f.description_summary && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Full description
          </summary>
          <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{f.description_full}</p>
        </details>
      )}

      {f.item_details && Object.keys(f.item_details).length > 0 && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Item details ({Object.keys(f.item_details).length})
          </summary>
          <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            {Object.entries(f.item_details).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-stone-400 truncate max-w-[10rem]">{k}</dt>
                <dd className="text-stone-600 break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {!f.listing_title && !f.seller_name && !f.match_explanation && !f.description_summary && (
        <p className="text-sm text-stone-400 italic">Listing details still being analysed…</p>
      )}

      {/* Footer meta — reviewer-relevant timestamps + the listing link. */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-stone-400">
        <span>found {new Date(f.found_at).toLocaleDateString()}</span>
        {f.last_checked_at && (
          <span title={new Date(f.last_checked_at).toLocaleString()}>
            · last visit {formatAgo(f.last_checked_at)}
          </span>
        )}
        <a href={f.page_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">
          · open listing ↗
        </a>
      </div>

      {/* Signals — developer-facing match diagnostics, collapsed by default so
          they don't crowd the reviewer's primary scan. */}
      <details className="text-xs text-stone-400">
        <summary className="cursor-pointer hover:text-stone-600 select-none">Signals</summary>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">sim {Math.round((f.similarity_score ?? 0) * 100)}%</span>
          {f.inliers != null && (
            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">inliers {f.inliers}</span>
          )}
          {f.source_method && (
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${methodChip(f.source_method).cls}`} title={`Found via ${f.source_method}`}>
              {methodChip(f.source_method).label}
            </span>
          )}
          {f.match_method && (
            <span
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${matchMethodChip(f.match_method).cls}`}
              title={matchMethodChip(f.match_method).title}
            >
              {matchMethodChip(f.match_method).label}
            </span>
          )}
          {f.vlm_verdict && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600">
              vlm: {f.vlm_verdict}
              {f.vlm_confidence != null && `@${Math.round(f.vlm_confidence * 100)}%`}
            </span>
          )}
          {f.published_at && <span className="text-stone-400">· {f.published_at}</span>}
        </div>
      </details>

      {/* Spacer — pushes the action bar to the foot of the column so it aligns
          with the bottom of the image instead of floating under short copy. */}
      <div className="hidden lg:block grow" />

      {/* Primary triage actions — sit at the foot of the enrichment column
          (right of the image, under the description) and enlarged so a reviewer
          can decide (takedown / license / dismiss) without hunting a small
          header control. */}
      <div className="border-t border-stone-200 pt-3 mt-1">
        <FindingActions
          f={f}
          ipId={ipId}
          canLicense={canLicense}
          isDismissed={isDismissed}
          isDismissing={isDismissing}
          onDismiss={onDismiss}
          onActionComplete={onActionComplete}
          onTakedownSent={onTakedownSent}
          onUpdated={onUpdated}
        />
      </div>
        </div>
      </div>

      {/* Takedown thread + discussion — inlined here so the email flow, reply
          thread, and case comments live with the finding instead of on a separate
          case page. Triage sends the first takedown straight from the row header
          (Send takedown); this panel surfaces the thread once a request exists.
          Comments show whenever a case exists. */}
      {f.case_id && (
        <div className="border-t border-stone-200 pt-3 space-y-4">
          {["takedown_sent", "enforced"].includes(
            (f.dismissed_at ? "dismissed" : f.review_status) ?? "",
          ) && (
            <TakedownPanel
              caseId={f.case_id}
              ipId={f.ip_id}
              platform={f.domain}
              compact
              onStatusChange={onUpdated}
            />
          )}
          <CaseComments caseId={f.case_id} compact />
        </div>
      )}
    </div>
  );
}

// Status-driven action group for the comparison header. One primary + a few
// secondaries per state; everything is optimistic ("Working…") and triggers
// a board refresh on success.
function FindingActions({
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
      : "px-4 py-2 rounded-md text-sm font-semibold disabled:opacity-50";
  const blue = `${primaryCls} bg-blue-600 text-white hover:bg-blue-500`;
  const emerald = `${primaryCls} bg-emerald-600 text-white hover:bg-emerald-500`;
  const ghostStone = `${primaryCls} border border-stone-300 text-stone-700 hover:bg-stone-50 bg-white`;

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
    "Shortcut 0: the detection is wrong or irrelevant",
    "0",
  );
  const dontPursueBtn = outcomeButton(
    "do-not-pursue",
    "Don't pursue",
    "do_not_pursue",
    "Shortcut 1: valid detection, intentionally tolerated or not worth enforcement",
    "1",
  );
  const secondHandBtn = outcomeButton(
    "second-hand",
    "Resale",
    "second_hand",
    "Shortcut 3: resale or second-hand item",
    "3",
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
          : "px-2 py-1 rounded-md text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
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

  let buttons: React.ReactNode = null;
  let utilityButtons: React.ReactNode = null;

  if (state === "pending") {
    // Triage decision: send the first takedown (auto-advances to takedown_sent)
    // or choose a non-enforcement outcome. License is the fast-path for a
    // recognised seller. The send is blocked (with a tooltip) until the IP has
    // a takedown signer (signer_ready) — set it on the IP's page. Admins can
    // still move the state forward without sending email.
    const signerReady = f.signer_ready ?? true;
    buttons = (
      <>
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
          aria-keyshortcuts="2"
        >
          <ButtonWithShortcut label="Send takedown" shortcut="2" dark />
        </button>
        {secondHandBtn}
        {falsePositiveBtn}
      </>
    );
    utilityButtons = (
      <div className="flex flex-wrap items-center gap-3">
        {licenseBtn}
      </div>
    );
  } else if (state === "takedown_sent") {
    buttons = (
      <>
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
        {secondHandBtn}
        {falsePositiveBtn}
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
          : "space-y-2"
      }
    >
      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 gap-2"}>
        {buttons}
      </div>
      {(utilityButtons || refreshBtn) && (
        <div
          className={
            compact
              ? "relative border-t border-stone-200 pt-1 flex items-center justify-between gap-2 text-[11px] text-stone-400"
              : "relative border-t border-stone-200 pt-2 flex items-center justify-between gap-3 text-sm text-stone-400"
          }
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
