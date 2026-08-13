import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Images,
  ListFilter,
  MoreHorizontal,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  DEFAULT_PRODUCT_SEMANTIC_COLORS,
  DEFAULT_PRODUCT_SEMANTIC_TAXONOMY,
  approveTakedownBatch,
  calculatePersistedProductGroupVisualEvidence,
  confirmPersistedProductGroup,
  correctProductSemanticGroupMember,
  createPersistedProductGroupAuthenticityRule,
  createPersistedProductGroupRule,
  deletePersistedProductGroupAuthenticityRule,
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
  mergePersistedProductGroups,
  pinPersistedProductGroupReferenceImage,
  refreshPersistedProductGroups,
  removePersistedProductGroupReferenceImage,
  resetPersistedProductGroupReferenceImages,
  revokePersistedProductGroupMerge,
  restoreProductSemanticCorrection,
  updatePersistedProductGroupEmbeddingSettings,
  updatePersistedProductGroupAuthenticityRule,
  updatePersistedProductGroupRule,
  type PersistedProductGroup,
  type PersistedProductGroupOverview,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type ProductClusterProfile,
  type ProductClusterScope,
  type ProductGroupCorrectionReason,
  type ProductGroupCommercialSubgroup,
  type ProductGroupAuthenticityRule,
  type ProductGroupAuthenticityRuleInput,
  type ProductGroupPriceSignal,
  type ProductGroupPriceSummary,
  type ProductGroupRecommendationCounts,
  type ProductGroupRule,
  type ProductGroupVisualEvidence,
  type ProductSemanticCategory,
  type ProductSemanticColor,
} from "../api";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import { BatchOperationBar } from "../components/monitoring/board/BatchOperationBar";
import { BatchResultNotice } from "../components/monitoring/board/BatchResultNotice";
import {
  type BatchResult,
  type BatchAction,
  runPool,
  dismissalOptionsForBatchAction,
  summarizeBatch,
  summarizeTakedownBatch,
} from "../components/monitoring/board/batchUtils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import { formatMoney } from "../components/monitoring/board/utils";
import { profileTitle } from "../components/product-clusters/productClusterGraphUtils";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";

type ProductGroupView = "triage" | "all";
type GroupMode = "same" | "related" | "visual";
type ProductWorkspaceSection = "review" | "offers" | "settings" | "history";
const PRODUCT_GROUP_VIEW = "all" as const;
const EMPTY_AUTHENTICITY_RULE: ProductGroupAuthenticityRuleInput = {
  expected_feature: "",
  violation_pattern: "",
  inspection_instruction: "",
  visibility_rule: "",
  applicability: null,
  rationale: null,
  modality: "image",
  failure_action: "review",
};

function authenticityRuleInput(
  rule: ProductGroupAuthenticityRule,
): ProductGroupAuthenticityRuleInput {
  return {
    expected_feature: rule.expected_feature,
    violation_pattern: rule.violation_pattern,
    inspection_instruction: rule.inspection_instruction,
    visibility_rule: rule.visibility_rule,
    applicability: rule.applicability,
    rationale: rule.rationale,
    modality: rule.modality,
    failure_action: rule.failure_action,
  };
}
type ActiveProductTask = {
  profileId: string;
  groupId: string | null;
  finding: IpReviewFinding;
};
type ProductGroupBatch = {
  groupId: string;
  scopeId: string;
  groupName: string;
  commercialSubgroupKey: string | null;
  commercialCaseIds: Set<string> | null;
  bucket: ProductGroupRecommendationBucket;
  findings: IpReviewFinding[] | null;
  selectedResultIds: Set<string>;
};
type SemanticCorrectionTarget = {
  group: PersistedProductGroup;
  profile: ProductClusterProfile;
};

const PRODUCT_GROUP_PAGE_SIZE = 8;
const SEMANTIC_GROUP_PAGE_SIZE = 4;
const NEW_PRODUCT_TYPE_VALUE = "__new_product_type__";
type ProductGroupRecommendationBucket =
  | "takedown"
  | "second_hand"
  | "might_be_ok"
  | "needs_review";

const PRODUCT_GROUP_RECOMMENDATION_BUCKETS: Array<{
  key: ProductGroupRecommendationBucket;
  label: string;
  description: string;
  className: string;
  labelClassName: string;
  countClassName: string;
}> = [
  {
    key: "takedown",
    label: "Takedown recommended",
    description: "A strong identity match and an independent violation signal support takedown.",
    className: "border-red-200 bg-red-50/60",
    labelClassName: "text-red-900",
    countClassName: "bg-white/80 text-red-800",
  },
  {
    key: "second_hand",
    label: "Likely second hand",
    description: "The listing evidence indicates that the item was previously used.",
    className: "border-purple-200 bg-purple-50/60",
    labelClassName: "text-purple-900",
    countClassName: "bg-white/80 text-purple-800",
  },
  {
    key: "might_be_ok",
    label: "Might be OK",
    description: "The current evidence points toward a licensed seller or false positive.",
    className: "border-emerald-200 bg-emerald-50/60",
    labelClassName: "text-emerald-950",
    countClassName: "bg-white/80 text-emerald-800",
  },
  {
    key: "needs_review",
    label: "Needs review",
    description: "The current evidence is inconclusive and needs a reviewer decision.",
    className: "border-amber-200 bg-amber-50/60",
    labelClassName: "text-amber-950",
    countClassName: "bg-white/80 text-amber-800",
  },
];

function productTypeLabelFromKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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

function decrementRecommendationCount(
  counts: ProductGroupRecommendationCounts,
  bucket: ProductGroupRecommendationBucket,
) {
  const next = {
    ...counts,
    [bucket]: Math.max(0, counts[bucket] - 1),
  };
  if (next.review != null) {
    next.review = next.might_be_ok + next.needs_review;
  }
  return next;
}

type AcknowledgedProductTaskResolution = {
  groupId: string;
  resultId: string;
  caseId: string | null;
  profileId: string;
  recommendationBucket: ProductGroupRecommendationBucket;
  remainingFindings: IpReviewFinding[] | null;
};

function productGroupHasReviewQueueWork(group: PersistedProductGroup) {
  const triageMemberCount = group.triage_member_count ?? 0;
  return group.confirmation_status === "confirmed"
    ? triageMemberCount > 0
    : triageMemberCount > 1;
}

function productProfileMatchesResolution(
  profile: ProductClusterProfile,
  resolution: AcknowledgedProductTaskResolution,
) {
  return profile.id === resolution.profileId || Boolean(
    resolution.caseId && profile.case_id === resolution.caseId,
  );
}

function optimisticallyResolveProductGroupTask(
  group: PersistedProductGroup,
  resolution: AcknowledgedProductTaskResolution,
) {
  if (group.id !== resolution.groupId) return { group, removed: false };
  const resolvedProfile = group.triage_members.find((profile) =>
    productProfileMatchesResolution(profile, resolution)
  ) ?? null;
  const matchingCommercialSubgroupKeys = new Set(
    group.commercial_subgroups
      .filter((subgroup) =>
        Boolean(
          resolution.caseId && subgroup.triage_case_ids.includes(resolution.caseId),
        ) || subgroup.key === resolvedProfile?.commercial_subgroup_key
      )
      .map((subgroup) => subgroup.key),
  );
  if (!resolvedProfile && matchingCommercialSubgroupKeys.size === 0) {
    return { group, removed: false };
  }

  const recommendationBucket = resolvedProfile
    ? recommendationBucketForProfile(resolvedProfile)
    : resolution.recommendationBucket;
  const commercialSubgroups = group.commercial_subgroups.map((subgroup) => {
    if (!matchingCommercialSubgroupKeys.has(subgroup.key)) return subgroup;
    return {
      ...subgroup,
      triage_member_count: Math.max(0, subgroup.triage_member_count - 1),
      triage_recommendation_counts: decrementRecommendationCount(
        subgroup.triage_recommendation_counts,
        recommendationBucket,
      ),
      triage_case_ids: resolution.caseId
        ? subgroup.triage_case_ids.filter((caseId) => caseId !== resolution.caseId)
        : subgroup.triage_case_ids,
    };
  });
  return {
    removed: true,
    group: {
      ...group,
      triage_member_count: group.triage_member_count == null
        ? null
        : Math.max(0, group.triage_member_count - 1),
      triage_recommendation_counts: group.triage_recommendation_counts
        ? decrementRecommendationCount(
          group.triage_recommendation_counts,
          recommendationBucket,
        )
        : group.triage_recommendation_counts,
      triage_members: group.triage_members.filter((profile) =>
        !productProfileMatchesResolution(profile, resolution)
      ),
      commercial_subgroups: commercialSubgroups,
    },
  };
}

function optimisticallyResolveProductGroupTaskInOverview(
  overview: PersistedProductGroupOverview,
  resolution: AcknowledgedProductTaskResolution,
) {
  let removed = false;
  let removedQueueGroup = false;
  const groups = overview.groups.map((group) => {
    const wasQueueGroup = productGroupHasReviewQueueWork(group);
    const result = optimisticallyResolveProductGroupTask(group, resolution);
    if (!result.removed) return group;
    removed = true;
    removedQueueGroup = wasQueueGroup && !productGroupHasReviewQueueWork(result.group);
    return result.group;
  });
  if (!removed) return overview;
  return {
    ...overview,
    groups,
    triage_group_count: overview.triage_group_count == null
      ? null
      : Math.max(0, overview.triage_group_count - (removedQueueGroup ? 1 : 0)),
    triage_profile_count: overview.triage_profile_count == null
      ? null
      : Math.max(0, overview.triage_profile_count - 1),
  };
}

function applyAcknowledgedProductTaskResolutions(
  overview: PersistedProductGroupOverview,
  resolutions: Iterable<AcknowledgedProductTaskResolution>,
) {
  let nextOverview = overview;
  for (const resolution of resolutions) {
    nextOverview = optimisticallyResolveProductGroupTaskInOverview(
      nextOverview,
      resolution,
    );
    const targetGroup = nextOverview.groups.find((group) => group.id === resolution.groupId);
    if (targetGroup?.triage_recommendation_counts == null && resolution.remainingFindings) {
      nextOverview = reconcileProductGroupTaskProjectionInOverview(
        nextOverview,
        resolution.groupId,
        resolution.remainingFindings,
      );
    }
  }
  return nextOverview;
}

function productTaskResolution(
  task: ActiveProductTask,
): AcknowledgedProductTaskResolution | null {
  if (!task.groupId) return null;
  return {
    groupId: task.groupId,
    resultId: task.finding.result_id,
    caseId: task.finding.case_id ?? null,
    profileId: task.profileId,
    recommendationBucket: recommendationBucketForFinding(task.finding),
    remainingFindings: null,
  } satisfies AcknowledgedProductTaskResolution;
}

function findingMatchesAcknowledgedResolution(
  finding: IpReviewFinding,
  resolution: AcknowledgedProductTaskResolution,
) {
  return finding.result_id === resolution.resultId || Boolean(
    resolution.caseId && finding.case_id === resolution.caseId,
  );
}

function recommendationCountsForFindings(findings: IpReviewFinding[]) {
  const counts: ProductGroupRecommendationCounts = {
    takedown: 0,
    second_hand: 0,
    might_be_ok: 0,
    needs_review: 0,
    review: 0,
  };
  for (const finding of findings) {
    const bucket = recommendationBucketForFinding(finding);
    counts[bucket] += 1;
  }
  counts.review = counts.might_be_ok + counts.needs_review;
  return counts;
}

function reconcileProductGroupTaskProjection(
  group: PersistedProductGroup,
  groupId: string,
  findings: IpReviewFinding[],
) {
  if (group.id !== groupId) return group;
  const findingCaseIds = new Set(
    findings.flatMap((finding) => finding.case_id ? [finding.case_id] : []),
  );
  const commercialSubgroups = group.commercial_subgroups.map((subgroup) => {
    const subgroupCaseIds = new Set(subgroup.triage_case_ids);
    const subgroupFindings = findings.filter((finding) => Boolean(
      finding.case_id && subgroupCaseIds.has(finding.case_id),
    ));
    return {
      ...subgroup,
      triage_member_count: subgroupFindings.length,
      triage_recommendation_counts: recommendationCountsForFindings(subgroupFindings),
      triage_case_ids: subgroupFindings.flatMap((finding) =>
        finding.case_id ? [finding.case_id] : []
      ),
    };
  });
  return {
    ...group,
    triage_member_count: findings.length,
    triage_recommendation_counts: recommendationCountsForFindings(findings),
    triage_members: group.triage_members.filter((profile) =>
      findingCaseIds.has(profile.case_id)
    ),
    commercial_subgroups: commercialSubgroups,
  };
}

function reconcileProductGroupTaskProjectionInOverview(
  overview: PersistedProductGroupOverview,
  groupId: string,
  findings: IpReviewFinding[],
) {
  let previousTriageMemberCount: number | null = null;
  let nextTriageMemberCount: number | null = null;
  let queueGroupDelta = 0;
  const groups = overview.groups.map((group) => {
    if (group.id !== groupId) return group;
    previousTriageMemberCount = group.triage_member_count;
    const wasQueueGroup = productGroupHasReviewQueueWork(group);
    const nextGroup = reconcileProductGroupTaskProjection(group, groupId, findings);
    nextTriageMemberCount = nextGroup.triage_member_count;
    const isQueueGroup = productGroupHasReviewQueueWork(nextGroup);
    queueGroupDelta = Number(isQueueGroup) - Number(wasQueueGroup);
    return nextGroup;
  });
  if (previousTriageMemberCount == null || nextTriageMemberCount == null) return overview;
  const profileDelta = nextTriageMemberCount - previousTriageMemberCount;
  return {
    ...overview,
    groups,
    triage_group_count: overview.triage_group_count == null
      ? null
      : Math.max(0, overview.triage_group_count + queueGroupDelta),
    triage_profile_count: overview.triage_profile_count == null
      ? null
      : Math.max(0, overview.triage_profile_count + profileDelta),
  };
}

function optimisticallyExcludeProductGroupMember(
  overview: PersistedProductGroupOverview,
  groupId: string,
  profileId: string,
) {
  let removedPersistedMember = false;
  let removedTriageMember = false;
  const groups = overview.groups.map((group) => {
    if (group.id !== groupId) return group;
    const profile = group.members.find((member) => member.id === profileId) ??
      group.triage_members.find((member) => member.id === profileId) ??
      group.commercial_subgroups
        .flatMap((subgroup) => subgroup.preview_members)
        .find((member) => member.id === profileId);
    if (!profile) return group;
    removedPersistedMember = true;
    removedTriageMember = group.triage_members.some((member) => member.id === profileId);
    const recommendationBucket = removedTriageMember
      ? recommendationBucketForProfile(profile)
      : null;
    const commercialSubgroups = group.commercial_subgroups.map((subgroup) => {
      if (subgroup.key !== profile.commercial_subgroup_key) return subgroup;
      return {
        ...subgroup,
        member_count: Math.max(0, subgroup.member_count - 1),
        triage_member_count: Math.max(
          0,
          subgroup.triage_member_count - (removedTriageMember ? 1 : 0),
        ),
        triage_recommendation_counts: recommendationBucket
          ? decrementRecommendationCount(
            subgroup.triage_recommendation_counts,
            recommendationBucket,
          )
          : subgroup.triage_recommendation_counts,
        triage_case_ids: subgroup.triage_case_ids.filter(
          (caseId) => caseId !== profile.case_id,
        ),
        preview_members: subgroup.preview_members.filter(
          (member) => member.id !== profileId,
        ),
      };
    });
    return {
      ...group,
      member_count: Math.max(0, group.member_count - 1),
      triage_member_count: group.triage_member_count == null
        ? null
        : Math.max(0, group.triage_member_count - (removedTriageMember ? 1 : 0)),
      triage_recommendation_counts: recommendationBucket && group.triage_recommendation_counts
        ? decrementRecommendationCount(group.triage_recommendation_counts, recommendationBucket)
        : group.triage_recommendation_counts,
      members: group.members.filter((member) => member.id !== profileId),
      triage_members: group.triage_members.filter((member) => member.id !== profileId),
      price_signal_members: group.price_signal_members.filter(
        (member) => member.profile_id !== profileId,
      ),
      commercial_subgroups: commercialSubgroups,
    };
  });
  if (!removedPersistedMember) return overview;
  return {
    ...overview,
    groups,
    triage_profile_count: overview.triage_profile_count == null
      ? null
      : Math.max(0, overview.triage_profile_count - (removedTriageMember ? 1 : 0)),
    snapshot_membership_count: overview.snapshot_membership_count == null
      ? null
      : Math.max(0, overview.snapshot_membership_count - 1),
  };
}

