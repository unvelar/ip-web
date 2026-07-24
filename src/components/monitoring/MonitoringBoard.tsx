import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, X } from "lucide-react";
import {
  dismissIpFinding,
  excludePersistedProductGroupMember,
  markIpFindingNeedsReview,
  markIpFindingEnforced,
  markTakedownSentWithoutEmail,
  resortMonitoringFindings,
  reopenIpFinding,
  restorePersistedProductGroupMember,
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
  type ProductGroupCorrectionReason,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import { BatchConfirmModal } from "./board/batch";
import { BatchOperationBar } from "./board/BatchOperationBar";
import { type BatchAction, runPool, summarizeBatch, summarizeResort } from "./board/batchUtils";
import {
  CANDIDATE_OUTCOME_LABELS,
  CANDIDATE_OUTCOME_ORDER,
  DISMISSAL_REASON_LABELS,
  FILTER_SELECT,
  type ResortTarget,
} from "./board/constants";
import { GridFindingCard } from "./board/GridFindingCard";
import { FindingRow } from "./board/FindingRow";
import { FindingInspector } from "./board/FindingInspector";
import type { FindingUpdateOptions } from "./board/FindingActions";
import { SortHeader } from "./board/SortHeader";
import { FilterPill, StatusTabs } from "./board/StatusTabs";
import { compactListingTitle, hasReviewAnalysis, selectedFindingSummary } from "./board/utils";

/** Shape pushed up to the parent — must match Findings.tsx::InboxFilters. */
export interface BoardFilters {
  status: MonitoringStatusFilter | null;
  priority: MonitoringPriorityBand | null;
  ip_id: string | null;
  product_group_id: string | null;
  platform: string | null;
  seller: string | null;
  dismissal_reason: MonitoringDismissalReasonFilter | null;
  candidate_outcome: MonitoringCandidateOutcome | null;
  show_dismissed: boolean;
  sort: MonitoringSortMode;
}

type LastReviewAction = {
  id: number;
  expiresAt: number;
  label: string;
  detail?: string;
  undo?: {
    kind: "undismiss" | "reopen" | "product_group_correction";
    ipId: string;
    resultId: string;
    groupId?: string;
    correctionId?: string;
  };
};

const TOAST_VISIBLE_MS = 5000;

function dismissalDecisionLabel(reason: MonitoringReviewOutcome) {
  switch (reason) {
    case "resale":
      return DISMISSAL_REASON_LABELS.second_hand;
    case "false_positive":
    case "do_not_pursue":
    case "second_hand":
    case "manual_cleared":
    case "licensed":
    case "allowed_product":
      return DISMISSAL_REASON_LABELS[reason];
    default:
      return "Review action";
  }
}

function isDecisionState(state: CaseReviewStatus) {
  return state === "pending" || state === "review";
}

function isBatchSelectableFinding(f: IpReviewFinding) {
  const state: CaseReviewStatus = f.dismissed_at
    ? "dismissed"
    : (f.review_status ?? "pending");
  return isDecisionState(state) && f.ready_for_review && !f.licensed_seller;
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
  showIpFilter = true,
  activeFindingId,
  onActiveFindingChange,
  seedBatchFindings,
  seedBatchKey,
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
  onRefresh: (completedResultId?: string) => void;
  /** Optional post-dismiss notification with the dismissed result_id. */
  onDismiss?: (resultId: string) => void;
  /** Render the IP-name chip on findings. */
  showIpColumn?: boolean;
  /** Render the page-level IP filter. False when the app shell owns selection. */
  showIpFilter?: boolean;
  /** Finding opened by a route such as /monitoring/tasks/:taskId. */
  activeFindingId?: string | null;
  /** Notifies the route owner when the reviewer opens/collapses a finding. */
  onActiveFindingChange?: (resultId: string | null) => void;
  /** Optional one-shot selection seed, used when opening a campaign as a batch. */
  seedBatchFindings?: IpReviewFinding[];
  seedBatchKey?: string | null;
}) {
  const ipAware = showIpColumn ?? findings.some((f) => !!f.ip_id);
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";
  // Optimistically-dismissed result_ids — the next refetch replaces these
  // once `dismissed_at` lands in the payload.
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [productCorrectedResultIds, setProductCorrectedResultIds] = useState<Set<string>>(new Set());
  const queueRef = useRef<HTMLDivElement | null>(null);
  const [completingResultIds, setCompletingResultIds] = useState<Set<string>>(new Set());
  const completingResultIdsRef = useRef<Set<string>>(new Set());
  // Active finding shown in the side inspector. null = inspector closed.
  const [activeId, setActiveIdState] = useState<string | null>(activeFindingId ?? null);
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [reviewToasts, setReviewToasts] = useState<LastReviewAction[]>([]);
  const [undoingToastIds, setUndoingToastIds] = useState<Set<number>>(new Set());
  const nextToastId = useRef(0);

  const dismissReviewToast = useCallback((id: number) => {
    setReviewToasts((prev) => prev.filter((action) => action.id !== id));
    setUndoingToastIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const recordLastAction = useCallback((action: Omit<LastReviewAction, "id" | "expiresAt">) => {
    setReviewToasts((prev) => [
      ...prev,
      {
        ...action,
        id: ++nextToastId.current,
        expiresAt: Date.now() + TOAST_VISIBLE_MS,
      },
    ]);
  }, []);

  const setResultCompleting = useCallback((resultId: string, completing: boolean) => {
    const next = new Set(completingResultIdsRef.current);
    if (completing) next.add(resultId);
    else next.delete(resultId);
    completingResultIdsRef.current = next;
    setCompletingResultIds(next);
  }, []);

  useEffect(() => {
    setActiveIdState(activeFindingId ?? null);
    if (activeFindingId) setViewMode("table");
  }, [activeFindingId]);

  const setActiveFinding = useCallback((resultId: string | null) => {
    setActiveIdState(resultId);
    onActiveFindingChange?.(resultId);
  }, [onActiveFindingChange]);

  // Stale entries in `dismissing` for findings that have since been removed
  // from the page are harmless — they're never queried after the row goes
  // away — so we don't bother clearing them on each refetch.

  const filteredFindings = useMemo(() => {
    const statusFiltered = filters.status === "pending"
        ? findings.filter(
            (f) =>
              f.ready_for_review &&
              hasReviewAnalysis(f) &&
              !f.dismissed_at &&
              !f.licensed_seller &&
              (f.review_status ?? "pending") === "pending",
          )
        : findings;
    return filters.product_group_id
      ? statusFiltered.filter((f) => !productCorrectedResultIds.has(f.result_id))
      : statusFiltered;
  }, [filters.product_group_id, filters.status, findings, productCorrectedResultIds]);

  // Selection is keyed by result_id. Related-items can add rows that are not
  // currently loaded in the visible page, so keep their full finding payloads
  // in a small side map without reordering the visible page.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionExtras, setSelectionExtras] = useState<Map<string, IpReviewFinding>>(new Map());
  const appliedSeedKey = useRef<string | null>(null);

  const displayFindings = useMemo(() => {
    const activeFinding = activeId
      ? findings.find((f) => f.result_id === activeId)
      : null;
    const baseFindings = (
      activeFinding &&
      !completingResultIds.has(activeFinding.result_id) &&
      !filteredFindings.some((f) => f.result_id === activeFinding.result_id)
    )
      ? [activeFinding, ...filteredFindings]
      : filteredFindings;

    if (selectionExtras.size === 0) return baseFindings;

    const seen = new Set(baseFindings.map((f) => f.result_id));
    const extraFindings: IpReviewFinding[] = [];
    for (const f of selectionExtras.values()) {
      if (!selected.has(f.result_id) || seen.has(f.result_id)) continue;
      seen.add(f.result_id);
      extraFindings.push(f);
    }
    return extraFindings.length > 0 ? [...baseFindings, ...extraFindings] : baseFindings;
  }, [activeId, completingResultIds, filteredFindings, findings, selected, selectionExtras]);

  // If filters/refetches remove the active row, the inspector naturally closes
  // until the user selects another visible row.
  const activeIndex = activeId
    ? displayFindings.findIndex((f) => f.result_id === activeId)
    : -1;
  const activeFinding = activeIndex >= 0 ? displayFindings[activeIndex] : null;

  useEffect(() => {
    if (!activeFinding) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (queueRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-finding-inspector]")) return;
      setActiveFinding(null);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [activeFinding, setActiveFinding]);

  const visibleActionableFindings = useMemo(
    () =>
      displayFindings.filter((f) => {
        const state: CaseReviewStatus = f.dismissed_at
          ? "dismissed"
          : (f.review_status ?? "pending");
        return (
          isDecisionState(state) &&
          f.ready_for_review &&
          hasReviewAnalysis(f) &&
          !dismissing.has(f.result_id) &&
          !f.licensed_seller &&
          !completingResultIds.has(f.result_id)
        );
      }),
    [completingResultIds, displayFindings, dismissing],
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
    setActiveFinding(next?.result_id ?? null);
  }, [setActiveFinding, visibleActionableFindings]);

  const refreshAfterFindingUpdate = useCallback((
    resultId: string,
    opts?: FindingUpdateOptions,
  ) => {
    if (opts?.completed) setResultCompleting(resultId, true);
    onRefresh(opts?.completed ? resultId : undefined);
  }, [onRefresh, setResultCompleting]);

  const moveActive = useCallback((delta: -1 | 1) => {
    if (displayFindings.length === 0) return;
    const current = activeId
      ? displayFindings.findIndex((f) => f.result_id === activeId)
      : -1;
    const base = current >= 0 ? current : delta > 0 ? -1 : displayFindings.length;
    const next = Math.max(0, Math.min(displayFindings.length - 1, base + delta));
    setActiveFinding(displayFindings[next].result_id);
  }, [activeId, displayFindings, setActiveFinding]);

  const handleDismiss = useCallback(async (
    f: IpReviewFinding,
    reason: MonitoringReviewOutcome = "false_positive",
  ) => {
    if (dismissing.has(f.result_id) || completingResultIdsRef.current.has(f.result_id)) return;
    const fipId = f.ip_id ?? ipId;
    if (!fipId) {
      alert("Cannot update finding: finding has no associated IP.");
      return;
    }
    setDismissing((prev) => new Set(prev).add(f.result_id));
    setResultCompleting(f.result_id, true);
    advanceAfterAction(f.result_id);
    try {
      await dismissIpFinding(fipId, f.result_id, { reason });
      onDismiss?.(f.result_id);
      recordLastAction({
        label: `${dismissalDecisionLabel(reason)} applied`,
        detail: compactListingTitle(f),
        undo: { kind: "undismiss", ipId: fipId, resultId: f.result_id },
      });
      setProductCorrectedResultIds((current) => new Set(current).add(f.result_id));
      setResultCompleting(f.result_id, false);
      onRefresh();
    } catch (e) {
      setResultCompleting(f.result_id, false);
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(f.result_id);
        return next;
      });
      setActiveFinding(f.result_id);
      alert(e instanceof Error ? e.message : "Failed to update finding");
    }
  }, [
    advanceAfterAction,
    dismissing,
    ipId,
    onDismiss,
    onRefresh,
    recordLastAction,
    setActiveFinding,
    setResultCompleting,
  ]);

  const rememberTakedownAction = useCallback((f: IpReviewFinding) => {
    const fipId = f.ip_id ?? ipId;
    if (!fipId) return;
    recordLastAction({
      label: "Takedown sent",
      detail: compactListingTitle(f),
      undo: { kind: "reopen", ipId: fipId, resultId: f.result_id },
    });
  }, [ipId, recordLastAction]);

  const rememberNeedsReviewAction = useCallback((f: IpReviewFinding) => {
    const fipId = f.ip_id ?? ipId;
    if (!fipId) return;
    recordLastAction({
      label: "Moved to Review",
      detail: compactListingTitle(f),
      undo: { kind: "reopen", ipId: fipId, resultId: f.result_id },
    });
  }, [ipId, recordLastAction]);

  const rememberEnforcedAction = useCallback((f: IpReviewFinding) => {
    const fipId = f.ip_id ?? ipId;
    if (!fipId) return;
    recordLastAction({
      label: "Marked enforced",
      detail: compactListingTitle(f),
      undo: { kind: "reopen", ipId: fipId, resultId: f.result_id },
    });
  }, [ipId, recordLastAction]);

  const rememberLicensedAction = useCallback((f: IpReviewFinding, dismissedCount: number) => {
    recordLastAction({
      label: "Seller licensed",
      detail:
        dismissedCount > 1
          ? `${dismissedCount} findings dismissed`
          : f.seller_name || compactListingTitle(f),
    });
  }, [recordLastAction]);

  const correctProductMembership = useCallback(async (
    f: IpReviewFinding,
    reason: ProductGroupCorrectionReason,
  ) => {
    const groupId = filters.product_group_id;
    const fipId = f.ip_id ?? ipId;
    if (!groupId || !fipId || !f.case_id) {
      alert("This finding does not have a stored product membership to correct.");
      return;
    }
    if (completingResultIdsRef.current.has(f.result_id)) return;

    setResultCompleting(f.result_id, true);
    advanceAfterAction(f.result_id);
    try {
      const { correction } = await excludePersistedProductGroupMember(fipId, groupId, {
        case_id: f.case_id,
        reason,
      });
      recordLastAction({
        label: reason === "different_variant"
          ? "Moved out as a different variant"
          : "Removed from product",
        detail: compactListingTitle(f),
        undo: {
          kind: "product_group_correction",
          ipId: fipId,
          resultId: f.result_id,
          groupId,
          correctionId: correction.id,
        },
      });
      onRefresh(f.result_id);
    } catch (e) {
      setResultCompleting(f.result_id, false);
      setActiveFinding(f.result_id);
      alert(e instanceof Error ? e.message : "Failed to correct product membership");
    }
  }, [
    advanceAfterAction,
    filters.product_group_id,
    ipId,
    onRefresh,
    recordLastAction,
    setActiveFinding,
    setResultCompleting,
  ]);

  const undoReviewToast = useCallback(async (action: LastReviewAction) => {
    if (!action.undo || undoingToastIds.has(action.id)) return;
    const undo = action.undo;
    setUndoingToastIds((prev) => new Set(prev).add(action.id));
    try {
      if (undo.kind === "undismiss") {
        await undismissIpFinding(undo.ipId, undo.resultId);
      } else if (undo.kind === "reopen") {
        await reopenIpFinding(undo.ipId, undo.resultId);
      } else {
        if (!undo.groupId || !undo.correctionId) {
          throw new Error("Product correction details are missing");
        }
        await restorePersistedProductGroupMember(
          undo.ipId,
          undo.groupId,
          undo.correctionId,
        );
      }
      setResultCompleting(undo.resultId, false);
      setProductCorrectedResultIds((current) => {
        if (!current.has(undo.resultId)) return current;
        const next = new Set(current);
        next.delete(undo.resultId);
        return next;
      });
      setDismissing((prev) => {
        if (!prev.has(undo.resultId)) return prev;
        const next = new Set(prev);
        next.delete(undo.resultId);
        return next;
      });
      setActiveFinding(undo.resultId);
      dismissReviewToast(action.id);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to undo action");
    } finally {
      setUndoingToastIds((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  }, [
    dismissReviewToast,
    onRefresh,
    setActiveFinding,
    setResultCompleting,
    undoingToastIds,
  ]);

  useEffect(() => {
    if (reviewToasts.length === 0) return;
    const now = Date.now();
    const timers = reviewToasts
      .filter((action) => !undoingToastIds.has(action.id))
      .map((action) =>
        window.setTimeout(
          () => dismissReviewToast(action.id),
          Math.max(0, action.expiresAt - now),
        ),
      );
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissReviewToast, reviewToasts, undoingToastIds]);

  // --- Multi-select + batch operations -------------------------------------
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Reset selection when the filter set changes — the rows it referenced are
  // gone. (Pruning on every refetch isn't needed: stale ids are simply ignored.)
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setSelected(new Set());
    setSelectionExtras(new Map());
    setProductCorrectedResultIds(new Set());
    setBatchResult(null);
    appliedSeedKey.current = null;
  }, [filterKey]);

  function clearSelection() {
    setSelected(new Set());
    setSelectionExtras(new Map());
  }

  useEffect(() => {
    if (!seedBatchKey || appliedSeedKey.current === seedBatchKey) return;
    appliedSeedKey.current = seedBatchKey;
    const openFindings = (seedBatchFindings ?? []).filter(isBatchSelectableFinding);
    if (openFindings.length === 0) {
      setBatchResult("No open campaign findings to add.");
      return;
    }
    setSelectionExtras((prev) => {
      const next = new Map(prev);
      for (const f of openFindings) next.set(f.result_id, f);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of openFindings) next.add(f.result_id);
      return next;
    });
    setBatchResult(`Added ${openFindings.length} campaign finding${openFindings.length === 1 ? "" : "s"} to the batch.`);
  }, [filterKey, seedBatchFindings, seedBatchKey]);

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
    const visibleIds = new Set(displayFindings.map((f) => f.result_id));
    const visibleSelected = displayFindings.every((f) => selected.has(f.result_id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (visibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function addRelatedToBatch(findingsToAdd: IpReviewFinding[]) {
    const openFindings = findingsToAdd.filter(isBatchSelectableFinding);
    if (openFindings.length === 0) {
      setBatchResult("No open related findings to add.");
      return;
    }
    setSelectionExtras((prev) => {
      const next = new Map(prev);
      for (const f of openFindings) next.set(f.result_id, f);
      return next;
    });
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of openFindings) next.add(f.result_id);
      return next;
    });
    setBatchResult(`Added ${openFindings.length} related finding${openFindings.length === 1 ? "" : "s"} to the batch.`);
  }

  const selectedActionFindings = useMemo(() => {
    const byId = new Map<string, IpReviewFinding>();
    for (const f of displayFindings) byId.set(f.result_id, f);
    for (const [id, f] of selectionExtras) if (!byId.has(id)) byId.set(id, f);
    return Array.from(byId.values()).filter((f) => selected.has(f.result_id));
  }, [displayFindings, selected, selectionExtras]);

  // Split the current selection for an action into rows to act on vs.
  // skip-reason counts to report. `state` mirrors FindingActions' derivation.
  function partitionSelection(action: BatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (r: string) => {
      skipped[r] = (skipped[r] ?? 0) + 1;
    };
    for (const f of selectedActionFindings) {
      if (!selected.has(f.result_id)) continue;
      const state: CaseReviewStatus = f.dismissed_at
        ? "dismissed"
        : (f.review_status ?? "pending");
      if (action === "send") {
        if (!isDecisionState(state)) skip("already sent or closed");
        else if (!f.case_id) skip("still preparing");
        else if (f.signer_ready === false && !canMarkSentWithoutEmail) skip("missing signer information");
        else eligible.push(f);
      } else if (action === "review") {
        if (state !== "pending") skip("not in triage");
        else if (!f.case_id) skip("still preparing");
        else if (!(f.ip_id ?? ipId)) skip("no associated IP");
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
    for (const f of selectedActionFindings) {
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
          } else if (action === "review") {
            await markIpFindingNeedsReview((f.ip_id ?? ipId) as string, f.result_id);
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
    clearSelection();
    setBatchResult(summarizeBatch(action, ok, skipCounts, failed));
    onRefresh(activeId && eligible.some((f) => f.result_id === activeId) ? activeId : undefined);
  }

  async function runResort(target: ResortTarget | null = filters.candidate_outcome) {
    if (!target) {
      setBatchResult("Choose a candidate bucket before resorting selected findings.");
      return;
    }
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
    clearSelection();
    setBatchResult(summarizeResort(target, failed > 0 ? 0 : eligible.length, skipped, failed));
    onRefresh();
  }

  const runShortcutAction = useCallback(async (action: "false_positive" | "do_not_pursue" | "send" | "second_hand" | "review") => {
    if (selected.size > 0) {
      setConfirmAction(action);
      return;
    }
    const completingResultIds = completingResultIdsRef.current;
    const targetFinding =
      activeFinding && !completingResultIds.has(activeFinding.result_id)
        ? activeFinding
        : visibleActionableFindings.find((f) => !completingResultIds.has(f.result_id));
    if (!targetFinding) return;
    if (completingResultIds.has(targetFinding.result_id)) return;

    const state: CaseReviewStatus = targetFinding.dismissed_at
      ? "dismissed"
      : (targetFinding.review_status ?? "pending");
    if (action === "review") {
      if (state !== "pending") return;
    } else if (!isDecisionState(state)) {
      return;
    }

    let targetCaseId: string | null = null;
    if (action === "send") {
      if (!targetFinding.case_id) {
        alert("Finding is still preparing.");
        return;
      }
      targetCaseId = targetFinding.case_id;
      setResultCompleting(targetFinding.result_id, true);
      advanceAfterAction(targetFinding.result_id);
    }
    try {
      if (action === "send") {
        if (!targetCaseId) return;
        const r = await autoSendTakedown(targetCaseId);
        if (r.status === "sent") {
          rememberTakedownAction(targetFinding);
          onRefresh(targetFinding.result_id);
          return;
        }
        if (canMarkSentWithoutEmail) {
          await markTakedownSentWithoutEmail(targetCaseId);
          rememberTakedownAction(targetFinding);
          onRefresh(targetFinding.result_id);
          return;
        }
        throw new Error(
          r.status === "needs_compose"
            ? "This takedown needs manual compose."
          : "Email is not configured.",
        );
      }
      if (action === "review") {
        if (!targetFinding.case_id) {
          alert("Finding is still preparing.");
          return;
        }
        const fipId = targetFinding.ip_id ?? ipId;
        if (!fipId) {
          alert("Cannot update finding: finding has no associated IP.");
          return;
        }
        await markIpFindingNeedsReview(fipId, targetFinding.result_id);
        rememberNeedsReviewAction(targetFinding);
        advanceAfterAction(targetFinding.result_id);
        onRefresh(targetFinding.result_id);
        return;
      }
      await handleDismiss(targetFinding, action);
    } catch (e) {
      if (action === "send") {
        setResultCompleting(targetFinding.result_id, false);
        setActiveFinding(targetFinding.result_id);
      }
      alert(e instanceof Error ? e.message : "Failed to update finding");
    }
  }, [
    advanceAfterAction,
    canMarkSentWithoutEmail,
    activeFinding,
    handleDismiss,
    ipId,
    onRefresh,
    rememberNeedsReviewAction,
    rememberTakedownAction,
    selected,
    setActiveFinding,
    setResultCompleting,
    visibleActionableFindings,
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
      if (e.key === "Escape" && activeFinding) {
        e.preventDefault();
        setActiveFinding(null);
        return;
      }
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && activeFinding) {
        e.preventDefault();
        moveActive(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      const action =
        e.key === "1" ? "false_positive" :
        e.key === "2" ? "second_hand" :
        e.key === "3" ? "do_not_pursue" :
        e.key.toLowerCase() === "r" ? "review" :
        e.key.toLowerCase() === "t" ? "send" :
        null;
      if (!action) return;
      e.preventDefault();
      void runShortcutAction(action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeFinding, moveActive, runShortcutAction, setActiveFinding]);

  const visibleSelectedCount = displayFindings.filter((f) => selected.has(f.result_id)).length;
  const allSelected = displayFindings.length > 0 && visibleSelectedCount === displayFindings.length;
  const someSelected = selected.size > 0 && !allSelected;
  const selectedSummary = useMemo(
    () => selectedFindingSummary(selectedActionFindings),
    [selectedActionFindings],
  );
  const resortSelectedTooltip = filters.candidate_outcome
    ? `Resort selected findings out of ${CANDIDATE_OUTCOME_LABELS[filters.candidate_outcome]}`
    : "Choose a candidate bucket, then select findings to resort them out of that bucket.";
  const showAiRecommendationTabs =
    filters.status === null || filters.status === "pending" || !!filters.candidate_outcome;
  const filterHeaderLabel =
    "w-24 shrink-0 text-[10px] font-bold uppercase tracking-wide text-stone-600";
  const filterRow =
    "flex items-center gap-0.5 px-3 py-2 overflow-x-auto whitespace-nowrap";
  const bulkSelectionBar = (
    <BatchOperationBar
      selectedCount={selected.size}
      selectedSummary={selectedSummary}
      batchProgress={batchProgress}
      onAction={setConfirmAction}
      onResort={() => void runResort()}
      resortDisabled={!filters.candidate_outcome}
      resortTooltip={resortSelectedTooltip}
      onClear={clearSelection}
    />
  );

  return (
    <>
      <div className="rounded-lg border border-stone-200 bg-white overflow-hidden mb-2">
        <div className="flex items-center gap-2 flex-wrap px-3 py-2 border-b border-stone-100 bg-white">
          <span className={filterHeaderLabel}>
            Workflow
          </span>
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
          <span className="flex-1 min-w-[8px]" aria-hidden />
          <span className="text-[11px] font-semibold text-stone-500 whitespace-nowrap">
            {facets.total} in view
          </span>
        </div>

        <div className="divide-y divide-stone-100">
          {showIpFilter && ipAware && facets.ips.length > 1 && (
            <div
              className={filterRow}
              role="group"
              aria-label="Filter by IP"
            >
              <span className={filterHeaderLabel}>
                IP
              </span>
              <FilterPill
                label="All"
                count={facets.total}
                active={!filters.ip_id}
                onClick={() => onFiltersChange({ ip_id: null, product_group_id: null })}
              />
              {facets.ips.map((ip) => (
                <FilterPill
                  key={ip.ip_id}
                  label={ip.name ?? "Unnamed IP"}
                  count={ip.n}
                  active={filters.ip_id === ip.ip_id}
                  onClick={() =>
                    onFiltersChange({
                      ip_id: filters.ip_id === ip.ip_id ? null : ip.ip_id,
                      product_group_id: null,
                    })
                  }
                  title={`${ip.name ?? "Unnamed IP"} · ${ip.n} finding${ip.n === 1 ? "" : "s"}`}
                  className="max-w-[9rem]"
                />
              ))}
            </div>
          )}
          {((facets.product_groups?.length ?? 0) > 0 || filters.product_group_id) && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className={filterHeaderLabel}>
                Group
              </span>
              <select
                value={filters.product_group_id ?? "all"}
                onChange={(event) =>
                  onFiltersChange({
                    product_group_id: event.target.value === "all" ? null : event.target.value,
                  })
                }
                aria-label="Filter by product or visual group"
                title="Filter tasks by a stored exact-product or overlapping visual group"
                className={`${FILTER_SELECT} max-w-sm`}
              >
                <option value="all">All groups</option>
                {filters.product_group_id && !(facets.product_groups ?? []).some(
                  (group) => group.product_group_id === filters.product_group_id,
                ) && (
                  <option value={filters.product_group_id}>Selected group (0)</option>
                )}
                {(facets.product_groups ?? []).map((group) => (
                  <option key={group.product_group_id} value={group.product_group_id}>
                    {group.name} ({group.n})
                  </option>
                ))}
              </select>
            </div>
          )}
          {facets.platforms.length > 1 && (
            <div
              className={filterRow}
              role="group"
              aria-label="Filter by website"
            >
              <span className={filterHeaderLabel}>
                Websites
              </span>
              <FilterPill
                label="All"
                count={facets.total}
                active={!filters.platform}
                onClick={() => onFiltersChange({ platform: null })}
              />
              {facets.platforms.map((p) => (
                <FilterPill
                  key={p.domain}
                  label={p.domain}
                  count={p.n}
                  active={filters.platform === p.domain}
                  onClick={() =>
                    onFiltersChange({
                      platform: filters.platform === p.domain ? null : p.domain,
                    })
                  }
                  title={`${p.domain} · ${p.n} finding${p.n === 1 ? "" : "s"}`}
                  className="max-w-[8rem]"
                />
              ))}
            </div>
          )}
          {(filters.status === "dismissed" || filters.dismissal_reason) && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className={filterHeaderLabel}>
                Dismissal
              </span>
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
                aria-label="Filter dismissed findings by outcome"
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
            </div>
          )}

          {showAiRecommendationTabs && (
            <div className="flex items-center gap-1 flex-wrap px-3 py-2">
              <span className={filterHeaderLabel}>
                AI Reasoning
              </span>
              <FilterPill
                label="All"
                count={facets.statuses.pending ?? 0}
                active={!filters.candidate_outcome}
                onClick={() => onFiltersChange({ candidate_outcome: null })}
              />
              {CANDIDATE_OUTCOME_ORDER.map((outcome) => (
                <FilterPill
                  key={outcome}
                  label={CANDIDATE_OUTCOME_LABELS[outcome]}
                  count={facets.candidate_outcomes?.[outcome] ?? 0}
                  active={filters.candidate_outcome === outcome}
                  onClick={() => onFiltersChange({ candidate_outcome: outcome, status: "pending" })}
                />
              ))}
              {selected.size > 0 && (
                <span className="ml-auto text-[11px] font-semibold text-stone-500 whitespace-nowrap">
                  {selected.size} selected
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div ref={queueRef} className="rounded-lg border border-stone-200 bg-white overflow-hidden">
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
                  active={activeId === f.result_id}
                  selected={selected.has(f.result_id)}
                  isDismissed={rowDismissed}
                  isDismissing={dismissing.has(f.result_id) && !f.dismissed_at}
                  onSelect={() => toggleSelect(f.result_id)}
                  onActivate={() => setActiveFinding(f.result_id)}
                  onOpen={() => {
                    setActiveFinding(f.result_id);
                    setViewMode("table");
                  }}
                  onDismiss={(reason) => handleDismiss(f, reason)}
                  onActionComplete={() => advanceAfterAction(f.result_id)}
                  onNeedsReview={() => rememberNeedsReviewAction(f)}
                  onTakedownSent={() => rememberTakedownAction(f)}
                  onEnforced={() => rememberEnforcedAction(f)}
                  onLicensed={(dismissedCount) => rememberLicensedAction(f, dismissedCount)}
                  onUpdated={(opts) => refreshAfterFindingUpdate(f.result_id, opts)}
                />
              );
            })}
          </div>
        ) : (
          /* Columnar findings table. Sortable headers drive the server sort;
             clicking a row opens/updates the right-side inspector. */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/60 text-[10px] uppercase tracking-wide text-stone-400">
                  <th className="w-9 pl-2 pr-1 py-1.5 align-middle">
                    <label className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100 cursor-pointer">
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
                  <SortHeader label="Similarity" col="rate" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="w-20" />
                  <th className="py-1.5 px-2 font-semibold w-16"><span className="sr-only">Image</span></th>
                  <th className="py-1.5 px-2 font-semibold">Listing</th>
                  <SortHeader label="Seller" col="seller" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="hidden md:table-cell" />
                  <SortHeader label="Platform" col="platform" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} className="hidden lg:table-cell" />
                  <th className="hidden sm:table-cell py-1.5 px-2 font-semibold">Status</th>
                  <SortHeader label="Price" col="price" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} align="right" className="hidden md:table-cell" />
                  <SortHeader label="Updated" col="updated" sort={filters.sort} onSort={(s) => onFiltersChange({ sort: s })} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {displayFindings.map((f) => {
                  const active = f.result_id === activeFinding?.result_id;
                  const rowDismissed = !!f.dismissed_at || dismissing.has(f.result_id);
                  return (
                    <tr
                      key={f.result_id}
                      onClick={() => setActiveFinding(f.result_id)}
                      className={`group relative cursor-pointer transition-colors ${
                        active ? "bg-blue-50/70" : "hover:bg-stone-50 focus-within:bg-stone-50"
                      } ${rowDismissed ? "opacity-50" : ""}`}
                    >
                      <td
                        className="w-9 pl-2 pr-1 align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <label className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-stone-100 cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label="Select finding"
                            checked={selected.has(f.result_id)}
                            onChange={() => toggleSelect(f.result_id)}
                            className="h-4 w-4"
                          />
                        </label>
                      </td>
                      <FindingRow
                        f={f}
                        active={active}
                        showIp={ipAware}
                      />
                    </tr>
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

      {selected.size > 0 && <div aria-hidden="true" className="h-32 sm:h-24" />}
      {bulkSelectionBar}

      {activeFinding && (
        <FindingInspector
          f={activeFinding}
          ipId={activeFinding.ip_id ?? ipId}
          showIp={ipAware}
          isDismissed={!!activeFinding.dismissed_at || dismissing.has(activeFinding.result_id)}
          isDismissing={dismissing.has(activeFinding.result_id) && !activeFinding.dismissed_at}
          onClose={() => setActiveFinding(null)}
          onDismiss={(reason) => handleDismiss(activeFinding, reason)}
          onActionComplete={() => advanceAfterAction(activeFinding.result_id)}
          onNeedsReview={() => rememberNeedsReviewAction(activeFinding)}
          onTakedownSent={() => rememberTakedownAction(activeFinding)}
          onEnforced={() => rememberEnforcedAction(activeFinding)}
          onLicensed={(dismissedCount) => rememberLicensedAction(activeFinding, dismissedCount)}
          onUpdated={(opts) => refreshAfterFindingUpdate(activeFinding.result_id, opts)}
          onAddRelatedToBatch={addRelatedToBatch}
          productGroupId={filters.product_group_id ?? undefined}
          onCorrectProductGroup={(reason) => correctProductMembership(activeFinding, reason)}
        />
      )}

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

      <LastDecisionToasts
        actions={reviewToasts}
        undoingIds={undoingToastIds}
        onUndo={undoReviewToast}
        onDismiss={dismissReviewToast}
      />
    </>
  );
}

function LastDecisionToasts({
  actions,
  undoingIds,
  onUndo,
  onDismiss,
}: {
  actions: LastReviewAction[];
  undoingIds: Set<number>;
  onUndo: (action: LastReviewAction) => void;
  onDismiss: (id: number) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex max-h-[min(calc(100vh-2rem),32rem)] w-[min(calc(100vw-2rem),19rem)] flex-col gap-2 overflow-y-auto">
      {actions.map((action) => {
        const undoing = undoingIds.has(action.id);
        return (
          <div
            key={action.id}
            role="status"
            aria-live="polite"
            className="rounded-lg border border-stone-200 bg-white text-stone-900 shadow-[0_12px_32px_rgba(28,25,23,0.14)]"
          >
            <div className="px-3 py-2.5">
              <div className="flex items-start gap-2">
                <CircleCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold leading-4 text-stone-900">
                    {action.label}
                  </div>
                  {action.detail && (
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-stone-500">
                      <span className="h-3 w-3 shrink-0 rounded-full border border-dashed border-stone-300" aria-hidden />
                      <span className="truncate">{action.detail}</span>
                    </div>
                  )}
                  {action.undo && (
                    <button
                      type="button"
                      disabled={undoing}
                      onClick={() => onUndo(action)}
                      className="mt-1.5 text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                    >
                      {undoing ? "Undoing..." : "Undo"}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(action.id)}
                  className="-mr-1 -mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
