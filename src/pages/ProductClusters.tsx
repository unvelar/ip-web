import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Images,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  DEFAULT_PRODUCT_SEMANTIC_COLORS,
  DEFAULT_PRODUCT_SEMANTIC_TAXONOMY,
  autoSendTakedown,
  calculatePersistedProductGroupVisualEvidence,
  confirmPersistedProductGroup,
  correctProductSemanticGroupMember,
  createPersistedProductGroupRule,
  deletePersistedProductGroupRule,
  dismissIpFinding,
  excludePersistedProductGroupMember,
  getMonitoringFinding,
  getMonitoringFindingForCase,
  getPersistedProductGroups,
  getProductSemanticTaxonomy,
  isApiError,
  listMonitoringFindingsGlobal,
  listProductClusterScopes,
  markIpFindingEnforced,
  markIpFindingNeedsReview,
  markTakedownSentWithoutEmail,
  pinPersistedProductGroupReferenceImage,
  refreshPersistedProductGroups,
  removePersistedProductGroupReferenceImage,
  resetPersistedProductGroupReferenceImages,
  restoreProductSemanticCorrection,
  updatePersistedProductGroupEmbeddingSettings,
  updatePersistedProductGroupRule,
  type PersistedProductGroup,
  type PersistedProductGroupOverview,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringReviewOutcome,
  type ProductClusterProfile,
  type ProductClusterScope,
  type ProductGroupCorrectionReason,
  type ProductGroupRule,
  type ProductGroupVisualEvidence,
  type ProductSemanticCategory,
  type ProductSemanticColor,
} from "../api";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import { BatchOperationBar } from "../components/monitoring/board/BatchOperationBar";
import { type BatchAction, runPool, summarizeBatch } from "../components/monitoring/board/batchUtils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import { selectedFindingSummary } from "../components/monitoring/board/utils";
import { profileTitle } from "../components/product-clusters/productClusterGraphUtils";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";

type ProductGroupView = "triage" | "all";
type GroupMode = "same" | "related" | "visual";
type ActiveProductTask = {
  profileId: string;
  groupId: string | null;
  finding: IpReviewFinding;
};
type ProductGroupBatch = {
  groupId: string;
  findings: IpReviewFinding[];
};
type SemanticCorrectionTarget = {
  group: PersistedProductGroup;
  profile: ProductClusterProfile;
};

const SEMANTIC_GROUP_PAGE_SIZE = 4;
const VISUAL_GROUP_PAGE_SIZE = 8;

function appendProductGroupPage(
  current: PersistedProductGroupOverview,
  next: PersistedProductGroupOverview,
) {
  const loadedGroupIds = new Set(current.groups.map((group) => group.id));
  return {
    ...next,
    groups: [
      ...current.groups,
      ...next.groups.filter((group) => !loadedGroupIds.has(group.id)),
    ],
    ungrouped: current.ungrouped,
    triage_ungrouped: current.triage_ungrouped,
  };
}