export default function ProductClusters() {
  const location = useLocation();
  const navigate = useNavigate();
  const { groupId: linkedGroupId, taskId: linkedTaskId } = useParams<{
    groupId: string;
    taskId: string;
  }>();
  const { actingTenantId } = useAuth();
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
  const [expandedSubgroupKeys, setExpandedSubgroupKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeBatch, setActiveBatch] = useState<ProductGroupBatch | null>(null);
  const [confirmBatchAction, setConfirmBatchAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const taskRequestSequence = useRef(0);
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
    `${scopesRequestKey}:${selectedIpId ?? ""}:same-product:${PRODUCT_GROUP_VIEW}`;
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
  ]);

  useEffect(() => {
    acknowledgedProductTaskResolutions.current.clear();
    setError(null);
    setTaskError(null);
    setBatchResult(null);
    setLoadingGroupTasksId(null);
    setLoadedGroupTasks({});
    setExpandedSubgroupKeys(new Set());
    setActiveBatch(null);
    setConfirmBatchAction(null);
    setBatchProgress(null);
    batchRequestSequence.current += 1;
    taskRequestSequence.current += 1;
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
        setActiveTask({
          profileId: findingProfileId(finding),
          groupId: linkedGroupId,
          finding,
        });
      })
      .catch((caught: unknown) => {
        if (taskRequestSequence.current !== requestSequence) return;
        setTaskError(errorMessage(caught, "Unable to open the linked task."));
      });
  }, [activeTask?.finding.result_id, linkedGroupId, linkedTaskId]);

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
        rememberTaskRouteScrollPosition();
        navigate({
          pathname: `/monitoring/products/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(finding.result_id)}`,
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
    rememberTaskRouteScrollPosition();
    navigate({
      pathname: `/monitoring/products/${encodeURIComponent(groupId)}/tasks/${encodeURIComponent(finding.result_id)}`,
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
            { limit: PRODUCT_GROUP_PAGE_SIZE },
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
          { limit: PRODUCT_GROUP_PAGE_SIZE, cursor },
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
    if (!selectedIpId || !visualOverview) return null;
    const alreadyLoaded = visualOverview.groups.find((group) => group.id === groupId);
    if (alreadyLoaded) return alreadyLoaded;

    const requestSequence = ++visualPageRequestSequence.current;
    setLoadingMoreVisualGroups(false);
    setError(null);
    let accumulated = visualOverview;
    const seenCursors = new Set<string>();
    try {
      while (accumulated.next_cursor && !seenCursors.has(accumulated.next_cursor)) {
        const cursor = accumulated.next_cursor;
        seenCursors.add(cursor);
        const nextOverview = applyAcknowledgedResolutions(
          await getPersistedProductGroups(
            selectedIpId,
            "same",
            PRODUCT_GROUP_VIEW,
            { limit: PRODUCT_GROUP_PAGE_SIZE, cursor },
          ),
        );
        if (visualPageRequestSequence.current !== requestSequence) return null;
        accumulated = appendProductGroupPage(accumulated, nextOverview);
        const target = accumulated.groups.find((group) => group.id === groupId);
        if (target) {
          setVisualOverview(accumulated);
          return target;
        }
      }
      setVisualOverview(accumulated);
      return null;
    } catch (caught: unknown) {
      if (visualPageRequestSequence.current === requestSequence) {
        setError(errorMessage(caught, "Unable to load the suggested product group."));
      }
      return null;
    }
  }, [applyAcknowledgedResolutions, selectedIpId, visualOverview]);

  useEffect(() => {
    if (!linkedGroupId) {
      setFocusedGroup(null);
      setFocusedGroupResolvedId(null);
      return;
    }
    const loadedGroup = visualOverview?.groups.find((group) => group.id === linkedGroupId);
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

  async function runGroupBatch(action: BatchAction, decisionReason?: string) {
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
      setVisualOverview(applyAcknowledgedResolutions(
        await getPersistedProductGroups(
          selectedIpId,
          "same",
          PRODUCT_GROUP_VIEW,
          { limit: PRODUCT_GROUP_PAGE_SIZE },
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
          { limit: PRODUCT_GROUP_PAGE_SIZE },
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
          { limit: PRODUCT_GROUP_PAGE_SIZE },
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
        { limit: PRODUCT_GROUP_PAGE_SIZE },
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
          { limit: PRODUCT_GROUP_PAGE_SIZE },
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
    ? visualOverview?.groups.find((group) => group.id === linkedGroupId) ?? focusedGroup
    : null;
  const showingWorkspace = Boolean(linkedGroupId);

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
          decisionReasonRequired={partitionGroupBatch(confirmBatchAction).eligible.some(
            (finding) => finding.actionability?.key !== "send_takedown",
          )}
          onCancel={() => setConfirmBatchAction(null)}
          onConfirm={(decisionReason) => {
            const action = confirmBatchAction;
            setConfirmBatchAction(null);
            void runGroupBatch(action, decisionReason);
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

function ProductQueue({
  overview,
  search,
  sort,
  loadingMore,
  currentSearch,
  onSearchChange,
  onSortChange,
  onLoadMore,
}: {
  overview: PersistedProductGroupOverview;
  search: string;
  sort: "work" | "name";
  loadingMore: boolean;
  currentSearch: string;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: "work" | "name") => void;
  onLoadMore: () => void;
}) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleGroups = overview.groups
    .filter((group) => {
      if (!normalizedSearch) return true;
      const searchable = [
        productGroupDisplayName(group),
        group.display_name,
        ...group.members.slice(0, 4).map((member) => profileTitle(member)),
        ...group.triage_members.slice(0, 4).map((member) => profileTitle(member)),
        ...group.commercial_subgroups.map((subgroup) => subgroup.variant_label),
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return searchable.includes(normalizedSearch);
    })
    .sort((left, right) => {
      if (sort === "name") {
        return productGroupDisplayName(left).localeCompare(productGroupDisplayName(right));
      }
      return (right.triage_member_count ?? 0) - (left.triage_member_count ?? 0) ||
        right.member_count - left.member_count;
    });
  const productCount = overview.group_count;

  return (
    <section className="mt-5" aria-labelledby="product-queue-heading">
      <div className="border-y border-stone-200 bg-white py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-600">
          <span>
            <strong className="font-black text-stone-950">
              {overview.triage_profile_count ?? 0}
            </strong>{" "}
            listings need review
          </span>
          <span>
            <strong className="font-black text-stone-950">{productCount}</strong>{" "}
            {productCount === 1 ? "product" : "products"}
          </span>
          {overview.pending_snapshot_count ? (
            <span className="text-amber-800">
              <strong>{overview.pending_snapshot_count}</strong> still grouping
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-0 sm:w-72">
            <span className="sr-only">Search products</span>
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search products or offers"
              className="min-h-11 w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700">
            <span className="text-stone-500">Sort</span>
            <select
              value={sort}
              onChange={(event) => onSortChange(event.target.value as "work" | "name")}
              className="min-w-0 flex-1 bg-transparent text-stone-950 outline-none"
            >
              <option value="work">Most work</option>
              <option value="name">Product name</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <h2 id="product-queue-heading" className="text-lg font-black text-stone-950">
            All products
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            Open a product to review its listings, offers and group settings.
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-stone-500">
          {visibleGroups.length} shown
        </span>
      </div>

      {visibleGroups.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white">
          {visibleGroups.map((group) => (
            <ProductQueueRow
              key={group.id}
              group={group}
              currentSearch={currentSearch}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <h3 className="text-base font-black text-stone-900">
            {search ? "No products match this search" : "No product groups yet"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
            {search
              ? "Try a product name, listing title or comparable offer."
              : "This IP has no product groups yet."}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="mt-4 min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 hover:bg-stone-50"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {overview.next_cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore && <RefreshCw size={15} className="animate-spin" />}
            {loadingMore ? "Loading products…" : "Load more products"}
          </button>
        </div>
      )}
    </section>
  );
}

function ProductQueueRow({
  group,
  currentSearch,
}: {
  group: PersistedProductGroup;
  currentSearch: string;
}) {
  const representative = group.members[0] ?? group.triage_members[0] ?? null;
  const triageCount = group.triage_member_count ?? 0;
  const offerCount = group.commercial_subgroups.filter((subgroup) =>
    subgroup.member_count > 0
  ).length;
  const priceRange = productGroupPriceRange(group);
  const confirmed = group.confirmation_status === "confirmed";

  return (
    <article className="border-b border-stone-200 p-3 last:border-b-0 sm:p-4">
      <div className="flex items-start gap-3 sm:items-center sm:gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-20 sm:w-20">
          {representative?.image_url ? (
            <img
              src={representative.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xl font-black text-stone-400">
              {productGroupDisplayName(group).slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className={`text-xs font-black uppercase tracking-[0.08em] ${
                confirmed ? "text-emerald-700" : "text-amber-800"
              }`}>
                {confirmed ? "Confirmed product" : "Needs confirmation"}
              </p>
              <h3 className="mt-1 line-clamp-2 text-base font-black text-stone-950 sm:text-lg">
                {productGroupDisplayName(group)}
              </h3>
            </div>
            <div className="shrink-0 text-left sm:text-right">
              <p className={`text-base font-black ${
                triageCount > 0 ? "text-red-800" : "text-emerald-700"
              }`}>
                {triageCount > 0 ? `${triageCount} to review` : "Review complete"}
              </p>
              <p className="mt-0.5 text-xs text-stone-500">
                {group.member_count} total listings
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-600">
            <span>{offerCount} comparable {offerCount === 1 ? "offer" : "offers"}</span>
            {priceRange && <span>{priceRange}</span>}
            <span>Similarity {group.average_score?.toFixed(2) ?? "—"}</span>
          </div>
        </div>

        <Link
          to={{
            pathname: `/monitoring/products/${encodeURIComponent(group.id)}`,
            search: currentSearch,
          }}
          aria-label={`Open ${productGroupDisplayName(group)}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800"
        >
          <span className="hidden sm:inline">Open</span>
          <span className="sm:hidden" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function productGroupDisplayName(group: PersistedProductGroup) {
  return group.display_name?.trim() ||
    (group.triage_members[0] ? profileTitle(group.triage_members[0]) : null) ||
    (group.members[0] ? profileTitle(group.members[0]) : null) ||
    "Unnamed product";
}

function productGroupPriceRange(group: PersistedProductGroup) {
  const ranges = group.commercial_subgroups
    .map((subgroup) => subgroup.price_range)
    .filter((range): range is NonNullable<typeof range> => Boolean(range));
  if (ranges.length === 0) return null;
  const minimum = Math.min(...ranges.map((range) => range.minimum));
  const maximum = Math.max(...ranges.map((range) => range.maximum));
  return minimum === maximum
    ? formatMoney(minimum, "USD")
    : `${formatMoney(minimum, "USD")}–${formatMoney(maximum, "USD")}`;
}

function ProductWorkspaceNotFound() {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <h2 className="text-lg font-black text-stone-950">Product not found</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
        This product is no longer in the current snapshot, or the link is out of date.
      </p>
      <Link
        to="/monitoring/products"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-stone-950 px-4 text-sm font-bold text-white"
      >
        Return to products
      </Link>
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
    correctedCategoryKey: string | null;
    newProductType: {
      label: string;
      supportsColorVariants: boolean;
    } | null;
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
  const [newProductTypeLabel, setNewProductTypeLabel] = useState("");
  const [newTypeSupportsColorVariants, setNewTypeSupportsColorVariants] = useState(false);
  const [correctedVariantColors, setCorrectedVariantColors] = useState<string[]>(
    currentVariantColors,
  );
  const [note, setNote] = useState("");
  const [propagateToSimilar, setPropagateToSimilar] = useState(true);
  const currentCategory = categories.find(
    (category) => category.key === currentCategoryKey,
  ) ?? {
    key: currentCategoryKey,
    label: target.profile.semantic_source_category_key === currentCategoryKey
      ? target.profile.semantic_source_category_label ?? productTypeLabelFromKey(currentCategoryKey)
      : productTypeLabelFromKey(currentCategoryKey),
    supports_color_variants: currentVariantColors.length > 0,
  };
  const availableCategories = categories.some(
    (category) => category.key === currentCategoryKey,
  ) ? categories : [currentCategory, ...categories];
  const creatingProductType = correctedCategoryKey === NEW_PRODUCT_TYPE_VALUE;
  const selectedCategory = availableCategories.find(
    (category) => category.key === correctedCategoryKey,
  ) ?? null;
  const supportsColorVariants = creatingProductType
    ? newTypeSupportsColorVariants
    : selectedCategory?.supports_color_variants === true;
  const effectiveCorrectedColors = supportsColorVariants
    ? correctedVariantColors
    : [];
  const normalizedNewProductTypeLabel = newProductTypeLabel.trim().replace(/\s+/g, " ");
  const classificationChanged = creatingProductType
    ? normalizedNewProductTypeLabel.length >= 2
    : correctedCategoryKey !== currentCategoryKey ||
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
              correctedCategoryKey: creatingProductType ? null : correctedCategoryKey,
              newProductType: creatingProductType
                ? {
                  label: normalizedNewProductTypeLabel,
                  supportsColorVariants: newTypeSupportsColorVariants,
                }
                : null,
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
              const nextSupportsColorVariants = nextCategoryKey === NEW_PRODUCT_TYPE_VALUE
                ? newTypeSupportsColorVariants
                : availableCategories.find((category) => category.key === nextCategoryKey)
                  ?.supports_color_variants === true;
              if (!nextSupportsColorVariants) {
                setCorrectedVariantColors([]);
              }
            }}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
          >
            {availableCategories.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
            <option value={NEW_PRODUCT_TYPE_VALUE}>Other — specify a new type…</option>
          </select>

          {creatingProductType && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <label
                className="block text-xs font-bold text-violet-950"
                htmlFor="new-product-type-label"
              >
                New product type
              </label>
              <input
                id="new-product-type-label"
                type="text"
                value={newProductTypeLabel}
                minLength={2}
                maxLength={120}
                required
                autoFocus
                disabled={saving}
                onChange={(event) => setNewProductTypeLabel(event.target.value)}
                placeholder="For example: Video game"
                className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-violet-800">
                This becomes an active product type for this IP and can be reused by future classifications.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={newTypeSupportsColorVariants}
                  disabled={saving}
                  onChange={(event) => {
                    setNewTypeSupportsColorVariants(event.target.checked);
                    if (!event.target.checked) setCorrectedVariantColors([]);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-700"
                />
                <span>
                  <span className="block text-xs font-bold text-violet-950">
                    Color is a useful variant for this type
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-violet-800">
                    Leave this off for media, fragrances, and products where packaging color is incidental.
                  </span>
                </span>
              </label>
            </div>
          )}

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-stone-800">Color groups</legend>
            {supportsColorVariants ? (
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
                {creatingProductType
                  ? "This new product type will not create color subgroups."
                  : "This product type does not create color subgroups."}
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

function productGroupRecommendationBucket(key: ProductGroupRecommendationBucket) {
  return PRODUCT_GROUP_RECOMMENDATION_BUCKETS.find((bucket) => bucket.key === key) ??
    PRODUCT_GROUP_RECOMMENDATION_BUCKETS[3];
}

function recommendationBucketForActionability(
  key: string | null | undefined,
): ProductGroupRecommendationBucket {
  if (key === "send_takedown") return "takedown";
  if (key === "allowed_resale") return "second_hand";
  if (key === "licensed_seller" || key === "false_positive") return "might_be_ok";
  return "needs_review";
}

function recommendationBucketForProfile(profile: ProductClusterProfile) {
  return recommendationBucketForActionability(profile.actionability?.key);
}

function recommendationBucketForFinding(finding: IpReviewFinding) {
  return recommendationBucketForActionability(finding.actionability?.key);
}

function selectedProductGroupBatchFindings(batch: ProductGroupBatch | null) {
  if (!batch?.findings) return [];
  return batch.findings.filter((finding) =>
    batch.selectedResultIds.has(finding.result_id)
  );
}

function findingProfileId(finding: IpReviewFinding) {
  return `finding:${finding.result_id}`;
}

function productGroupPriceSignalForUsd(
  priceValueUsd: number | null | undefined,
  actionabilityKey: string | null | undefined,
  priceSummary: ProductGroupPriceSummary | null,
): ProductGroupPriceSignal | null {
  const price = Number(priceValueUsd);
  if (
    !priceSummary ||
    !Number.isFinite(price) ||
    price <= 0 ||
    priceSummary.unusually_low_threshold_usd <= 0 ||
    price >= priceSummary.unusually_low_threshold_usd ||
    (actionabilityKey !== "send_takedown" && actionabilityKey !== "needs_review")
  ) {
    return null;
  }
  return {
    unusually_low: true,
    percent_below_reference: Math.max(
      1,
      Math.min(99, Math.round((1 - price / priceSummary.median_usd) * 100)),
    ),
    reference_median_usd: priceSummary.median_usd,
    comparison_scope: "group",
    source_group_id: null,
    source_group_name: null,
  };
}

function productGroupPriceSignalForFinding(
  finding: IpReviewFinding,
  priceSummary: ProductGroupPriceSummary | null,
  priceSignalByCaseId: ReadonlyMap<string, ProductGroupPriceSignal> | null,
) {
  const propagatedSignal = finding.case_id
    ? priceSignalByCaseId?.get(finding.case_id) ?? null
    : null;
  if (
    propagatedSignal?.unusually_low === true &&
    (finding.actionability?.key === "send_takedown" ||
      finding.actionability?.key === "needs_review")
  ) {
    return propagatedSignal;
  }
  return productGroupPriceSignalForUsd(
    finding.price_value_usd,
    finding.actionability?.key,
    priceSummary,
  );
}

function productClusterProfileForFinding(
  finding: IpReviewFinding,
  priceSummary: ProductGroupPriceSummary | null = null,
  priceSignalByCaseId: ReadonlyMap<string, ProductGroupPriceSignal> | null = null,
): ProductClusterProfile {
  return {
    id: findingProfileId(finding),
    case_id: finding.case_id ?? finding.result_id,
    listing_title: finding.listing_title,
    platform: finding.domain,
    source_url: finding.page_url,
    description_summary: finding.description_summary,
    profile_text: "",
    price_value: finding.price_value,
    price_currency: finding.price_currency,
    price_value_usd: finding.price_value_usd,
    price_signal: productGroupPriceSignalForFinding(
      finding,
      priceSummary,
      priceSignalByCaseId,
    ),
    image_count: finding.image_urls?.length ?? (finding.image_url ? 1 : 0),
    image_url: finding.image_url ?? finding.screenshot_url,
    actionability: finding.actionability,
    updated_at: finding.updated_at,
  };
}

function compareProductProfilesByPriceSignal(
  left: ProductClusterProfile,
  right: ProductClusterProfile,
) {
  const leftSignal = left.price_signal?.unusually_low ? left.price_signal : null;
  const rightSignal = right.price_signal?.unusually_low ? right.price_signal : null;
  if (Boolean(leftSignal) !== Boolean(rightSignal)) return leftSignal ? -1 : 1;
  if (leftSignal && rightSignal) {
    return rightSignal.percent_below_reference - leftSignal.percent_below_reference;
  }
  return 0;
}

function productGroupSubgroupKey(
  groupId: string,
  bucket: ProductGroupRecommendationBucket,
) {
  return `${groupId}:${bucket}`;
}

function productCommercialReviewScopeId(
  groupId: string,
  commercialSubgroupKey: string | null,
) {
  return commercialSubgroupKey
    ? `${groupId}:commercial:${commercialSubgroupKey}`
    : groupId;
}

type ProductGroupSubgroupItem =
  | { kind: "profile"; id: string; bucket: ProductGroupRecommendationBucket; profile: ProductClusterProfile }
  | { kind: "finding"; id: string; bucket: ProductGroupRecommendationBucket; finding: IpReviewFinding };

function fillProductGroupSubgroupPreview(
  previewItems: ProductGroupSubgroupItem[],
  exactFindings: IpReviewFinding[] | null,
  bucket: ProductGroupRecommendationBucket,
  limit: number,
) {
  const filled = previewItems.slice(0, limit);
  if (!exactFindings || filled.length >= limit) return filled;

  const caseIds = new Set<string>();
  const sourceUrls = new Set<string>();
  for (const item of filled) {
    const caseId = item.kind === "profile" ? item.profile.case_id : item.finding.case_id;
    const sourceUrl = item.kind === "profile"
      ? item.profile.source_url
      : item.finding.page_url;
    if (caseId) caseIds.add(caseId);
    if (sourceUrl) sourceUrls.add(sourceUrl);
  }

  for (const finding of exactFindings) {
    if (filled.length >= limit) break;
    if (finding.case_id && caseIds.has(finding.case_id)) continue;
    if (finding.page_url && sourceUrls.has(finding.page_url)) continue;
    filled.push({
      kind: "finding",
      id: finding.result_id,
      bucket,
      finding,
    });
    if (finding.case_id) caseIds.add(finding.case_id);
    if (finding.page_url) sourceUrls.add(finding.page_url);
  }
  return filled;
}

function ProductGroupMemberSubgroups({
  profiles,
  priceSummary,
  priceSignalByCaseId,
  totalCount,
  recommendationCounts,
  separateByRecommendation,
  allFindings,
  expandedSubgroupKeys,
  loadingAllFindings,
  groupId,
  groupName,
  activeBatch,
  batchProgress,
  batchDisabled,
  previewLimit,
  gridClassName,
  renderMember,
  renderFinding,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
}: {
  profiles: ProductClusterProfile[];
  priceSummary: ProductGroupPriceSummary | null;
  priceSignalByCaseId: ReadonlyMap<string, ProductGroupPriceSignal> | null;
  totalCount: number;
  recommendationCounts: ProductGroupRecommendationCounts | null;
  separateByRecommendation: boolean;
  allFindings: IpReviewFinding[] | null;
  expandedSubgroupKeys: ReadonlySet<string>;
  loadingAllFindings: boolean;
  groupId: string;
  groupName: string;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
  previewLimit: number;
  gridClassName: string;
  renderMember: (profile: ProductClusterProfile) => ReactNode;
  renderFinding: (finding: IpReviewFinding) => ReactNode;
  onSelectBatch: (
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onBatchAction: (action: BatchAction) => void;
  onClearBatch: () => void;
  onToggleBatchFinding: (resultId: string) => void;
  onSetAllBatchFindings: (selected: boolean) => void;
  onToggleSubgroupListings: (
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
}) {
  const sortedProfiles = [...profiles].sort(compareProductProfilesByPriceSignal);
  const items: ProductGroupSubgroupItem[] = sortedProfiles.map((profile) => ({
    kind: "profile" as const,
    id: profile.id,
    bucket: recommendationBucketForProfile(profile),
    profile,
  }));
  const recommendationsAvailable = separateByRecommendation &&
    (totalCount > 0 || items.length > 0 || (allFindings?.length ?? 0) > 0) &&
    (allFindings != null || profiles.every((profile) => profile.actionability?.key));

  if (!recommendationsAvailable) {
    return (
      <div className={`mt-3 grid gap-2 ${gridClassName}`}>
        {sortedProfiles.map(renderMember)}
      </div>
    );
  }

  const itemsByBucket = new Map<
    ProductGroupRecommendationBucket,
    ProductGroupSubgroupItem[]
  >();
  for (const item of items) {
    const bucketItems = itemsByBucket.get(item.bucket) ?? [];
    bucketItems.push(item);
    itemsByBucket.set(item.bucket, bucketItems);
  }
  for (const bucketItems of itemsByBucket.values()) {
    bucketItems.sort((left, right) => {
      const leftProfile = left.kind === "profile"
        ? left.profile
        : productClusterProfileForFinding(
          left.finding,
          priceSummary,
          priceSignalByCaseId,
        );
      const rightProfile = right.kind === "profile"
        ? right.profile
        : productClusterProfileForFinding(
          right.finding,
          priceSummary,
          priceSignalByCaseId,
        );
      return compareProductProfilesByPriceSignal(leftProfile, rightProfile);
    });
  }
  const findingsByBucket = new Map<ProductGroupRecommendationBucket, IpReviewFinding[]>();
  for (const finding of allFindings ?? []) {
    const bucket = recommendationBucketForFinding(finding);
    const bucketFindings = findingsByBucket.get(bucket) ?? [];
    bucketFindings.push(finding);
    findingsByBucket.set(bucket, bucketFindings);
  }
  for (const bucketFindings of findingsByBucket.values()) {
    bucketFindings.sort((left, right) => {
      const leftSignal = productGroupPriceSignalForFinding(
        left,
        priceSummary,
        priceSignalByCaseId,
      );
      const rightSignal = productGroupPriceSignalForFinding(
        right,
        priceSummary,
        priceSignalByCaseId,
      );
      if (Boolean(leftSignal) !== Boolean(rightSignal)) return leftSignal ? -1 : 1;
      if (leftSignal && rightSignal) {
        return rightSignal.percent_below_reference - leftSignal.percent_below_reference;
      }
      return 0;
    });
  }
  const previewTruncated = totalCount > profiles.length;
  const activeBatchFindings = activeBatch?.scopeId === groupId
    ? activeBatch.findings
    : null;
  const batchFindingByResultId = new Map<string, IpReviewFinding>();
  const batchFindingByCaseId = new Map<string, IpReviewFinding>();
  const batchFindingBySourceUrl = new Map<string, IpReviewFinding>();
  for (const finding of activeBatchFindings ?? []) {
    batchFindingByResultId.set(finding.result_id, finding);
    if (finding.case_id && !batchFindingByCaseId.has(finding.case_id)) {
      batchFindingByCaseId.set(finding.case_id, finding);
    }
    if (finding.page_url && !batchFindingBySourceUrl.has(finding.page_url)) {
      batchFindingBySourceUrl.set(finding.page_url, finding);
    }
  }
  const batchFindingForItem = (item: ProductGroupSubgroupItem) => {
    if (item.kind === "finding") {
      return batchFindingByResultId.get(item.finding.result_id) ?? null;
    }
    return batchFindingByCaseId.get(item.profile.case_id) ??
      (item.profile.source_url
        ? batchFindingBySourceUrl.get(item.profile.source_url) ?? null
        : null);
  };

  return (
    <div className="mt-4 space-y-4">
      {PRODUCT_GROUP_RECOMMENDATION_BUCKETS.map((bucket) => {
        const sampledPreviewItems = itemsByBucket.get(bucket.key) ?? [];
        const exactBucketFindings = allFindings
          ? (findingsByBucket.get(bucket.key) ?? [])
          : null;
        const previewItems = fillProductGroupSubgroupPreview(
          sampledPreviewItems,
          exactBucketFindings,
          bucket.key,
          previewLimit,
        );
        const exactBucketCount = exactBucketFindings?.length ?? (
          recommendationCounts?.[bucket.key] ?? (
            previewTruncated ? null : previewItems.length
          )
        );
        if (previewItems.length === 0 && exactBucketCount === 0) return null;

        const subgroupKey = productGroupSubgroupKey(groupId, bucket.key);
        const expansionRequested = expandedSubgroupKeys.has(subgroupKey);
        const subgroupExpanded = expansionRequested && exactBucketFindings != null;
        const hasHiddenItems = exactBucketCount == null
          ? previewTruncated
          : exactBucketCount > previewItems.length;
        const subgroupComplete = !hasHiddenItems || subgroupExpanded;
        const bucketItems: ProductGroupSubgroupItem[] = subgroupExpanded
          ? exactBucketFindings.map((finding) => ({
              kind: "finding" as const,
              id: finding.result_id,
              bucket: bucket.key,
              finding,
            }))
          : previewItems;
        const selectedForBatch = activeBatch?.scopeId === groupId &&
          activeBatch.bucket === bucket.key;
        const batchFindingCount = selectedForBatch
          ? activeBatch.findings?.length ?? 0
          : 0;
        const selectedBatchFindingCount = selectedForBatch
          ? selectedProductGroupBatchFindings(activeBatch).length
          : 0;
        const allBatchFindingsSelected = batchFindingCount > 0 &&
          selectedBatchFindingCount === batchFindingCount;
        const countLabel = exactBucketCount == null
          ? previewItems.length > 0
            ? `${previewItems.length} shown`
            : "Not shown"
          : subgroupExpanded || exactBucketCount === previewItems.length
            ? `${exactBucketCount} ${exactBucketCount === 1 ? "listing" : "listings"}`
            : `${previewItems.length} shown of ${exactBucketCount}`;
        return (
          <section
            key={bucket.key}
            data-product-review-subgroup={bucket.key}
            className={`rounded-xl border p-3 ${bucket.className}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                title={bucket.description}
                className={`text-[10px] font-black uppercase tracking-[0.12em] ${bucket.labelClassName}`}
              >
                {bucket.label}
              </p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${bucket.countClassName}`}
                >
                  {countLabel}
                </span>
                {hasHiddenItems && (
                  <button
                    type="button"
                    data-product-review-expand={bucket.key}
                    aria-expanded={subgroupExpanded}
                    disabled={batchDisabled}
                    onClick={() => onToggleSubgroupListings(bucket.key)}
                    className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] font-bold text-stone-600 shadow-sm transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-wait disabled:opacity-50"
                  >
                    {expansionRequested && loadingAllFindings ? (
                      <RefreshCw size={12} className="animate-spin" aria-hidden="true" />
                    ) : subgroupExpanded ? (
                      <ChevronUp size={12} aria-hidden="true" />
                    ) : (
                      <ChevronDown size={12} aria-hidden="true" />
                    )}
                    {expansionRequested && loadingAllFindings
                      ? "Loading all…"
                      : subgroupExpanded
                        ? "Collapse"
                        : exactBucketCount == null
                          ? "View all"
                          : `View all ${exactBucketCount}`}
                  </button>
                )}
                {subgroupComplete && (exactBucketCount ?? previewItems.length) > 0 && (
                  <button
                    type="button"
                    data-product-review-batch={bucket.key}
                    aria-expanded={selectedForBatch}
                    disabled={batchDisabled}
                    onClick={() => onSelectBatch(bucket.key)}
                    className={`inline-flex items-center gap-1 rounded-md border bg-white px-2 py-1 text-[10px] font-bold shadow-sm transition disabled:cursor-wait disabled:opacity-50 ${
                      selectedForBatch
                        ? "border-stone-400 text-stone-900"
                        : "border-stone-200 text-stone-600 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    <MoreHorizontal size={13} aria-hidden="true" />
                    {selectedForBatch ? "Close actions" : "Batch actions"}
                  </button>
                )}
              </div>
            </div>
            {selectedForBatch && (
              activeBatch.findings == null ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-stone-200 bg-white/80 px-3 py-2 text-xs text-stone-600">
                  <RefreshCw size={13} className="animate-spin" aria-hidden="true" />
                  Loading every current listing in this subgroup…
                </div>
              ) : (
                <>
                  <div
                    data-product-review-selection-summary={bucket.key}
                    className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white/80 px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-stone-700">
                      {selectedBatchFindingCount} of {batchFindingCount} selected
                    </span>
                    <button
                      type="button"
                      disabled={batchDisabled}
                      onClick={() => onSetAllBatchFindings(!allBatchFindingsSelected)}
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] font-bold text-stone-600 transition hover:border-stone-300 hover:text-stone-900 disabled:cursor-wait disabled:opacity-50"
                    >
                      {allBatchFindingsSelected ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <BatchOperationBar
                    selectedCount={selectedBatchFindingCount}
                    selectedSummary={[groupName, bucket.label]}
                    batchProgress={batchProgress}
                    onAction={onBatchAction}
                    onClear={onClearBatch}
                    showResort={false}
                    placement="inline"
                    showShortcuts={false}
                    showPackagingOnly={selectedProductGroupBatchFindings(activeBatch).every(
                      (finding) => finding.offer_subject === "packaging_only",
                    )}
                    disabled={batchDisabled}
                  />
                </>
              )
            )}
            {bucketItems.length > 0 && (
              <div className={`mt-3 grid gap-3 ${gridClassName}`}>
                {bucketItems.map((item) => {
                  const batchFinding = selectedForBatch
                    ? batchFindingForItem(item)
                    : null;
                  const itemSelected = Boolean(
                    batchFinding && activeBatch?.selectedResultIds.has(batchFinding.result_id),
                  );
                  const itemLabel = item.kind === "finding"
                    ? item.finding.listing_title ?? "listing"
                    : profileTitle(item.profile);
                  return (
                    <div
                      key={`${item.kind}:${item.id}`}
                      data-product-review-batch-item={batchFinding?.result_id}
                      data-product-review-selected={batchFinding ? String(itemSelected) : undefined}
                      className={`relative min-w-0 rounded-lg ${
                        batchFinding && itemSelected
                          ? "ring-2 ring-blue-500 ring-offset-1"
                          : ""
                      }`}
                    >
                      {item.kind === "finding"
                        ? renderFinding(item.finding)
                        : renderMember(item.profile)}
                      {batchFinding && (
                        <button
                          type="button"
                          data-product-review-toggle-selection={batchFinding.result_id}
                          aria-pressed={itemSelected}
                          aria-label={`${itemSelected ? "Deselect" : "Select"} ${itemLabel}`}
                          title={`${itemSelected ? "Deselect" : "Select"} this listing`}
                          disabled={batchDisabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleBatchFinding(batchFinding.result_id);
                          }}
                          className={`absolute left-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-md border shadow-sm transition disabled:cursor-wait disabled:opacity-50 ${
                            itemSelected
                              ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
                              : "border-stone-300 bg-white/95 text-transparent hover:border-blue-400"
                          }`}
                        >
                          <Check size={16} strokeWidth={3} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {bucketItems.length === 0 && (
              <p className="mt-2 rounded-lg border border-dashed border-stone-200 bg-white/70 px-3 py-2 text-[11px] text-stone-600">
                {exactBucketCount == null
                  ? "This subgroup is not represented in the preview. View all to inspect its listings."
                  : `${exactBucketCount} ${exactBucketCount === 1 ? "listing is" : "listings are"} hidden from this preview. View all to inspect ${exactBucketCount === 1 ? "it" : "them"}.`}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function SemanticProductGroupsOverview({
  overview,
  groupView,
  onGroupViewChange,
  showViewToggle = true,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingGroupTasksId,
  loadedGroupTasks,
  expandedSubgroupKeys,
  activeBatch,
  batchProgress,
  savingSemanticCorrectionProfileId,
  loadingMore,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
  onLoadMore,
  onOpenTask,
  onOpenFinding,
  onCorrectType,
}: {
  overview: PersistedProductGroupOverview;
  groupView: ProductGroupView;
  onGroupViewChange: (view: ProductGroupView) => void;
  showViewToggle?: boolean;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingGroupTasksId: string | null;
  loadedGroupTasks: Record<string, IpReviewFinding[]>;
  expandedSubgroupKeys: ReadonlySet<string>;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  savingSemanticCorrectionProfileId: string | null;
  loadingMore: boolean;
  onSelectBatch: (
    groupId: string,
    groupName: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onBatchAction: (action: BatchAction) => void;
  onClearBatch: () => void;
  onToggleBatchFinding: (resultId: string) => void;
  onSetAllBatchFindings: (selected: boolean) => void;
  onToggleSubgroupListings: (
    groupId: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onLoadMore: () => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onOpenFinding: (finding: IpReviewFinding, groupId: string) => void;
  onCorrectType: (
    group: PersistedProductGroup,
    profile: ProductClusterProfile,
  ) => void;
}) {
  const showingTriage = groupView === "triage";
  const displayedGroups = showingTriage
    ? overview.groups.filter(productGroupHasReviewQueueWork)
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

      {overview.dirty && !overview.last_error && !buildingFirstSnapshot && (
        <p className="mt-3 text-xs font-medium text-stone-500" aria-live="polite">
          Updating product groups with newly completed comparisons…
        </p>
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
        <div className="mt-5 grid items-start gap-5">
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
                allFindings={loadedGroupTasks[group.id] ?? null}
                expandedSubgroupKeys={expandedSubgroupKeys}
                loadingAllFindings={loadingGroupTasksId === group.id}
                activeBatch={activeBatch}
                batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                batchDisabled={Boolean(loadingGroupTasksId || batchProgress)}
                onSelectBatch={(bucket) => onSelectBatch(
                  group.id,
                  group.display_name ?? "Product type",
                  bucket,
                )}
                onBatchAction={onBatchAction}
                onClearBatch={onClearBatch}
                onToggleBatchFinding={onToggleBatchFinding}
                onSetAllBatchFindings={onSetAllBatchFindings}
                onToggleSubgroupListings={(bucket) =>
                  onToggleSubgroupListings(group.id, bucket)}
                onOpenTask={onOpenTask}
                onOpenFinding={onOpenFinding}
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
                        allFindings={loadedGroupTasks[child.id] ?? null}
                        expandedSubgroupKeys={expandedSubgroupKeys}
                        loadingAllFindings={loadingGroupTasksId === child.id}
                        activeBatch={activeBatch}
                        batchProgress={activeBatch?.groupId === child.id ? batchProgress : null}
                        savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                        batchDisabled={Boolean(loadingGroupTasksId || batchProgress)}
                        onSelectBatch={(bucket) => onSelectBatch(
                          child.id,
                          child.display_name ?? "Color variant",
                          bucket,
                        )}
                        onBatchAction={onBatchAction}
                        onClearBatch={onClearBatch}
                        onToggleBatchFinding={onToggleBatchFinding}
                        onSetAllBatchFindings={onSetAllBatchFindings}
                        onToggleSubgroupListings={(bucket) =>
                          onToggleSubgroupListings(child.id, bucket)}
                        onOpenTask={onOpenTask}
                        onOpenFinding={onOpenFinding}
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
                allFindings={loadedGroupTasks[group.id] ?? null}
                expandedSubgroupKeys={expandedSubgroupKeys}
                loadingAllFindings={loadingGroupTasksId === group.id}
                activeBatch={activeBatch}
                batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                savingSemanticCorrectionProfileId={savingSemanticCorrectionProfileId}
                batchDisabled={Boolean(loadingGroupTasksId || batchProgress)}
                onSelectBatch={(bucket) => onSelectBatch(
                  group.id,
                  group.display_name ?? "Product type",
                  bucket,
                )}
                onBatchAction={onBatchAction}
                onClearBatch={onClearBatch}
                onToggleBatchFinding={onToggleBatchFinding}
                onSetAllBatchFindings={onSetAllBatchFindings}
                onToggleSubgroupListings={(bucket) =>
                  onToggleSubgroupListings(group.id, bucket)}
                onOpenTask={onOpenTask}
                onOpenFinding={onOpenFinding}
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
  allFindings,
  expandedSubgroupKeys,
  loadingAllFindings,
  activeBatch,
  batchProgress,
  batchDisabled,
  savingSemanticCorrectionProfileId,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
  onOpenTask,
  onOpenFinding,
  onCorrectType,
}: {
  group: PersistedProductGroup;
  ipId: string;
  showingTriage: boolean;
  triageProjectionAvailable: boolean;
  nested?: boolean;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  allFindings: IpReviewFinding[] | null;
  expandedSubgroupKeys: ReadonlySet<string>;
  loadingAllFindings: boolean;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
  savingSemanticCorrectionProfileId: string | null;
  onSelectBatch: (bucket: ProductGroupRecommendationBucket) => void;
  onBatchAction: (action: BatchAction) => void;
  onClearBatch: () => void;
  onToggleBatchFinding: (resultId: string) => void;
  onSetAllBatchFindings: (selected: boolean) => void;
  onToggleSubgroupListings: (bucket: ProductGroupRecommendationBucket) => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onOpenFinding: (finding: IpReviewFinding, groupId: string) => void;
  onCorrectType: (
    group: PersistedProductGroup,
    profile: ProductClusterProfile,
  ) => void;
}) {
  const triageMemberCount = group.triage_member_count ?? 0;
  const displayedMembers = showingTriage ? group.triage_members : group.members;
  const displayedMemberCount = showingTriage ? triageMemberCount : group.member_count;
  const taskLinkMode = triageProjectionAvailable && triageMemberCount === 0
    ? "history"
    : showingTriage || (triageProjectionAvailable && triageMemberCount > 0)
      ? "pending"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const color = group.semantic_definition?.variant_color;
  const priceSignalByCaseId = new Map(
    group.price_signal_members.map((member) => [
      member.case_id,
      member.price_signal,
    ]),
  );
  const unusualPriceCount = priceSignalByCaseId.size;

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
          {unusualPriceCount > 0 && (
            <div
              className="mt-1.5"
              title="Each USD-normalized price is compared with the listing's best-matching exact visual cohort. It is supporting evidence for review, not an automatic counterfeit verdict."
              data-product-type-price-warning-count={unusualPriceCount}
            >
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800 ring-1 ring-inset ring-red-200">
                {unusualPriceCount} unusual {unusualPriceCount === 1 ? "price" : "prices"}
              </span>
              <p className="mt-1 text-[9px] font-medium text-stone-500">
                Compared within visual cohorts · USD
              </p>
            </div>
          )}
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

      <ProductGroupMemberSubgroups
        profiles={displayedMembers}
        priceSummary={null}
        priceSignalByCaseId={priceSignalByCaseId}
        totalCount={displayedMemberCount}
        recommendationCounts={showingTriage
          ? group.triage_recommendation_counts ?? null
          : null}
        separateByRecommendation={showingTriage}
        allFindings={showingTriage ? allFindings : null}
        expandedSubgroupKeys={expandedSubgroupKeys}
        loadingAllFindings={loadingAllFindings}
        groupId={group.id}
        groupName={group.display_name ?? (nested ? "Color variant" : "Product type")}
        activeBatch={activeBatch}
        batchProgress={batchProgress}
        batchDisabled={batchDisabled}
        previewLimit={8}
        gridClassName="grid-cols-3 sm:grid-cols-8"
        renderMember={(profile) => (
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
        )}
        renderFinding={(finding) => {
          const profile = productClusterProfileForFinding(
            finding,
            null,
            priceSignalByCaseId,
          );
          return (
            <div className="relative min-w-0">
              <ListingTile
                profile={profile}
                active={activeTaskProfileId === profile.id}
                onClick={() => onOpenFinding(finding, group.id)}
              />
            </div>
          );
        }}
        onSelectBatch={onSelectBatch}
        onBatchAction={onBatchAction}
        onClearBatch={onClearBatch}
        onToggleBatchFinding={onToggleBatchFinding}
        onSetAllBatchFindings={onSetAllBatchFindings}
        onToggleSubgroupListings={onToggleSubgroupListings}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-stone-500">
          {showingTriage
            ? `${displayedMemberCount} current to-triage listings`
            : nested
              ? "A meaningful color subset of the parent type"
              : `${group.member_count} classified in this product type`}
        </span>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}${taskLinkMode === "pending" ? "&select_all=true" : ""}`}
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
    </div>
  );
}

export function ProductGroupsOverview({
  overview,
  mode,
  groupView,
  onGroupViewChange,
  showViewToggle = true,
  showUngrouped = true,
  savingGroupId,
  mergeSourceGroupId,
  savingMergeKey,
  revokingMergeDecisionId,
  savingCorrectionProfileId,
  activeTaskProfileId,
  loadingTaskProfileId,
  loadingGroupTasksId,
  loadedGroupTasks,
  expandedSubgroupKeys,
  activeBatch,
  batchProgress,
  loadingMore,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
  onLoadMore,
  onOpenTask,
  onOpenFinding,
  onConfirmGroup,
  onSelectMergeSource,
  onLoadGroupForReview,
  onMergeGroups,
  onRevokeMerge,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onCreateAuthenticityRule,
  onUpdateAuthenticityRule,
  onDeleteAuthenticityRule,
}: {
  overview: PersistedProductGroupOverview;
  mode: GroupMode;
  groupView: ProductGroupView;
  onGroupViewChange: (view: ProductGroupView) => void;
  showViewToggle?: boolean;
  showUngrouped?: boolean;
  savingGroupId: string | null;
  mergeSourceGroupId: string | null;
  savingMergeKey: string | null;
  revokingMergeDecisionId: string | null;
  savingCorrectionProfileId: string | null;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  loadingGroupTasksId: string | null;
  loadedGroupTasks: Record<string, IpReviewFinding[]>;
  expandedSubgroupKeys: ReadonlySet<string>;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  loadingMore: boolean;
  onSelectBatch: (
    groupId: string,
    groupName: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onBatchAction: (action: BatchAction) => void;
  onClearBatch: () => void;
  onToggleBatchFinding: (resultId: string) => void;
  onSetAllBatchFindings: (selected: boolean) => void;
  onToggleSubgroupListings: (
    groupId: string,
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onLoadMore: () => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onOpenFinding: (finding: IpReviewFinding, groupId: string) => void;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
  onSelectMergeSource: (groupId: string | null) => void;
  onLoadGroupForReview: (groupId: string) => Promise<PersistedProductGroup | null>;
  onMergeGroups: (leftGroupId: string, rightGroupId: string) => Promise<void>;
  onRevokeMerge: (groupId: string, decisionId: string) => Promise<void>;
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
  onCreateAuthenticityRule: (
    groupId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) => Promise<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>;
  onUpdateAuthenticityRule: (
    groupId: string,
    ruleId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) => Promise<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>;
  onDeleteAuthenticityRule: (
    groupId: string,
    ruleId: string,
  ) => Promise<{ id: string; assessment_jobs_enqueued: number }>;
}) {
  const showingTriage = groupView === "triage";
  const displayedGroups = showingTriage
    ? overview.triage_projection_available
      ? overview.groups.filter(productGroupHasReviewQueueWork)
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
  const mergeSourceGroup = mergeSourceGroupId
    ? overview.groups.find((group) => group.id === mergeSourceGroupId) ?? null
    : null;
  const loadedGroupIds = new Set(overview.groups.map((group) => group.id));

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

      {overview.dirty && !overview.last_error && !buildingFirstSnapshot && (
        <p className="mt-3 text-xs font-medium text-stone-500" aria-live="polite">
          Updating product groups with newly completed comparisons…
        </p>
      )}

      {mode === "same" && mergeSourceGroup && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <div>
            <p className="text-xs font-bold text-violet-900">Choose the matching product group</p>
            <p className="mt-0.5 text-[11px] text-violet-700">
              Selected {mergeSourceGroup.display_name ||
                `a group with ${mergeSourceGroup.member_count} listings`}. The decision is durable and can be undone.
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(savingMergeKey)}
            onClick={() => onSelectMergeSource(null)}
            className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-40"
          >
            Cancel merge
          </button>
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
            <div className="mt-5 grid grid-cols-1 gap-5">
              {displayedGroups.map((group, index) => (
                <ProductGroupCard
                  key={group.id}
                  group={group}
                  availableGroups={overview.groups}
                  reconciliationSuggestions={group.reconciliation_suggestions.filter(
                    (suggestion) =>
                      group.id === suggestion.left_group_id ||
                      !loadedGroupIds.has(suggestion.left_group_id),
                  )}
                  index={index}
                  ipId={overview.scope.ip_id}
                  mode={mode}
                  showPersistedMembers={!showingTriage}
                  triageProjectionAvailable={overview.triage_projection_available}
                  saving={savingGroupId === group.id}
                  mergeSourceGroup={mergeSourceGroup}
                  savingMergeKey={savingMergeKey}
                  revokingMergeDecisionId={revokingMergeDecisionId}
                  savingCorrectionProfileId={savingCorrectionProfileId}
                  activeTaskProfileId={activeTaskProfileId}
                  loadingTaskProfileId={loadingTaskProfileId}
                  allFindings={loadedGroupTasks[group.id] ?? null}
                  expandedSubgroupKeys={expandedSubgroupKeys}
                  loadingAllFindings={loadingGroupTasksId === group.id}
                  activeBatch={activeBatch}
                  batchProgress={activeBatch?.groupId === group.id ? batchProgress : null}
                  batchDisabled={Boolean(loadingGroupTasksId || batchProgress)}
                  onSelectBatch={(bucket, commercialSubgroup) => onSelectBatch(
                    group.id,
                    group.display_name ?? `Product group ${index + 1}`,
                    bucket,
                    commercialSubgroup,
                  )}
                  onBatchAction={onBatchAction}
                  onClearBatch={onClearBatch}
                  onToggleBatchFinding={onToggleBatchFinding}
                  onSetAllBatchFindings={onSetAllBatchFindings}
                  onToggleSubgroupListings={(bucket, commercialSubgroup) =>
                    onToggleSubgroupListings(group.id, bucket, commercialSubgroup)}
                  onOpenTask={onOpenTask}
                  onOpenFinding={onOpenFinding}
                  onConfirmGroup={onConfirmGroup}
                  onSelectMergeSource={onSelectMergeSource}
                  onLoadGroupForReview={onLoadGroupForReview}
                  onMergeGroups={onMergeGroups}
                  onRevokeMerge={onRevokeMerge}
                  onUpdateEmbeddingThreshold={onUpdateEmbeddingThreshold}
                  onCorrectGroupMember={onCorrectGroupMember}
                  onCreateRule={onCreateRule}
                  onUpdateRule={onUpdateRule}
                  onDeleteRule={onDeleteRule}
                  onCreateAuthenticityRule={onCreateAuthenticityRule}
                  onUpdateAuthenticityRule={onUpdateAuthenticityRule}
                  onDeleteAuthenticityRule={onDeleteAuthenticityRule}
                />
              ))}
            </div>
          )}

          {overview.next_cursor ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-xs text-stone-600">
                Showing {displayedGroups.length} of {overview.pagination_group_count} {showingTriage
                  ? "products with work"
                  : "product groups"}.
              </p>
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                {loadingMore ? "Loading…" : mode === "visual"
                  ? "Load more visual groups"
                  : "Load more products"}
              </button>
            </div>
          ) : overview.truncated ? (
            <p className="mt-3 text-xs text-amber-700">
              More {mode === "visual" ? "visual groups" : "product groups"} exist, but this API version cannot page through them yet.
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

function ProductGroupPriceSummaryView({
  summary,
}: {
  summary: ProductGroupPriceSummary;
}) {
  const typicalPrice = summary.typical_low_usd === summary.typical_high_usd
    ? formatMoney(summary.typical_low_usd, "USD")
    : `${formatMoney(summary.typical_low_usd, "USD")}–${formatMoney(summary.typical_high_usd, "USD")}`;
  const learningLabel = summary.reference_source === "reviewed"
    ? `Learned from ${summary.reviewed_clear_count} cleared reviews`
    : "Comparable-variant baseline · learns from cleared reviews";
  const title = [
    "Only USD-normalized prices are compared.",
    `The typical range and low-price cutoff use ${summary.reference_count} reference listings.`,
    "Second-hand and false-positive outcomes are kept out of the baseline.",
    "An unusually low price is supporting evidence for review, not an automatic counterfeit verdict.",
  ].join(" ");

  return (
    <div className="mt-1.5" title={title} data-product-group-price-summary="USD">
      <div className="flex flex-wrap justify-end gap-1">
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-inset ring-sky-200">
          USD typical {typicalPrice}
        </span>
        {summary.unusually_low_count > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800 ring-1 ring-inset ring-red-200">
            {summary.unusually_low_count} unusually low
          </span>
        )}
      </div>
      <p className="mt-1 text-[9px] font-medium text-stone-500">
        {learningLabel}
      </p>
    </div>
  );
}

type ProductGroupReconciliationSuggestion =
  PersistedProductGroup["reconciliation_suggestions"][number];

function productGroupPreviewProfiles(
  group: PersistedProductGroup,
  limit = 4,
) {
  const uniqueProfiles = new Map<string, ProductClusterProfile>();
  for (const profile of [...group.triage_members, ...group.members]) {
    if (!uniqueProfiles.has(profile.id)) uniqueProfiles.set(profile.id, profile);
  }
  return [...uniqueProfiles.values()]
    .sort((left, right) => Number(Boolean(right.image_url)) - Number(Boolean(left.image_url)))
    .slice(0, limit);
}

function productGroupReviewLabel(group: PersistedProductGroup) {
  return group.display_name?.trim() ||
    `Unnamed group · ${group.member_count} ${group.member_count === 1 ? "listing" : "listings"}`;
}

function productGroupRepresentativeTitle(group: PersistedProductGroup) {
  const profiles = productGroupPreviewProfiles(group, 8);
  const titledProfile = profiles.find((profile) => profile.listing_title?.trim());
  return titledProfile ? profileTitle(titledProfile) : null;
}

function productGroupVariantLabels(group: PersistedProductGroup) {
  return [...new Set(
    group.commercial_subgroups
      .map((subgroup) => subgroup.variant_label.trim())
      .filter(Boolean),
  )].slice(0, 3);
}

function productGroupPriceLabel(group: PersistedProductGroup) {
  if (group.price_summary) {
    const low = formatMoney(group.price_summary.typical_low_usd, "USD");
    const high = formatMoney(group.price_summary.typical_high_usd, "USD");
    return low === high ? low : `${low}–${high} typical`;
  }
  const subgroupPrices = group.commercial_subgroups.flatMap((subgroup) =>
    subgroup.price_range
      ? [subgroup.price_range.minimum, subgroup.price_range.maximum]
      : []
  );
  if (subgroupPrices.length > 0) {
    const low = Math.min(...subgroupPrices);
    const high = Math.max(...subgroupPrices);
    return low === high
      ? formatMoney(low, "USD")
      : `${formatMoney(low, "USD")}–${formatMoney(high, "USD")}`;
  }
  return "Price unavailable";
}

function productGroupRecommendationSummary(group: PersistedProductGroup) {
  const counts = group.triage_recommendation_counts;
  if (!counts) return [];
  return [
    { label: "Takedown recommended", count: counts.takedown },
    { label: "Second-hand", count: counts.second_hand },
    { label: "Might be OK", count: counts.might_be_ok },
    { label: "Needs review", count: counts.needs_review },
  ].filter(({ count }) => count > 0);
}

function ProductGroupPreviewImages({
  profiles,
  size = "compact",
}: {
  profiles: ProductClusterProfile[];
  size?: "compact" | "large";
}) {
  const [failedProfileKeys, setFailedProfileKeys] = useState<Set<string>>(new Set());
  const candidateProfiles = [...profiles]
    .sort((left, right) => Number(Boolean(right.image_url)) - Number(Boolean(left.image_url)));
  const visibleProfiles = candidateProfiles
    .filter((profile) =>
      !failedProfileKeys.has(`${profile.id}:${profile.image_url ?? ""}`)
    )
    .slice(0, 4);
  const cellClassName = size === "large"
    ? "aspect-square min-w-0 overflow-hidden rounded-lg bg-stone-100"
    : "h-12 w-12 overflow-hidden rounded-md bg-stone-100 sm:h-14 sm:w-14";
  return (
    <div className={size === "large"
      ? "grid grid-cols-4 gap-1.5"
      : "grid shrink-0 grid-cols-2 gap-1"}
    >
      {visibleProfiles.map((profile) => {
        const profileKey = `${profile.id}:${profile.image_url ?? ""}`;
        return (
          <div key={profileKey} className={cellClassName} title={profileTitle(profile)}>
            {profile.image_url ? (
              <img
                src={profile.image_url}
                alt={profileTitle(profile)}
                onError={() => {
                  setFailedProfileKeys((current) => {
                    const next = new Set(current);
                    next.add(profileKey);
                    return next;
                  });
                }}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm font-black text-stone-400">
                {profileTitle(profile).slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        );
      })}
      {visibleProfiles.length === 0 && (
        <div className={`${cellClassName} flex items-center justify-center text-stone-400`}>
          <Images size={size === "large" ? 24 : 18} />
        </div>
      )}
    </div>
  );
}

function ProductGroupReconciliationPreview({
  suggestion,
  targetGroup,
  mergeBusy,
  loading,
  onReview,
}: {
  suggestion: ProductGroupReconciliationSuggestion;
  targetGroup: PersistedProductGroup | null;
  mergeBusy: boolean;
  loading: boolean;
  onReview: () => void;
}) {
  const minimumCoverage = Math.min(suggestion.left_coverage, suggestion.right_coverage);
  const targetLabel = targetGroup
    ? productGroupReviewLabel(targetGroup)
    : suggestion.target_display_name?.trim() ||
      `Unnamed group · ${suggestion.target_member_count} listings`;
  const suggestedRepresentative = suggestion.target_preview_members.find(
    (profile) => profile.listing_title?.trim(),
  );
  const representativeTitle = targetGroup
    ? productGroupRepresentativeTitle(targetGroup)
    : suggestedRepresentative
      ? profileTitle(suggestedRepresentative)
      : null;
  const variants = targetGroup ? productGroupVariantLabels(targetGroup) : [];
  const targetConfirmationStatus = targetGroup?.confirmation_status ??
    suggestion.target_confirmation_status;

  return (
    <div
      data-reconciliation-target-group-id={suggestion.target_group_id}
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 lg:flex-row lg:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {targetGroup || suggestion.target_preview_members.length > 0 ? (
          <ProductGroupPreviewImages
            profiles={targetGroup
              ? productGroupPreviewProfiles(targetGroup, 8)
              : suggestion.target_preview_members}
          />
        ) : (
          <div className="grid shrink-0 grid-cols-2 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="flex h-12 w-12 items-center justify-center rounded-md bg-stone-100 text-stone-300 sm:h-14 sm:w-14"
              >
                <Images size={16} />
              </div>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-bold text-stone-950">
              {targetLabel}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              targetConfirmationStatus === "confirmed"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                : "bg-stone-100 text-stone-600"
            }`}>
              {targetConfirmationStatus === "confirmed" ? "Confirmed" : "Unconfirmed"}
            </span>
          </div>
          {representativeTitle && (
            <p className="mt-1 line-clamp-1 text-[11px] font-medium text-stone-700">
              <span className="text-stone-400">Representative listing:</span>{" "}
              {representativeTitle}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {targetGroup && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {productGroupPriceLabel(targetGroup)}
              </span>
            )}
            {variants.map((variant) => (
              <span
                key={variant}
                className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"
              >
                {variant}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-stone-600">
            {suggestion.support_count} matching comparisons · {Math.round(minimumCoverage * 100)}%+ member coverage · median match {suggestion.median_same_product_score.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {targetGroup && (
          <a
            href={`#product-group-${targetGroup.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
          >
            <Eye size={14} />
            View group
          </a>
        )}
        <button
          type="button"
          disabled={mergeBusy || loading}
          onClick={onReview}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
          ) : (
            <Eye size={14} />
          )}
          {loading ? "Loading preview…" : "Review & merge"}
        </button>
      </div>
    </div>
  );
}

function ProductGroupMergeComparisonPanel({
  group,
  eyebrow,
}: {
  group: PersistedProductGroup;
  eyebrow: string;
}) {
  const profiles = productGroupPreviewProfiles(group, 6);
  const variants = productGroupVariantLabels(group);
  const recommendations = productGroupRecommendationSummary(group);
  const representativeTitle = productGroupRepresentativeTitle(group);
  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
        {eyebrow}
      </p>
      <h3 className="mt-1 line-clamp-2 text-base font-black text-stone-950">
        {productGroupReviewLabel(group)}
      </h3>
      <p className="mt-1 text-[11px] font-semibold text-stone-500">
        {group.confirmation_status === "confirmed" ? "Confirmed product" : "Unconfirmed product group"}
      </p>

      <div className="mt-3">
        <ProductGroupPreviewImages
          profiles={productGroupPreviewProfiles(group, 8)}
          size="large"
        />
      </div>

      {representativeTitle && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Representative listing
          </p>
          <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-stone-800">
            {representativeTitle}
          </p>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <dt className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Listings</dt>
          <dd className="mt-0.5 font-black text-stone-900">{group.member_count}</dd>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <dt className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Price</dt>
          <dd className="mt-0.5 truncate font-black text-stone-900">{productGroupPriceLabel(group)}</dd>
        </div>
      </dl>

      {variants.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Comparable variants
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {variants.map((variant) => (
              <span
                key={variant}
                className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800 ring-1 ring-inset ring-sky-200"
              >
                {variant}
              </span>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Current triage mix
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recommendations.map(({ label, count }) => (
              <span
                key={label}
                className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200"
              >
                {label} {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {profiles.length > 1 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Other examples
          </p>
          <ul className="mt-1.5 space-y-1">
            {profiles.slice(1, 4).map((profile) => (
              <li key={profile.id} className="truncate text-[10px] font-medium text-stone-600">
                {profileTitle(profile)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProductGroupMergeReviewDialog({
  sourceGroup,
  targetGroup,
  targetVisibleOnPage,
  suggestion,
  saving,
  error,
  onClose,
  onMerge,
}: {
  sourceGroup: PersistedProductGroup;
  targetGroup: PersistedProductGroup | null;
  targetVisibleOnPage: boolean;
  suggestion: ProductGroupReconciliationSuggestion;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: () => Promise<void>;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const minimumCoverage = Math.min(suggestion.left_coverage, suggestion.right_coverage);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-group-merge-review-title"
        data-product-group-merge-review
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-violet-200 bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
              Same-product decision
            </p>
            <h2 id="product-group-merge-review-title" className="mt-1 text-xl font-black text-stone-950">
              Review product merge
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-600">
              Compare both groups before creating one durable product identity. The decision can be undone from merge history.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close merge review"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-950">Why this was suggested</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              {suggestion.support_count} matching comparisons across at least {Math.round(minimumCoverage * 100)}% of each group · median same-product match {suggestion.median_same_product_score.toFixed(2)} · minimum match {suggestion.minimum_same_product_score.toFixed(2)}
            </p>
          </div>

          {targetGroup ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <ProductGroupMergeComparisonPanel group={sourceGroup} eyebrow="Current group" />
              <ProductGroupMergeComparisonPanel group={targetGroup} eyebrow="Suggested target" />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
              The target group could not be loaded for review. No merge can be submitted until its listings are available.
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-800"
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {targetGroup && (
                <p className="text-xs font-bold text-stone-800">
                  Combine “{productGroupReviewLabel(sourceGroup)}” and “{productGroupReviewLabel(targetGroup)}” as one underlying product?
                </p>
              )}
              <p className="mt-1 text-[10px] text-stone-500">
                Listings keep their size, price, and review lanes after the product identities are combined.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {targetGroup && targetVisibleOnPage && (
                <a
                  href={`#product-group-${targetGroup.id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                >
                  <Eye size={14} />
                  View target on page
                </a>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !targetGroup}
                onClick={() => void onMerge().catch(() => undefined)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                ) : (
                  <Check size={14} />
                )}
                {saving ? "Combining…" : "Merge these groups"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductGroupCard({
  workspace = false,
  group,
  availableGroups,
  reconciliationSuggestions,
  index,
  ipId,
  mode,
  showPersistedMembers,
  triageProjectionAvailable,
  saving,
  mergeSourceGroup,
  savingMergeKey,
  revokingMergeDecisionId,
  savingCorrectionProfileId,
  activeTaskProfileId,
  loadingTaskProfileId,
  allFindings,
  expandedSubgroupKeys,
  loadingAllFindings,
  activeBatch,
  batchProgress,
  batchDisabled,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
  onOpenTask,
  onOpenFinding,
  onConfirmGroup,
  onSelectMergeSource,
  onLoadGroupForReview,
  onMergeGroups,
  onRevokeMerge,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onCreateAuthenticityRule,
  onUpdateAuthenticityRule,
  onDeleteAuthenticityRule,
}: {
  workspace?: boolean;
  group: PersistedProductGroup;
  availableGroups: PersistedProductGroup[];
  reconciliationSuggestions: PersistedProductGroup["reconciliation_suggestions"];
  index: number;
  ipId: string;
  mode: GroupMode;
  showPersistedMembers: boolean;
  triageProjectionAvailable: boolean;
  saving: boolean;
  mergeSourceGroup: PersistedProductGroup | null;
  savingMergeKey: string | null;
  revokingMergeDecisionId: string | null;
  savingCorrectionProfileId: string | null;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  allFindings: IpReviewFinding[] | null;
  expandedSubgroupKeys: ReadonlySet<string>;
  loadingAllFindings: boolean;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
  onSelectBatch: (
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onBatchAction: (action: BatchAction) => void;
  onClearBatch: () => void;
  onToggleBatchFinding: (resultId: string) => void;
  onSetAllBatchFindings: (selected: boolean) => void;
  onToggleSubgroupListings: (
    bucket: ProductGroupRecommendationBucket,
    commercialSubgroup?: ProductGroupCommercialSubgroup | null,
  ) => void;
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onOpenFinding: (finding: IpReviewFinding, groupId: string) => void;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
  onSelectMergeSource: (groupId: string | null) => void;
  onLoadGroupForReview: (groupId: string) => Promise<PersistedProductGroup | null>;
  onMergeGroups: (leftGroupId: string, rightGroupId: string) => Promise<void>;
  onRevokeMerge: (groupId: string, decisionId: string) => Promise<void>;
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
  onCreateAuthenticityRule: (
    groupId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) => Promise<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>;
  onUpdateAuthenticityRule: (
    groupId: string,
    ruleId: string,
    input: ProductGroupAuthenticityRuleInput,
  ) => Promise<{
    rule: ProductGroupAuthenticityRule;
    assessment_jobs_enqueued: number;
  }>;
  onDeleteAuthenticityRule: (
    groupId: string,
    ruleId: string,
  ) => Promise<{ id: string; assessment_jobs_enqueued: number }>;
}) {
  const [workspaceSection, setWorkspaceSection] =
    useState<ProductWorkspaceSection>("review");
  const [selectedCommercialSubgroupKey, setSelectedCommercialSubgroupKey] =
    useState<string | null>(() => group.commercial_subgroups[0]?.key ?? null);
  const [workspaceMergeTargetId, setWorkspaceMergeTargetId] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState(
    group.confirmation_status === "confirmed" ? group.display_name ?? "" : "",
  );
  const [ruleDraft, setRuleDraft] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleNotice, setRuleNotice] = useState<string | null>(null);
  const [authenticityDraft, setAuthenticityDraft] =
    useState<ProductGroupAuthenticityRuleInput>(EMPTY_AUTHENTICITY_RULE);
  const [editingAuthenticityRuleId, setEditingAuthenticityRuleId] =
    useState<string | null>(null);
  const [savingAuthenticityRule, setSavingAuthenticityRule] = useState(false);
  const [authenticityNotice, setAuthenticityNotice] = useState<string | null>(null);
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
  const [mergeReviewTargetId, setMergeReviewTargetId] = useState<string | null>(null);
  const [mergeReviewError, setMergeReviewError] = useState<string | null>(null);
  const [resolvedMergeReviewTarget, setResolvedMergeReviewTarget] =
    useState<PersistedProductGroup | null>(null);
  const [loadingMergeReviewTargetId, setLoadingMergeReviewTargetId] =
    useState<string | null>(null);
  const confirmed = group.confirmation_status === "confirmed";
  const selectedAsMergeSource = mergeSourceGroup?.id === group.id;
  const selectedMergeKey = mergeSourceGroup
    ? [mergeSourceGroup.id, group.id].sort().join(":")
    : null;
  const savingThisMerge = selectedMergeKey != null && savingMergeKey === selectedMergeKey;
  const alreadySameCanonicalProduct = Boolean(
    mergeSourceGroup?.canonical_product_id &&
      mergeSourceGroup.canonical_product_id === group.canonical_product_id,
  );
  const mergeReviewSuggestion = mergeReviewTargetId
    ? reconciliationSuggestions.find(
        (suggestion) => suggestion.target_group_id === mergeReviewTargetId,
      ) ?? null
    : null;
  const mergeReviewTarget = mergeReviewTargetId
    ? availableGroups.find((candidate) => candidate.id === mergeReviewTargetId) ??
      (resolvedMergeReviewTarget?.id === mergeReviewTargetId
        ? resolvedMergeReviewTarget
        : null)
    : null;
  const triageMemberCount = group.triage_member_count ?? 0;
  const showingPersistedMembers = showPersistedMembers || managing ||
    (workspace && workspaceSection === "settings");
  const displayedMembers = showingPersistedMembers ? group.members : group.triage_members;
  const displayedMemberCount = showingPersistedMembers ? group.member_count : triageMemberCount;
  const workspaceRepresentative = group.triage_members[0] ?? group.members[0] ?? null;
  const taskLinkMode = triageProjectionAvailable && triageMemberCount === 0
    ? "history"
    : !showingPersistedMembers || triageMemberCount > 0
      ? "pending"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const canConfirm = mode === "same" || mode === "visual";
  const trimmedName = name.trim();
  const nextEmbeddingThreshold = embeddingThresholdEnabled
    ? embeddingThresholdDraft
    : null;
  const embeddingThresholdChanged =
    nextEmbeddingThreshold !== group.embedding_match_threshold;
  const authenticityDraftValid = [
    authenticityDraft.expected_feature,
    authenticityDraft.violation_pattern,
    authenticityDraft.inspection_instruction,
    authenticityDraft.visibility_rule,
  ].every((value) => value.trim().length >= 10) && (
    authenticityDraft.failure_action !== "takedown" ||
    (authenticityDraft.rationale?.trim().length ?? 0) >= 10
  );
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

  async function openMergeReview(targetGroupId: string) {
    setLoadingMergeReviewTargetId(targetGroupId);
    setMergeReviewError(null);
    try {
      const target = availableGroups.find((candidate) => candidate.id === targetGroupId) ??
        await onLoadGroupForReview(targetGroupId);
      if (!target) return;
      setResolvedMergeReviewTarget(target);
      setMergeReviewTargetId(targetGroupId);
    } finally {
      setLoadingMergeReviewTargetId(null);
    }
  }

  const displayedCommercialSubgroups = mode === "same"
    ? group.commercial_subgroups.filter((subgroup) =>
        showingPersistedMembers
          ? subgroup.member_count > 0
          : subgroup.triage_member_count > 0
      )
    : [];
  const selectedCommercialSubgroup = displayedCommercialSubgroups.find(
    (subgroup) => subgroup.key === selectedCommercialSubgroupKey,
  ) ?? displayedCommercialSubgroups[0] ?? null;
  const renderedCommercialSubgroups = workspace
    ? selectedCommercialSubgroup ? [selectedCommercialSubgroup] : []
    : displayedCommercialSubgroups;

  const renderProductMember = (profile: ProductClusterProfile) => {
    const primaryVisualEvidence = primaryVisualEvidenceByProfileId.get(profile.id);
    if (workspace) {
      return (
        <ProductListingRow
          key={profile.id}
          profile={profile}
          active={activeTaskProfileId === profile.id}
          loading={loadingTaskProfileId === profile.id}
          onOpen={() => onOpenTask(profile, group.id)}
          correctionDisabled={Boolean(savingCorrectionProfileId)}
          onRemove={canConfirm && group.member_count > 1 && (!confirmed || managing)
            ? () => void onCorrectGroupMember(group.id, profile.id, "wrong_product")
              .catch(() => undefined)
            : undefined}
        />
      );
    }
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
            aria-label={`Remove ${profileTitle(profile)} from this product`}
            title="This listing belongs to a different underlying product"
            disabled={Boolean(savingCorrectionProfileId)}
            onClick={() => {
              void onCorrectGroupMember(group.id, profile.id, "wrong_product")
                .catch(() => undefined);
            }}
            className={`mt-2 inline-flex w-full items-center justify-center rounded-md px-2 py-1.5 text-[10px] font-semibold text-stone-500 transition hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700 disabled:opacity-40 ${
              confirmed ? "opacity-0 group-hover/member:opacity-100 group-focus-within/member:opacity-100" : "opacity-100"
            }`}
          >
            Different product
          </button>
        )}
      </div>
    );
  };

  const renderProductFinding = (
    finding: IpReviewFinding,
    priceSummary: ProductGroupPriceSummary | null,
  ) => {
    const profile = productClusterProfileForFinding(finding, priceSummary);
    if (workspace) {
      return (
        <ProductListingRow
          profile={profile}
          active={activeTaskProfileId === profile.id}
          onOpen={() => onOpenFinding(finding, group.id)}
        />
      );
    }
    return (
      <div className="relative min-w-0">
        <ListingTile
          profile={profile}
          active={activeTaskProfileId === profile.id}
          onClick={() => onOpenFinding(finding, group.id)}
        />
      </div>
    );
  };

  return (
    <section
      id={`product-group-${group.id}`}
      data-product-group-id={group.id}
      className={`scroll-mt-4 bg-white transition target:ring-4 target:ring-violet-200 ${
        workspace ? "rounded-xl border border-stone-200 p-4 sm:p-5" : "rounded-2xl border p-4 shadow-sm"
      } ${
        confirmed
          ? "border-emerald-200"
          : mode === "visual"
            ? "border-indigo-200"
            : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {workspace && (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-20 sm:w-20">
              {workspaceRepresentative?.image_url ? (
                <img
                  src={workspaceRepresentative.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xl font-black text-stone-400">
                  {productGroupDisplayName(group).slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          )}
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
            <h2 className={`mt-1 line-clamp-2 font-black text-stone-950 ${
              workspace ? "text-xl sm:text-2xl" : "text-sm"
            }`}>
              {group.display_name}
            </h2>
          ) : (
            <>
              {workspace && (
                <h2 className="mt-1 line-clamp-2 text-xl font-black text-stone-950 sm:text-2xl">
                  {productGroupDisplayName(group)}
                </h2>
              )}
              <p className="mt-1 text-[11px] text-stone-500">
                {mode === "visual"
                  ? "Automatically grouped by shared gallery appearance"
                  : "Unnamed until confirmed"}
              </p>
            </>
          )}
          {confirmed && group.confirmed_at && (
            <p className="mt-1 text-[10px] text-emerald-700">
              Confirmed {new Date(group.confirmed_at).toLocaleString()}
            </p>
          )}
          {mode === "same" && group.atomic_cohort_count > 1 && (
            <p className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
              {group.atomic_cohort_count} evidence cohorts combined
            </p>
          )}
          </div>
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
          {group.price_summary && displayedCommercialSubgroups.length === 0 && (
            <ProductGroupPriceSummaryView summary={group.price_summary} />
          )}
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
                if (workspace) {
                  setWorkspaceSection("settings");
                  setManaging(true);
                } else {
                  setManaging((current) => !current);
                }
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
              ? workspace
                ? "Manage product"
                : (managing ? "Close group settings" : "Manage group")
              : "Confirm & name"}
          </button>
          {confirmed && mode === "same" && !managing && (
            <button
              type="button"
              disabled={loadingVisualEvidence}
              onClick={() => {
                if (workspace) {
                  setWorkspaceSection("settings");
                  setManaging(true);
                }
                void loadVisualEvidence();
              }}
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
          {!workspace && mode === "same" && (
            mergeSourceGroup ? (
              selectedAsMergeSource ? (
                <button
                  type="button"
                  disabled={Boolean(savingMergeKey)}
                  onClick={() => onSelectMergeSource(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
                >
                  <X size={14} />
                  Cancel selection
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(savingMergeKey) || alreadySameCanonicalProduct}
                  onClick={() => {
                    void onMergeGroups(mergeSourceGroup.id, group.id).catch(() => undefined);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Check size={14} />
                  {alreadySameCanonicalProduct
                    ? "Already one product"
                    : savingThisMerge
                      ? "Combining…"
                      : "Merge with selected product"}
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={Boolean(savingMergeKey)}
                onClick={() => onSelectMergeSource(group.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40"
              >
                <Plus size={14} />
                Merge with…
              </button>
            )
          )}
        </div>
      )}
      {workspace && (
        <nav
          className="mt-5 flex gap-1 overflow-x-auto border-b border-stone-200"
          aria-label="Product workspace sections"
        >
          {([
            ["review", `Review queue · ${triageMemberCount}`],
            ["offers", `Offers · ${displayedCommercialSubgroups.length}`],
            ["settings", "Group settings"],
            ["history", `History · ${group.canonical_decisions.length}`],
          ] as Array<[ProductWorkspaceSection, string]>).map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-current={workspaceSection === section ? "page" : undefined}
              onClick={() => {
                setWorkspaceSection(section);
                setManaging(section === "settings");
              }}
              className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-bold transition ${
                workspaceSection === section
                  ? "border-stone-950 text-stone-950"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {!managing && visualEvidenceError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
          {visualEvidenceError}
        </p>
      )}

      {mode === "same" && reconciliationSuggestions.length > 0 &&
        (!workspace || workspaceSection === "history") && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-bold text-amber-950">Possible duplicate product group</p>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-800">
            Distributed cross-listing evidence supports the same underlying product. Review the target before combining them.
          </p>
          <div className="mt-2 space-y-2">
            {reconciliationSuggestions.map((suggestion) => (
              <ProductGroupReconciliationPreview
                key={suggestion.target_group_id}
                suggestion={suggestion}
                targetGroup={availableGroups.find(
                  (candidate) => candidate.id === suggestion.target_group_id,
                ) ?? null}
                mergeBusy={Boolean(savingMergeKey)}
                loading={loadingMergeReviewTargetId === suggestion.target_group_id}
                onReview={() => void openMergeReview(suggestion.target_group_id)}
              />
            ))}
          </div>
        </div>
      )}

      {mode === "same" && group.canonical_decisions.length > 0 &&
        (!workspace || workspaceSection === "history") && (
        <details className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-bold text-violet-900">
            Merge history · {group.canonical_decisions.length}
          </summary>
          <p className="mt-1 text-[10px] leading-4 text-violet-700">
            Undo removes this decision. Other decisions in the history may still keep some cohorts combined.
          </p>
          <div className="mt-2 space-y-2">
            {group.canonical_decisions.map((decision) => (
              <div
                key={decision.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-violet-100"
              >
                <div>
                  <p className="text-[11px] font-semibold text-stone-800">
                    {decision.decision_source === "reviewer"
                      ? "Reviewer-confirmed merge"
                      : "High-confidence automatic merge"}
                  </p>
                  <p className="mt-0.5 text-[9px] text-stone-500">
                    {new Date(decision.created_at).toLocaleString()} · confidence {Math.round(decision.confidence * 100)}%
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(revokingMergeDecisionId)}
                  onClick={() => {
                    void onRevokeMerge(group.id, decision.id).catch(() => undefined);
                  }}
                  className="rounded-md border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800 disabled:opacity-40"
                >
                  {revokingMergeDecisionId === decision.id ? "Undoing…" : "Undo merge"}
                </button>
              </div>
            ))}
          </div>
        </details>
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

      {confirmed && managing && (!workspace || workspaceSection === "settings") && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                <Settings2 size={14} />
                Group settings
              </p>
              <p className="mt-1 text-[11px] text-blue-700">
                {mode === "same"
                  ? "Rename the product, adjust how closely new listings must match, manage representative images and rules, or remove a listing below."
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
                  Extra similarity check for new matches
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Unvelar already compares each listing’s photos and product details.
                  Leave this extra check off unless unrelated listings keep appearing
                  in this product.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  When it is on, listings must first look and read similar enough to
                  the listings already here. Genuine offers often use different
                  photos, angles, backgrounds, packaging, languages, or incomplete
                  descriptions. Those differences can make a real match fail this
                  early check before the full product matcher can assess it.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  Use it when reducing incorrect matches matters more than finding
                  every genuine offer. It only affects new listings and listings not
                  yet in this product; it will not remove listings already here.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-bold text-violet-800">
                {embeddingThresholdEnabled
                  ? `On · ${embeddingThresholdDraft.toFixed(2)}`
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
              Use this extra check for new matches
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
                aria-label="How closely new listings must resemble this product"
              />
              <div className="mt-1 flex justify-between text-[10px] text-stone-500">
                <span>Allow more variation</span>
                <span>Require a closer overall match</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-stone-500">
                Listings that pass this extra check still go through the normal
                product matching process. This setting does not decide whether a
                listing is authentic or should be taken down.
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
                        "Saved. The extra check now applies to new matches. We’re refreshing this product in the background.",
                      );
                    })
                    .catch(() => undefined)
                    .finally(() => setSavingEmbeddingThreshold(false));
                }}
                className="shrink-0 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
              >
                {savingEmbeddingThreshold ? "Saving…" : "Save matching setting"}
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
                <p className="text-xs font-bold text-stone-900">What belongs to this product</p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Use these rules only to distinguish this product from a different
                  design, model or formula. Do not use size, price, condition or signs
                  of a possible counterfeit here. Those listings should still join
                  this product so Unvelar can inspect them correctly.
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
                  No product-specific rules yet. Add only characteristics that distinguish this underlying product from a different design or model.
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
                placeholder='Example: "This product is the Bianco Latte fragrance, not another Giardini di Toscana fragrance."'
                onChange={(event) => setRuleDraft(event.target.value)}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Changes recheck current membership and automatically apply to future listings.
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

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">Authenticity checks</p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  These checks run after a listing has joined this product. They never
                  remove it from the product. Current listings are rechecked when a
                  check changes, and future listings are checked automatically.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  A check fails only when the listing clearly shows the required area
                  and the feature is demonstrably wrong or missing. If the right photo
                  is absent, cropped or blurry, the result is <strong>Not visible</strong>—
                  it is not treated as counterfeit.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-800">
                {group.authenticity_rules.length} active
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {group.authenticity_rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-stone-900">
                          {rule.expected_feature}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          rule.failure_action === "takedown"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                        }`}>
                          {rule.failure_action === "takedown"
                            ? "Can recommend takedown"
                            : "Review only"}
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-1.5 text-[10px] leading-4 text-stone-600 sm:grid-cols-2">
                        <div>
                          <dt className="font-bold text-stone-700">Clear failure</dt>
                          <dd>{rule.violation_pattern}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-stone-700">Enough evidence to judge</dt>
                          <dd>{rule.visibility_rule}</dd>
                        </div>
                        {rule.applicability && (
                          <div className="sm:col-span-2">
                            <dt className="font-bold text-stone-700">Applies to</dt>
                            <dd>{rule.applicability}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <button
                      type="button"
                      title="Edit authenticity check"
                      disabled={savingAuthenticityRule}
                      onClick={() => {
                        setEditingAuthenticityRuleId(rule.id);
                        setAuthenticityDraft(authenticityRuleInput(rule));
                        setAuthenticityNotice(null);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      title="Remove authenticity check"
                      disabled={savingAuthenticityRule}
                      onClick={() => {
                        setSavingAuthenticityRule(true);
                        setAuthenticityNotice(null);
                        void onDeleteAuthenticityRule(group.id, rule.id)
                          .then((result) => {
                            if (editingAuthenticityRuleId === rule.id) {
                              setEditingAuthenticityRuleId(null);
                              setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                            }
                            setAuthenticityNotice(
                              authenticityJobsNotice(result.assessment_jobs_enqueued),
                            );
                          })
                          .catch(() => undefined)
                          .finally(() => setSavingAuthenticityRule(false));
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {group.authenticity_rules.length === 0 && (
                <p className="rounded-lg border border-dashed border-stone-300 bg-white/70 px-3 py-3 text-xs leading-5 text-stone-500">
                  No authenticity checks yet. Add only facts confirmed by the
                  rightsholder or reliable genuine samples across the packaging
                  versions this check covers.
                </p>
              )}
            </div>

            <form
              className="mt-3 rounded-lg border border-stone-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!authenticityDraftValid) return;
                const input: ProductGroupAuthenticityRuleInput = {
                  ...authenticityDraft,
                  expected_feature: authenticityDraft.expected_feature.trim(),
                  violation_pattern: authenticityDraft.violation_pattern.trim(),
                  inspection_instruction: authenticityDraft.inspection_instruction.trim(),
                  visibility_rule: authenticityDraft.visibility_rule.trim(),
                  applicability: authenticityDraft.applicability?.trim() || null,
                  rationale: authenticityDraft.rationale?.trim() || null,
                };
                setSavingAuthenticityRule(true);
                setAuthenticityNotice(null);
                const save = editingAuthenticityRuleId
                  ? onUpdateAuthenticityRule(
                      group.id,
                      editingAuthenticityRuleId,
                      input,
                    )
                  : onCreateAuthenticityRule(group.id, input);
                void save
                  .then((result) => {
                    setEditingAuthenticityRuleId(null);
                    setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                    setAuthenticityNotice(
                      authenticityJobsNotice(result.assessment_jobs_enqueued),
                    );
                  })
                  .catch(() => undefined)
                  .finally(() => setSavingAuthenticityRule(false));
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-stone-900">
                  {editingAuthenticityRuleId ? "Edit authenticity check" : "Add an authenticity check"}
                </p>
                {editingAuthenticityRuleId && (
                  <button
                    type="button"
                    disabled={savingAuthenticityRule}
                    onClick={() => {
                      setEditingAuthenticityRuleId(null);
                      setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                    }}
                    className="text-[10px] font-bold text-stone-500 hover:text-stone-800"
                  >
                    Cancel editing
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-stone-700">
                  What genuine items should show
                  <textarea
                    value={authenticityDraft.expected_feature}
                    maxLength={1000}
                    rows={3}
                    placeholder="Example: A printed lot number appears in the bottom-right corner of the box’s bottom panel."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      expected_feature: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  What counts as a clear failure
                  <textarea
                    value={authenticityDraft.violation_pattern}
                    maxLength={1000}
                    rows={3}
                    placeholder="Example: The complete bottom panel is clear, but no lot number is present in that area."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      violation_pattern: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  How Unvelar should check it
                  <textarea
                    value={authenticityDraft.inspection_instruction}
                    maxLength={1000}
                    rows={3}
                    placeholder="Inspect every gallery image for the bottom panel and compare the position and format of the printed code."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      inspection_instruction: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  When there is enough evidence to judge
                  <textarea
                    value={authenticityDraft.visibility_rule}
                    maxLength={1000}
                    rows={3}
                    placeholder="Only judge when the whole bottom panel is visible, uncropped and sharp enough to read."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      visibility_rule: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="mt-3 block text-[10px] font-bold text-stone-700">
                Which packaging versions or markets this applies to <span className="font-normal text-stone-400">(optional)</span>
                <input
                  value={authenticityDraft.applicability ?? ""}
                  maxLength={1000}
                  placeholder="Example: 100 ml European retail boxes introduced in 2025."
                  onChange={(event) => setAuthenticityDraft((current) => ({
                    ...current,
                    applicability: event.target.value || null,
                  }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-stone-700">
                  Where to check
                  <select
                    value={authenticityDraft.modality}
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      modality: event.target.value as ProductGroupAuthenticityRuleInput["modality"],
                    }))}
                    className="mt-1 min-h-9 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="image">Listing photos</option>
                    <option value="description">Listing text</option>
                    <option value="both">Photos and text</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  If it clearly fails
                  <select
                    value={authenticityDraft.failure_action}
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      failure_action: event.target.value as ProductGroupAuthenticityRuleInput["failure_action"],
                    }))}
                    className="mt-1 min-h-9 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="review">Send to human review</option>
                    <option value="takedown">Allow a takedown recommendation</option>
                  </select>
                </label>
              </div>

              {authenticityDraft.failure_action === "takedown" && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-[10px] leading-4 text-red-800">
                    This does not send a takedown automatically. It can recommend one
                    only when the product identity is strong, the rule is clearly
                    violated, and current evidence reaches high confidence.
                  </p>
                  <label className="mt-2 block text-[10px] font-bold text-red-900">
                    Why this is reliable enough to support takedown
                    <textarea
                      value={authenticityDraft.rationale ?? ""}
                      maxLength={2000}
                      rows={3}
                      placeholder="Describe the rightsholder source, genuine samples and packaging versions that confirm this feature."
                      onChange={(event) => setAuthenticityDraft((current) => ({
                        ...current,
                        rationale: event.target.value || null,
                      }))}
                      className="mt-1 w-full resize-y rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </label>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Passed checks support authenticity but never prove it by themselves.
                </p>
                <button
                  type="submit"
                  disabled={savingAuthenticityRule || !authenticityDraftValid}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  <Plus size={13} />
                  {savingAuthenticityRule
                    ? "Saving…"
                    : editingAuthenticityRuleId
                      ? "Save check"
                      : "Add check"}
                </button>
              </div>
            </form>

            {authenticityNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {authenticityNotice}
              </p>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {workspace && workspaceSection === "review" && displayedCommercialSubgroups.length > 1 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-stone-500">
            Comparable offer
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {displayedCommercialSubgroups.map((subgroup) => {
              const count = showingPersistedMembers
                ? subgroup.member_count
                : subgroup.triage_member_count;
              const selected = selectedCommercialSubgroup?.key === subgroup.key;
              return (
                <button
                  key={subgroup.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedCommercialSubgroupKey(subgroup.key)}
                  className={`min-h-11 shrink-0 rounded-lg border px-3 text-left text-sm font-bold transition ${
                    selected
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span>{subgroup.variant_label}</span>
                    {subgroup.price_band === "unusually_low" ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset ${
                        selected
                          ? "bg-red-400/20 text-red-100 ring-red-300/30"
                          : "bg-red-50 text-red-700 ring-red-200"
                      }`}>
                        {count} low-price {count === 1 ? "listing" : "listings"}
                      </span>
                    ) : (
                      <span className={`text-xs ${selected ? "text-stone-300" : "text-stone-400"}`}>
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {workspace && workspaceSection === "offers" && (
        <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
          {displayedCommercialSubgroups.length > 0 ? displayedCommercialSubgroups.map((subgroup) => {
            const count = showingPersistedMembers
              ? subgroup.member_count
              : subgroup.triage_member_count;
            const needsTriageCount = subgroup.triage_member_count;
            const triagedCount = Math.max(0, subgroup.member_count - needsTriageCount);
            const triageComplete = needsTriageCount === 0;
            const subgroupMembers = displayedMembers.filter(
              (member) => member.commercial_subgroup_key === subgroup.key,
            );
            const representative = subgroupMembers.find((member) => member.image_url) ??
              subgroupMembers[0] ?? null;
            const priceRange = subgroup.price_range;
            const priceLabel = !priceRange
              ? "Price unavailable"
              : priceRange.minimum === priceRange.maximum
                ? formatMoney(priceRange.minimum, "USD")
                : `${formatMoney(priceRange.minimum, "USD")}–${formatMoney(priceRange.maximum, "USD")}`;
            return (
              <button
                key={subgroup.key}
                type="button"
                onClick={() => {
                  setSelectedCommercialSubgroupKey(subgroup.key);
                  setWorkspaceSection("review");
                  setManaging(false);
                }}
                className={`flex min-h-24 w-full items-center gap-3 border-b border-stone-200 p-3 text-left transition last:border-b-0 sm:gap-4 sm:p-4 ${
                  triageComplete
                    ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                    : "bg-white hover:bg-amber-50/50"
                }`}
              >
                <span className="flex h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-20 sm:w-20">
                  {representative?.image_url ? (
                    <img
                      src={representative.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-black text-stone-400">
                      {subgroup.variant_label.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-stone-950">
                    {subgroup.variant_label}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    {subgroup.price_band === "unusually_low" ? (
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                        {count} low-price {count === 1 ? "listing" : "listings"}
                      </span>
                    ) : (
                      <span>{count} {count === 1 ? "listing" : "listings"}</span>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {needsTriageCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                        {needsTriageCount} {needsTriageCount === 1 ? "needs triage" : "need triage"}
                      </span>
                    )}
                    {triagedCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <Check size={10} aria-hidden="true" />
                        {triagedCount} triaged
                      </span>
                    )}
                    {triageComplete && triagedCount === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <Check size={10} aria-hidden="true" />
                        Triage complete
                      </span>
                    )}
                  </span>
                </span>
                <span className={`shrink-0 text-right text-sm font-black ${
                  subgroup.price_band === "unusually_low" ? "text-red-700" : "text-stone-700"
                }`}>
                  <span className="block">{priceLabel}</span>
                  <span className="mt-1 block text-xs font-bold text-stone-400">View listings →</span>
                </span>
              </button>
            );
          }) : (
            <p className="px-4 py-8 text-center text-sm text-stone-500">
              No comparable offers are available for this product.
            </p>
          )}
        </div>
      )}

      {workspace && workspaceSection === "history" && (
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-black text-stone-950">Merge another product</p>
          <p className="mt-1 text-sm text-stone-500">
            Combine this identity with another loaded product. The decision remains reversible.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={workspaceMergeTargetId}
              onChange={(event) => setWorkspaceMergeTargetId(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Choose a product…</option>
              {availableGroups.filter((candidate) => candidate.id !== group.id).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {productGroupDisplayName(candidate)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!workspaceMergeTargetId || Boolean(savingMergeKey)}
              onClick={() => {
                if (!workspaceMergeTargetId) return;
                void onMergeGroups(group.id, workspaceMergeTargetId)
                  .then(() => setWorkspaceMergeTargetId(""))
                  .catch(() => undefined);
              }}
              className="min-h-11 rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {savingMergeKey ? "Merging…" : "Merge products"}
            </button>
          </div>
        </div>
      )}

      {workspace && workspaceSection === "history" &&
        reconciliationSuggestions.length === 0 && group.canonical_decisions.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center">
          <p className="text-sm font-bold text-stone-900">No merge history yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Merge suggestions and reversible decisions will appear here.
          </p>
        </div>
      )}

      {workspace && workspaceSection === "review" &&
        !showingPersistedMembers && displayedMemberCount === 0 && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
            <p className="text-sm font-black text-emerald-950">Review queue complete</p>
            <p className="mt-1 text-sm text-emerald-800">
              No current tasks remain for this product. Resolved listings stay in task history
              and return here only if they are reopened.
            </p>
          </div>
        )}

      {(!workspace || workspaceSection === "review") && displayedMemberCount > 0 &&
        (displayedCommercialSubgroups.length > 0 ? (
        <div className="mt-4 space-y-3" data-product-commercial-groups>
          {renderedCommercialSubgroups.map((commercialSubgroup) => {
            const scopeId = productCommercialReviewScopeId(
              group.id,
              commercialSubgroup.key,
            );
            const profiles = showingPersistedMembers
              ? commercialSubgroup.preview_members.length > 0
                ? commercialSubgroup.preview_members
                : displayedMembers.filter(
                  (profile) => profile.commercial_subgroup_key === commercialSubgroup.key,
                )
              : displayedMembers.filter(
                (profile) => profile.commercial_subgroup_key === commercialSubgroup.key,
              );
            const commercialCaseIds = new Set(commercialSubgroup.triage_case_ids);
            const subgroupFindings = !showingPersistedMembers && allFindings
              ? allFindings.filter((finding) =>
                  Boolean(finding.case_id && commercialCaseIds.has(finding.case_id))
                )
              : null;
            const priceRange = commercialSubgroup.price_range;
            const priceRangeLabel = !priceRange
              ? "Price unavailable"
              : priceRange.minimum === priceRange.maximum
                ? formatMoney(priceRange.minimum, "USD")
                : `${formatMoney(priceRange.minimum, "USD")}–${formatMoney(
                    priceRange.maximum,
                    "USD",
                  )}`;
            return (
              <section
                key={commercialSubgroup.key}
                data-product-commercial-subgroup={commercialSubgroup.key}
                className={`rounded-xl border p-3 ${
                  commercialSubgroup.price_band === "unusually_low"
                    ? "border-red-200 bg-red-50/40"
                    : "border-stone-200 bg-stone-50/70"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                      Comparable offer
                    </p>
                    <h3 className="mt-0.5 text-sm font-black text-stone-900">
                      {commercialSubgroup.variant_label}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      commercialSubgroup.price_band === "unusually_low"
                        ? "bg-red-100 text-red-800"
                        : commercialSubgroup.price_band === "unpriced"
                          ? "bg-stone-200 text-stone-700"
                          : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {commercialSubgroup.price_band === "unusually_low"
                        ? `Low-price range · ${priceRangeLabel}`
                        : priceRangeLabel}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-inset ring-stone-200">
                      {showingPersistedMembers
                        ? commercialSubgroup.member_count
                        : commercialSubgroup.triage_member_count} listings
                    </span>
                  </div>
                </div>
                {commercialSubgroup.price_band === "unusually_low" && (
                  <p className="mt-2 rounded-lg border border-red-100 bg-white/70 px-2.5 py-2 text-[11px] font-medium text-red-800">
                    <span className="font-bold">Price signal:</span>{" "}
                    {commercialSubgroup.price_summary?.unusually_low_threshold_usd
                      ? `Below ${formatMoney(
                          commercialSubgroup.price_summary.unusually_low_threshold_usd,
                          "USD",
                        )} compared with other ${commercialSubgroup.variant_label} listings.`
                      : `Priced unusually low compared with other ${commercialSubgroup.variant_label} listings.`}
                  </p>
                )}
                <ProductGroupMemberSubgroups
                  profiles={profiles}
                  priceSummary={commercialSubgroup.price_summary}
                  priceSignalByCaseId={null}
                  totalCount={showingPersistedMembers
                    ? commercialSubgroup.member_count
                    : commercialSubgroup.triage_member_count}
                  recommendationCounts={!showingPersistedMembers
                    ? commercialSubgroup.triage_recommendation_counts
                    : null}
                  separateByRecommendation={!showingPersistedMembers}
                  allFindings={subgroupFindings}
                  expandedSubgroupKeys={expandedSubgroupKeys}
                  loadingAllFindings={loadingAllFindings}
                  groupId={scopeId}
                  groupName={`${group.display_name ?? `Product group ${index + 1}`} · ${commercialSubgroup.variant_label}`}
                  activeBatch={activeBatch}
                  batchProgress={batchProgress}
                  batchDisabled={batchDisabled}
                  previewLimit={4}
                  gridClassName={workspace ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}
                  renderMember={renderProductMember}
                  renderFinding={(finding) => renderProductFinding(
                    finding,
                    commercialSubgroup.price_summary,
                  )}
                  onSelectBatch={(bucket) => onSelectBatch(bucket, commercialSubgroup)}
                  onBatchAction={onBatchAction}
                  onClearBatch={onClearBatch}
                  onToggleBatchFinding={onToggleBatchFinding}
                  onSetAllBatchFindings={onSetAllBatchFindings}
                  onToggleSubgroupListings={(bucket) =>
                    onToggleSubgroupListings(bucket, commercialSubgroup)}
                />
                {showingPersistedMembers && profiles.length > 0 &&
                  profiles.length < commercialSubgroup.member_count && (
                    <p className="mt-2 text-[11px] text-stone-500">
                      Showing {profiles.length} representative listings from this offer.
                    </p>
                  )}
                {profiles.length === 0 && (
                  <p className="mt-2 text-[11px] text-stone-500">
                    A listing preview could not be loaded for this offer.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ProductGroupMemberSubgroups
          profiles={displayedMembers}
          priceSummary={group.price_summary}
          priceSignalByCaseId={null}
          totalCount={displayedMemberCount}
          recommendationCounts={!showingPersistedMembers
            ? group.triage_recommendation_counts ?? null
            : null}
          separateByRecommendation={!showingPersistedMembers}
          allFindings={!showingPersistedMembers ? allFindings : null}
          expandedSubgroupKeys={expandedSubgroupKeys}
          loadingAllFindings={loadingAllFindings}
          groupId={group.id}
          groupName={group.display_name ?? `Product group ${index + 1}`}
          activeBatch={activeBatch}
          batchProgress={batchProgress}
          batchDisabled={batchDisabled}
          previewLimit={4}
          gridClassName={workspace ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}
          renderMember={renderProductMember}
          renderFinding={(finding) => renderProductFinding(finding, group.price_summary)}
          onSelectBatch={onSelectBatch}
          onBatchAction={onBatchAction}
          onClearBatch={onClearBatch}
          onToggleBatchFinding={onToggleBatchFinding}
          onSetAllBatchFindings={onSetAllBatchFindings}
          onToggleSubgroupListings={onToggleSubgroupListings}
        />
      ))}
      {(!workspace || workspaceSection === "review") && (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
        <span className="text-xs text-stone-500">
          {!showingPersistedMembers
            ? `${displayedMemberCount} current to-triage listings`
            : <>
                Minimum {mode === "same"
                  ? "same-product"
                  : mode === "related"
                    ? "related-product"
                    : "pairwise image similarity"}{" "}
                {group.minimum_score?.toFixed(3) ?? "—"}
              </>}
        </span>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}${taskLinkMode === "pending" ? "&select_all=true" : ""}`}
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
      )}
      {mergeReviewSuggestion && (
        <ProductGroupMergeReviewDialog
          sourceGroup={group}
          targetGroup={mergeReviewTarget}
          targetVisibleOnPage={availableGroups.some(
            (candidate) => candidate.id === mergeReviewSuggestion.target_group_id,
          )}
          suggestion={mergeReviewSuggestion}
          error={mergeReviewError}
          saving={savingMergeKey === [group.id, mergeReviewSuggestion.target_group_id]
            .sort().join(":")}
          onClose={() => {
            setMergeReviewTargetId(null);
            setMergeReviewError(null);
          }}
          onMerge={async () => {
            setMergeReviewError(null);
            try {
              await onMergeGroups(group.id, mergeReviewSuggestion.target_group_id);
              setMergeReviewTargetId(null);
            } catch (caught: unknown) {
              setMergeReviewError(errorMessage(caught, "Unable to merge these products."));
            }
          }}
        />
      )}
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

function ProductListingRow({
  profile,
  active = false,
  loading = false,
  correctionDisabled = false,
  onOpen,
  onRemove,
}: {
  profile: ProductClusterProfile;
  active?: boolean;
  loading?: boolean;
  correctionDisabled?: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const priceValueUsd = profile.price_value_usd == null
    ? null
    : Number(profile.price_value_usd);
  const price = priceValueUsd != null && Number.isFinite(priceValueUsd)
    ? formatMoney(priceValueUsd, "USD")
    : "Price unavailable";
  const bucket = productGroupRecommendationBucket(recommendationBucketForProfile(profile));
  const unusualPrice = profile.price_signal?.unusually_low === true;

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg border bg-white p-2 transition ${
      active ? "border-blue-400 ring-2 ring-blue-100" : "border-stone-200"
    }`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100 sm:h-20 sm:w-20">
          {profile.image_url ? (
            <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-lg font-black text-stone-400">
              {profileTitle(profile).slice(0, 1).toUpperCase()}
            </span>
          )}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/75">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-bold text-stone-950">
            {profileTitle(profile)}
          </span>
          <span className="mt-1 block truncate text-xs text-stone-500">
            {profile.platform || "Marketplace listing"}
          </span>
        </span>
        <span className="hidden shrink-0 text-right sm:block">
          <span className={`block text-sm font-black ${unusualPrice ? "text-red-700" : "text-stone-950"}`}>
            {price}
          </span>
          <span className={`mt-1 block text-xs font-bold ${bucket.labelClassName}`}>
            {bucket.label}
          </span>
        </span>
        <span className="shrink-0 text-stone-400" aria-hidden="true">→</span>
      </button>
      {onRemove && (
        <button
          type="button"
          disabled={correctionDisabled}
          onClick={onRemove}
          className="hidden min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-stone-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40 md:inline-flex md:items-center"
        >
          Different product
        </button>
      )}
    </div>
  );
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
  const priceValueUsd = profile.price_value_usd == null
    ? null
    : Number(profile.price_value_usd);
  const price = priceValueUsd != null && Number.isFinite(priceValueUsd)
    ? formatMoney(priceValueUsd, "USD")
    : null;
  const unusualPrice = profile.price_signal?.unusually_low === true
    ? profile.price_signal
    : null;
  const priceSignalReference = unusualPrice?.comparison_scope === "visual_cohort"
    ? unusualPrice?.source_group_name?.trim() || "its exact visual cohort"
    : unusualPrice?.comparison_scope === "commercial_variant"
      ? "the same size or commercial variant"
      : "the learned group";
  const priceComparisonLabel = unusualPrice?.comparison_scope === "visual_cohort"
    ? "visual cohort"
    : unusualPrice?.comparison_scope === "commercial_variant"
      ? "same variant"
      : "typical";
  const taskTitle = onClick
    ? `Open task details: ${profileTitle(profile)}`
    : `Task details unavailable: ${profileTitle(profile)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={unusualPrice
        ? `${taskTitle}. Price is ${unusualPrice.percent_below_reference}% below the USD median for ${priceSignalReference}; treat this as review evidence, not an automatic verdict.`
        : taskTitle}
      data-product-price-currency={price ? "USD" : undefined}
      data-product-price-signal={unusualPrice ? "unusually-low" : undefined}
      data-product-price-comparison={unusualPrice?.comparison_scope}
      className={`w-full min-w-0 rounded-lg border p-2 text-left transition disabled:cursor-default ${
        active
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
          : unusualPrice
            ? "border-red-300 bg-red-50 enabled:hover:border-red-400 enabled:hover:bg-red-100"
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
        {price && (
          <span className={`absolute bottom-1.5 right-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md px-2 py-1 text-xs font-extrabold tracking-tight text-white shadow-md ring-1 ring-white/30 ${
            unusualPrice ? "bg-red-700/95" : "bg-stone-950/90"
          }`}>
            {price}
          </span>
        )}
        {unusualPrice && (
          <span className="absolute left-1.5 top-1.5 rounded bg-red-700/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
            {unusualPrice.percent_below_reference}% below {priceComparisonLabel}
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
      <span className="mt-2 block truncate text-[11px] font-semibold text-stone-700">
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

function authenticityJobsNotice(count: number) {
  if (count === 0) {
    return "Authenticity check saved. Future listings will use it automatically.";
  }
  return `Authenticity check saved. ${count} current listing${count === 1 ? "" : "s"} queued to be checked again.`;
}
