import { Check, Clock3, Layers3, Link2, LoaderCircle, RefreshCw, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { MonitoringDismissReasonCode, MonitoringReviewOutcome } from "../api/findingActions";
import {
  allowIpFindingProductImage,
  dismissIpFinding,
  markIpFindingNeedsReview,
  reopenIpFinding,
  undismissIpFinding,
} from "../api/findingActions";
import { getMonitoringFinding } from "../api/monitoring";
import type { PersistedProductGroup, PersistedProductGroupOverview } from "../api/products";
import {
  listProductClusterScopes,
  mergePersistedProductGroups,
  revokePersistedProductGroupMerge,
} from "../api/products";
import type { IpReviewFinding } from "../api/reviews";
import type { TakedownFeedbackAssociationScope } from "../api/takedowns";
import { approveTakedownBatch } from "../api/takedowns";
import { preferredAllowedProductImage } from "../components/monitoring/board/allowedProduct";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import { dismissalOptionsForBatchAction, runPool } from "../components/monitoring/board/batchUtils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import { BatchWorkspace } from "../features/products/BatchWorkspace";
import {
  loadCanonicalProductGroup,
  loadProductGroupFindings,
  loadProductGroupPage,
  loadRecentDecisionPages,
} from "../features/products/data";
import type {
  ProductLabView,
  ProductMergeNotice,
  RecentDecisionCursors,
  ReviewBucket,
} from "../features/products/labDomain";
import {
  appendPage,
  buildProductCategoryTree,
  expandedCategoryGroups,
  mergeRecentDecisions,
  messageFor,
  PAGE_SIZE,
  productName,
  RECENT_DECISION_STATUSES,
  reviewBucket,
} from "../features/products/labDomain";
import { ProductCategoryBranch } from "../features/products/ProductCategoryBranch";
import { ProductSettingsWorkspace } from "../features/products/ProductSettingsWorkspace";
import { QueueSkeleton } from "../features/products/QueueSkeleton";
import { QuietState } from "../features/products/QuietState";
import { RecentDecisionRow } from "../features/products/RecentDecisionRow";
import type { ProductLabBatchAction } from "../features/products/reviewDecisions";
import {
  adjacentFinding,
  productCommercialReviewLanes,
  productNeedsAttention,
  recentDecisionCanUndo,
  recentDecisionKind,
  reconcileProductAttentionOverview,
  reconcileProductCommercialSubgroupCount,
  removeProcessedFindings,
  resetOptimisticProductStateAfterUndo,
  scopeFindingsToCommercialSubgroup,
} from "../features/products/reviewDecisions";
import { ViewTab } from "../features/products/ViewTab";

export default function ProductLab() {
  const { actingTenantId } = useAuth();
  const { activeIpId, activeIp, loading: loadingIp } = useActiveIp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [focusedGroup, setFocusedGroup] = useState<PersistedProductGroup | null>(null);
  const [loadingFocusedGroup, setLoadingFocusedGroup] = useState(false);
  const [focusedGroupError, setFocusedGroupError] = useState<string | null>(null);
  const [scopeAvailable, setScopeAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedProductQuery, setDebouncedProductQuery] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [batchFindings, setBatchFindings] = useState<IpReviewFinding[] | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState<ReviewBucket>("all");
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(() => new Set());
  const [confirmBatchAction, setConfirmBatchAction] = useState<ProductLabBatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);
  const [mergeSourceGroup, setMergeSourceGroup] = useState<PersistedProductGroup | null>(null);
  const [mergeTargetGroupIds, setMergeTargetGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [savingMerge, setSavingMerge] = useState(false);
  const [mergeProgress, setMergeProgress] = useState<{ done: number; total: number } | null>(null);
  const [mergeSelectionError, setMergeSelectionError] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<ProductMergeNotice | null>(null);
  const [undoingMerge, setUndoingMerge] = useState(false);
  const [activeFinding, setActiveFinding] = useState<IpReviewFinding | null>(null);
  const [dismissingResultId, setDismissingResultId] = useState<string | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<IpReviewFinding[]>([]);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(50);
  const [historyCursors, setHistoryCursors] = useState<RecentDecisionCursors>(() =>
    Object.fromEntries(
      RECENT_DECISION_STATUSES.map((status) => [status, null]),
    ) as RecentDecisionCursors
  );
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [undoingResultIds, setUndoingResultIds] = useState<Set<string>>(() => new Set());
  const [collapsedCategoryPaths, setCollapsedCategoryPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const exactPendingCountsRef = useRef<Record<string, number>>({});
  const exactPendingCountsIpRef = useRef<string | null>(null);
  const batchScopeRef = useRef<string | null>(null);
  const commercialReviewScopeRef = useRef<string | null>(null);
  const optimisticallyProcessedIdsRef = useRef<Set<string>>(new Set());

  const requestedView = searchParams.get("view");
  const view: ProductLabView = requestedView === "all" || requestedView === "history"
    ? requestedView
    : "attention";
  const selectedGroupId = searchParams.get("group");
  const requestedFindingId = searchParams.get("finding");
  const requestedCommercialSubgroupKey = searchParams.get("offer");
  const showGroupSettings = searchParams.get("panel") === "settings";

  useEffect(() => {
    const closeCategoryMenusOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      const target = event.target;

      document
        .querySelectorAll<HTMLDetailsElement>("details[data-category-overflow-menu][open]")
        .forEach((menu) => {
          if (!menu.contains(target)) menu.removeAttribute("open");
        });
    };
    const closeCategoryMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      document
        .querySelectorAll<HTMLDetailsElement>("details[data-category-overflow-menu][open]")
        .forEach((menu) => {
          menu.removeAttribute("open");
          menu.querySelector<HTMLElement>("summary")?.focus();
        });
    };

    document.addEventListener("pointerdown", closeCategoryMenusOutside);
    document.addEventListener("keydown", closeCategoryMenusOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeCategoryMenusOutside);
      document.removeEventListener("keydown", closeCategoryMenusOnEscape);
    };
  }, []);

  useEffect(() => {
    if (view === "history") return;
    const timer = window.setTimeout(() => {
      setDebouncedProductQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, view]);

  const selectGroup = useCallback((groupId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (groupId) next.set("group", groupId);
    else next.delete("group");
    next.delete("panel");
    next.delete("finding");
    next.delete("offer");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const openGroupSettings = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("panel", "settings");
    next.delete("finding");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const openReviewQueue = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("panel");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const openFinding = useCallback((finding: IpReviewFinding) => {
    setActiveFinding(finding);
    const next = new URLSearchParams(searchParams);
    next.set("finding", finding.result_id);
    next.delete("panel");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const closeFinding = useCallback(() => {
    setActiveFinding(null);
    const next = new URLSearchParams(searchParams);
    next.delete("finding");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setMergeSourceGroup(null);
    setMergeTargetGroupIds(new Set());
    setSavingMerge(false);
    setMergeProgress(null);
    setMergeSelectionError(null);
    setMergeNotice(null);
    setUndoingMerge(false);
  }, [activeIpId, actingTenantId]);

  useEffect(() => {
    if (loadingIp) return;
    if (view === "history") {
      setLoading(false);
      return;
    }
    if (!activeIpId) {
      exactPendingCountsIpRef.current = null;
      exactPendingCountsRef.current = {};
      setOverview(null);
      setScopeAvailable(false);
      setLoading(false);
      return;
    }

    let alive = true;
    const controller = new AbortController();
    const overviewScope = `${actingTenantId ?? ""}:${activeIpId}`;
    const scopeChanged = exactPendingCountsIpRef.current !== overviewScope;
    if (scopeChanged) {
      exactPendingCountsIpRef.current = overviewScope;
      exactPendingCountsRef.current = {};
      setOverview(null);
      setScopeAvailable(null);
    }
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const { scopes } = await listProductClusterScopes(controller.signal);
        if (!alive) return;
        const available = scopes.some((scope) => scope.ip_id === activeIpId);
        setScopeAvailable(available);
        if (!available) return;

        let accumulated: PersistedProductGroupOverview = await loadProductGroupPage(activeIpId, view, {
          query: debouncedProductQuery || null,
          allProducts: Boolean(mergeSourceGroup),
          signal: controller.signal,
        });
        if (!alive) return;
        accumulated = Object.entries(exactPendingCountsRef.current).reduce(
          (current, [groupId, exactPendingCount]) =>
            reconcileProductAttentionOverview(current, groupId, exactPendingCount),
          accumulated,
        );
        setOverview(accumulated);
      } catch (caught: unknown) {
        if (!alive || controller.signal.aborted) return;
        setError(messageFor(caught));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [
    activeIpId,
    actingTenantId,
    debouncedProductQuery,
    loadingIp,
    mergeSourceGroup,
    refreshToken,
    view,
  ]);

  useEffect(() => {
    if (loadingIp || view !== "history") return;
    if (!activeIpId) {
      setRecentDecisions([]);
      setLoadingHistory(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setLoadingHistory(true);
    setHistoryVisibleCount(50);
    setHistoryError(null);
    void loadRecentDecisionPages(activeIpId, undefined, controller.signal)
      .then((result) => {
        if (alive) {
          setRecentDecisions(result.findings);
          setHistoryCursors(result.cursors);
        }
      })
      .catch((caught: unknown) => {
        if (alive && !controller.signal.aborted) setHistoryError(messageFor(caught));
      })
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [activeIpId, actingTenantId, loadingIp, refreshToken, view]);

  useEffect(() => {
    if (view === "history") setHistoryVisibleCount(50);
  }, [query, view]);

  const visibleGroups = useMemo(() => {
    if (!overview) return [];
    return overview.groups
      .filter((group) => {
        if (
          view === "attention" &&
          !productNeedsAttention(group)
        ) return false;
        return true;
      });
  }, [overview, view]);

  const pagedCategoryTrees = useMemo(
    () => Array.from(
      { length: Math.ceil(visibleGroups.length / PAGE_SIZE) },
      (_, pageIndex) => buildProductCategoryTree(
        visibleGroups.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE),
      ),
    ),
    [visibleGroups],
  );
  const navigableGroups = useMemo(
    () => pagedCategoryTrees.flatMap((categories) => expandedCategoryGroups(
      categories,
      collapsedCategoryPaths,
      Boolean(query.trim()),
    )),
    [collapsedCategoryPaths, pagedCategoryTrees, query],
  );

  const toggleCategory = useCallback((path: string) => {
    setCollapsedCategoryPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const loadedSelectedGroup = selectedGroupId
    ? overview?.groups.find((group) =>
        group.id === selectedGroupId || group.canonical_product_id === selectedGroupId
      ) ?? null
    : null;

  useEffect(() => {
    if (!selectedGroupId || !activeIpId) {
      setFocusedGroup(null);
      setLoadingFocusedGroup(false);
      setFocusedGroupError(null);
      return;
    }
    if (loadedSelectedGroup) {
      setFocusedGroup(null);
      setLoadingFocusedGroup(false);
      setFocusedGroupError(null);
      return;
    }

    let alive = true;
    setFocusedGroup(null);
    setLoadingFocusedGroup(true);
    setFocusedGroupError(null);
    void loadCanonicalProductGroup(activeIpId, selectedGroupId)
      .then((group) => {
        if (alive) setFocusedGroup(group);
      })
      .catch((caught: unknown) => {
        if (alive) setFocusedGroupError(messageFor(caught));
      })
      .finally(() => {
        if (alive) setLoadingFocusedGroup(false);
      });
    return () => {
      alive = false;
    };
  }, [activeIpId, loadedSelectedGroup, selectedGroupId]);

  const selectedGroup = loadedSelectedGroup ?? (
    selectedGroupId && focusedGroup && (
      focusedGroup.id === selectedGroupId ||
      focusedGroup.canonical_product_id === selectedGroupId
    ) ? focusedGroup : null
  );
  const selectedGroupRequestId = selectedGroup?.id ?? selectedGroupId;
  const selectedGroupResolvedId = selectedGroup?.id ?? null;

  const commercialReviewLanes = useMemo(() => {
    return productCommercialReviewLanes(
      selectedGroup?.commercial_subgroups ?? [],
      null,
    );
  }, [selectedGroup]);
  const selectedCommercialSubgroupKey = commercialReviewLanes.some(({ subgroup }) =>
    subgroup.key === requestedCommercialSubgroupKey
  ) ? requestedCommercialSubgroupKey : null;
  const selectedCommercialSubgroup = commercialReviewLanes.find(({ subgroup }) =>
    subgroup.key === selectedCommercialSubgroupKey
  )?.subgroup ?? null;
  const selectedCommercialCaseIdsKey = selectedCommercialSubgroup
    ?.triage_case_ids.join(",") ?? null;
  const batchFindingsCoverWholeGroup = selectedCommercialSubgroupKey == null;
  const scopedBatchFindings = useMemo(() => {
    return scopeFindingsToCommercialSubgroup(
      batchFindings,
      selectedCommercialSubgroup,
    );
  }, [batchFindings, selectedCommercialSubgroup]);

  useEffect(() => {
    const nextScope = selectedGroupRequestId && selectedCommercialSubgroupKey
      ? `${selectedGroupRequestId}:${selectedCommercialSubgroupKey}`
      : null;
    if (commercialReviewScopeRef.current === nextScope) return;
    commercialReviewScopeRef.current = nextScope;
    setReviewFilter("all");
    setSelectedResultIds(new Set());
    setConfirmBatchAction(null);
    setBatchNotice(null);
  }, [selectedCommercialSubgroupKey, selectedGroupRequestId]);

  const selectCommercialReviewLane = useCallback((subgroupKey: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (subgroupKey) next.set("offer", subgroupKey);
    else next.delete("offer");
    next.delete("finding");
    next.delete("panel");
    setActiveFinding(null);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const updateSelectedGroup = useCallback((
    update: (current: PersistedProductGroup) => PersistedProductGroup,
  ) => {
    if (!selectedGroupId) return;
    setOverview((current) => current ? {
      ...current,
      groups: current.groups.map((group) =>
        group.id === selectedGroupId ||
        group.canonical_product_id === selectedGroupId
          ? update(group)
          : group
      ),
    } : current);
    setFocusedGroup((current) => current && (
      current.id === selectedGroupId ||
      current.canonical_product_id === selectedGroupId
    ) ? update(current) : current);
  }, [selectedGroupId]);

  const mergeTargetGroups = useMemo(() => (overview?.groups ?? []).filter(
    (group) => mergeTargetGroupIds.has(group.id),
  ), [mergeTargetGroupIds, overview]);
  const selectedGroupConfirmationStatus = selectedGroup?.confirmation_status;

  useEffect(() => {
    const nextBatchScope = activeIpId && selectedGroupResolvedId
      ? `${actingTenantId ?? ""}:${activeIpId}:${selectedGroupResolvedId}:` +
        `${selectedCommercialSubgroupKey ?? "all"}`
      : null;
    const scopeChanged = batchScopeRef.current !== nextBatchScope;
    if (scopeChanged) {
      batchScopeRef.current = nextBatchScope;
      setBatchFindings(null);
      setReviewFilter("all");
      setSelectedResultIds(new Set());
      setConfirmBatchAction(null);
      setBatchNotice(null);
      setActiveFinding(null);
      optimisticallyProcessedIdsRef.current.clear();
    }
    setBatchError(null);
    if (!nextBatchScope || !activeIpId || !selectedGroupResolvedId) {
      setLoadingBatch(false);
      return;
    }

    let alive = true;
    setLoadingBatch(true);
    const selectedCaseIds = selectedCommercialSubgroupKey == null
      ? null
      : selectedCommercialCaseIdsKey?.split(",").filter(Boolean) ?? [];
    void loadProductGroupFindings(
      activeIpId,
      selectedGroupResolvedId,
      selectedCaseIds,
    )
      .then((findings) => {
        if (!alive) return;
        const displayedFindings = removeProcessedFindings(
          findings,
          optimisticallyProcessedIdsRef.current,
        );
        const serverResultIds = new Set(findings.map((finding) => finding.result_id));
        for (const resultId of optimisticallyProcessedIdsRef.current) {
          if (!serverResultIds.has(resultId)) {
            optimisticallyProcessedIdsRef.current.delete(resultId);
          }
        }
        setBatchFindings(displayedFindings);
        const availableResultIds = new Set(
          displayedFindings.map((finding) => finding.result_id),
        );
        setSelectedResultIds((current) => {
          const next = new Set([...current].filter((resultId) => availableResultIds.has(resultId)));
          return next.size === current.size ? current : next;
        });
        if (selectedCommercialSubgroupKey) {
          updateSelectedGroup((group) =>
            reconcileProductCommercialSubgroupCount(
              group,
              selectedCommercialSubgroupKey,
              displayedFindings.length,
            )
          );
        } else {
          exactPendingCountsRef.current[selectedGroupResolvedId] = displayedFindings.length;
          setOverview((current) => current
            ? reconcileProductAttentionOverview(
                current,
                selectedGroupResolvedId,
                displayedFindings.length,
              )
            : current);
        }
        if (
          !selectedCommercialSubgroupKey &&
          view === "attention" &&
          selectedGroupConfirmationStatus &&
          !productNeedsAttention({
            confirmation_status: selectedGroupConfirmationStatus,
            triage_member_count: displayedFindings.length,
          })
        ) {
          selectGroup(null);
        }
      })
      .catch((caught: unknown) => {
        if (alive) setBatchError(messageFor(caught));
      })
      .finally(() => {
        if (alive) setLoadingBatch(false);
      });
    return () => {
      alive = false;
    };
  }, [
    activeIpId,
    actingTenantId,
    refreshToken,
    selectGroup,
    selectedCommercialCaseIdsKey,
    selectedCommercialSubgroupKey,
    selectedGroupConfirmationStatus,
    selectedGroupResolvedId,
    updateSelectedGroup,
    view,
  ]);

  useEffect(() => {
    if (!requestedFindingId) {
      return;
    }
    if (activeFinding?.result_id === requestedFindingId) {
      return;
    }
    let alive = true;
    void getMonitoringFinding(requestedFindingId)
      .then(({ finding }) => {
        if (alive) {
          setActiveFinding(finding);
        }
      })
      .catch((caught: unknown) => {
        if (alive) {
          setBatchNotice(`Unable to open the linked listing. ${messageFor(caught)}`);
        }
      });
    return () => {
      alive = false;
    };
  }, [activeFinding?.result_id, requestedFindingId]);

  useEffect(() => {
    if (!activeFinding) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-finding-inspector]")) return;
      closeFinding();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeFinding();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeFinding, closeFinding]);

  useEffect(() => {
    if (!mergeSourceGroup || savingMerge) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMergeSourceGroup(null);
      setMergeTargetGroupIds(new Set());
      setMergeSelectionError(null);
    };
    window.addEventListener("keydown", cancelOnEscape);
    return () => window.removeEventListener("keydown", cancelOnEscape);
  }, [mergeSourceGroup, savingMerge]);

  function beginProductMergeSelection(group: PersistedProductGroup) {
    setMergeSourceGroup(group);
    setMergeTargetGroupIds(new Set());
    setMergeSelectionError(null);
    setMergeNotice(null);
    setQuery("");
    setCollapsedCategoryPaths(new Set());
  }

  function cancelProductMergeSelection() {
    if (savingMerge) return;
    setMergeSourceGroup(null);
    setMergeTargetGroupIds(new Set());
    setMergeSelectionError(null);
  }

  function toggleMergeTarget(groupId: string) {
    if (!mergeSourceGroup || groupId === mergeSourceGroup.id || savingMerge) return;
    setMergeTargetGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setMergeSelectionError(null);
  }

  function changeView(nextView: ProductLabView) {
    const next = new URLSearchParams(searchParams);
    if (nextView === "attention") next.delete("view");
    else next.set("view", nextView);
    next.delete("group");
    next.delete("panel");
    next.delete("finding");
    setQuery("");
    setActiveFinding(null);
    setMergeSourceGroup(null);
    setMergeTargetGroupIds(new Set());
    setMergeSelectionError(null);
    setSearchParams(next);
  }

  async function loadMore() {
    if (view === "history" || !activeIpId || !overview?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadProductGroupPage(activeIpId, view, {
        cursor: overview.next_cursor,
        query: debouncedProductQuery || null,
        allProducts: Boolean(mergeSourceGroup),
      });
      setOverview((current) => current ? appendPage(current, next) : next);
    } catch (caught: unknown) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  const attentionCount = overview?.triage_group_count ?? null;
  const productCount = overview?.group_count ?? 0;
  const paginatedProductCount = view === "attention" && !mergeSourceGroup
    ? attentionCount ?? overview?.pagination_group_count ?? 0
    : overview?.pagination_group_count ?? 0;
  const remainingProductCount = Math.max(
    0,
    paginatedProductCount - visibleGroups.length,
  );
  const nextProductPageSize = Math.min(PAGE_SIZE, remainingProductCount);
  const showMobileInspector = Boolean(selectedGroupId && !mergeSourceGroup);
  const matchingRecentDecisions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return recentDecisions;
    return recentDecisions.filter((finding) => [
      finding.listing_title,
      finding.seller_name,
      finding.domain,
      finding.dismissal_reason,
      finding.review_status,
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
  }, [query, recentDecisions]);
  const visibleRecentDecisions = useMemo(
    () => matchingRecentDecisions.slice(0, historyVisibleCount),
    [historyVisibleCount, matchingRecentDecisions],
  );
  const historyHasServerPages = Object.values(historyCursors).some(Boolean);
  const historyHasOlder =
    historyVisibleCount < matchingRecentDecisions.length || historyHasServerPages;

  async function loadOlderHistory() {
    if (!activeIpId || loadingOlderHistory) return;
    if (historyVisibleCount < matchingRecentDecisions.length) {
      setHistoryVisibleCount((count) => count + 50);
      return;
    }
    if (!historyHasServerPages) return;
    setLoadingOlderHistory(true);
    setHistoryError(null);
    try {
      const result = await loadRecentDecisionPages(activeIpId, historyCursors);
      setHistoryCursors(result.cursors);
      setRecentDecisions((current) => mergeRecentDecisions(current, result.findings));
      setHistoryVisibleCount((count) => count + 50);
    } catch (caught: unknown) {
      setHistoryError(messageFor(caught));
    } finally {
      setLoadingOlderHistory(false);
    }
  }

  const selectedFindings = scopedBatchFindings?.filter((finding) =>
    selectedResultIds.has(finding.result_id)
  ) ?? [];
  const inspectorFindings = useMemo(() => view === "history"
    ? visibleRecentDecisions
    : (scopedBatchFindings ?? []).filter((finding) =>
      reviewFilter === "all" || reviewBucket(finding) === reviewFilter
    ), [reviewFilter, scopedBatchFindings, view, visibleRecentDecisions]);
  const activeFindingIndex = activeFinding
    ? inspectorFindings.findIndex((finding) => finding.result_id === activeFinding.result_id)
    : -1;

  const moveActiveFinding = useCallback((direction: -1 | 1) => {
    if (!activeFinding) return;
    const adjacent = adjacentFinding(inspectorFindings, activeFinding.result_id, direction);
    if (adjacent) openFinding(adjacent);
  }, [activeFinding, inspectorFindings, openFinding]);

  async function undoRecentDecision(finding: IpReviewFinding) {
    const findingIpId = finding.ip_id ?? activeIpId;
    if (!findingIpId || undoingResultIds.has(finding.result_id)) return;
    const kind = recentDecisionKind(finding);
    if (!kind || !recentDecisionCanUndo(finding)) return;
    if (
      (kind === "takedown_sent" || kind === "enforced") &&
      !window.confirm(
        "This reopens the listing inside Unvelar, but it cannot recall a takedown notice that was already sent. Reopen it?",
      )
    ) return;

    setUndoingResultIds((current) => new Set(current).add(finding.result_id));
    setHistoryNotice(null);
    try {
      if (kind === "dismissed") {
        await undismissIpFinding(findingIpId, finding.result_id);
      } else {
        await reopenIpFinding(findingIpId, finding.result_id);
      }
      const reset = resetOptimisticProductStateAfterUndo(
        optimisticallyProcessedIdsRef.current,
        finding.result_id,
      );
      exactPendingCountsRef.current = reset.exactPendingCounts;
      optimisticallyProcessedIdsRef.current = reset.processedResultIds;
      setRecentDecisions((current) => current.filter(
        (item) => item.result_id !== finding.result_id,
      ));
      if (activeFinding?.result_id === finding.result_id) closeFinding();
      setHistoryNotice("Decision undone. The listing is back in Needs attention.");
      setRefreshToken((token) => token + 1);
    } catch (caught: unknown) {
      setHistoryNotice(`Unable to undo this decision. ${messageFor(caught)}`);
    } finally {
      setUndoingResultIds((current) => {
        const next = new Set(current);
        next.delete(finding.result_id);
        return next;
      });
    }
  }

  function partitionBatch(action: ProductLabBatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (reason: string) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    for (const finding of selectedFindings) {
      const findingIpId = finding.ip_id ?? activeIpId;
      if (action === "send") {
        if (!finding.case_id) skip("still preparing");
        else eligible.push(finding);
      } else if (action === "allow_product") {
        if (!findingIpId) skip("no associated IP");
        else if (!preferredAllowedProductImage(finding)) skip("no eligible product image");
        else eligible.push(finding);
      } else if (action === "review") {
        if (!finding.case_id) skip("still preparing");
        else if (!findingIpId) skip("no associated IP");
        else eligible.push(finding);
      } else if (!findingIpId) {
        skip("no associated IP");
      } else {
        eligible.push(finding);
      }
    }
    return { eligible, skipped };
  }

  async function runBatch(
    action: ProductLabBatchAction,
    decisionReason?: string,
    associationScopes?: TakedownFeedbackAssociationScope[],
  ) {
    const { eligible, skipped } = partitionBatch(action);
    if (eligible.length === 0) {
      setBatchNotice("None of the selected listings can use that action yet.");
      return;
    }

    setBatchProgress({ done: 0, total: eligible.length });
    let completed = 0;
    let failed = 0;
    const processedResultIds = new Set<string>();
    try {
      if (action === "send") {
        const result = await approveTakedownBatch(
          eligible.map((finding) => finding.case_id as string),
          decisionReason ?? "",
          associationScopes ?? [],
        );
        completed = result.queued_case_ids.length + (result.legal_queue?.length ?? 0);
        failed = result.failed.length;
        const handledCaseIds = new Set([
          ...result.queued_case_ids,
          ...(result.legal_queue ?? []).map((item) => item.case_id),
        ]);
        for (const finding of eligible) {
          if (finding.case_id && handledCaseIds.has(finding.case_id)) {
            processedResultIds.add(finding.result_id);
          }
        }
        for (const item of result.skipped) {
          skipped[item.reason] = (skipped[item.reason] ?? 0) + 1;
        }
        setBatchProgress({ done: eligible.length, total: eligible.length });
      } else {
        await runPool(eligible, async (finding) => {
          try {
            const findingIpId = (finding.ip_id ?? activeIpId) as string;
            if (action === "review") {
              await markIpFindingNeedsReview(findingIpId, finding.result_id);
            } else if (action === "allow_product") {
              await allowIpFindingProductImage(findingIpId, finding.result_id, {
                image_url: preferredAllowedProductImage(finding),
              });
            } else {
              await dismissIpFinding(
                findingIpId,
                finding.result_id,
                dismissalOptionsForBatchAction(action),
              );
            }
            completed += 1;
            processedResultIds.add(finding.result_id);
          } catch {
            failed += 1;
          } finally {
            setBatchProgress((progress) => progress
              ? { ...progress, done: progress.done + 1 }
              : progress);
          }
        }, 4);
      }
      const skippedCount = Object.values(skipped).reduce((sum, count) => sum + count, 0);
      if (processedResultIds.size > 0) {
        for (const resultId of processedResultIds) {
          optimisticallyProcessedIdsRef.current.add(resultId);
        }
        setBatchFindings((current) => current
          ? removeProcessedFindings(current, processedResultIds)
          : current);
        if (selectedGroupRequestId && batchFindings) {
          const remainingCount = removeProcessedFindings(
            batchFindings,
            processedResultIds,
          ).length;
          if (batchFindingsCoverWholeGroup) {
            exactPendingCountsRef.current[selectedGroupRequestId] = remainingCount;
            setOverview((current) => current
              ? reconcileProductAttentionOverview(current, selectedGroupRequestId, remainingCount)
              : current);
          } else if (selectedCommercialSubgroupKey) {
            updateSelectedGroup((group) =>
              reconcileProductCommercialSubgroupCount(
                group,
                selectedCommercialSubgroupKey,
                remainingCount,
              )
            );
          }
        }
      }
      setBatchNotice([
        `${completed} processed`,
        skippedCount ? `${skippedCount} skipped` : null,
        failed ? `${failed} failed` : null,
      ].filter(Boolean).join(" · "));
      setSelectedResultIds(new Set());
      setRefreshToken((token) => token + 1);
    } catch (caught: unknown) {
      setBatchNotice(`Nothing was processed. ${messageFor(caught)}`);
    } finally {
      setBatchProgress(null);
    }
  }

  function resolveActiveFinding() {
    if (!activeFinding) return;
    const resolvedResultId = activeFinding.result_id;
    setBatchFindings((current) => current?.filter(
      (finding) => finding.result_id !== resolvedResultId
    ) ?? current);
    setSelectedResultIds((current) => {
      if (!current.has(resolvedResultId)) return current;
      const next = new Set(current);
      next.delete(resolvedResultId);
      return next;
    });
    closeFinding();
    setRefreshToken((token) => token + 1);
  }

  async function dismissActiveFinding(
    reason: MonitoringReviewOutcome,
    reasonCode?: MonitoringDismissReasonCode,
  ) {
    if (!activeFinding) return;
    const findingIpId = activeFinding.ip_id ?? activeIpId;
    if (!findingIpId) {
      setBatchNotice("This listing has no associated IP, so it cannot be updated.");
      return;
    }
    setDismissingResultId(activeFinding.result_id);
    try {
      await dismissIpFinding(findingIpId, activeFinding.result_id, {
        reason,
        ...(reasonCode ? { reason_code: reasonCode } : {}),
      });
      resolveActiveFinding();
    } catch (caught: unknown) {
      setBatchNotice(`Unable to update this listing. ${messageFor(caught)}`);
    } finally {
      setDismissingResultId(null);
    }
  }

  function refreshActiveFinding(options?: { completed?: boolean }) {
    if (!activeFinding || options?.completed) {
      if (options?.completed) resolveActiveFinding();
      return;
    }
    const resultId = activeFinding.result_id;
    void getMonitoringFinding(resultId)
      .then(({ finding }) => {
        setActiveFinding((current) => current?.result_id === resultId ? finding : current);
        setBatchFindings((current) => current?.map((item) =>
          item.result_id === resultId ? finding : item
        ) ?? current);
      })
      .catch((caught: unknown) => {
        setBatchNotice(`Unable to refresh this listing. ${messageFor(caught)}`);
      });
  }

  async function mergeSelectedProducts() {
    if (!activeIpId || !mergeSourceGroup || savingMerge) return;
    if (mergeTargetGroupIds.size === 0) return;
    if (mergeTargetGroups.length !== mergeTargetGroupIds.size) {
      setMergeSelectionError("Some selected products are no longer loaded. Refresh and select them again.");
      return;
    }

    const source = mergeSourceGroup;
    const targets = [...mergeTargetGroups];
    const completedTargets: PersistedProductGroup[] = [];
    const decisions: NonNullable<ProductMergeNotice["undo"]>["decisions"] = [];
    let mergedGroup = source;
    let failure: {
      target: PersistedProductGroup;
      message: string;
      mergeWasSaved: boolean;
    } | null = null;

    setSavingMerge(true);
    setMergeProgress({ done: 0, total: targets.length });
    setMergeSelectionError(null);
    try {
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        let decision: Awaited<ReturnType<typeof mergePersistedProductGroups>>["decision"];
        try {
          ({ decision } = await mergePersistedProductGroups(
            activeIpId,
            mergedGroup.id,
            target.id,
          ));
        } catch (caught: unknown) {
          failure = { target, message: messageFor(caught), mergeWasSaved: false };
          break;
        }
        decisions.push({
          decisionId: decision.id,
          canonicalProductId: decision.canonical_product_id,
        });
        completedTargets.push(target);
        try {
          mergedGroup = await loadCanonicalProductGroup(
            activeIpId,
            decision.canonical_product_id,
          );
          setMergeProgress({ done: index + 1, total: targets.length });
        } catch (caught: unknown) {
          failure = { target, message: messageFor(caught), mergeWasSaved: true };
          break;
        }
      }

      if (decisions.length === 0) {
        setMergeSelectionError(failure?.message ?? "The selected products could not be merged.");
        return;
      }

      const mergedGroupIds = new Set([
        source.id,
        ...completedTargets.map((group) => group.id),
      ]);
      setOverview((current) => {
        if (!current) return current;
        const sourceIndex = current.groups.findIndex((group) => group.id === source.id);
        const remaining = current.groups.filter((group) =>
          !mergedGroupIds.has(group.id) && group.id !== mergedGroup.id
        );
        remaining.splice(Math.max(0, sourceIndex), 0, mergedGroup);
        const triageReduction = completedTargets.filter((group) =>
          (group.triage_member_count ?? 0) > 0
        ).length;
        return {
          ...current,
          groups: remaining,
          group_count: Math.max(0, current.group_count - completedTargets.length),
          pagination_group_count: Math.max(
            0,
            current.pagination_group_count - completedTargets.length,
          ),
          catalog_product_count: Math.max(
            0,
            current.catalog_product_count - completedTargets.length,
          ),
          triage_group_count: current.triage_group_count === null
            ? null
            : Math.max(0, current.triage_group_count - triageReduction),
        };
      });

      setMergeSourceGroup(null);
      setMergeTargetGroupIds(new Set());
      setMergeSelectionError(null);
      setMergeNotice({
        message: failure
          ? failure.mergeWasSaved
            ? `${completedTargets.length} of ${targets.length} selected products were combined, but the updated row could not be loaded yet: ${failure.message}`
            : `${completedTargets.length} of ${targets.length} selected products were combined. “${productName(failure.target)}” was not merged: ${failure.message}`
          : `${completedTargets.length + 1} product groups are now one product. Future matching listings will use this reviewer decision.`,
        tone: failure ? "error" : "success",
        undo: {
          decisions,
          groupId: mergedGroup.id,
          sourceGroupId: source.id,
        },
      });
      selectGroup(mergedGroup.id);
      setRefreshToken((token) => token + 1);
    } finally {
      setSavingMerge(false);
      setMergeProgress(null);
    }
  }

  async function undoLastProductMerge() {
    const undo = mergeNotice?.undo;
    if (!activeIpId || !undo || undoingMerge) return;
    setUndoingMerge(true);
    let currentGroupId = undo.groupId;
    let remainingDecisions = [...undo.decisions];
    try {
      for (let index = undo.decisions.length - 1; index >= 0; index -= 1) {
        const decision = undo.decisions[index];
        await revokePersistedProductGroupMerge(
          activeIpId,
          currentGroupId,
          decision.decisionId,
        );
        remainingDecisions = remainingDecisions.slice(0, index);
        const previousDecision = undo.decisions[index - 1];
        if (previousDecision) {
          const restoredGroup = await loadCanonicalProductGroup(
            activeIpId,
            previousDecision.canonicalProductId,
          );
          currentGroupId = restoredGroup.id;
        }
      }
      setMergeNotice({
        message: "Same-product decisions undone. The previous product groups will be restored.",
        tone: "success",
      });
      selectGroup(undo.sourceGroupId);
      setRefreshToken((token) => token + 1);
    } catch (caught: unknown) {
      setMergeNotice({
        message: remainingDecisions.length < undo.decisions.length
          ? `Undo was only partly completed. ${messageFor(caught)}`
          : `Unable to undo the same-product decision. ${messageFor(caught)}`,
        tone: "error",
        undo: remainingDecisions.length > 0
          ? { ...undo, decisions: remainingDecisions, groupId: currentGroupId }
          : undefined,
      });
    } finally {
      setUndoingMerge(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh_-_var(--app-shell-topbar-height)_-_var(--app-shell-banner-height))] bg-[#f7f6f3] text-stone-950 lg:h-[calc(100dvh_-_var(--app-shell-topbar-height)_-_var(--app-shell-banner-height))] lg:overflow-hidden">
      <header className="border-b border-stone-200/80 bg-[#faf9f7] px-4 py-[7px] sm:px-6 lg:px-5">
        <div className="flex min-h-[28px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="shrink-0 text-[16px] font-semibold tracking-[-0.025em] text-stone-950">
              Product Lab
            </h1>
            <p className="hidden truncate text-[11px] text-stone-500 sm:block">
              {activeIp?.name ? `${activeIp.name} · ` : ""}Review what needs attention, then move on.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRefreshToken((token) => token + 1)}
              disabled={loading || loadingHistory}
              className="grid size-[28px] place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
              aria-label="Refresh products"
              title="Refresh products"
            >
              <RefreshCw size={14} className={loading || loadingHistory ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:h-[calc(100%-43px)] lg:grid-cols-[minmax(340px,0.82fr)_minmax(430px,1.18fr)]">
        <section className={`${showMobileInspector ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-stone-200/80 bg-[#faf9f7] lg:border-r`} aria-label="Products">
          <div className="border-b border-stone-200/80 px-4 sm:px-6 lg:px-4">
            <div className="flex items-center gap-4 overflow-x-auto" role="tablist" aria-label="Product views">
              <ViewTab
                active={view === "attention"}
                label="Needs attention"
                count={attentionCount}
                onClick={() => changeView("attention")}
              />
              <ViewTab
                active={view === "history"}
                label="Recent decisions"
                count={null}
                onClick={() => changeView("history")}
              />
              <ViewTab
                active={view === "all"}
                label="All products"
                count={view === "all" ? productCount : null}
                onClick={() => changeView("all")}
              />
            </div>
          </div>

          {mergeSourceGroup && (
            <div
              role="region"
              aria-label="Select products that are the same"
              className="border-b border-violet-200 bg-violet-50 px-4 py-3 sm:px-6 lg:px-4"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-violet-700 text-white">
                  <Link2 size={13} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-violet-950">
                    Which rows are the same product?
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-violet-800/75">
                    Started with “{productName(mergeSourceGroup)}”. Click every matching product below.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={savingMerge}
                  onClick={cancelProductMergeSelection}
                  className="h-7 shrink-0 rounded-md px-2 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-40"
                >
                  Cancel
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] font-medium text-violet-800">
                  {mergeTargetGroupIds.size === 0
                    ? "No matching rows selected yet"
                    : `${mergeTargetGroupIds.size} matching ${mergeTargetGroupIds.size === 1 ? "row" : "rows"} selected`}
                </span>
                <button
                  type="button"
                  disabled={mergeTargetGroupIds.size === 0 || savingMerge}
                  onClick={() => void mergeSelectedProducts()}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-violet-700 px-3 text-[10px] font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingMerge ? <LoaderCircle size={12} className="animate-spin" /> : <Link2 size={12} />}
                  {savingMerge && mergeProgress
                    ? `Combining ${mergeProgress.done}/${mergeProgress.total}`
                    : mergeTargetGroupIds.size > 0
                      ? `Merge ${mergeTargetGroupIds.size + 1} as one product`
                      : "Select matching rows"}
                </button>
              </div>
              {mergeSelectionError && (
                <p role="alert" className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] leading-4 text-red-800">
                  {mergeSelectionError}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 border-b border-stone-200/80 px-4 py-[7px] sm:px-6 lg:px-4">
            <label className="relative block min-w-0 flex-1">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={view === "history"
                  ? "Search decision history"
                  : view === "all" || mergeSourceGroup
                    ? "Search all products"
                    : "Search products needing attention"}
                placeholder={view === "history"
                  ? "Search recent decisions"
                  : mergeSourceGroup
                    ? "Search all products to merge"
                    : view === "all"
                      ? "Search all products"
                      : "Search products"}
                className="block h-[30px] w-full rounded-md border border-stone-200 bg-white pl-8 pr-3 text-[11px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/70"
              />
            </label>
            {view !== "history" && overview && (
              <div
                className="shrink-0 text-[10px] leading-[14px] tabular-nums text-stone-500"
                role="status"
                aria-live="polite"
              >
                <span>
                  {loading
                    ? "Updating…"
                    : `${visibleGroups.length} of ${paginatedProductCount}${query.trim() ? " matches" : ""}`}
                </span>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {view !== "history" && error && (
              <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-800">
                {error}
              </div>
            )}

            {view === "history" ? (
              <>
                {historyNotice && (
                  <div className="m-3 flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-700">
                    <span>{historyNotice}</span>
                    <button
                      type="button"
                      onClick={() => setHistoryNotice(null)}
                      className="shrink-0 font-medium text-stone-400 hover:text-stone-800"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
                {historyError ? (
                  <div className="m-4 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] text-red-800">
                    {historyError}
                  </div>
                ) : loadingHistory ? (
                  <QueueSkeleton />
                ) : visibleRecentDecisions.length === 0 ? (
                  <QuietState
                    icon={<Clock3 size={18} />}
                    title={query ? "No matching decisions" : "No recent decisions"}
                    detail={query
                      ? "Try another listing, seller, or marketplace."
                      : "Decisions you make for this IP will appear here."}
                  />
                ) : (
                  <>
                    <div className="flex items-center justify-between border-b border-stone-200/70 bg-white px-4 py-2 text-[10px] text-stone-500 sm:px-6 lg:px-4">
                      <span>
                        Showing {visibleRecentDecisions.length} of {matchingRecentDecisions.length} loaded decisions
                      </span>
                      <span>Newest first</span>
                    </div>
                    <div role="listbox" aria-label="Decision history">
                      {visibleRecentDecisions.map((finding) => (
                        <RecentDecisionRow
                          key={finding.result_id}
                          finding={finding}
                          selected={activeFinding?.result_id === finding.result_id}
                          undoing={undoingResultIds.has(finding.result_id)}
                          onOpen={() => openFinding(finding)}
                          onUndo={() => void undoRecentDecision(finding)}
                        />
                      ))}
                    </div>
                    {historyHasOlder && (
                      <div className="border-t border-stone-200/80 p-3 text-center">
                        <button
                          type="button"
                          onClick={() => void loadOlderHistory()}
                          disabled={loadingOlderHistory}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
                        >
                          {loadingOlderHistory && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
                          {loadingOlderHistory ? "Loading older decisions…" : "Load 50 older decisions"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : loading && !overview ? (
              <QueueSkeleton />
            ) : error && !overview ? null : !activeIpId ? (
              <QuietState
                icon={<Layers3 size={18} />}
                title="Choose a working IP"
                detail="Product Lab follows the IP selected in the top bar."
              />
            ) : scopeAvailable === false ? (
              <QuietState
                icon={<Clock3 size={18} />}
                title="Products are still being prepared"
                detail={`There is no product grouping available for ${activeIp?.name ?? "this IP"} yet.`}
              />
            ) : visibleGroups.length === 0 ? (
              <QuietState
                icon={view === "attention" ? <Check size={18} /> : <Search size={18} />}
                title={query ? "No matching products" : view === "attention" ? "You're caught up" : "No products yet"}
                detail={query
                  ? "Try another product name or clear the search."
                  : view === "attention"
                    ? "Nothing needs your attention right now."
                    : "Products will appear after monitoring finds enough listing evidence."}
              />
            ) : (
              <div
                role="listbox"
                aria-label="Product list"
                aria-multiselectable={Boolean(mergeSourceGroup)}
                onKeyDown={(event) => {
                  if (mergeSourceGroup) return;
                  if (!["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) return;
                  if (navigableGroups.length === 0) return;
                  event.preventDefault();
                  const currentIndex = navigableGroups.findIndex((group) => group.id === selectedGroup?.id);
                  const direction = event.key === "ArrowDown" || event.key === "j" ? 1 : -1;
                  const nextIndex = Math.max(0, Math.min(navigableGroups.length - 1, currentIndex + direction));
                  selectGroup(navigableGroups[nextIndex].id);
                }}
              >
                {pagedCategoryTrees.map((categories, pageIndex) => (
                  <div key={pageIndex}>
                    {pageIndex > 0 && (
                      <div className="border-y border-stone-200/80 bg-stone-50 px-4 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-400 sm:px-6 lg:px-4">
                        Page {pageIndex + 1}
                      </div>
                    )}
                    {categories.map((category) => (
                      <ProductCategoryBranch
                        key={category.key}
                        category={category}
                        depth={0}
                        collapsedPaths={collapsedCategoryPaths}
                        forceExpanded={Boolean(query.trim())}
                        showAllListings={view === "all" || Boolean(mergeSourceGroup)}
                        selectedGroupId={selectedGroup?.id ?? null}
                        mergeSourceGroupId={mergeSourceGroup?.id ?? null}
                        mergeTargetGroupIds={mergeTargetGroupIds}
                        mergeDisabled={savingMerge}
                        onToggle={toggleCategory}
                        onSelectGroup={selectGroup}
                        onToggleMergeGroup={toggleMergeTarget}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {view !== "history" && overview?.next_cursor && !loading && (
              <div className="border-t border-stone-200/80 p-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="h-8 rounded-md px-3 text-[11px] font-medium text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 disabled:opacity-50"
                >
                  {loadingMore
                    ? "Loading…"
                    : nextProductPageSize > 0
                      ? `Load ${nextProductPageSize} more`
                      : "Load more"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className={`${showMobileInspector ? "block" : "hidden lg:block"} min-h-0 overflow-y-auto overscroll-contain bg-white`} aria-label="Selected product">
          {view === "history" ? (
            <div className="grid h-full min-h-[420px] place-items-center px-8 text-center">
              <div className="max-w-xs">
                <RotateCcw size={20} className="mx-auto text-stone-300" />
                <p className="mt-3 text-[13px] font-medium text-stone-700">A quiet safety net</p>
                <p className="mt-1 text-[12px] leading-5 text-stone-400">
                  Open a recent listing to review the details, or undo its decision directly from the history list.
                </p>
              </div>
            </div>
          ) : selectedGroup && showGroupSettings && activeIpId ? (
            <ProductSettingsWorkspace
              key={selectedGroup.id}
              group={selectedGroup}
              ipId={activeIpId}
              onBack={() => selectGroup(null)}
              onReview={openReviewQueue}
              onGroupChange={updateSelectedGroup}
              onRefresh={() => setRefreshToken((token) => token + 1)}
            />
          ) : selectedGroup ? (
            <BatchWorkspace
              group={selectedGroup}
              findings={scopedBatchFindings}
              commercialReviewLanes={commercialReviewLanes}
              selectedCommercialSubgroupKey={selectedCommercialSubgroupKey}
              loading={loadingBatch}
              error={batchError}
              filter={reviewFilter}
              selectedResultIds={selectedResultIds}
              batchProgress={batchProgress}
              notice={batchNotice}
              selectingSameProduct={Boolean(mergeSourceGroup)}
              onBack={() => selectGroup(null)}
              onFilterChange={(nextFilter) => {
                setReviewFilter(nextFilter);
                setSelectedResultIds(new Set());
              }}
              onCommercialSubgroupChange={selectCommercialReviewLane}
              onToggleFinding={(resultId) => {
                setSelectedResultIds((current) => {
                  const next = new Set(current);
                  if (next.has(resultId)) next.delete(resultId);
                  else next.add(resultId);
                  return next;
                });
                setBatchNotice(null);
              }}
              onSetFindingsSelected={(resultIds, selected) => {
                setSelectedResultIds((current) => {
                  const next = new Set(current);
                  for (const resultId of resultIds) {
                    if (selected) next.add(resultId);
                    else next.delete(resultId);
                  }
                  return next;
                });
                setBatchNotice(null);
              }}
              onOpenFinding={openFinding}
              onBatchAction={setConfirmBatchAction}
              onMergeProduct={() => beginProductMergeSelection(selectedGroup)}
              onOpenSettings={openGroupSettings}
              onDismissNotice={() => setBatchNotice(null)}
            />
          ) : selectedGroupId && loadingFocusedGroup ? (
            <div className="grid h-full min-h-[420px] place-items-center px-8 text-center">
              <div>
                <LoaderCircle size={20} className="mx-auto animate-spin text-stone-400" />
                <p className="mt-3 text-[13px] font-medium text-stone-700">Loading product…</p>
              </div>
            </div>
          ) : selectedGroupId && focusedGroupError ? (
            <div className="grid h-full min-h-[420px] place-items-center px-8 text-center">
              <div className="max-w-sm">
                <p className="text-[13px] font-medium text-stone-800">Product not found</p>
                <p className="mt-1 text-[12px] leading-5 text-stone-500">{focusedGroupError}</p>
                <button
                  type="button"
                  onClick={() => selectGroup(null)}
                  className="mt-3 h-8 rounded-md border border-stone-200 bg-white px-3 text-[11px] font-medium text-stone-700 hover:bg-stone-50"
                >
                  Back to products
                </button>
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-[420px] place-items-center px-8 text-center">
              <div>
                <Sparkles size={20} className="mx-auto text-stone-300" />
                <p className="mt-3 text-[13px] font-medium text-stone-700">Choose a product group</p>
                <p className="mt-1 text-[12px] text-stone-400">Then process its listings as one batch.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {confirmBatchAction && (
        <BatchConfirmModal
          action={confirmBatchAction}
          scopeLabel={selectedGroup ? productName(selectedGroup) : undefined}
          {...partitionBatch(confirmBatchAction)}
          onCancel={() => setConfirmBatchAction(null)}
          onConfirm={(decisionReason, associationScopes) => {
            const action = confirmBatchAction;
            setConfirmBatchAction(null);
            void runBatch(action, decisionReason, associationScopes);
          }}
        />
      )}
      {mergeNotice && (
        <div
          role={mergeNotice.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`fixed bottom-4 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-start gap-3 rounded-xl border px-4 py-3 shadow-xl ${
            mergeNotice.tone === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-950"
          }`}
        >
          <Check size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[11px] font-medium leading-5">
            {mergeNotice.message}
          </p>
          {mergeNotice.undo && (
            <button
              type="button"
              disabled={undoingMerge}
              onClick={() => void undoLastProductMerge()}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-current/20 bg-white/70 px-2 text-[10px] font-semibold hover:bg-white disabled:opacity-50"
            >
              {undoingMerge && <LoaderCircle size={11} className="animate-spin" />}
              {undoingMerge ? "Undoing…" : "Undo"}
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss same-product notice"
            onClick={() => setMergeNotice(null)}
            className="grid size-7 shrink-0 place-items-center rounded-md opacity-60 hover:bg-white/70 hover:opacity-100"
          >
            <X size={13} />
          </button>
        </div>
      )}
      {activeFinding && (
        <FindingInspector
          f={activeFinding}
          ipId={activeFinding.ip_id ?? activeIpId ?? undefined}
          showIp={false}
          isDismissed={Boolean(activeFinding.dismissed_at)}
          isDismissing={dismissingResultId === activeFinding.result_id}
          onClose={closeFinding}
          onDismiss={(reason, reasonCode) => void dismissActiveFinding(reason, reasonCode)}
          onActionComplete={resolveActiveFinding}
          onNeedsReview={resolveActiveFinding}
          onTakedownSent={resolveActiveFinding}
          onEnforced={resolveActiveFinding}
          onLicensed={resolveActiveFinding}
          onUpdated={refreshActiveFinding}
          onAddRelatedToBatch={() => undefined}
          productGroupId={selectedGroup?.id}
          navigation={activeFindingIndex >= 0 ? {
            position: activeFindingIndex + 1,
            total: inspectorFindings.length,
            onPrevious: activeFindingIndex > 0
              ? () => moveActiveFinding(-1)
              : undefined,
            onNext: activeFindingIndex < inspectorFindings.length - 1
              ? () => moveActiveFinding(1)
              : undefined,
          } : undefined}
          taskHref={selectedGroup
            ? `/monitoring/products?group=${encodeURIComponent(selectedGroup.id)}` +
              `&finding=${encodeURIComponent(activeFinding.result_id)}`
            : undefined}
        />
      )}
    </div>
  );
}