export default function ProductClusters() {
  const { actingTenantId, user } = useAuth();
  const {
    activeIpId: selectedIpId,
    activeIp,
    loading: loadingActiveIp,
  } = useActiveIp();
  const [scopes, setScopes] = useState<ProductClusterScope[]>([]);
  const [semanticOverview, setSemanticOverview] =
    useState<PersistedProductGroupOverview | null>(null);
  const [visualOverview, setVisualOverview] =
    useState<PersistedProductGroupOverview | null>(null);
  const [productGroupView, setProductGroupView] = useState<ProductGroupView>("triage");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scopesLoadedKey, setScopesLoadedKey] = useState<string | null>(null);
  const [groupsLoadedKey, setGroupsLoadedKey] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [loadingMoreSemanticGroups, setLoadingMoreSemanticGroups] = useState(false);
  const [loadingMoreVisualGroups, setLoadingMoreVisualGroups] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savingCorrectionProfileId, setSavingCorrectionProfileId] = useState<string | null>(null);
  const [savingSemanticCorrectionProfileId, setSavingSemanticCorrectionProfileId] =
    useState<string | null>(null);
  const [semanticCorrectionTarget, setSemanticCorrectionTarget] =
    useState<SemanticCorrectionTarget | null>(null);
  const [semanticTaxonomy, setSemanticTaxonomy] = useState<ProductSemanticCategory[]>(
    () => [...DEFAULT_PRODUCT_SEMANTIC_TAXONOMY],
  );
  const [semanticColors, setSemanticColors] = useState<ProductSemanticColor[]>(
    () => [...DEFAULT_PRODUCT_SEMANTIC_COLORS],
  );
  const [semanticTaxonomyLoaded, setSemanticTaxonomyLoaded] = useState(false);
  const [semanticFeedbackNotice, setSemanticFeedbackNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<ActiveProductTask | null>(null);
  const [loadingTaskProfileId, setLoadingTaskProfileId] = useState<string | null>(null);
  const [dismissingTaskId, setDismissingTaskId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [loadingBatchGroupId, setLoadingBatchGroupId] = useState<string | null>(null);
  const [activeBatch, setActiveBatch] = useState<ProductGroupBatch | null>(null);
  const [confirmBatchAction, setConfirmBatchAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const taskRequestSequence = useRef(0);
  const batchRequestSequence = useRef(0);
  const semanticPageRequestSequence = useRef(0);
  const visualPageRequestSequence = useRef(0);
  const canMarkSentWithoutEmail = user?.role === "admin";
  const closeTask = useCallback(() => {
    taskRequestSequence.current += 1;
    setActiveTask(null);
    setLoadingTaskProfileId(null);
  }, []);
  const scopesRequestKey = `${actingTenantId ?? ""}:${refreshVersion}`;
  const groupsRequestKey =
    `${scopesRequestKey}:${selectedIpId ?? ""}:semantic+visual:${productGroupView}`;
  const selectedScope = scopes.find((scope) => scope.ip_id === selectedIpId) ?? null;
  const selectedScopeAvailable =
    scopesLoadedKey === scopesRequestKey && selectedScope != null;
  const loadingScopes = loadingActiveIp || scopesLoadedKey !== scopesRequestKey;
  const loadingGroups =
    Boolean(selectedIpId && selectedScopeAvailable) && groupsLoadedKey !== groupsRequestKey;

  useEffect(() => {
    let alive = true;
    void listProductClusterScopes()
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
    };
  }, [actingTenantId, refreshVersion, scopesRequestKey]);

  useEffect(() => {
    semanticPageRequestSequence.current += 1;
    visualPageRequestSequence.current += 1;
    setLoadingMoreSemanticGroups(false);
    setLoadingMoreVisualGroups(false);
    if (!selectedIpId || !selectedScopeAvailable) {
      setSemanticOverview(null);
      setVisualOverview(null);
      return;
    }
    let alive = true;
    let loadError: unknown = null;
    setSemanticOverview(null);
    setVisualOverview(null);
    const loadSemantic = getPersistedProductGroups(
      selectedIpId,
      "semantic",
      productGroupView,
      {
        limit: SEMANTIC_GROUP_PAGE_SIZE,
      },
    ).then((nextOverview) => {
      if (alive) setSemanticOverview(nextOverview);
    }).catch((caught: unknown) => {
      loadError ??= caught;
    });
    const loadVisual = getPersistedProductGroups(
      selectedIpId,
      "visual",
      productGroupView,
      {
        limit: VISUAL_GROUP_PAGE_SIZE,
      },
    ).then((nextOverview) => {
      if (alive) setVisualOverview(nextOverview);
    }).catch((caught: unknown) => {
      loadError ??= caught;
    });
    void Promise.all([loadSemantic, loadVisual])
      .then(() => {
        if (!alive) return;
        setError(loadError == null ? null : errorMessage(loadError));
        setGroupsLoadedKey(groupsRequestKey);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [
    selectedIpId,
    selectedScopeAvailable,
    productGroupView,
    refreshVersion,
    actingTenantId,
    groupsRequestKey,
  ]);

  useEffect(() => {
    setError(null);
    setTaskError(null);
    setBatchResult(null);
    setLoadingBatchGroupId(null);
    setActiveBatch(null);
    setConfirmBatchAction(null);
    setBatchProgress(null);
    batchRequestSequence.current += 1;
    closeTask();
    setSemanticCorrectionTarget(null);
    setSemanticFeedbackNotice(null);
    setSemanticTaxonomyLoaded(false);
  }, [actingTenantId, closeTask, selectedIpId]);

  useEffect(() => {
    if (!semanticCorrectionTarget || semanticTaxonomyLoaded) return;
    let alive = true;
    void getProductSemanticTaxonomy()
      .then(({ categories, colors }) => {
        if (alive && categories.length > 0) setSemanticTaxonomy(categories);
        if (alive && colors && colors.length > 0) setSemanticColors(colors);
      })
      .catch(() => {
        // Keep the bundled taxonomy while frontend and API releases roll out.
      })
      .finally(() => {
        if (alive) setSemanticTaxonomyLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [semanticCorrectionTarget, semanticTaxonomyLoaded]);

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
    const requestSequence = ++taskRequestSequence.current;
    setActiveTask(null);
    setLoadingTaskProfileId(profile.id);
    setTaskError(null);
    try {
      const { finding } = await getMonitoringFindingForCase(profile.case_id);
      if (taskRequestSequence.current !== requestSequence) return;
      setActiveTask({ profileId: profile.id, groupId, finding });
    } catch (caught: unknown) {
      if (taskRequestSequence.current !== requestSequence) return;
      setTaskError(errorMessage(caught, "Unable to open task details."));
    } finally {
      if (taskRequestSequence.current === requestSequence) {
        setLoadingTaskProfileId(null);
      }
    }
  }

  async function dismissActiveTask(reason: MonitoringReviewOutcome) {
    if (!activeTask) return;
    const finding = activeTask.finding;
    const ipId = finding.ip_id ?? selectedIpId;
    if (!ipId) {
      setTaskError("Cannot update this task because it has no associated IP.");
      return;
    }
    setDismissingTaskId(finding.result_id);
    setTaskError(null);
    try {
      await dismissIpFinding(ipId, finding.result_id, { reason });
      closeTask();
      setRefreshVersion((version) => version + 1);
    } catch (caught: unknown) {
      setTaskError(errorMessage(caught, "Unable to update task."));
    } finally {
      setDismissingTaskId(null);
    }
  }

  function refreshTaskAfterUpdate(opts?: { completed?: boolean }) {
    const task = activeTask;
    const reopeningClosedTask = Boolean(
      task && (
        task.finding.dismissed_at ||
        (task.finding.review_status ?? "pending") !== "pending"
      ),
    );
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
        const nextSemanticOverview = await refreshPersistedProductGroups(
          selectedIpId,
          "semantic",
          productGroupView,
          { limit: SEMANTIC_GROUP_PAGE_SIZE },
        );
        setSemanticOverview(nextSemanticOverview);
        setVisualOverview(await getPersistedProductGroups(
          selectedIpId,
          "visual",
          productGroupView,
          { limit: VISUAL_GROUP_PAGE_SIZE },
        ));
      } catch (caught: unknown) {
        setError(errorMessage(caught));
      } finally {
        setRefreshingGroups(false);
      }
    }
    setRefreshVersion((version) => version + 1);
  }

  async function loadMoreSemanticGroupTypes() {
    const cursor = semanticOverview?.next_cursor;
    if (!selectedIpId || !cursor || loadingMoreSemanticGroups) return;
    const requestSequence = ++semanticPageRequestSequence.current;
    setLoadingMoreSemanticGroups(true);
    setError(null);
    try {
      const nextOverview = await getPersistedProductGroups(
        selectedIpId,
        "semantic",
        productGroupView,
        { limit: SEMANTIC_GROUP_PAGE_SIZE, cursor },
      );
      if (semanticPageRequestSequence.current !== requestSequence) return;
      setSemanticOverview((current) =>
        current && current.next_cursor === cursor
          ? appendProductGroupPage(current, nextOverview)
          : current
      );
    } catch (caught: unknown) {
      if (semanticPageRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load more product types."));
      }
    } finally {
      if (semanticPageRequestSequence.current === requestSequence) {
        setLoadingMoreSemanticGroups(false);
      }
    }
  }

  async function loadMoreVisualGroups() {
    const cursor = visualOverview?.next_cursor;
    if (!selectedIpId || !cursor || loadingMoreVisualGroups) return;
    const requestSequence = ++visualPageRequestSequence.current;
    setLoadingMoreVisualGroups(true);
    setError(null);
    try {
      const nextOverview = await getPersistedProductGroups(
        selectedIpId,
        "visual",
        productGroupView,
        { limit: VISUAL_GROUP_PAGE_SIZE, cursor },
      );
      if (visualPageRequestSequence.current !== requestSequence) return;
      setVisualOverview((current) =>
        current && current.next_cursor === cursor
          ? appendProductGroupPage(current, nextOverview)
          : current
      );
    } catch (caught: unknown) {
      if (visualPageRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load more visual groups."));
      }
    } finally {
      if (visualPageRequestSequence.current === requestSequence) {
        setLoadingMoreVisualGroups(false);
      }
    }
  }

  async function openGroupBatch(groupId: string, action: BatchAction) {
    if (!selectedIpId || batchProgress || loadingBatchGroupId) return;
    if (activeBatch?.groupId === groupId) {
      setConfirmBatchAction(action);
      return;
    }

    const requestSequence = ++batchRequestSequence.current;
    setLoadingBatchGroupId(groupId);
    setActiveBatch(null);
    setConfirmBatchAction(null);
    setError(null);
    try {
      const findings = await loadProductGroupBatch(selectedIpId, groupId);
      if (batchRequestSequence.current !== requestSequence) return;
      if (findings.length === 0) {
        setBatchResult("No tasks in this product group still need triage.");
        setRefreshVersion((version) => version + 1);
        return;
      }
      setActiveBatch({ groupId, findings });
      setConfirmBatchAction(action);
    } catch (caught: unknown) {
      if (batchRequestSequence.current !== requestSequence) return;
      setError(errorMessage(caught, "Unable to load this product group's tasks."));
    } finally {
      if (batchRequestSequence.current === requestSequence) {
        setLoadingBatchGroupId(null);
      }
    }
  }

  function partitionGroupBatch(action: BatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (reason: string) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    for (const finding of activeBatch?.findings ?? []) {
      const state: CaseReviewStatus = finding.dismissed_at
        ? "dismissed"
        : (finding.review_status ?? "pending");
      const findingIpId = finding.ip_id ?? selectedIpId;
      if (action === "send") {
        if (!isDecisionState(state)) skip("already sent or closed");
        else if (!finding.case_id) skip("still preparing");
        else if (finding.signer_ready === false && !canMarkSentWithoutEmail) {
          skip("missing signer information");
        } else eligible.push(finding);
      } else if (action === "review") {
        if (state !== "pending") skip("not in triage");
        else if (!finding.case_id) skip("still preparing");
        else if (!findingIpId) skip("no associated IP");
        else eligible.push(finding);
      } else if (
        action === "false_positive" ||
        action === "do_not_pursue" ||
        action === "second_hand"
      ) {
        if (finding.dismissed_at) skip("already dismissed");
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

  async function runGroupBatch(action: BatchAction) {
    const { eligible, skipped } = partitionGroupBatch(action);
    const skipCounts = { ...skipped };
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
      async (finding) => {
        try {
          const findingIpId = (finding.ip_id ?? selectedIpId) as string;
          if (action === "send") {
            const result = await autoSendTakedown(finding.case_id as string);
            if (result.status === "sent") ok += 1;
            else if (canMarkSentWithoutEmail) {
              await markTakedownSentWithoutEmail(finding.case_id as string);
              ok += 1;
            } else if (result.status === "needs_compose") bump("needs manual compose");
            else bump("email not configured");
          } else if (
            action === "false_positive" ||
            action === "do_not_pursue" ||
            action === "second_hand"
          ) {
            await dismissIpFinding(findingIpId, finding.result_id, { reason: action });
            ok += 1;
          } else if (action === "review") {
            await markIpFindingNeedsReview(findingIpId, finding.result_id);
            ok += 1;
          } else {
            await markIpFindingEnforced(findingIpId, finding.result_id);
            ok += 1;
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
    setBatchProgress(null);
    setActiveBatch(null);
    setBatchResult(summarizeBatch(action, ok, skipCounts, failed));
    closeTask();
    setRefreshVersion((version) => version + 1);
  }

  async function confirmGroup(groupId: string, displayName: string) {
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
      );
      setVisualOverview(await getPersistedProductGroups(
        selectedIpId,
        "visual",
        productGroupView,
        { limit: VISUAL_GROUP_PAGE_SIZE },
      ));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingGroupId(null);
    }
  }

  async function correctGroupMember(
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) {
    if (!selectedIpId) return;
    visualPageRequestSequence.current += 1;
    setLoadingMoreVisualGroups(false);
    setError(null);
    setSavingCorrectionProfileId(profileId);
    try {
      await excludePersistedProductGroupMember(selectedIpId, groupId, {
        profile_id: profileId,
        reason,
      });
      setVisualOverview(await getPersistedProductGroups(
        selectedIpId,
        "visual",
        productGroupView,
        { limit: VISUAL_GROUP_PAGE_SIZE },
      ));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingCorrectionProfileId(null);
    }
  }

  async function correctSemanticMember(input: {
    group: PersistedProductGroup;
    profile: ProductClusterProfile;
    correctedCategoryKey: string;
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
          corrected_category_key: input.correctedCategoryKey,
          corrected_variant_colors: input.correctedVariantColors,
          note: input.note.trim() || null,
          propagate_to_similar: input.propagateToSimilar,
        },
      );
      setSemanticOverview(
        await getPersistedProductGroups(selectedIpId, "semantic", productGroupView, {
          limit: SEMANTIC_GROUP_PAGE_SIZE,
        }),
      );
      setSemanticCorrectionTarget(null);
      setSemanticFeedbackNotice(
        result.already_applied
          ? "This classification was already corrected. The latest product groups are now loaded."
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
          productGroupView,
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
        await getPersistedProductGroups(selectedIpId, "semantic", productGroupView, {
          limit: SEMANTIC_GROUP_PAGE_SIZE,
        }),
      );
      setSemanticCorrectionTarget(null);
      setSemanticFeedbackNotice(
        result.similar_profiles_queued > 0
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
          productGroupView,
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

  const primaryOverview = semanticOverview ?? visualOverview;
  const workloadOverview = semanticOverview ?? visualOverview;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-stone-900">
              Product Clustering Lab
            </h1>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Beta
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Groups can overlap. A listing may belong to a product type such as home
            decor and, independently, to one or more visually similar groups.
          </p>
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

      {primaryOverview && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone-500">
            <span>
              <strong className="text-stone-800">{primaryOverview.scope.profile_count}</strong>{" "}
              profiled listings
            </span>
            {semanticOverview?.snapshot_profile_count != null && (
              <span>
                <strong className="text-stone-800">{semanticOverview.snapshot_profile_count}</strong>{" "}
                classified
              </span>
            )}
            {(semanticOverview?.pending_snapshot_count ?? 0) > 0 && (
              <span className="text-violet-700">
                <strong>{semanticOverview?.pending_snapshot_count}</strong>{" "}
                awaiting classification
              </span>
            )}
            {productGroupView === "triage" && workloadOverview?.triage_projection_available && (
              <>
                <span>
                  <strong className="text-stone-800">{workloadOverview.triage_profile_count ?? 0}</strong>{" "}
                  {(workloadOverview.triage_profile_count ?? 0) === 1 ? "listing" : "listings"} to triage
                </span>
                {semanticOverview && (
                  <span>
                    <strong className="text-stone-800">{semanticOverview.triage_group_count ?? 0}</strong>{" "}
                    type/variant groups with work
                  </span>
                )}
                {visualOverview && (
                  <span>
                    <strong className="text-stone-800">{visualOverview.triage_group_count ?? 0}</strong>{" "}
                    visual groups with work
                  </span>
                )}
              </>
            )}
            {productGroupView === "all" && (
              <>
                {semanticOverview && (
                  <span>
                    <strong className="text-stone-800">{semanticOverview.group_count}</strong>{" "}
                    type/variant groups
                  </span>
                )}
                {visualOverview && (
                  <span>
                    <strong className="text-stone-800">{visualOverview.group_count}</strong>{" "}
                    visual groups
                  </span>
                )}
                {workloadOverview?.triage_projection_available && (
                  <span>
                    <strong className="text-stone-800">{workloadOverview.triage_profile_count ?? 0}</strong>{" "}
                    {(workloadOverview.triage_profile_count ?? 0) === 1 ? "listing" : "listings"} to triage
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      )}

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
        <div className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
          <span>{batchResult}</span>
          <button
            type="button"
            onClick={() => setBatchResult(null)}
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-400 hover:bg-stone-200 hover:text-stone-700"
            aria-label="Dismiss batch result"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loadingScopes ? (
        <LoadingState />
      ) : !selectedIpId || !selectedScope ? (
        <EmptyState ipName={activeIp?.name ?? null} />
      ) : loadingGroups && !semanticOverview && !visualOverview ? (
        <LoadingState />
      ) : semanticOverview || visualOverview ? (
        <div className="mt-5">
          <ProductGroupViewToggle
            view={productGroupView}
            onChange={setProductGroupView}
          />
          {semanticOverview && (
            <section className="mt-7" aria-labelledby="semantic-groups-heading">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
                Product classification
              </p>
              <h2 id="semantic-groups-heading" className="mt-1 text-lg font-black text-stone-900">
                Product types and useful variants
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-stone-500">
                Functional categories such as home decor, plush toys, and keychains,
                with meaningful variants nested beneath them.
              </p>
              {semanticFeedbackNotice && (
                <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900">
                  <span>{semanticFeedbackNotice}</span>
                  <button
                    type="button"
                    aria-label="Dismiss semantic correction status"
                    onClick={() => setSemanticFeedbackNotice(null)}
                    className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              <SemanticProductGroupsOverview
                overview={semanticOverview}
                groupView={productGroupView}
                onGroupViewChange={setProductGroupView}
                showViewToggle={false}
                activeTaskProfileId={activeTask?.profileId ?? null}
                loadingTaskProfileId={loadingTaskProfileId}
                loadingBatchGroupId={loadingBatchGroupId}
                activeBatch={activeBatch}
                batchProgress={batchProgress}
                savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                loadingMore={loadingMoreSemanticGroups}
                onBatchAction={(groupId, action) => void openGroupBatch(groupId, action)}
                onLoadMore={() => void loadMoreSemanticGroupTypes()}
                onOpenTask={(profile, groupId) => void openTask(profile, groupId)}
                onCorrectType={(group, profile) => {
                  setSemanticCorrectionTarget({ group, profile });
                }}
              />
            </section>
          )}
          {visualOverview && (
            <section className="mt-10 border-t border-stone-200 pt-7" aria-labelledby="visual-groups-heading">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-700">
                Visual similarity
              </p>
              <h2 id="visual-groups-heading" className="mt-1 text-lg font-black text-stone-900">
                Visually similar groups
              </h2>
              <p className="mt-1 max-w-3xl text-sm text-stone-500">
                Independent cohorts formed from shared gallery appearance. The same
                listing can appear here, in another visual group, and in a product-type group above.
              </p>
              <ProductGroupsOverview
                overview={visualOverview}
                mode="visual"
                groupView={productGroupView}
                onGroupViewChange={setProductGroupView}
                showViewToggle={false}
                showUngrouped={false}
                savingGroupId={savingGroupId}
                savingCorrectionProfileId={savingCorrectionProfileId}
                activeTaskProfileId={activeTask?.profileId ?? null}
                loadingTaskProfileId={loadingTaskProfileId}
                loadingBatchGroupId={loadingBatchGroupId}
                activeBatch={activeBatch}
                batchProgress={batchProgress}
                loadingMore={loadingMoreVisualGroups}
                onBatchAction={(groupId, action) => void openGroupBatch(groupId, action)}
                onLoadMore={() => void loadMoreVisualGroups()}
                onOpenTask={(profile, groupId) => void openTask(profile, groupId)}
                onConfirmGroup={confirmGroup}
                onUpdateEmbeddingThreshold={updateGroupEmbeddingThreshold}
                onCorrectGroupMember={correctGroupMember}
                onCreateRule={createGroupRule}
                onUpdateRule={updateGroupRule}
                onDeleteRule={deleteGroupRule}
              />
            </section>
          )}
        </div>
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
          onDismiss={(reason) => void dismissActiveTask(reason)}
          onActionComplete={closeTask}
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
      {confirmBatchAction && activeBatch && (
        <BatchConfirmModal
          action={confirmBatchAction}
          {...partitionGroupBatch(confirmBatchAction)}
          onCancel={() => setConfirmBatchAction(null)}
          onConfirm={() => {
            const action = confirmBatchAction;
            setConfirmBatchAction(null);
            void runGroupBatch(action);
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

function SemanticCorrectionDialog({
  target,
  categories,
  colors,
  saving,
  onClose,
  onSave,
  onReset,
}: {
  target: SemanticCorrectionTarget;
  categories: ProductSemanticCategory[];
  colors: ProductSemanticColor[];
  saving: boolean;
  onClose: () => void;
  onSave: (values: {
    correctedCategoryKey: string;
    correctedVariantColors: string[];
    note: string;
    propagateToSimilar: boolean;
  }) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  const currentCategoryKey = target.group.semantic_definition?.category_key ?? "";
  const sourceCategoryKey = target.profile.semantic_source_category_key ?? currentCategoryKey;
  const groupVariantColor = target.group.semantic_definition?.variant_color;
  const currentVariantColors = [...new Set(
    (target.profile.semantic_variant_colors ?? (
      groupVariantColor
        ? [{ color: groupVariantColor, confidence: 1, evidence_image_positions: [] }]
        : []
    ))
      .map(({ color }) => color.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
  const [correctedCategoryKey, setCorrectedCategoryKey] = useState(currentCategoryKey);
  const [correctedVariantColors, setCorrectedVariantColors] = useState<string[]>(
    currentVariantColors,
  );
  const [note, setNote] = useState("");
  const [propagateToSimilar, setPropagateToSimilar] = useState(true);
  const selectedCategory = categories.find(
    (category) => category.key === correctedCategoryKey,
  ) ?? null;
  const effectiveCorrectedColors = selectedCategory?.supports_color_variants
    ? correctedVariantColors
    : [];
  const classificationChanged = correctedCategoryKey !== currentCategoryKey ||
    effectiveCorrectedColors.length !== currentVariantColors.length ||
    effectiveCorrectedColors.some((color, index) => color !== currentVariantColors[index]);
  const colorLabels = new Map(colors.map((color) => [color.key, color.label]));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-correction-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
              Reviewer correction
            </p>
            <h2 id="semantic-correction-title" className="mt-1 text-lg font-black text-stone-950">
              Correct classification
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-stone-700">
              {profileTitle(target.profile)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close classification correction"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600">
          <p>
            Current group: <strong className="text-stone-900">{target.group.display_name}</strong>
          </p>
          <p className="mt-1">
            Current colors: <strong className="text-stone-900">{
              currentVariantColors.length > 0
                ? currentVariantColors.map((color) => colorLabels.get(color) ?? color).join(", ")
                : "No color subgroup"
            }</strong>
          </p>
          {target.profile.semantic_correction_id && (
            <p className="mt-1">
              Classifier result: <strong className="text-stone-900">{
                target.profile.semantic_source_category_label ?? sourceCategoryKey
              }</strong>
            </p>
          )}
        </div>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!correctedCategoryKey || !classificationChanged || saving) return;
            void Promise.resolve(onSave({
              correctedCategoryKey,
              correctedVariantColors: effectiveCorrectedColors,
              note,
              propagateToSimilar,
            })).catch(() => undefined);
          }}
        >
          <label className="block text-xs font-bold text-stone-800" htmlFor="corrected-product-type">
            Product type
          </label>
          <select
            id="corrected-product-type"
            value={correctedCategoryKey}
            disabled={saving}
            onChange={(event) => {
              const nextCategoryKey = event.target.value;
              setCorrectedCategoryKey(nextCategoryKey);
              if (!categories.find((category) => category.key === nextCategoryKey)
                ?.supports_color_variants) {
                setCorrectedVariantColors([]);
              }
            }}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
          >
            {categories.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
          </select>

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-stone-800">Color groups</legend>
            {selectedCategory?.supports_color_variants ? (
              <>
                <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                  Select every marketed color variant that should apply. Color groups may overlap.
                </p>
                <button
                  type="button"
                  aria-pressed={correctedVariantColors.length === 0}
                  disabled={saving}
                  onClick={() => setCorrectedVariantColors([])}
                  className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                    correctedVariantColors.length === 0
                      ? "border-violet-400 bg-violet-50 text-violet-950"
                      : "border-stone-200 bg-white text-stone-700 hover:border-violet-300"
                  }`}
                >
                  <span className="block text-xs font-bold">No color subgroup</span>
                  <span className="mt-0.5 block text-[11px]">
                    Keep this listing only in the generic product-type group.
                  </span>
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {colors.map((color) => {
                    const checked = correctedVariantColors.includes(color.key);
                    return (
                      <label
                        key={color.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                          checked
                            ? "border-violet-400 bg-violet-50 text-violet-950"
                            : "border-stone-200 bg-white text-stone-700 hover:border-violet-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={saving}
                          onChange={(event) => {
                            setCorrectedVariantColors((current) => event.target.checked
                              ? [...new Set([...current, color.key])].sort()
                              : current.filter((key) => key !== color.key));
                          }}
                          className="h-3.5 w-3.5 rounded border-violet-300 text-violet-700"
                        />
                        {color.label}
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[11px] text-stone-600">
                This product type does not create color subgroups.
              </p>
            )}
          </fieldset>

          <label className="mt-4 block text-xs font-bold text-stone-800" htmlFor="semantic-correction-note">
            Note <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <textarea
            id="semantic-correction-note"
            value={note}
            maxLength={1000}
            rows={3}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why is the current classification wrong?"
            className="mt-1.5 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
            <input
              type="checkbox"
              checked={propagateToSimilar}
              disabled={saving}
              onChange={(event) => setPropagateToSimilar(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-700"
            />
            <span>
              <span className="block text-xs font-bold text-violet-950">
                Reconsider visually similar listings
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-violet-800">
                Strong visual matches are queued using this correction as a trusted example. Their types and colors are still decided from their own text and images.
              </span>
            </span>
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              {target.profile.semantic_correction_id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void Promise.resolve(onReset()).catch(() => undefined)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                  Use classifier result
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !correctedCategoryKey || !classificationChanged}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-40"
              >
                <CheckCircle2 size={14} />
                {saving ? "Updating…" : "Update classification"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProductGroupViewToggle({
  view,
  onChange,
}: {
  view: ProductGroupView;
  onChange: (view: ProductGroupView) => void;
}) {
  const showingTriage = view === "triage";
  return (
    <div
      className="inline-flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
      role="group"
      aria-label="Product group listing view"
    >
      <button
        type="button"
        aria-pressed={showingTriage}
        onClick={() => onChange("triage")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          showingTriage
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
      >
        Needs triage
      </button>
      <button
        type="button"
        aria-pressed={!showingTriage}
        onClick={() => onChange("all")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          !showingTriage
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
      >
        All product groups
      </button>
    </div>
  );
}

function SemanticProductGroupsOverview({
  overview,
  groupView,
  onGroupViewChange,
  showViewToggle = true,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingBatchGroupId,
  activeBatch,
  batchProgress,
  savingSemanticCorrectionProfileId,
  loadingMore,
  onBatchAction,
  onLoadMore,
  onOpenTask,
  onCorrectType,
}: {
  overview: PersistedProductGroupOverview;
  groupView: ProductGroupView;
  onGroupViewChange: (view: ProductGroupView) => void;
  showViewToggle?: boolean;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingBatchGroupId: string | null;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  savingSemanticCorrectionProfileId: string | null;
  loadingMore: boolean;
  onBatchAction: (groupId: string, action: BatchAction) => void;
  onLoadMore: () => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onCorrectType: (
    group: PersistedProductGroup,
    profile: ProductClusterProfile,
  ) => void;
}) {
  const showingTriage = groupView === "triage";
  const displayedGroups = showingTriage
    ? overview.groups.filter((group) => (group.triage_member_count ?? 0) > 0)
    : overview.groups;
  const categoryGroups = displayedGroups.filter(
    (group) => group.semantic_kind === "category" && !group.parent_group_id,
  );
  const categoryIds = new Set(categoryGroups.map((group) => group.id));
  const childrenByParent = new Map<string, PersistedProductGroup[]>();
  const orphanGroups: PersistedProductGroup[] = [];
  for (const group of displayedGroups) {
    if (group.semantic_kind === "category" && !group.parent_group_id) continue;
    if (!group.parent_group_id || !categoryIds.has(group.parent_group_id)) {
      orphanGroups.push(group);
      continue;
    }
    const siblings = childrenByParent.get(group.parent_group_id) ?? [];
    siblings.push(group);
    childrenByParent.set(group.parent_group_id, siblings);
  }
  for (const siblings of childrenByParent.values()) {
    siblings.sort((left, right) =>
      (left.display_name ?? "").localeCompare(right.display_name ?? ""),
    );
  }
  const buildingFirstSnapshot = overview.dirty &&
    (overview.snapshot_profile_count ?? 0) === 0;
  const pendingClassifications = overview.pending_snapshot_count ?? 0;

  return (
    <div className="mt-5">
      {showViewToggle && (
        <ProductGroupViewToggle view={groupView} onChange={onGroupViewChange} />
      )}

      {overview.last_error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The latest automatic group refresh failed: {overview.last_error}
        </div>
      )}

      {showingTriage && !overview.triage_projection_available ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Triage workload is temporarily unavailable while the backend update rolls out.
        </div>
      ) : categoryGroups.length === 0 && orphanGroups.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
          <h2 className="text-base font-bold text-stone-900">
            {buildingFirstSnapshot
              ? "Building the first product taxonomy"
              : showingTriage
                ? (overview.triage_profile_count ?? 0) === 0
                  ? "No listings need triage"
                  : "No classified group has shared triage work"
                : "No product type has multiple listings yet"}
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            {buildingFirstSnapshot || pendingClassifications > 0
              ? "Classification runs independently in the background and groups appear as results arrive."
              : showingTriage
                ? "Any remaining to-triage listings are either still being classified or are the only listing of their type."
                : "Singleton classifications are retained for coverage and will appear once another listing shares their type."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-2">
          {categoryGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm"
            >
              <SemanticProductGroupCard
                group={group}
                ipId={overview.scope.ip_id}
                showingTriage={showingTriage}
                triageProjectionAvailable={overview.triage_projection_available}
                activeTaskProfileId={activeTaskProfileId}
                loadingTaskProfileId={loadingTaskProfileId}
                loadingBatch={loadingBatchGroupId === group.id}
                batchFindings={activeBatch?.groupId === group.id ? activeBatch.findings : null}
                batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                batchDisabled={Boolean(
                  (loadingBatchGroupId && loadingBatchGroupId !== group.id) ||
                  (batchProgress && activeBatch?.groupId !== group.id)
                )}
                onBatchAction={(action) => onBatchAction(group.id, action)}
                onOpenTask={onOpenTask}
                onCorrectType={onCorrectType}
              />
              {(childrenByParent.get(group.id)?.length ?? 0) > 0 && (
                <div className="mt-4 border-t border-violet-100 pt-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
                    Useful variants
                  </p>
                  <div className="space-y-3">
                    {childrenByParent.get(group.id)?.map((child) => (
                      <SemanticProductGroupCard
                        key={child.id}
                        group={child}
                        ipId={overview.scope.ip_id}
                        showingTriage={showingTriage}
                        triageProjectionAvailable={overview.triage_projection_available}
                        nested
                        activeTaskProfileId={activeTaskProfileId}
                        loadingTaskProfileId={loadingTaskProfileId}
                        loadingBatch={loadingBatchGroupId === child.id}
                        batchFindings={activeBatch?.groupId === child.id ? activeBatch.findings : null}
                        batchProgress={activeBatch?.groupId === child.id ? batchProgress : null}
                        savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                        batchDisabled={Boolean(
                          (loadingBatchGroupId && loadingBatchGroupId !== child.id) ||
                          (batchProgress && activeBatch?.groupId !== child.id)
                        )}
                        onBatchAction={(action) => onBatchAction(child.id, action)}
                        onOpenTask={onOpenTask}
                        onCorrectType={onCorrectType}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ))}
          {orphanGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <SemanticProductGroupCard
                group={group}
                ipId={overview.scope.ip_id}
                showingTriage={showingTriage}
                triageProjectionAvailable={overview.triage_projection_available}
                activeTaskProfileId={activeTaskProfileId}
                loadingTaskProfileId={loadingTaskProfileId}
                loadingBatch={loadingBatchGroupId === group.id}
                batchFindings={activeBatch?.groupId === group.id ? activeBatch.findings : null}
                batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                batchDisabled={Boolean(
                  (loadingBatchGroupId && loadingBatchGroupId !== group.id) ||
                  (batchProgress && activeBatch?.groupId !== group.id)
                )}
                onBatchAction={(action) => onBatchAction(group.id, action)}
                onOpenTask={onOpenTask}
                onCorrectType={onCorrectType}
              />
            </section>
          ))}
        </div>
      )}

      {overview.next_cursor ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
          <p className="text-xs text-stone-600">
            Showing {categoryGroups.length} of {overview.pagination_group_count} product types,
            with their useful variants.
          </p>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore && <RefreshCw size={13} className="animate-spin" />}
            {loadingMore ? "Loading…" : "Load more product types"}
          </button>
        </div>
      ) : overview.truncated ? (
        <p className="mt-3 text-xs text-amber-700">
          More product types exist, but this API version cannot page through them yet.
        </p>
      ) : null}
    </div>
  );
}

function SemanticListingActionsMenu({
  profile,
  editDisabled,
  onView,
  onEdit,
}: {
  profile: ProductClusterProfile;
  editDisabled: boolean;
  onView: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const title = profileTitle(profile);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-20">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Open actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={profile.semantic_correction_id
          ? "Listing actions — reviewer corrected"
          : "Listing actions"}
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
          profile.semantic_correction_id
            ? "border-emerald-300 text-emerald-800"
            : "border-stone-200 text-stone-700"
        }`}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
        {profile.semantic_correction_id && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-2 w-2 rounded-full border border-white bg-emerald-500"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${title}`}
          className="absolute right-0 mt-1 w-28 overflow-hidden rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onView)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-stone-700 transition hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
          >
            <Eye size={13} aria-hidden="true" />
            View
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={editDisabled}
            onClick={() => runAction(onEdit)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-stone-700 transition hover:bg-violet-50 hover:text-violet-800 focus:bg-violet-50 focus:text-violet-800 focus:outline-none disabled:cursor-wait disabled:opacity-50"
          >
            <Pencil size={13} aria-hidden="true" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function SemanticProductGroupCard({
  group,
  ipId,
  showingTriage,
  triageProjectionAvailable,
  nested = false,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingBatch,
  batchFindings,
  batchProgress,
  batchDisabled,
  savingSemanticCorrectionProfileId,
  onBatchAction,
  onOpenTask,
  onCorrectType,
}: {
  group: PersistedProductGroup;
  ipId: string;
  showingTriage: boolean;
  triageProjectionAvailable: boolean;
  nested?: boolean;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingBatch: boolean;
  batchFindings: IpReviewFinding[] | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
  savingSemanticCorrectionProfileId: string | null;
  onBatchAction: (action: BatchAction) => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onCorrectType: (
    group: PersistedProductGroup,
    profile: ProductClusterProfile,
  ) => void;
}) {
  const triageMemberCount = group.triage_member_count ?? 0;
  const displayedMembers = showingTriage ? group.triage_members : group.members;
  const displayedMemberCount = showingTriage ? triageMemberCount : group.member_count;
  const taskLinkMode = showingTriage || (triageProjectionAvailable && triageMemberCount > 0)
    ? "pending"
    : triageProjectionAvailable
      ? "history"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const color = group.semantic_definition?.variant_color;

  return (
    <div
      data-product-group-id={group.id}
      className={nested
        ? "rounded-xl border border-stone-200 bg-stone-50 p-3"
        : ""}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${
            nested ? "text-stone-500" : "text-violet-700"
          }`}>
            {nested ? "Color variant" : "Product type"}
          </p>
          <h2 className={`${nested ? "mt-0.5 text-sm" : "mt-1 text-lg"} font-black text-stone-900`}>
            {group.display_name ?? "Classified products"}
          </h2>
          <p className="mt-1 text-[11px] text-stone-500">
            {color
              ? `Listings marketed as ${color}.`
              : "Automatically classified from listing text and stored gallery evidence."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-stone-900">
            {showingTriage
              ? `${triageMemberCount} to triage`
              : `${group.member_count} ${group.member_count === 1 ? "listing" : "listings"}`}
          </p>
          <p className="mt-0.5 text-[10px] text-stone-500">
            Classifier confidence {group.average_score?.toFixed(2) ?? "—"}
          </p>
          {!showingTriage && triageProjectionAvailable && (
            <p className={`mt-0.5 text-[10px] font-semibold ${
              triageMemberCount > 0 ? "text-red-700" : "text-emerald-700"
            }`}>
              {triageMemberCount > 0
                ? `${triageMemberCount} still to triage`
                : "No listings need triage"}
            </p>
          )}
        </div>
      </div>

      <div className={`mt-3 grid grid-cols-3 gap-2 ${nested ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
        {displayedMembers.map((profile) => (
          <div key={profile.id} className="group/semantic-member relative min-w-0">
            <ListingTile
              profile={profile}
              active={activeTaskProfileId === profile.id}
              loading={loadingTaskProfileId === profile.id}
              onClick={() => onOpenTask(profile, group.id)}
            />
            <SemanticListingActionsMenu
              profile={profile}
              editDisabled={Boolean(savingSemanticCorrectionProfileId)}
              onView={() => onOpenTask(profile, group.id)}
              onEdit={() => onCorrectType(group, profile)}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">
          {displayedMemberCount > displayedMembers.length
            ? `+${displayedMemberCount - displayedMembers.length} more listings`
            : nested
              ? "A meaningful color subset of the parent type"
              : `${group.member_count} classified in this product type`}
        </p>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            taskLinkMode === "pending"
              ? "border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100"
              : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-100"
          }`}
        >
          <ListFilter size={13} />
          {taskLinkMode === "pending"
            ? "Open tasks"
            : taskLinkMode === "history"
              ? "View history"
              : "View tasks"}
        </Link>
      </div>
      <BatchOperationBar
        selectedCount={batchFindings?.length ?? triageMemberCount}
        selectedSummary={batchFindings
          ? selectedFindingSummary(batchFindings)
          : group.display_name
            ? [group.display_name]
            : []}
        batchProgress={batchProgress}
        onAction={onBatchAction}
        showResort={false}
        placement="inline"
        showShortcuts={false}
        disabled={batchDisabled}
        statusMessage={loadingBatch ? "Loading all group tasks…" : null}
      />
    </div>
  );
}

function ProductGroupsOverview({
  overview,
  mode,
  groupView,
  onGroupViewChange,
  showViewToggle = true,
  showUngrouped = true,
  savingGroupId,
  savingCorrectionProfileId,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingBatchGroupId,
  activeBatch,
  batchProgress,
  loadingMore,
  onBatchAction,
  onLoadMore,
  onOpenTask,
  onConfirmGroup,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: {
  overview: PersistedProductGroupOverview;
  mode: GroupMode;
  groupView: ProductGroupView;
  onGroupViewChange: (view: ProductGroupView) => void;
  showViewToggle?: boolean;
  showUngrouped?: boolean;
  savingGroupId: string | null;
  savingCorrectionProfileId: string | null;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingBatchGroupId: string | null;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  loadingMore: boolean;
  onBatchAction: (groupId: string, action: BatchAction) => void;
  onLoadMore: () => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
  onUpdateEmbeddingThreshold: (
    groupId: string,
    embeddingMatchThreshold: number | null,
  ) => Promise<{
    group: Pick<PersistedProductGroup, "id" | "embedding_match_threshold">;
    regrouping_queued: boolean;
  }>;
  onCorrectGroupMember: (
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) => Promise<void>;
  onCreateRule: (
    groupId: string,
    instruction: string,
  ) => Promise<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>;
  onUpdateRule: (
    groupId: string,
    ruleId: string,
    instruction: string,
  ) => Promise<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>;
  onDeleteRule: (
    groupId: string,
    ruleId: string,
  ) => Promise<{ id: string; rescore_jobs_enqueued: number }>;
}) {
  const showingTriage = groupView === "triage";
  const displayedGroups = showingTriage
    ? overview.triage_projection_available
      ? overview.groups.filter((group) => (group.triage_member_count ?? 0) > 0)
      : []
    : overview.groups;
  const triageProfileCount = overview.triage_profile_count ?? 0;
  const displayedUngroupedCount = showingTriage
    ? overview.triage_ungrouped_count ?? 0
    : overview.ungrouped_count;
  const displayedUngrouped = showingTriage
    ? overview.triage_ungrouped
    : overview.ungrouped;
  const buildingFirstSnapshot = overview.dirty && (overview.snapshot_profile_count ?? 0) === 0;

  return (
    <div className="mt-5">
      {showViewToggle && (
        <ProductGroupViewToggle view={groupView} onChange={onGroupViewChange} />
      )}

      {overview.last_error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The latest automatic group refresh failed: {overview.last_error}
        </div>
      )}

      {showingTriage && !overview.triage_projection_available ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Triage workload is temporarily unavailable while the backend update rolls out. Historical group membership is hidden so it is not mistaken for open work.
        </div>
      ) : (
        <>
          {displayedGroups.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
              <h2 className="text-base font-bold text-stone-900">
                {buildingFirstSnapshot
                  ? "Building the first persistent snapshot"
                  : showingTriage
                    ? triageProfileCount === 0
                      ? "No listings need triage"
                      : mode === "visual"
                        ? "No overlapping visual cohorts need triage"
                        : "No multi-listing batches need triage"
                    : mode === "visual"
                      ? "No multi-listing visual cohorts in this snapshot"
                      : "No multi-listing groups in this snapshot"}
              </h2>
              <p className="mt-2 text-sm text-stone-500">
                {buildingFirstSnapshot
                  ? showingTriage
                    ? "The backend will publish triage batches after the queued refresh completes."
                    : "The backend will publish stored groups after the queued refresh completes."
                  : showingTriage
                    ? triageProfileCount === 0
                      ? "No review-ready listings in this snapshot are waiting in To triage."
                      : mode === "visual"
                        ? "The remaining work has no close cross-listing gallery view yet."
                        : "The remaining work is shown as one-listing candidates below."
                    : displayedUngroupedCount > 0
                      ? mode === "visual"
                        ? "Listings without a close visual cohort are shown below."
                        : "Stored one-listing candidates are shown below."
                      : "No stored group memberships are available for this IP."}
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {displayedGroups.map((group, index) => (
                <ProductGroupCard
                  key={group.id}
                  group={group}
                  index={index}
                  ipId={overview.scope.ip_id}
                  mode={mode}
                  showPersistedMembers={!showingTriage}
                  triageProjectionAvailable={overview.triage_projection_available}
                  saving={savingGroupId === group.id}
                  savingCorrectionProfileId={savingCorrectionProfileId}
                  activeTaskProfileId={activeTaskProfileId}
                  loadingTaskProfileId={loadingTaskProfileId}
                  loadingBatch={loadingBatchGroupId === group.id}
                  batchFindings={activeBatch?.groupId === group.id ? activeBatch.findings : null}
                  batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                  batchDisabled={Boolean(
                    (loadingBatchGroupId && loadingBatchGroupId !== group.id) ||
                    (batchProgress && activeBatch?.groupId !== group.id)
                  )}
                  onBatchAction={(action) => onBatchAction(group.id, action)}
                  onOpenTask={onOpenTask}
                  onConfirmGroup={onConfirmGroup}
                  onUpdateEmbeddingThreshold={onUpdateEmbeddingThreshold}
                  onCorrectGroupMember={onCorrectGroupMember}
                  onCreateRule={onCreateRule}
                  onUpdateRule={onUpdateRule}
                  onDeleteRule={onDeleteRule}
                />
              ))}
            </div>
          )}

          {overview.next_cursor ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-600">
                Showing {displayedGroups.length} of {overview.pagination_group_count} {showingTriage
                  ? "visual groups with work"
                  : "visual groups"}.
              </p>
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                {loadingMore ? "Loading…" : "Load more visual groups"}
              </button>
            </div>
          ) : overview.truncated ? (
            <p className="mt-3 text-xs text-amber-700">
              More visual groups exist, but this API version cannot page through them yet.
            </p>
          ) : null}

          {showUngrouped && displayedUngroupedCount > 0 && (
            <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-stone-900">
                {mode === "visual"
                  ? showingTriage
                    ? "Listings without a visual cohort to triage"
                    : "Listings without a visual cohort"
                  : showingTriage
                    ? "One-listing candidates to triage"
                    : "Stored one-listing candidates"} · {displayedUngroupedCount}
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                {mode === "visual"
                  ? "All of their stored images were analyzed, but none formed a retained cross-listing clique at this cutoff."
                  : showingTriage
                  ? "These listings still need triage, but no second listing has enough complete pairwise evidence to join them yet."
                  : "These are persisted too, but no second listing has enough complete pairwise evidence to join them yet."}
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
                {displayedUngrouped.map((profile) => (
                  <ListingTile
                    key={profile.id}
                    profile={profile}
                    active={activeTaskProfileId === profile.id}
                    loading={loadingTaskProfileId === profile.id}
                    onClick={() => onOpenTask(profile, null)}
                  />
                ))}
              </div>
              {displayedUngroupedCount > displayedUngrouped.length && (
                <p className="mt-3 text-xs text-stone-500">
                  +{displayedUngroupedCount - displayedUngrouped.length} more {showingTriage
                    ? mode === "visual"
                      ? "listings without a visual cohort to triage"
                      : "one-listing candidates to triage"
                    : mode === "visual"
                      ? "listings without a visual cohort"
                      : "stored one-listing candidates"}
                </p>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ProductGroupCard({
  group,
  index,
  ipId,
  mode,
  showPersistedMembers,
  triageProjectionAvailable,
  saving,
  savingCorrectionProfileId,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingBatch,
  batchFindings,
  batchProgress,
  batchDisabled,
  onBatchAction,
  onOpenTask,
  onConfirmGroup,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: {
  group: PersistedProductGroup;
  index: number;
  ipId: string;
  mode: GroupMode;
  showPersistedMembers: boolean;
  triageProjectionAvailable: boolean;
  saving: boolean;
  savingCorrectionProfileId: string | null;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingBatch: boolean;
  batchFindings: IpReviewFinding[] | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
  onBatchAction: (action: BatchAction) => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
  onUpdateEmbeddingThreshold: (
    groupId: string,
    embeddingMatchThreshold: number | null,
  ) => Promise<{
    group: Pick<PersistedProductGroup, "id" | "embedding_match_threshold">;
    regrouping_queued: boolean;
  }>;
  onCorrectGroupMember: (
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) => Promise<void>;
  onCreateRule: (
    groupId: string,
    instruction: string,
  ) => Promise<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>;
  onUpdateRule: (
    groupId: string,
    ruleId: string,
    instruction: string,
  ) => Promise<{ rule: ProductGroupRule; rescore_jobs_enqueued: number }>;
  onDeleteRule: (
    groupId: string,
    ruleId: string,
  ) => Promise<{ id: string; rescore_jobs_enqueued: number }>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [managing, setManaging] = useState(false);
  const [correctingProfileId, setCorrectingProfileId] = useState<string | null>(null);
  const [name, setName] = useState(
    group.confirmation_status === "confirmed" ? group.display_name ?? "" : "",
  );
  const [ruleDraft, setRuleDraft] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleNotice, setRuleNotice] = useState<string | null>(null);
  const [embeddingThresholdEnabled, setEmbeddingThresholdEnabled] = useState(
    group.embedding_match_threshold != null,
  );
  const [embeddingThresholdDraft, setEmbeddingThresholdDraft] = useState(
    group.embedding_match_threshold ?? 0.5,
  );
  const [savingEmbeddingThreshold, setSavingEmbeddingThreshold] = useState(false);
  const [embeddingThresholdNotice, setEmbeddingThresholdNotice] = useState<string | null>(null);
  const [visualEvidence, setVisualEvidence] = useState<ProductGroupVisualEvidence | null>(null);
  const [loadingVisualEvidence, setLoadingVisualEvidence] = useState(false);
  const [visualEvidenceError, setVisualEvidenceError] = useState<string | null>(null);
  const [savingReferenceImageId, setSavingReferenceImageId] = useState<string | null>(null);
  const [resettingReferences, setResettingReferences] = useState(false);
  const confirmed = group.confirmation_status === "confirmed";
  const triageMemberCount = group.triage_member_count ?? 0;
  const showingPersistedMembers = showPersistedMembers || managing;
  const displayedMembers = showingPersistedMembers ? group.members : group.triage_members;
  const displayedMemberCount = showingPersistedMembers ? group.member_count : triageMemberCount;
  const taskLinkMode = !showingPersistedMembers || (
    triageProjectionAvailable && triageMemberCount > 0
  )
    ? "pending"
    : triageProjectionAvailable
      ? "history"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const canConfirm = mode === "same" || mode === "visual";
  const trimmedName = name.trim();
  const correctingProfile = group.members.find((profile) => profile.id === correctingProfileId) ?? null;
  const nextEmbeddingThreshold = embeddingThresholdEnabled
    ? embeddingThresholdDraft
    : null;
  const embeddingThresholdChanged =
    nextEmbeddingThreshold !== group.embedding_match_threshold;
  const referenceRankByImageId = new Map(
    visualEvidence?.references.map((reference) => [
      reference.image_id,
      reference.reference_rank,
    ]) ?? [],
  );
  const referenceByImageId = new Map(
    visualEvidence?.references.map((reference) => [reference.image_id, reference]) ?? [],
  );
  const primaryVisualEvidenceByProfileId = new Map(
    visualEvidence?.members.flatMap((member) => {
      const primaryImage = member.images.reduce(
        (current, image) =>
          current == null || image.position < current.position ? image : current,
        null as ProductGroupVisualEvidence["members"][number]["images"][number] | null,
      );
      return primaryImage ? [[member.profile_id, primaryImage] as const] : [];
    }) ?? [],
  );
  const manualReferenceCount = visualEvidence?.references.filter(
    (reference) => reference.selection_source === "manual",
  ).length ?? 0;

  async function saveName() {
    if (!trimmedName) return;
    try {
      await onConfirmGroup(group.id, trimmedName);
      setEditingName(false);
      setManaging(true);
    } catch {
      // The parent keeps the editor open and displays the API error.
    }
  }

  async function loadVisualEvidence() {
    setLoadingVisualEvidence(true);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await calculatePersistedProductGroupVisualEvidence(ipId, group.id),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setLoadingVisualEvidence(false);
    }
  }

  async function pinReferenceImage(imageId: string) {
    setSavingReferenceImageId(imageId);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await pinPersistedProductGroupReferenceImage(ipId, group.id, imageId),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setSavingReferenceImageId(null);
    }
  }

  async function removeReferenceImage(imageId: string) {
    setSavingReferenceImageId(imageId);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await removePersistedProductGroupReferenceImage(ipId, group.id, imageId),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setSavingReferenceImageId(null);
    }
  }

  async function resetReferenceImages() {
    setResettingReferences(true);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await resetPersistedProductGroupReferenceImages(ipId, group.id),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setResettingReferences(false);
    }
  }

  return (
    <section
      data-product-group-id={group.id}
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        confirmed
          ? "border-emerald-200"
          : mode === "visual"
            ? "border-indigo-200"
            : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
            confirmed
              ? "text-emerald-700"
              : mode === "visual"
                ? "text-indigo-700"
                : "text-stone-500"
          }`}>
            {confirmed && <CheckCircle2 size={13} />}
            {confirmed
              ? "Confirmed group"
              : mode === "same"
                ? `Potential product group ${index + 1}`
                : mode === "related"
                  ? `Related family ${index + 1}`
                  : `Visual group ${index + 1}`}
          </p>
          {confirmed && group.display_name ? (
            <h2 className="mt-1 line-clamp-2 text-sm font-bold text-stone-900">
              {group.display_name}
            </h2>
          ) : (
            <p className="mt-1 text-[11px] text-stone-500">
              {mode === "visual"
                ? "Automatically grouped by shared gallery appearance"
                : "Unnamed until confirmed"}
            </p>
          )}
          {confirmed && group.confirmed_at && (
            <p className="mt-1 text-[10px] text-emerald-700">
              Confirmed {new Date(group.confirmed_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-stone-900">
            {showingPersistedMembers
              ? `${group.member_count} persisted ${group.member_count === 1 ? "listing" : "listings"}`
              : `${triageMemberCount} to triage`}
          </p>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {!showingPersistedMembers && <>{group.member_count} persisted · </>}
            Avg {mode === "same"
              ? "same-product"
              : mode === "related"
                ? "related-product"
                : "image similarity"}{" "}
            {group.average_score?.toFixed(3) ?? "—"}
          </p>
          {showingPersistedMembers && triageProjectionAvailable && (
            <p className={`mt-0.5 text-[10px] font-semibold ${
              triageMemberCount > 0 ? "text-red-700" : "text-emerald-700"
            }`}>
              {triageMemberCount > 0
                ? `${triageMemberCount} still to triage`
                : "No listings need triage"}
            </p>
          )}
          {confirmed && mode === "same" && (
            <>
              <p className="mt-1 text-[10px] font-semibold text-blue-700">
                {group.rules.length} active rule{group.rules.length === 1 ? "" : "s"}
              </p>
              {group.embedding_match_threshold != null && (
                <p className="mt-0.5 text-[10px] font-semibold text-violet-700">
                  Multimodal gate ≥ {group.embedding_match_threshold.toFixed(2)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {canConfirm && !editingName && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setName(confirmed ? group.display_name ?? "" : "");
              if (confirmed) {
                setManaging((current) => !current);
              } else {
                setEditingName(true);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              confirmed
                ? "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
            }`}
          >
            {confirmed ? <Settings2 size={14} /> : <CheckCircle2 size={14} />}
            {confirmed
              ? (managing ? "Close group settings" : "Manage group")
              : "Confirm & name"}
          </button>
          {confirmed && mode === "same" && !managing && (
            <button
              type="button"
              disabled={loadingVisualEvidence}
              onClick={() => void loadVisualEvidence()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Images size={14} />
              {loadingVisualEvidence
                ? "Calculating…"
                : visualEvidence
                  ? "Refresh image similarity"
                  : "Show image similarity"}
            </button>
          )}
        </div>
      )}
      {!managing && visualEvidenceError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
          {visualEvidenceError}
        </p>
      )}

      {canConfirm && editingName && (
        <form
          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <label className="block">
            <span className="text-xs font-bold text-emerald-900">Group name</span>
            <input
              autoFocus
              type="text"
              required
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingName(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !trimmedName || (confirmed && trimmedName === group.display_name)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {saving ? "Saving…" : confirmed ? "Save name" : "Confirm & name"}
            </button>
          </div>
        </form>
      )}

      {confirmed && managing && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                <Settings2 size={14} />
                Group settings
              </p>
              <p className="mt-1 text-[11px] text-blue-700">
                {mode === "same"
                  ? "Rename the product, tune its multimodal candidate gate, manage representative images and rules, or remove a listing below."
                  : "Rename this confirmed group or remove an incorrect image-backed placement below."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setManaging(false)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Done
            </button>
          </div>

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <label className="block">
              <span className="text-xs font-bold text-stone-800">Group name</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={saving || !trimmedName || trimmedName === group.display_name}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save name"}
                </button>
              </div>
            </label>
          </form>

          {mode === "same" && (
            <>
          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                  <Images size={14} />
                  Image similarity
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Compare every stored listing image with this product’s persisted
                  reference images from other listings in the group. Each number is
                  raw image-to-image cosine similarity to the closest reference.
                  It is explanatory only: it does not control group membership,
                  indicate authenticity probability, or represent the final
                  same-product score. Pin authoritative views, or remove an
                  unsuitable reference to suppress it from automatic selection.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingVisualEvidence}
                onClick={() => void loadVisualEvidence()}
                className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
              >
                {loadingVisualEvidence
                  ? "Calculating…"
                  : visualEvidence
                    ? "Refresh similarity"
                    : "Show image similarity"}
              </button>
            </div>

            {visualEvidenceError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {visualEvidenceError}
              </p>
            )}

            {visualEvidence && (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-stone-800">
                        Product reference images
                      </p>
                      <p className="mt-0.5 text-[9px] text-stone-500">
                        {manualReferenceCount} manual · automatic images fill the remaining slots
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={resettingReferences || Boolean(savingReferenceImageId)}
                      onClick={() => void resetReferenceImages()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                    >
                      <RotateCcw size={11} />
                      {resettingReferences ? "Resetting…" : "Reset to automatic"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {visualEvidence.references.map((reference) => (
                      <div key={reference.id} className="min-w-0">
                        <div className="relative aspect-square overflow-hidden rounded-md bg-stone-100">
                          {reference.image_url ? (
                            <img
                              src={reference.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-stone-400">
                              No image
                            </span>
                          )}
                          <span className="absolute left-1 top-1 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            Ref #{reference.reference_rank}
                          </span>
                          <button
                            type="button"
                            title="Remove and suppress this reference"
                            aria-label={`Remove reference ${reference.reference_rank}`}
                            disabled={Boolean(savingReferenceImageId) || resettingReferences}
                            onClick={() => void removeReferenceImage(reference.image_id)}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-stone-500 shadow-sm hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          >
                            <X size={11} />
                          </button>
                          <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                            reference.selection_source === "manual"
                              ? "bg-emerald-700/90"
                              : "bg-stone-700/85"
                          }`}>
                            {reference.selection_source === "manual" ? "Manual" : "Auto"}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate text-[9px] text-stone-500"
                          title={reference.listing_title ?? undefined}
                        >
                          {reference.listing_title || `View ${reference.position + 1}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {visualEvidence.members.map((member) => (
                  <div
                    key={member.profile_id}
                    className="rounded-lg border border-stone-200 bg-white p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[11px] font-bold text-stone-800">
                        {member.listing_title || "Untitled listing"}
                      </p>
                      <span className="shrink-0 text-[9px] text-stone-500">
                        {member.platform || `Listing #${member.member_rank}`}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {member.images.map((image) => {
                        const matchedReferenceRank = image.matched_reference_image_id
                          ? referenceRankByImageId.get(image.matched_reference_image_id)
                          : null;
                        const reference = referenceByImageId.get(image.image_id);
                        const savingThisReference = savingReferenceImageId === image.image_id;
                        return (
                          <div
                            key={image.image_id}
                            className="overflow-hidden rounded-md border border-stone-200 bg-stone-50"
                          >
                            <div className="relative aspect-square overflow-hidden bg-stone-100">
                              {image.image_url ? (
                                <img
                                  src={image.image_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[10px] text-stone-400">
                                  No image
                                </span>
                              )}
                              <span
                                className="absolute right-1 top-1 rounded bg-white/95 px-1.5 py-0.5 font-mono text-[9px] font-bold text-indigo-900 shadow-sm"
                                title="Raw cosine similarity to the closest product reference image"
                              >
                                {image.visual_support_score == null
                                  ? "Image sim —"
                                  : `Image sim ${image.visual_support_score.toFixed(2)}`}
                              </span>
                              {image.is_reference && (
                                <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                                  reference?.selection_source === "manual"
                                    ? "bg-emerald-700/90"
                                    : "bg-indigo-900/85"
                                }`}>
                                  {reference?.selection_source === "manual"
                                    ? "Manual reference"
                                    : "Auto reference"}
                                </span>
                              )}
                            </div>
                            <div className="px-1.5 py-1.5">
                              <p className="text-[9px] text-stone-500">
                                {matchedReferenceRank
                                  ? `Closest to ref #${matchedReferenceRank}`
                                  : "No separate reference available"}
                              </p>
                              <div className="mt-1 flex gap-1">
                                {reference?.selection_source !== "manual" && (
                                  <button
                                    type="button"
                                    disabled={Boolean(savingReferenceImageId) || resettingReferences}
                                    onClick={() => void pinReferenceImage(image.image_id)}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-1 text-[9px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                                  >
                                    <Pin size={9} />
                                    {savingThisReference
                                      ? "Saving…"
                                      : image.is_reference
                                        ? "Make manual"
                                        : "Use as reference"}
                                  </button>
                                )}
                                {image.is_reference && (
                                  <button
                                    type="button"
                                    disabled={Boolean(savingReferenceImageId) || resettingReferences}
                                    onClick={() => void removeReferenceImage(image.image_id)}
                                    className="rounded bg-stone-100 px-1.5 py-1 text-[9px] font-semibold text-stone-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                                  >
                                    {savingThisReference ? "Removing…" : "Remove"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {visualEvidence.truncated && (
                  <p className="text-[10px] text-stone-500">
                    Showing image evidence for {visualEvidence.members.length} of{" "}
                    {visualEvidence.member_count} listings.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">
                  Multimodal candidate gate
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Require the whole-listing embedding—up to six images plus title,
                  description and product attributes—to reach this raw cosine
                  similarity against another listing before exact-product reranking
                  and rules are applied. Passing the gate does not add a listing to
                  the product; the final same-product score still decides membership.
                  A failed pair may still be recognized as a related product. Higher
                  is stricter.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-bold text-violet-800">
                {embeddingThresholdEnabled
                  ? embeddingThresholdDraft.toFixed(2)
                  : "Off"}
              </span>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={embeddingThresholdEnabled}
                onChange={(event) => {
                  setEmbeddingThresholdEnabled(event.target.checked);
                  setEmbeddingThresholdNotice(null);
                }}
                className="h-4 w-4 rounded border-stone-300 text-violet-700 focus:ring-violet-200"
              />
              Use a product-specific multimodal candidate gate
            </label>

            <div className={`mt-3 ${embeddingThresholdEnabled ? "" : "opacity-45"}`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                disabled={!embeddingThresholdEnabled}
                value={embeddingThresholdDraft}
                onChange={(event) => {
                  setEmbeddingThresholdDraft(Number(event.target.value));
                  setEmbeddingThresholdNotice(null);
                }}
                className="w-full accent-violet-700"
                aria-label="Minimum multimodal listing similarity"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-stone-500">
                <span>0.00 broad</span>
                <span>1.00 strict</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-stone-500">
                Turning this off removes this extra gate; normal embedding retrieval,
                reranking and final same-product scoring still run.
              </p>
              <button
                type="button"
                disabled={savingEmbeddingThreshold || !embeddingThresholdChanged}
                onClick={() => {
                  setSavingEmbeddingThreshold(true);
                  setEmbeddingThresholdNotice(null);
                  void onUpdateEmbeddingThreshold(group.id, nextEmbeddingThreshold)
                    .then(() => {
                      setEmbeddingThresholdNotice(
                        "Saved. Future candidates use this immediately; the stored group snapshot will rebuild in the background.",
                      );
                    })
                    .catch(() => undefined)
                    .finally(() => setSavingEmbeddingThreshold(false));
                }}
                className="shrink-0 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
              >
                {savingEmbeddingThreshold ? "Saving…" : "Save threshold"}
              </button>
            </div>
            {embeddingThresholdNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {embeddingThresholdNotice}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">Automatic membership rules</p>
                <p className="mt-0.5 text-[11px] text-stone-600">
                  The product reranker checks these instructions for new candidates. If evidence is not visible, it remains unknown.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-800">
                {group.rules.length} active
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {group.rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-stone-200 bg-white p-2.5">
                  {editingRuleId === rule.id ? (
                    <>
                      <textarea
                        autoFocus
                        value={editingRuleText}
                        maxLength={1000}
                        rows={3}
                        onChange={(event) => setEditingRuleText(event.target.value)}
                        className="w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={savingRule}
                          onClick={() => setEditingRuleId(null)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingRule || editingRuleText.trim().length < 10}
                          onClick={() => {
                            setSavingRule(true);
                            void onUpdateRule(group.id, rule.id, editingRuleText.trim())
                              .then((result) => {
                                setEditingRuleId(null);
                                setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                              })
                              .catch(() => undefined)
                              .finally(() => setSavingRule(false));
                          }}
                          className="rounded-lg bg-blue-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                        >
                          Save rule
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-xs leading-5 text-stone-800">
                        {rule.instruction}
                      </p>
                      <button
                        type="button"
                        title="Edit rule"
                        onClick={() => {
                          setEditingRuleId(rule.id);
                          setEditingRuleText(rule.instruction);
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Remove rule"
                        disabled={savingRule}
                        onClick={() => {
                          setSavingRule(true);
                          void onDeleteRule(group.id, rule.id)
                            .then((result) => {
                              setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                            })
                            .catch(() => undefined)
                            .finally(() => setSavingRule(false));
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {group.rules.length === 0 && (
                <p className="rounded-lg border border-dashed border-stone-300 bg-white/70 px-3 py-3 text-xs text-stone-500">
                  No product-specific rules yet. Add only characteristics that distinguish this exact product or variant.
                </p>
              )}
            </div>

            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                const instruction = ruleDraft.trim();
                if (instruction.length < 10) return;
                setSavingRule(true);
                void onCreateRule(group.id, instruction)
                  .then((result) => {
                    setRuleDraft("");
                    setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                  })
                  .catch(() => undefined)
                  .finally(() => setSavingRule(false));
              }}
            >
              <textarea
                value={ruleDraft}
                maxLength={1000}
                rows={3}
                placeholder='Example: "For this exact product, the case should show a lot number in the bottom-right corner."'
                onChange={(event) => setRuleDraft(event.target.value)}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Rules are versioned; changes automatically queue this product for rescoring.
                </p>
                <button
                  type="submit"
                  disabled={savingRule || ruleDraft.trim().length < 10}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  <Plus size={13} />
                  {savingRule ? "Saving…" : "Add rule"}
                </button>
              </div>
            </form>
            {ruleNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {ruleNotice}
              </p>
            )}
          </div>
            </>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {displayedMembers.map((profile) => {
          const primaryVisualEvidence = primaryVisualEvidenceByProfileId.get(profile.id);
          return (
            <div key={profile.id} className="group/member relative min-w-0">
              <ListingTile
                profile={profile}
                active={activeTaskProfileId === profile.id}
                loading={loadingTaskProfileId === profile.id}
                onClick={() => onOpenTask(profile, group.id)}
                groupImageSimilarity={mode === "visual"
                  ? profile.group_image_similarity
                  : undefined}
                groupImagePosition={mode === "visual"
                  ? profile.group_image_position
                  : undefined}
                visualSupportIsReference={primaryVisualEvidence?.is_reference}
              />
              {canConfirm && group.member_count > 1 && (!confirmed || managing) && (
                <button
                  type="button"
                  aria-label={`Exclude ${profileTitle(profile)} from this group`}
                  title="Exclude this gallery view from this group"
                  disabled={Boolean(savingCorrectionProfileId)}
                  onClick={() => setCorrectingProfileId(profile.id)}
                  className={`absolute right-2 top-10 inline-flex h-7 items-center justify-center rounded-full border border-red-200 bg-white/95 px-2.5 text-[10px] font-bold text-red-700 shadow-sm transition hover:bg-red-50 focus:opacity-100 disabled:opacity-40 ${
                    confirmed ? "opacity-0 group-hover/member:opacity-100" : "opacity-100"
                  }`}
                >
                  Exclude
                </button>
              )}
            </div>
          );
        })}
      </div>
      {correctingProfile && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-950">
            Remove “{profileTitle(correctingProfile)}” from this group?
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            The exact gallery-image placement will be categorized again, but it will
            not be paired with these same group images after a refresh.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => {
                void onCorrectGroupMember(group.id, correctingProfile.id, "wrong_product")
                  .then(() => setCorrectingProfileId(null))
                  .catch(() => undefined);
              }}
              className="rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-950 disabled:opacity-50"
            >
              Exclude
            </button>
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => {
                void onCorrectGroupMember(group.id, correctingProfile.id, "different_variant")
                  .then(() => setCorrectingProfileId(null))
                  .catch(() => undefined);
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
            >
              Different variant
            </button>
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => setCorrectingProfileId(null)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">
          {displayedMemberCount > displayedMembers.length
            ? `+${displayedMemberCount - displayedMembers.length} more ${showingPersistedMembers ? "persisted" : "to-triage"} listings`
            : `Minimum ${mode === "same"
              ? "same-product"
              : mode === "related"
                ? "related-product"
                : "pairwise image similarity"} ${
              group.minimum_score?.toFixed(3) ?? "—"
            }`}
        </p>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            taskLinkMode === "pending"
              ? "border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100"
              : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100"
          }`}
        >
          <ListFilter size={13} />
          {taskLinkMode === "pending"
            ? "Open tasks"
            : taskLinkMode === "history"
              ? "View history"
              : "View tasks"}
        </Link>
      </div>
      <BatchOperationBar
        selectedCount={batchFindings?.length ?? triageMemberCount}
        selectedSummary={batchFindings
          ? selectedFindingSummary(batchFindings)
          : group.display_name
            ? [group.display_name]
            : []}
        batchProgress={batchProgress}
        onAction={onBatchAction}
        showResort={false}
        placement="inline"
        showShortcuts={false}
        disabled={batchDisabled}
        statusMessage={loadingBatch ? "Loading all group tasks…" : null}
      />
    </section>
  );
}

async function loadProductGroupBatch(ipId: string, groupId: string) {
  const findings: IpReviewFinding[] = [];
  const seenResultIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const page = await listMonitoringFindingsGlobal({
      status: "pending",
      ip_id: ipId,
      product_group_id: groupId,
      limit: 200,
      cursor,
    });
    for (const finding of page.findings) {
      if (seenResultIds.has(finding.result_id)) continue;
      seenResultIds.add(finding.result_id);
      findings.push(finding);
    }
    cursor = page.next_cursor;
    if (cursor && seenCursors.has(cursor)) break;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return findings;
}

function isDecisionState(state: CaseReviewStatus) {
  return state === "pending" || state === "review";
}

function ListingTile({
  profile,
  onClick,
  active = false,
  loading = false,
  groupImageSimilarity,
  groupImagePosition,
  visualSupportIsReference = false,
}: {
  profile: ProductClusterProfile;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  groupImageSimilarity?: number | null;
  groupImagePosition?: number | null;
  visualSupportIsReference?: boolean;
}) {
  const hasGroupImageSimilarity = groupImageSimilarity !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick
        ? `Open task details: ${profileTitle(profile)}`
        : `Task details unavailable: ${profileTitle(profile)}`}
      className={`w-full min-w-0 rounded-lg border p-1.5 text-left transition disabled:cursor-default ${
        active
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
          : "border-stone-200 bg-stone-50 enabled:hover:border-blue-300 enabled:hover:bg-blue-50"
      }`}
    >
      <span className="relative block aspect-square overflow-hidden rounded-md bg-stone-100">
        {profile.image_url ? (
          <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm font-bold text-stone-400">
            {profileTitle(profile).slice(0, 1).toUpperCase()}
          </span>
        )}
        {hasGroupImageSimilarity && groupImagePosition != null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Gallery view {groupImagePosition + 1} of {profile.image_count}
          </span>
        )}
        {visualSupportIsReference && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Reference
          </span>
        )}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70" aria-hidden="true">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
          </span>
        )}
      </span>
      <span className="mt-1.5 block truncate text-[10px] font-semibold text-stone-700">
        {profileTitle(profile)}
      </span>
    </button>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 flex min-h-96 items-center justify-center rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-3 text-sm text-stone-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" />
        Loading product relationships…
      </div>
    </div>
  );
}

function EmptyState({ ipName }: { ipName: string | null }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <h2 className="text-base font-bold text-stone-900">
        {ipName ? `No product profiles for ${ipName}` : "No product profiles yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">
        Let new enrichment jobs populate this IP before using the lab, or choose another
        working IP from the top bar.
      </p>
    </div>
  );
}

function errorMessage(
  caught: unknown,
  fallback = "Could not load product relationships.",
) {
  if (caught instanceof Error && caught.message.trim()) return caught.message;
  return fallback;
}

function rescoreNotice(count: number) {
  if (count === 0) {
    return "Rule saved. Future candidates will use it automatically.";
  }
  return `Rule saved. ${count} current listing${count === 1 ? "" : "s"} queued for automatic rescoring.`;
}
