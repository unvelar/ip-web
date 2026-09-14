import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { CaseReviewStatus } from "../api/cases";
import type { MonitoringDismissReasonCode, MonitoringReviewOutcome } from "../api/findingActions";
import { dismissIpFinding, markIpFindingEnforced, markIpFindingNeedsReview } from "../api/findingActions";
import { getMonitoringFinding, getMonitoringFindingForCase, listMonitoringFindingsGlobal } from "../api/monitoring";
import type {
  PersistedProductGroup,
  PersistedProductGroupOverview,
  ProductCatalogScope,
  ProductClusterProfile,
  ProductClusterScope,
  ProductGroupAuthenticityRuleInput,
  ProductGroupCommercialSubgroup,
  ProductGroupCorrectionReason,
  ProductSemanticCategory,
  ProductSemanticColor,
  ShopifyProductTaxonomyCategory,
} from "../api/products";
import {
  confirmPersistedProductGroup,
  correctProductSemanticGroupMember,
  createPersistedProductGroupAuthenticityRule,
  createPersistedProductGroupRule,
  DEFAULT_PRODUCT_SEMANTIC_COLORS,
  DEFAULT_PRODUCT_SEMANTIC_TAXONOMY,
  deletePersistedProductGroupAuthenticityRule,
  deletePersistedProductGroupRule,
  excludePersistedProductGroupMember,
  getPersistedProductGroups,
  getProductSemanticTaxonomy,
  listProductClusterScopes,
  mergePersistedProductGroups,
  refreshPersistedProductGroups,
  restoreProductSemanticCorrection,
  revokePersistedProductGroupMerge,
  updatePersistedProductGroupAuthenticityRule,
  updatePersistedProductGroupEmbeddingSettings,
  updatePersistedProductGroupRule,
} from "../api/products";
import type { IpReviewFinding } from "../api/reviews";
import type { TakedownFeedbackAssociationScope } from "../api/takedowns";
import { approveTakedownBatch } from "../api/takedowns";
import { isApiError } from "../api/transport";
import { BatchResultNotice } from "../components/monitoring/board/BatchResultNotice";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import type { BatchAction, BatchResult } from "../components/monitoring/board/batchUtils";
import {
  dismissalOptionsForBatchAction,
  runPool,
  summarizeBatch,
  summarizeTakedownBatch,
} from "../components/monitoring/board/batchUtils";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import { EmptyState } from "../features/products/EmptyState";
import { LoadingState } from "../features/products/LoadingState";
import { ProductGroupCard } from "../features/products/ProductGroupCard";
import { ProductQueue } from "../features/products/ProductQueue";
import { ProductWorkspaceNotFound } from "../features/products/ProductWorkspaceNotFound";
import { SemanticCorrectionDialog } from "../features/products/SemanticCorrectionDialog";
import { loadProductGroupBatch } from "../features/products/clusterData";
import type {
  AcknowledgedProductTaskResolution,
  ActiveProductTask,
  ProductGroupBatch,
  ProductGroupRecommendationBucket,
  SemanticCorrectionTarget,
} from "../features/products/clusterDomain";
import {
  appendProductGroupPage,
  applyAcknowledgedProductTaskResolutions,
  errorMessage,
  findingMatchesAcknowledgedResolution,
  findingProfileId,
  isDecisionState,
  optimisticallyExcludeProductGroupMember,
  optimisticallyResolveProductGroupTask,
  optimisticallyResolveProductGroupTaskInOverview,
  PRODUCT_GROUP_PAGE_SIZE,
  PRODUCT_GROUP_VIEW,
  productCommercialReviewScopeId,
  productGroupRecommendationBucket,
  productGroupSubgroupKey,
  productTaskResolution,
  recommendationBucketForFinding,
  reconcileProductGroupTaskProjection,
  reconcileProductGroupTaskProjectionInOverview,
  selectedProductGroupBatchFindings,
  SEMANTIC_GROUP_PAGE_SIZE,
} from "../features/products/clusterDomain";

export default function ProductClusters() {
  const location = useLocation();
  const navigate = useNavigate();
  const { groupId: linkedGroupId, taskId: linkedTaskId } = useParams<{
    groupId: string;
    taskId: string;
  }>();
  const { actingTenantId } = useAuth();
  const requestedCategoryId = new URLSearchParams(location.search).get("category");
  const requestedCatalogScope = new URLSearchParams(location.search).get("scope");
  const catalogScope: ProductCatalogScope = requestedCatalogScope === "history"
    ? "history"
    : "catalog";
  const selectedCategoryId = requestedCategoryId === "unclassified" ||
      /^gid:\/\/shopify\/TaxonomyCategory\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
        requestedCategoryId ?? "",
      )
    ? requestedCategoryId
    : null;
  const {
    activeIpId: selectedIpId,
    activeIp,
    loading: loadingActiveIp,
  } = useActiveIp();
  const [scopes, setScopes] = useState<ProductClusterScope[]>([]);
  const [, setSemanticOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [visualOverview, setVisualOverview] =
    useState<PersistedProductGroupOverview | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productSort, setProductSort] = useState<"work" | "name">("work");
  const [focusedGroup, setFocusedGroup] = useState<PersistedProductGroup | null>(null);
  const [focusedGroupResolvedId, setFocusedGroupResolvedId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scopesLoadedKey, setScopesLoadedKey] = useState<string | null>(null);
  const [groupsLoadedKey, setGroupsLoadedKey] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [loadingMoreSemanticGroups, setLoadingMoreSemanticGroups] = useState(false);
  const [loadingMoreVisualGroups, setLoadingMoreVisualGroups] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [mergeSourceGroupId, setMergeSourceGroupId] = useState<string | null>(null);
  const [savingMergeKey, setSavingMergeKey] = useState<string | null>(null);
  const [revokingMergeDecisionId, setRevokingMergeDecisionId] = useState<string | null>(null);
  const [savingCorrectionProfileId, setSavingCorrectionProfileId] = useState<string | null>(null);
  const [savingSemanticCorrectionProfileId, setSavingSemanticCorrectionProfileId] =
    useState<string | null>(null);
  const [semanticCorrectionTarget, setSemanticCorrectionTarget] =
    useState<SemanticCorrectionTarget | null>(null);
  const [semanticTaxonomy, setSemanticTaxonomy] = useState<ProductSemanticCategory[]>([]);
  const [semanticColors, setSemanticColors] = useState<ProductSemanticColor[]>(
    () => [...DEFAULT_PRODUCT_SEMANTIC_COLORS],
  );
  const [semanticTaxonomyLoaded, setSemanticTaxonomyLoaded] = useState(false);
  const [, setSemanticFeedbackNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveProductTask | null>(null);
  const [loadingTaskProfileId, setLoadingTaskProfileId] = useState<string | null>(null);
  const [dismissingTaskId, setDismissingTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [loadingGroupTasksId, setLoadingGroupTasksId] = useState<string | null>(null);
  const [loadedGroupTasks, setLoadedGroupTasks] = useState<Record<string, IpReviewFinding[]>>({});
  const [productTaskHistory, setProductTaskHistory] =
    useState<Record<string, IpReviewFinding[]>>({});
  const [loadingProductHistoryId, setLoadingProductHistoryId] = useState<string | null>(null);
  const [expandedSubgroupKeys, setExpandedSubgroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeBatch, setActiveBatch] = useState<ProductGroupBatch | null>(null);
  const [confirmBatchAction, setConfirmBatchAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const taskRequestSequence = useRef(0);
  const productHistoryRequestSequence = useRef(0);
  const closingTaskRouteRef = useRef<string | null>(null);
  const batchRequestSequence = useRef(0);
  const semanticPageRequestSequence = useRef(0);
  const visualPageRequestSequence = useRef(0);
  const acknowledgedProductTaskResolutions = useRef(
    new Map<string, AcknowledgedProductTaskResolution>(),
  );
  const taskRouteScrollPosition = useRef<{ main: number; window: number } | null>(null);
  const taskRouteRef = useRef({ linkedGroupId, linkedTaskId, search: location.search });
  taskRouteRef.current = { linkedGroupId, linkedTaskId, search: location.search };
  const rememberTaskRouteScrollPosition = useCallback(() => {
    taskRouteScrollPosition.current = {
      main: document.querySelector("main")?.scrollTop ?? 0,
      window: window.scrollY,
    };
  }, []);
  const closeTask = useCallback(() => {
    taskRequestSequence.current += 1;
    const closingLinkedTaskId = taskRouteRef.current.linkedTaskId;
    if (closingLinkedTaskId) {
      closingTaskRouteRef.current = closingLinkedTaskId;
      rememberTaskRouteScrollPosition();
      navigate({
        pathname: taskRouteRef.current.linkedGroupId
          ? `/monitoring/products/${encodeURIComponent(taskRouteRef.current.linkedGroupId)}`
          : "/monitoring/products",
        search: taskRouteRef.current.search,
      });
    }
    setActiveTask(null);
    setLoadingTaskProfileId(null);
  }, [navigate, rememberTaskRouteScrollPosition]);
  const applyAcknowledgedResolutions = useCallback(
    (overview: PersistedProductGroupOverview) =>
      applyAcknowledgedProductTaskResolutions(
        overview,
        acknowledgedProductTaskResolutions.current.values(),
      ),
    [],
  );
  const omitAcknowledgedGroupFindings = useCallback(
    (groupId: string, findings: IpReviewFinding[]) => {
      const resolutions = [...acknowledgedProductTaskResolutions.current.values()]
        .filter((resolution) => resolution.groupId === groupId);
      if (resolutions.length === 0) return findings;
      return findings.filter((finding) =>
        !resolutions.some((resolution) =>
          findingMatchesAcknowledgedResolution(finding, resolution)
        )
      );
    },
    [],
  );
  const acknowledgeProductTaskResolution = useCallback((task: ActiveProductTask) => {
    const resolution = productTaskResolution(task);
    if (!resolution) return;
    const resolutionKey = `${resolution.groupId}:${resolution.resultId}`;
    if (acknowledgedProductTaskResolutions.current.has(resolutionKey)) return;
    const loadedFindings = loadedGroupTasks[resolution.groupId] ?? null;
    const remainingFindings = loadedFindings?.filter((finding) =>
      !findingMatchesAcknowledgedResolution(finding, resolution)
    ) ?? null;
    resolution.remainingFindings = remainingFindings;
    acknowledgedProductTaskResolutions.current.set(resolutionKey, resolution);
    setVisualOverview((current) => {
      if (!current) return current;
      return remainingFindings
        ? reconcileProductGroupTaskProjectionInOverview(
          current,
          resolution.groupId,
          remainingFindings,
        )
        : optimisticallyResolveProductGroupTaskInOverview(current, resolution);
    });
    setFocusedGroup((current) => {
      if (!current) return current;
      return remainingFindings
        ? reconcileProductGroupTaskProjection(
          current,
          resolution.groupId,
          remainingFindings,
        )
        : optimisticallyResolveProductGroupTask(current, resolution).group;
    });
    setLoadedGroupTasks((current) => {
      const findings = current[resolution.groupId];
      if (!findings) return current;
      const nextFindings = findings.filter((finding) =>
        !findingMatchesAcknowledgedResolution(finding, resolution)
      );
      return nextFindings.length === findings.length
        ? current
        : { ...current, [resolution.groupId]: nextFindings };
    });
    setActiveBatch((current) => {
      if (current?.groupId !== resolution.groupId || !current.findings) return current;
      const removedResultIds = new Set(
        current.findings
          .filter((finding) => findingMatchesAcknowledgedResolution(finding, resolution))
          .map((finding) => finding.result_id),
      );
      if (removedResultIds.size === 0) return current;
      return {
        ...current,
        findings: current.findings.filter(
          (finding) => !removedResultIds.has(finding.result_id),
        ),
        selectedResultIds: new Set(
          [...current.selectedResultIds].filter(
            (resultId) => !removedResultIds.has(resultId),
          ),
        ),
      };
    });
  }, [loadedGroupTasks]);
  const forgetProductTaskResolution = useCallback((task: ActiveProductTask) => {
    for (const [key, resolution] of acknowledgedProductTaskResolutions.current) {
      if (
        resolution.resultId === task.finding.result_id ||
        Boolean(
          task.finding.case_id && resolution.caseId === task.finding.case_id,
        )
      ) {
        acknowledgedProductTaskResolutions.current.delete(key);
      }
    }
  }, []);
  const scopesRequestKey = `${actingTenantId ?? ""}:${refreshVersion}`;
  const groupsRequestKey =
    `${scopesRequestKey}:${selectedIpId ?? ""}:same-product:${PRODUCT_GROUP_VIEW}:${catalogScope}:category:${selectedCategoryId ?? "all"}`;
  const selectedScope = scopes.find((scope) => scope.ip_id === selectedIpId) ?? null;
  const selectedScopeAvailable =
    scopesLoadedKey === scopesRequestKey && selectedScope != null;
  const loadingScopes = loadingActiveIp || scopesLoadedKey !== scopesRequestKey;
  const loadingGroups =
    Boolean(selectedIpId && selectedScopeAvailable) && groupsLoadedKey !== groupsRequestKey;

  useEffect(() => {
    const position = taskRouteScrollPosition.current;
    if (!position) return;

    const frame = window.requestAnimationFrame(() => {
      document.querySelector("main")?.scrollTo({ top: position.main });
      window.scrollTo({ top: position.window });
      taskRouteScrollPosition.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    void listProductClusterScopes(controller.signal)
      .then(({ scopes: nextScopes }) => {
        if (!alive) return;
        setScopes(nextScopes);
        if (nextScopes.length === 0) {
          setSemanticOverview(null);
          setVisualOverview(null);
        }
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setScopes([]);
        setSemanticOverview(null);
        setVisualOverview(null);
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (alive) setScopesLoadedKey(scopesRequestKey);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [actingTenantId, refreshVersion, scopesRequestKey]);

  useEffect(() => {
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    if (!selectedIpId || !selectedScopeAvailable) {
      setSemanticOverview(null);
      setVisualOverview(null);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setSemanticOverview(null);
    setVisualOverview(null);
    void getPersistedProductGroups(
      selectedIpId,
      "same",
      PRODUCT_GROUP_VIEW,
      {
        limit: PRODUCT_GROUP_PAGE_SIZE,
        categoryId: selectedCategoryId,
        catalogScope,
        signal: controller.signal,
      },
    ).then((nextOverview) => {
      if (!alive) return;
      setVisualOverview(applyAcknowledgedResolutions(nextOverview));
      setError(null);
    }).catch((caught: unknown) => {
      if (alive) setError(errorMessage(caught));
    }).finally(() => {
      if (alive) setGroupsLoadedKey(groupsRequestKey);
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [
    selectedIpId,
    selectedScopeAvailable,
    refreshVersion,
    actingTenantId,
    applyAcknowledgedResolutions,
    groupsRequestKey,
    selectedCategoryId,
    catalogScope,
  ]);

  useEffect(() => {
    acknowledgedProductTaskResolutions.current.clear();
    setError(null);
    setTaskError(null);
    setBatchResult(null);
    setLoadingGroupTasksId(null);
    setLoadedGroupTasks({});
    setProductTaskHistory({});
    setLoadingProductHistoryId(null);
    setExpandedSubgroupKeys(new Set());
    setActiveBatch(null);
    setConfirmBatchAction(null);
    setBatchProgress(null);
    batchRequestSequence.current += 1;
    taskRequestSequence.current += 1;
    productHistoryRequestSequence.current += 1;
    setActiveTask(null);
    setLoadingTaskProfileId(null);
    setSemanticCorrectionTarget(null);
    setSemanticFeedbackNotice(null);
    setSemanticTaxonomy([]);
    setSemanticTaxonomyLoaded(false);
    setMergeSourceGroupId(null);
    setSavingMergeKey(null);
    setRevokingMergeDecisionId(null);
  }, [actingTenantId, selectedIpId]);

  useEffect(() => {
    if (!linkedTaskId || !linkedGroupId) {
      closingTaskRouteRef.current = null;
      return;
    }
    if (closingTaskRouteRef.current === linkedTaskId) return;
    closingTaskRouteRef.current = null;
    if (activeTask?.finding.result_id === linkedTaskId) return;
    const requestSequence = ++taskRequestSequence.current;
    setTaskError(null);
    void getMonitoringFinding(linkedTaskId)
      .then(({ finding }) => {
        if (taskRequestSequence.current !== requestSequence) return;
        const resolvedGroup = visualOverview?.groups.find((group) =>
          group.id === linkedGroupId || group.canonical_product_id === linkedGroupId
        ) ?? (focusedGroup && (
          focusedGroup.id === linkedGroupId ||
          focusedGroup.canonical_product_id === linkedGroupId
        ) ? focusedGroup : null);
        setActiveTask({
          profileId: findingProfileId(finding),
          groupId: resolvedGroup?.id ?? linkedGroupId,
          finding,
        });
      })
      .catch((caught: unknown) => {
        if (taskRequestSequence.current !== requestSequence) return;
        setTaskError(errorMessage(caught, "Unable to open the linked task."));
      });
  }, [
    activeTask?.finding.result_id,
    focusedGroup,
    linkedGroupId,
    linkedTaskId,
    visualOverview,
  ]);

  useEffect(() => {
    if (!activeTask || !linkedGroupId) return;
    const resolvedGroup = visualOverview?.groups.find((group) =>
      group.id === linkedGroupId || group.canonical_product_id === linkedGroupId
    ) ?? (focusedGroup && (
      focusedGroup.id === linkedGroupId ||
      focusedGroup.canonical_product_id === linkedGroupId
    ) ? focusedGroup : null);
    if (!resolvedGroup || activeTask.groupId === resolvedGroup.id) return;
    setActiveTask((current) => current ? { ...current, groupId: resolvedGroup.id } : current);
  }, [activeTask, focusedGroup, linkedGroupId, visualOverview]);

  useEffect(() => {
    batchRequestSequence.current += 1;
    setLoadingGroupTasksId(null);
    setLoadedGroupTasks({});
    setExpandedSubgroupKeys(new Set());
    setActiveBatch(null);
    setConfirmBatchAction(null);
    setMergeSourceGroupId(null);
  }, [refreshVersion]);

  useEffect(() => {
    if (!semanticCorrectionTarget || !selectedIpId || semanticTaxonomyLoaded) return;
    let alive = true;
    void getProductSemanticTaxonomy(selectedIpId)
      .then(({ categories, colors }) => {
        if (alive) setSemanticTaxonomy(
          categories.filter((category) => category.key !== "other"),
        );
        if (alive && colors && colors.length > 0) setSemanticColors(colors);
      })
      .catch(() => {
        // Keep correction usable while frontend and API releases roll out.
        if (alive) setSemanticTaxonomy(
          DEFAULT_PRODUCT_SEMANTIC_TAXONOMY.filter((category) => category.key !== "other"),
        );
      })
      .finally(() => {
        if (alive) setSemanticTaxonomyLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [selectedIpId, semanticCorrectionTarget, semanticTaxonomyLoaded]);

  useEffect(() => {
    if (!activeTask) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-finding-inspector]")) return;
      closeTask();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeTask();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeTask, closeTask]);

  async function openTask(profile: ProductClusterProfile, groupId: string | null) {
    closingTaskRouteRef.current = null;
    const requestSequence = ++taskRequestSequence.current;
    setActiveTask(null);
    setLoadingTaskProfileId(profile.id);
    setTaskError(null);
    try {
      const { finding } = await getMonitoringFindingForCase(profile.case_id);
      if (taskRequestSequence.current !== requestSequence) return;
      setActiveTask({ profileId: profile.id, groupId, finding });
      if (groupId) {
        const routeGroup = visualOverview?.groups.find((group) => group.id === groupId) ??
          (focusedGroup?.id === groupId ? focusedGroup : null);
        const routeProductId = visualOverview?.catalog_supported
          ? routeGroup?.canonical_product_id ?? groupId
          : groupId;
        rememberTaskRouteScrollPosition();
        navigate({
          pathname: `/monitoring/products/${encodeURIComponent(routeProductId)}/tasks/${encodeURIComponent(finding.result_id)}`,
          search: location.search,
        });
      }
    } catch (caught: unknown) {
      if (taskRequestSequence.current !== requestSequence) return;
      setTaskError(errorMessage(caught, "Unable to open task details."));
    } finally {
      if (taskRequestSequence.current === requestSequence) {
        setLoadingTaskProfileId(null);
      }
    }
  }

  function openLoadedFinding(finding: IpReviewFinding, groupId: string) {
    closingTaskRouteRef.current = null;
    taskRequestSequence.current += 1;
    setLoadingTaskProfileId(null);
    setTaskError(null);
    setActiveTask({
      profileId: findingProfileId(finding),
      groupId,
      finding,
    });
    const routeGroup = visualOverview?.groups.find((group) => group.id === groupId) ??
      (focusedGroup?.id === groupId ? focusedGroup : null);
    const routeProductId = visualOverview?.catalog_supported
      ? routeGroup?.canonical_product_id ?? groupId
      : groupId;
    rememberTaskRouteScrollPosition();
    navigate({
      pathname: `/monitoring/products/${encodeURIComponent(routeProductId)}/tasks/${encodeURIComponent(finding.result_id)}`,
      search: location.search,
    });
  }

  async function dismissActiveTask(
    reason: MonitoringReviewOutcome,
    reasonCode?: MonitoringDismissReasonCode,
  ) {
    if (!activeTask) return;
    const task = activeTask;
    const finding = activeTask.finding;
    const ipId = finding.ip_id ?? selectedIpId;
    if (!ipId) {
      setTaskError("Cannot update this task because it has no associated IP.");
      return;
    }
    setDismissingTaskId(finding.result_id);
    setTaskError(null);
    acknowledgeProductTaskResolution(task);
    try {
      await dismissIpFinding(ipId, finding.result_id, {
        reason,
        ...(reasonCode ? { reason_code: reasonCode } : {}),
      });
      closeTask();
      setRefreshVersion((version) => version + 1);
    } catch (caught: unknown) {
      forgetProductTaskResolution(task);
      setRefreshVersion((version) => version + 1);
      setTaskError(errorMessage(caught, "Unable to update task."));
    } finally {
      setDismissingTaskId(null);
    }
  }

  function completeActiveTask() {
    if (activeTask) acknowledgeProductTaskResolution(activeTask);
    closeTask();
  }

  function refreshTaskAfterUpdate(opts?: { completed?: boolean }) {
    const task = activeTask;
    const reopeningClosedTask = Boolean(
      task && (
        task.finding.dismissed_at ||
        (task.finding.review_status ?? "pending") !== "pending"
      ),
    );
    if (task && opts?.completed) {
      acknowledgeProductTaskResolution(task);
    } else if (task && reopeningClosedTask) {
      forgetProductTaskResolution(task);
    }
    if (opts?.completed || reopeningClosedTask) {
      setRefreshVersion((version) => version + 1);
    }
    if (!task || opts?.completed) {
      closeTask();
      return;
    }

    const requestSequence = ++taskRequestSequence.current;
    void getMonitoringFinding(task.finding.result_id)
      .then(({ finding }) => {
        if (taskRequestSequence.current !== requestSequence) return;
        setActiveTask({ ...task, finding });
      })
      .catch((caught: unknown) => {
        if (taskRequestSequence.current !== requestSequence) return;
        setTaskError(errorMessage(caught, "Unable to refresh task details."));
      });
  }

  async function refreshAll() {
    setError(null);
    if (selectedIpId && selectedScopeAvailable) {
      setRefreshingGroups(true);
      try {
        const nextOverview = applyAcknowledgedResolutions(
          await refreshPersistedProductGroups(
            selectedIpId,
            "same",
            PRODUCT_GROUP_VIEW,
            { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
          ),
        );
        setVisualOverview(nextOverview);
      } catch (caught: unknown) {
        setError(errorMessage(caught));
      } finally {
        setRefreshingGroups(false);
      }
    }
    setRefreshVersion((version) => version + 1);
  }

  async function loadMoreVisualGroups() {
    const cursor = visualOverview?.next_cursor;
    if (!selectedIpId || !cursor || loadingMoreVisualGroups) return;
    const requestSequence = ++visualPageRequestSequence.current;
    setLoadingMoreVisualGroups(true);
    setError(null);
    try {
      const nextOverview = applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          {
            limit: PRODUCT_GROUP_PAGE_SIZE,
            cursor,
            categoryId: selectedCategoryId,
            catalogScope,
          },
        ),
      );
      if (visualPageRequestSequence.current !== requestSequence) return;
      setVisualOverview((current) =>
        current && current.next_cursor === cursor
          ? appendProductGroupPage(current, nextOverview)
          : current
      );
    } catch (caught: unknown) {
      if (visualPageRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load more product groups."));
      }
    } finally {
      if (visualPageRequestSequence.current === requestSequence) {
        setLoadingMoreVisualGroups(false);
      }
    }
  }

  const loadProductGroupForReview = useCallback(async (groupId: string) => {
    if (!selectedIpId) return null;
    const alreadyLoaded = visualOverview?.groups.find((group) =>
      group.id === groupId || group.canonical_product_id === groupId
    );
    if (alreadyLoaded) return alreadyLoaded;

    const requestSequence = ++visualPageRequestSequence.current;
    setLoadingMoreVisualGroups(false);
    setError(null);
    try {
      const productOverview = applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: 1, productId: groupId, catalogScope },
        ),
      );
      if (visualPageRequestSequence.current !== requestSequence) return null;
      const directMatch = productOverview.groups.find((group) =>
        group.id === groupId || group.canonical_product_id === groupId
      ) ?? null;
      if (directMatch || productOverview.catalog_supported) return directMatch;

      // A pre-catalog API ignores product_id. Preserve the old deep-link
      // behavior by walking its ordinary group pages instead of accepting the
      // unrelated first result as the requested product.
      let cursor = productOverview.next_cursor;
      const seenCursors = new Set<string>();
      while (cursor && !seenCursors.has(cursor)) {
        seenCursors.add(cursor);
        const nextOverview = applyAcknowledgedResolutions(
          await getPersistedProductGroups(
            selectedIpId,
            "same",
            PRODUCT_GROUP_VIEW,
            { limit: PRODUCT_GROUP_PAGE_SIZE, cursor, catalogScope },
          ),
        );
        if (visualPageRequestSequence.current !== requestSequence) return null;
        const match = nextOverview.groups.find((group) => group.id === groupId);
        if (match) return match;
        cursor = nextOverview.next_cursor;
      }
      return null;
    } catch (caught: unknown) {
      if (visualPageRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load the suggested product group."));
      }
      return null;
    }
  }, [applyAcknowledgedResolutions, catalogScope, selectedIpId, visualOverview]);

  useEffect(() => {
    if (!linkedGroupId) {
      setFocusedGroup(null);
      setFocusedGroupResolvedId(null);
      return;
    }
    const loadedGroup = visualOverview?.groups.find((group) =>
      group.id === linkedGroupId || group.canonical_product_id === linkedGroupId
    );
    if (loadedGroup) {
      setFocusedGroup(loadedGroup);
      setFocusedGroupResolvedId(linkedGroupId);
      return;
    }
    if (!visualOverview || loadingGroups) return;

    let alive = true;
    setFocusedGroupResolvedId(null);
    void loadProductGroupForReview(linkedGroupId).then((group) => {
      if (!alive) return;
      setFocusedGroup(group);
      setFocusedGroupResolvedId(linkedGroupId);
    });
    return () => {
      alive = false;
    };
  }, [linkedGroupId, loadProductGroupForReview, loadingGroups, visualOverview]);

  const loadGroupTasks = useCallback(async (groupId: string) => {
    const cached = loadedGroupTasks[groupId];
    if (cached) return cached;
    if (!selectedIpId || loadingGroupTasksId) return null;

    const requestSequence = ++batchRequestSequence.current;
    setLoadingGroupTasksId(groupId);
    setError(null);
    try {
      const findings = omitAcknowledgedGroupFindings(
        groupId,
        await loadProductGroupBatch(selectedIpId, groupId),
      );
      if (batchRequestSequence.current !== requestSequence) return null;
      for (const resolution of acknowledgedProductTaskResolutions.current.values()) {
        if (resolution.groupId === groupId) resolution.remainingFindings = findings;
      }
      setLoadedGroupTasks((current) => ({ ...current, [groupId]: findings }));
      setVisualOverview((current) => current
        ? reconcileProductGroupTaskProjectionInOverview(current, groupId, findings)
        : current);
      setFocusedGroup((current) => current
        ? reconcileProductGroupTaskProjection(current, groupId, findings)
        : current);
      return findings;
    } catch (caught: unknown) {
      if (batchRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load all listings in this product group."));
      }
      return null;
    } finally {
      if (batchRequestSequence.current === requestSequence) {
        setLoadingGroupTasksId(null);
      }
    }
  }, [loadedGroupTasks, loadingGroupTasksId, omitAcknowledgedGroupFindings, selectedIpId]);

  useEffect(() => {
    if (!linkedGroupId) return;
    void loadGroupTasks(linkedGroupId);
  }, [linkedGroupId, loadGroupTasks]);

  const loadProductTaskHistory = useCallback(async (input: {
    historyKey: string;
    groupId: string;
    catalogSupported: boolean;
  }) => {
    if (Object.prototype.hasOwnProperty.call(productTaskHistory, input.historyKey)) {
      return productTaskHistory[input.historyKey];
    }
    if (!selectedIpId || loadingProductHistoryId) return null;
    const requestSequence = ++productHistoryRequestSequence.current;
    setLoadingProductHistoryId(input.historyKey);
    setError(null);
    try {
      const findings: IpReviewFinding[] = [];
      const seenResultIds = new Set<string>();
      const seenCursors = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await listMonitoringFindingsGlobal({
          status: "all",
          show_dismissed: true,
          ip_id: selectedIpId,
          catalog_product_id: input.catalogSupported ? input.historyKey : null,
          product_group_id: input.catalogSupported ? null : input.groupId,
          sort: "updated_desc",
          limit: 200,
          cursor,
        });
        if (productHistoryRequestSequence.current !== requestSequence) return null;
        for (const finding of page.findings) {
          if (seenResultIds.has(finding.result_id)) continue;
          seenResultIds.add(finding.result_id);
          findings.push(finding);
        }
        cursor = page.next_cursor;
        if (cursor && seenCursors.has(cursor)) break;
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
      if (productHistoryRequestSequence.current !== requestSequence) return null;
      setProductTaskHistory((current) => ({
        ...current,
        [input.historyKey]: findings,
      }));
      return findings;
    } catch (caught: unknown) {
      if (productHistoryRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load this product's task history."));
      }
      return null;
    } finally {
      if (productHistoryRequestSequence.current === requestSequence) {
        setLoadingProductHistoryId((current) =>
          current === input.historyKey ? null : current
        );
      }
    }
  }, [loadingProductHistoryId, productTaskHistory, selectedIpId]);

  async function toggleGroupSubgroupListings(
    groupId: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup: ProductGroupCommercialSubgroup | null = null,
  ) {
    if (batchProgress || loadingGroupTasksId) return;
    const scopeId = productCommercialReviewScopeId(groupId, commercialSubgroup?.key ?? null);
    const key = productGroupSubgroupKey(scopeId, bucket);
    if (expandedSubgroupKeys.has(key)) {
      setExpandedSubgroupKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      if (activeBatch?.scopeId === scopeId && activeBatch.bucket === bucket) {
        setActiveBatch(null);
        setConfirmBatchAction(null);
      }
      return;
    }
    setExpandedSubgroupKeys((current) => new Set(current).add(key));
    const findings = await loadGroupTasks(groupId);
    if (!findings) {
      setExpandedSubgroupKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function selectGroupBatch(
    groupId: string,
    groupName: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup: ProductGroupCommercialSubgroup | null = null,
  ) {
    if (batchProgress || loadingGroupTasksId) return;
    const scopeId = productCommercialReviewScopeId(groupId, commercialSubgroup?.key ?? null);
    if (activeBatch?.scopeId === scopeId && activeBatch.bucket === bucket) {
      setActiveBatch(null);
      setConfirmBatchAction(null);
      return;
    }

    const cached = loadedGroupTasks[groupId] ?? null;
    const commercialCaseIds = commercialSubgroup
      ? new Set(commercialSubgroup.triage_case_ids)
      : null;
    const scopedGroupName = commercialSubgroup
      ? `${groupName} · ${commercialSubgroup.variant_label}`
      : groupName;
    const cachedScope = cached
      ? cached.filter((finding) =>
          (!commercialCaseIds || Boolean(
            finding.case_id && commercialCaseIds.has(finding.case_id)
          )) && recommendationBucketForFinding(finding) === bucket
        )
      : null;
    setActiveBatch({
      groupId,
      scopeId,
      groupName: scopedGroupName,
      commercialSubgroupKey: commercialSubgroup?.key ?? null,
      commercialCaseIds,
      bucket,
      findings: cachedScope,
      selectedResultIds: new Set(cachedScope?.map((finding) => finding.result_id) ?? []),
    });
    setConfirmBatchAction(null);
    setBatchResult(null);
    if (cachedScope) {
      if (cachedScope.length === 0) {
        const bucketLabel = productGroupRecommendationBucket(bucket).label;
        setActiveBatch(null);
        setBatchResult(`No current to-triage listings remain in “${bucketLabel}”.`);
      }
      return;
    }

    const findings = await loadGroupTasks(groupId);
    if (!findings) {
      setActiveBatch(null);
      return;
    }
    const scopedFindings = findings.filter(
      (finding) =>
        (!commercialCaseIds || Boolean(
          finding.case_id && commercialCaseIds.has(finding.case_id)
        )) && recommendationBucketForFinding(finding) === bucket,
    );
    if (scopedFindings.length === 0) {
      const bucketLabel = productGroupRecommendationBucket(bucket).label;
      setActiveBatch(null);
      setBatchResult(`No current to-triage listings remain in “${bucketLabel}”.`);
      return;
    }
    setActiveBatch({
      groupId,
      scopeId,
      groupName: scopedGroupName,
      commercialSubgroupKey: commercialSubgroup?.key ?? null,
      commercialCaseIds,
      bucket,
      findings: scopedFindings,
      selectedResultIds: new Set(scopedFindings.map((finding) => finding.result_id)),
    });
  }

  function clearGroupBatch() {
    if (batchProgress) return;
    setActiveBatch(null);
    setConfirmBatchAction(null);
  }

  function toggleGroupBatchFinding(resultId: string) {
    if (batchProgress) return;
    setActiveBatch((current) => {
      if (!current?.findings?.some((finding) => finding.result_id === resultId)) {
        return current;
      }
      const selectedResultIds = new Set(current.selectedResultIds);
      if (selectedResultIds.has(resultId)) selectedResultIds.delete(resultId);
      else selectedResultIds.add(resultId);
      return { ...current, selectedResultIds };
    });
    setConfirmBatchAction(null);
  }

  function setAllGroupBatchFindings(selected: boolean) {
    if (batchProgress) return;
    setActiveBatch((current) => current?.findings
      ? {
          ...current,
          selectedResultIds: new Set(
            selected ? current.findings.map((finding) => finding.result_id) : [],
          ),
        }
      : current);
    setConfirmBatchAction(null);
  }

  function partitionGroupBatch(action: BatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (reason: string) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    for (const finding of selectedProductGroupBatchFindings(activeBatch)) {
      const state: CaseReviewStatus = finding.dismissed_at
        ? "dismissed"
        : (finding.review_status ?? "pending");
      const findingIpId = finding.ip_id ?? selectedIpId;
      if (action === "send") {
        if (!isDecisionState(state)) skip("already sent or closed");
        else if (!finding.case_id) skip("still preparing");
        else eligible.push(finding);
      } else if (action === "review") {
        if (state !== "pending") skip("not in triage");
        else if (!finding.case_id) skip("still preparing");
        else if (!findingIpId) skip("no associated IP");
        else eligible.push(finding);
      } else if (
        action === "false_positive" ||
        action === "do_not_pursue" ||
        action === "second_hand" ||
        action === "packaging_only"
      ) {
        if (finding.dismissed_at) skip("already dismissed");
        else if (action === "packaging_only" && finding.offer_subject !== "packaging_only") {
          skip("not packaging-only");
        }
        else if (!findingIpId) skip("no associated IP");
        else eligible.push(finding);
      } else {
        if (state !== "takedown_sent") skip("not awaiting enforcement");
        else if (!findingIpId) skip("no associated IP");
        else eligible.push(finding);
      }
    }
    return { eligible, skipped };
  }

  async function runGroupBatch(
    action: BatchAction,
    decisionReason?: string,
    associationScopes?: TakedownFeedbackAssociationScope[],
  ) {
    const { eligible, skipped } = partitionGroupBatch(action);
    const completedBatch = activeBatch;
    const skipCounts = { ...skipped };
    let ok = 0;
    let failed = 0;
    if (eligible.length === 0) {
      setBatchResult(summarizeBatch(action, 0, skipCounts, 0));
      return;
    }

    const bump = (reason: string) => {
      skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
    };
    if (action === "send") {
      setActiveBatch(null);
      closeTask();
      try {
        const result = await approveTakedownBatch(
          eligible.map((finding) => finding.case_id as string),
          decisionReason ?? "",
          associationScopes ?? [],
        );
        for (const item of result.skipped) bump(item.reason);
        const queued = result.queued_case_ids.length;
        const legalQueue = result.legal_queue ?? [];
        const legalQueueCounts: Record<string, number> = {};
        for (const item of legalQueue) {
          legalQueueCounts[item.reason] = (legalQueueCounts[item.reason] ?? 0) + 1;
        }
        const handled = queued + legalQueue.length;
        ok = queued;
        failed = result.failed.length;
        const sendSummary = summarizeTakedownBatch(
          queued,
          result.email_count,
          legalQueueCounts,
          skipCounts,
          failed,
        );
        const scopeLabel = completedBatch
          ? productGroupRecommendationBucket(completedBatch.bucket).label
          : null;
        setBatchResult(scopeLabel
          ? { ...sendSummary, title: `${scopeLabel}: ${sendSummary.title}` }
          : sendSummary);
        if (handled === 0) {
          setActiveBatch(completedBatch);
        } else {
          setRefreshVersion((version) => version + 1);
        }
      } catch (error) {
        setActiveBatch(completedBatch);
        setBatchResult(
          `Nothing was queued. ${error instanceof Error ? error.message : "The request failed."}`,
        );
      }
      return;
    } else {
      setBatchProgress({ done: 0, total: eligible.length });
      await runPool(
        eligible,
        async (finding) => {
          try {
            const findingIpId = (finding.ip_id ?? selectedIpId) as string;
            if (
              action === "false_positive" ||
              action === "do_not_pursue" ||
              action === "second_hand" ||
              action === "packaging_only"
            ) {
              await dismissIpFinding(
                findingIpId,
                finding.result_id,
                dismissalOptionsForBatchAction(action),
              );
              ok += 1;
            } else if (action === "review") {
              await markIpFindingNeedsReview(findingIpId, finding.result_id);
              ok += 1;
            } else {
              await markIpFindingEnforced(findingIpId, finding.result_id);
              ok += 1;
            }
            if (completedBatch) {
              acknowledgeProductTaskResolution({
                profileId: findingProfileId(finding),
                groupId: completedBatch.groupId,
                finding,
              });
            }
          } catch {
            failed += 1;
          } finally {
            setBatchProgress((progress) => progress
              ? { ...progress, done: progress.done + 1 }
              : progress);
          }
        },
        4,
      );
    }
    setBatchProgress(null);
    setActiveBatch(null);
    const scopeLabel = completedBatch
      ? productGroupRecommendationBucket(completedBatch.bucket).label
      : null;
    setBatchResult(
      `${scopeLabel ? `${scopeLabel}: ` : ""}${summarizeBatch(action, ok, skipCounts, failed)}`,
    );
    closeTask();
    setRefreshVersion((version) => version + 1);
  }

  async function confirmGroup(
    groupId: string,
    displayName: string,
    shopifyCategory?: ShopifyProductTaxonomyCategory,
  ) {
    if (!selectedIpId) return;
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    setError(null);
    setSavingGroupId(groupId);
    try {
      await confirmPersistedProductGroup(
        selectedIpId,
        groupId,
        displayName,
        shopifyCategory?.id,
      );
      setVisualOverview(applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
        ),
      ));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingGroupId(null);
    }
  }

  async function mergeProductGroups(leftGroupId: string, rightGroupId: string) {
    if (!selectedIpId || leftGroupId === rightGroupId) return;
    const mergeKey = [leftGroupId, rightGroupId].sort().join(":");
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    setError(null);
    setSavingMergeKey(mergeKey);
    try {
      await mergePersistedProductGroups(selectedIpId, leftGroupId, rightGroupId);
      setVisualOverview(applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
        ),
      ));
      setMergeSourceGroupId(null);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingMergeKey(null);
    }
  }

  async function revokeProductGroupMerge(groupId: string, decisionId: string) {
    if (!selectedIpId) return;
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    setError(null);
    setRevokingMergeDecisionId(decisionId);
    try {
      await revokePersistedProductGroupMerge(selectedIpId, groupId, decisionId);
      setVisualOverview(applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
        ),
      ));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setRevokingMergeDecisionId(null);
    }
  }

  async function correctGroupMember(
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) {
    if (!selectedIpId) return;
    const previousOverview = visualOverview;
    const previousGroup = previousOverview?.groups.find((group) => group.id === groupId) ?? null;
    const removedProfile = previousGroup?.members.find((profile) => profile.id === profileId) ??
      previousGroup?.triage_members.find((profile) => profile.id === profileId) ?? null;
    const previousLoadedFindings = loadedGroupTasks[groupId] ?? null;
    const previousActiveBatch = activeBatch?.groupId === groupId ? activeBatch : null;
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    setError(null);
    setSavingCorrectionProfileId(profileId);
    setVisualOverview((current) => current
      ? optimisticallyExcludeProductGroupMember(current, groupId, profileId)
      : current);
    if (removedProfile) {
      setLoadedGroupTasks((current) => current[groupId]
        ? {
          ...current,
          [groupId]: current[groupId].filter(
            (finding) => finding.case_id !== removedProfile.case_id,
          ),
        }
        : current);
      setActiveBatch((current) => {
        if (current?.groupId !== groupId || !current.findings) return current;
        const removedResultIds = new Set(
          current.findings
            .filter((finding) => finding.case_id === removedProfile.case_id)
            .map((finding) => finding.result_id),
        );
        if (removedResultIds.size === 0) return current;
        return {
          ...current,
          findings: current.findings.filter(
            (finding) => !removedResultIds.has(finding.result_id),
          ),
          selectedResultIds: new Set(
            [...current.selectedResultIds].filter((resultId) => !removedResultIds.has(resultId)),
          ),
        };
      });
    }
    try {
      const result = await excludePersistedProductGroupMember(selectedIpId, groupId, {
        profile_id: profileId,
        reason,
      });
      const latestOverview = await getPersistedProductGroups(
        selectedIpId,
        "same",
        PRODUCT_GROUP_VIEW,
        { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
      ).catch((caught: unknown) => {
        setError(errorMessage(
          caught,
          "The correction was saved, but the latest product groups could not be loaded.",
        ));
        return null;
      });
      if (latestOverview) {
        // The regroup request can complete before a replica/cache serves the
        // updated snapshot. Keep the acknowledged correction applied locally
        // so that a stale follow-up read cannot resurrect the removed card.
        setVisualOverview(
          optimisticallyExcludeProductGroupMember(latestOverview, groupId, profileId),
        );
      } else if (!result.regrouped) {
        setVisualOverview((current) => current ? { ...current, dirty: true } : current);
      }
    } catch (caught: unknown) {
      if (isApiError(caught, 404)) {
        // Treat an already-absent membership as the desired end state. This
        // also repairs clients that briefly rendered a stale group snapshot.
        const latestOverview = await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: PRODUCT_GROUP_PAGE_SIZE, categoryId: selectedCategoryId, catalogScope },
        ).catch(() => null);
        if (latestOverview) {
          setVisualOverview(
            optimisticallyExcludeProductGroupMember(latestOverview, groupId, profileId),
          );
        }
        return;
      }
      setError(errorMessage(caught));
      if (previousGroup) {
        setVisualOverview((current) => current ? {
          ...current,
          triage_profile_count: previousOverview
            ? previousOverview.triage_profile_count
            : current.triage_profile_count,
          snapshot_membership_count: previousOverview
            ? previousOverview.snapshot_membership_count
            : current.snapshot_membership_count,
          groups: current.groups.map((group) =>
            group.id === groupId ? previousGroup : group
          ),
        } : current);
      }
      if (previousLoadedFindings) {
        setLoadedGroupTasks((current) => ({
          ...current,
          [groupId]: previousLoadedFindings,
        }));
      }
      if (previousActiveBatch) setActiveBatch(previousActiveBatch);
      throw caught;
    } finally {
      setSavingCorrectionProfileId(null);
    }
  }

  async function correctSemanticMember(input: {
    group: PersistedProductGroup;
    profile: ProductClusterProfile;
    correctedCategoryKey: string | null;
    newProductType: {
      label: string;
      supportsColorVariants: boolean;
    } | null;
    correctedVariantColors: string[];
    note: string;
    propagateToSimilar: boolean;
  }) {
    if (!selectedIpId) return;
    semanticPageRequestSequence.current += 1;
    setLoadingMoreSemanticGroups(false);
    setError(null);
    setSemanticFeedbackNotice(null);
    setSavingSemanticCorrectionProfileId(input.profile.id);
    try {
      const result = await correctProductSemanticGroupMember(
        selectedIpId,
        input.group.id,
        {
          profile_id: input.profile.id,
          ...(input.newProductType
            ? {
              new_product_type: {
                label: input.newProductType.label,
                supports_color_variants: input.newProductType.supportsColorVariants,
              },
            }
            : { corrected_category_key: input.correctedCategoryKey ?? undefined }),
          corrected_variant_colors: input.correctedVariantColors,
          note: input.note.trim() || null,
          propagate_to_similar: input.propagateToSimilar,
        },
      );
      setSemanticOverview(
        await getPersistedProductGroups(selectedIpId, "semantic", PRODUCT_GROUP_VIEW, {
          limit: SEMANTIC_GROUP_PAGE_SIZE,
        }),
      );
      setSemanticCorrectionTarget(null);
      setSemanticTaxonomyLoaded(false);
      setSemanticFeedbackNotice(
        result.propagation_failed
          ? "Classification corrected, but visually similar listings could not be queued for reconsideration. The correction itself was saved."
          : result.already_applied
            ? "This classification was already corrected. Visually similar listings were checked again and the latest product groups are now loaded."
            : result.similar_profiles_queued > 0
              ? `Classification corrected. ${result.similar_profiles_queued} visually similar listing${
                result.similar_profiles_queued === 1 ? " is" : "s are"
              } queued for reconsideration using this reviewer-confirmed example.`
              : input.propagateToSimilar
                ? "Classification corrected. No other listing met the strong visual-similarity threshold."
                : "Classification corrected for this listing only.",
      );
    } catch (caught: unknown) {
      if (isApiError(caught, 404)) {
        const latestOverview = await getPersistedProductGroups(
          selectedIpId,
          "semantic",
          PRODUCT_GROUP_VIEW,
          { limit: SEMANTIC_GROUP_PAGE_SIZE },
        ).catch(() => null);
        if (latestOverview) {
          setSemanticOverview(latestOverview);
          setSemanticCorrectionTarget(null);
          setSemanticFeedbackNotice(
            "That listing changed product groups while the page was open. The latest groups are now loaded.",
          );
          return;
        }
      }
      setError(errorMessage(caught, "Unable to correct this classification."));
      throw caught;
    } finally {
      setSavingSemanticCorrectionProfileId(null);
    }
  }

  async function resetSemanticCorrection(target: SemanticCorrectionTarget) {
    if (!selectedIpId || !target.profile.semantic_correction_id) return;
    semanticPageRequestSequence.current += 1;
    setLoadingMoreSemanticGroups(false);
    setError(null);
    setSemanticFeedbackNotice(null);
    setSavingSemanticCorrectionProfileId(target.profile.id);
    try {
      const result = await restoreProductSemanticCorrection(
        selectedIpId,
        target.profile.semantic_correction_id,
      );
      setSemanticOverview(
        await getPersistedProductGroups(selectedIpId, "semantic", PRODUCT_GROUP_VIEW, {
          limit: SEMANTIC_GROUP_PAGE_SIZE,
        }),
      );
      setSemanticCorrectionTarget(null);
      setSemanticFeedbackNotice(
        result.propagation_failed
          ? "Correction reset, but visually similar listings could not be queued for reconsideration. The reset itself was saved."
          : result.similar_profiles_queued > 0
            ? `Correction reset. ${result.similar_profiles_queued} visually similar listing${
              result.similar_profiles_queued === 1 ? " is" : "s are"
            } queued to reconsider the change without that example.`
            : "Correction reset to the classifier result.",
      );
    } catch (caught: unknown) {
      if (isApiError(caught, 404)) {
        const latestOverview = await getPersistedProductGroups(
          selectedIpId,
          "semantic",
          PRODUCT_GROUP_VIEW,
          { limit: SEMANTIC_GROUP_PAGE_SIZE },
        ).catch(() => null);
        if (latestOverview) {
          setSemanticOverview(latestOverview);
          setSemanticCorrectionTarget(null);
          setSemanticFeedbackNotice(
            "That correction had already changed. The latest product groups are now loaded.",
          );
          return;
        }
      }
      setError(errorMessage(caught, "Unable to reset this classification correction."));
      throw caught;
    } finally {
      setSavingSemanticCorrectionProfileId(null);
    }
  }

  async function updateGroupEmbeddingThreshold(
    groupId: string,
    embeddingMatchThreshold: number | null,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await updatePersistedProductGroupEmbeddingSettings(
        selectedIpId,
        groupId,
        embeddingMatchThreshold,
      );
      setVisualOverview((current) => current ? {
        ...current,
        dirty: result.regrouping_queued || current.dirty,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, ...result.group } : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function createGroupRule(groupId: string, instruction: string) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await createPersistedProductGroupRule(
        selectedIpId,
        groupId,
        instruction,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? { ...group, rules: [...group.rules, result.rule] }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function updateGroupRule(
    groupId: string,
    ruleId: string,
    instruction: string,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await updatePersistedProductGroupRule(
        selectedIpId,
        groupId,
        ruleId,
        instruction,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              rules: group.rules.map((rule) =>
                rule.id === result.rule.id ? result.rule : rule
              ),
            }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function deleteGroupRule(groupId: string, ruleId: string) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await deletePersistedProductGroupRule(
        selectedIpId,
        groupId,
        ruleId,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function createGroupAuthenticityRule(
    groupId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await createPersistedProductGroupAuthenticityRule(
        selectedIpId,
        groupId,
        input,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              authenticity_rules: [...group.authenticity_rules, result.rule],
            }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function updateGroupAuthenticityRule(
    groupId: string,
    ruleId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await updatePersistedProductGroupAuthenticityRule(
        selectedIpId,
        groupId,
        ruleId,
        input,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              authenticity_rules: group.authenticity_rules.map((rule) =>
                rule.id === result.rule.id ? result.rule : rule
              ),
            }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function deleteGroupAuthenticityRule(groupId: string, ruleId: string) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await deletePersistedProductGroupAuthenticityRule(
        selectedIpId,
        groupId,
        ruleId,
      );
      setVisualOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              authenticity_rules: group.authenticity_rules.filter(
                (rule) => rule.id !== ruleId,
              ),
            }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  const workspaceGroup = linkedGroupId
    ? visualOverview?.groups.find((group) =>
      group.id === linkedGroupId || group.canonical_product_id === linkedGroupId
    ) ?? focusedGroup
    : null;
  const workspaceCatalogSupported = visualOverview?.catalog_supported === true;
  const workspaceHistoryKey = workspaceGroup
    ? workspaceCatalogSupported
      ? workspaceGroup.canonical_product_id ?? workspaceGroup.id
      : workspaceGroup.id
    : null;
  const showingWorkspace = Boolean(linkedGroupId);
  const selectCatalogCategory = (categoryId: string | null) => {
    const params = new URLSearchParams(location.search);
    if (categoryId) params.set("category", categoryId);
    else params.delete("category");
    navigate({
      pathname: "/monitoring/products",
      search: params.toString() ? `?${params.toString()}` : "",
    });
  };
  const selectCatalogScope = (nextScope: ProductCatalogScope) => {
    const params = new URLSearchParams(location.search);
    params.delete("category");
    if (nextScope === "history") params.set("scope", "history");
    else params.delete("scope");
    navigate({
      pathname: "/monitoring/products",
      search: params.toString() ? `?${params.toString()}` : "",
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {showingWorkspace ? (
            <Link
              to={{ pathname: "/monitoring/products", search: location.search }}
              className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-stone-600 transition hover:text-stone-950"
            >
              <ArrowLeft size={17} aria-hidden="true" />
              All products
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-stone-950">
                Product Lab
              </h1>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Beta
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={
            loadingScopes || loadingGroups || refreshingGroups ||
            loadingMoreSemanticGroups || loadingMoreVisualGroups
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loadingScopes || loadingGroups || refreshingGroups ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {taskError && (
        <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{taskError}</span>
          <button
            type="button"
            onClick={() => setTaskError(null)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-red-500 hover:bg-red-100 hover:text-red-800"
            aria-label="Dismiss task error"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {batchResult && (
        <BatchResultNotice
          result={batchResult}
          profileIpId={selectedIpId}
          onDismiss={() => setBatchResult(null)}
          className="fixed inset-x-4 top-20 z-50 shadow-lg sm:left-auto sm:right-6 sm:max-w-lg"
        />
      )}

      {loadingScopes ? (
        <LoadingState />
      ) : !selectedIpId || !selectedScope ? (
        <EmptyState ipName={activeIp?.name ?? null} />
      ) : loadingGroups && !visualOverview ? (
        <LoadingState />
      ) : visualOverview ? (
        showingWorkspace ? (
          workspaceGroup ? (
            <div className="mt-3">
              <ProductGroupCard
                key={workspaceGroup.id}
                workspace
                group={workspaceGroup}
                availableGroups={visualOverview.groups}
                reconciliationSuggestions={workspaceGroup.reconciliation_suggestions}
                index={visualOverview.groups.findIndex((group) => group.id === workspaceGroup.id)}
                ipId={visualOverview.scope.ip_id}
                mode="same"
                showPersistedMembers={false}
                triageProjectionAvailable={visualOverview.triage_projection_available}
                saving={savingGroupId === workspaceGroup.id}
                mergeSourceGroup={mergeSourceGroupId
                  ? visualOverview.groups.find((group) => group.id === mergeSourceGroupId) ?? null
                  : null}
                savingMergeKey={savingMergeKey}
                revokingMergeDecisionId={revokingMergeDecisionId}
                savingCorrectionProfileId={savingCorrectionProfileId}
                activeTaskProfileId={activeTask?.profileId ?? null}
                loadingTaskProfileId={loadingTaskProfileId}
                allFindings={loadedGroupTasks[workspaceGroup.id] ?? null}
                taskHistory={workspaceHistoryKey
                  ? productTaskHistory[workspaceHistoryKey] ?? null
                  : null}
                loadingTaskHistory={loadingProductHistoryId === workspaceHistoryKey}
                catalogSupported={workspaceCatalogSupported}
                expandedSubgroupKeys={expandedSubgroupKeys}
                loadingAllFindings={loadingGroupTasksId === workspaceGroup.id}
                activeBatch={activeBatch}
                batchProgress={activeBatch?.groupId === workspaceGroup.id ? batchProgress : null}
                batchDisabled={Boolean(loadingGroupTasksId || batchProgress)}
                onSelectBatch={(bucket, commercialSubgroup) => void selectGroupBatch(
                  workspaceGroup.id,
                  workspaceGroup.display_name ?? "Product",
                  bucket,
                  commercialSubgroup,
                )}
                onBatchAction={(action) => {
                  if (selectedProductGroupBatchFindings(activeBatch).length > 0) {
                    setConfirmBatchAction(action);
                  }
                }}
                onClearBatch={clearGroupBatch}
                onToggleBatchFinding={toggleGroupBatchFinding}
                onSetAllBatchFindings={setAllGroupBatchFindings}
                onToggleSubgroupListings={(bucket, commercialSubgroup) => void toggleGroupSubgroupListings(
                  workspaceGroup.id,
                  bucket,
                  commercialSubgroup,
                )}
                onOpenTask={(profile, groupId) => void openTask(profile, groupId)}
                onOpenFinding={openLoadedFinding}
                onLoadTaskHistory={() => {
                  if (!workspaceHistoryKey) return;
                  void loadProductTaskHistory({
                    historyKey: workspaceHistoryKey,
                    groupId: workspaceGroup.id,
                    catalogSupported: workspaceCatalogSupported,
                  });
                }}
                onConfirmGroup={confirmGroup}
                onSelectMergeSource={setMergeSourceGroupId}
                onLoadGroupForReview={loadProductGroupForReview}
                onMergeGroups={mergeProductGroups}
                onRevokeMerge={revokeProductGroupMerge}
                onUpdateEmbeddingThreshold={updateGroupEmbeddingThreshold}
                onCorrectGroupMember={correctGroupMember}
                onCreateRule={createGroupRule}
                onUpdateRule={updateGroupRule}
                onDeleteRule={deleteGroupRule}
                onCreateAuthenticityRule={createGroupAuthenticityRule}
                onUpdateAuthenticityRule={updateGroupAuthenticityRule}
                onDeleteAuthenticityRule={deleteGroupAuthenticityRule}
              />
            </div>
          ) : (
            focusedGroupResolvedId === linkedGroupId
              ? <ProductWorkspaceNotFound />
              : <LoadingState />
          )
        ) : (
          <ProductQueue
            overview={visualOverview}
            search={productSearch}
            sort={productSort}
            loadingMore={loadingMoreVisualGroups}
            onSearchChange={setProductSearch}
            onSortChange={setProductSort}
            onLoadMore={() => void loadMoreVisualGroups()}
            currentSearch={location.search}
            selectedCategoryId={selectedCategoryId}
            catalogScope={catalogScope}
            onSelectCategory={selectCatalogCategory}
            onSelectScope={selectCatalogScope}
          />
        )
      ) : null}

      {activeTask && (
        <FindingInspector
          f={activeTask.finding}
          ipId={activeTask.finding.ip_id ?? selectedIpId ?? undefined}
          showIp
          isDismissed={
            Boolean(activeTask.finding.dismissed_at) ||
            dismissingTaskId === activeTask.finding.result_id
          }
          isDismissing={
            dismissingTaskId === activeTask.finding.result_id &&
            !activeTask.finding.dismissed_at
          }
          onClose={closeTask}
          onDismiss={(reason, reasonCode) => void dismissActiveTask(reason, reasonCode)}
          onActionComplete={completeActiveTask}
          onNeedsReview={() => undefined}
          onTakedownSent={() => undefined}
          onEnforced={() => undefined}
          onLicensed={() => undefined}
          onUpdated={refreshTaskAfterUpdate}
          onAddRelatedToBatch={() => undefined}
          productGroupId={activeTask.groupId ?? undefined}
          showRelatedItems={false}
        />
      )}
      {confirmBatchAction && activeBatch?.findings && (
        <BatchConfirmModal
          action={confirmBatchAction}
          scopeLabel={productGroupRecommendationBucket(activeBatch.bucket).label}
          {...partitionGroupBatch(confirmBatchAction)}
          onCancel={() => setConfirmBatchAction(null)}
          onConfirm={(decisionReason, associationScopes) => {
            const action = confirmBatchAction;
            setConfirmBatchAction(null);
            void runGroupBatch(action, decisionReason, associationScopes);
          }}
        />
      )}
      {semanticCorrectionTarget && (
        <SemanticCorrectionDialog
          target={semanticCorrectionTarget}
          categories={semanticTaxonomy}
          colors={semanticColors}
          saving={savingSemanticCorrectionProfileId === semanticCorrectionTarget.profile.id}
          onClose={() => setSemanticCorrectionTarget(null)}
          onSave={(values) => correctSemanticMember({
            ...values,
            group: semanticCorrectionTarget.group,
            profile: semanticCorrectionTarget.profile,
          })}
          onReset={() => resetSemanticCorrection(semanticCorrectionTarget)}
        />
      )}
    </div>
  );
}
export { ProductGroupSettings } from "../features/products/ProductGroupSettings";
export { ProductGroupsOverview } from "../features/products/ProductGroupsOverview";
export { SemanticProductGroupsOverview } from "../features/products/SemanticProductGroupsOverview";
