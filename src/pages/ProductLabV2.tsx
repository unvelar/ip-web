import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  Layers3,
  Link2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Square,
  Sparkles,
  X,
} from "lucide-react";
import {
  approveTakedownBatch,
  dismissIpFinding,
  getMonitoringFinding,
  getPersistedProductGroups,
  listMonitoringFindingsGlobal,
  listProductClusterScopes,
  markIpFindingNeedsReview,
  mergePersistedProductGroups,
  reopenIpFinding,
  revokePersistedProductGroupMerge,
  searchPersistedProductGroupMergeCandidates,
  undismissIpFinding,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type PersistedProductGroup,
  type PersistedProductGroupOverview,
  type ProductGroupMergeCandidate,
  type TakedownFeedbackAssociationScope,
} from "../api";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import {
  dismissalOptionsForBatchAction,
  runPool,
} from "../components/monitoring/board/batchUtils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import { AssigneeAvatar } from "../components/monitoring/board/AssigneeAvatar";
import {
  findingPlatformLabel,
  formatMoney,
} from "../components/monitoring/board/utils";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import {
  adjacentFinding,
  productShouldStayInAttention,
  recentDecisionCanUndo,
  recommendedBatchActionForSelection,
  reconcileProductAttentionOverview,
  recentDecisionKind,
  recentDecisionTimestamp,
  removeProcessedFindings,
  resetOptimisticProductStateAfterUndo,
  shouldLoadMoreProductGroups,
  sortRecentDecisions,
  type ProductLabBatchAction,
} from "./productLabV2Utils";

type ProductLabView = "attention" | "history" | "all";
type ReviewBucket = "all" | "takedown" | "second_hand" | "might_be_ok" | "needs_review";
const PAGE_SIZE = 24;

type ProductMergeNotice = {
  message: string;
  tone: "success" | "error";
  undo?: {
    decisionId: string;
    groupId: string;
    sourceGroupId: string;
  };
};

type CategorizedProduct = {
  group: PersistedProductGroup;
  index: number;
};

type ProductCategoryNode = {
  key: string;
  label: string;
  path: string;
  groups: CategorizedProduct[];
  children: ProductCategoryNode[];
  groupCount: number;
};

function buildProductCategoryTree(groups: PersistedProductGroup[]): ProductCategoryNode[] {
  type MutableCategoryNode = Omit<ProductCategoryNode, "children" | "groupCount"> & {
    children: Map<string, MutableCategoryNode>;
  };

  const roots = new Map<string, MutableCategoryNode>();

  groups.forEach((group, index) => {
    const categoryPath = group.catalog_primary_category_path?.trim();
    const categoryName = group.catalog_primary_category_name?.trim();
    const segments = (categoryPath || categoryName || "Unclassified")
      .split(" > ")
      .map((segment) => segment.trim())
      .filter(Boolean);
    let siblings = roots;
    const pathSegments: string[] = [];
    let leaf: MutableCategoryNode | null = null;

    for (const segment of segments) {
      pathSegments.push(segment);
      const path = pathSegments.join(" > ");
      const key = path === "Unclassified" ? "unclassified" : path;
      leaf = siblings.get(key) ?? {
        key,
        label: segment,
        path,
        groups: [],
        children: new Map(),
      };
      siblings.set(key, leaf);
      siblings = leaf.children;
    }

    leaf?.groups.push({ group, index });
  });

  const finalize = (node: MutableCategoryNode): ProductCategoryNode => {
    const children = [...node.children.values()]
      .map(finalize)
      .sort((left, right) => {
        if (left.key === "unclassified") return 1;
        if (right.key === "unclassified") return -1;
        return left.label.localeCompare(right.label);
      });
    return {
      ...node,
      children,
      groupCount: node.groups.length + children.reduce(
        (total, child) => total + child.groupCount,
        0,
      ),
    };
  };

  return [...roots.values()]
    .map(finalize)
    .sort((left, right) => {
      if (left.key === "unclassified") return 1;
      if (right.key === "unclassified") return -1;
      return left.label.localeCompare(right.label);
    });
}

function expandedCategoryGroups(
  categories: ProductCategoryNode[],
  collapsedPaths: ReadonlySet<string>,
  forceExpanded: boolean,
): PersistedProductGroup[] {
  const groups: PersistedProductGroup[] = [];
  for (const category of categories) {
    if (!forceExpanded && collapsedPaths.has(category.path)) continue;
    groups.push(...category.groups.map((item) => item.group));
    groups.push(...expandedCategoryGroups(
      category.children,
      collapsedPaths,
      forceExpanded,
    ));
  }
  return groups;
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function productName(group: PersistedProductGroup, index?: number) {
  const representative = group.members[0] ?? group.triage_members[0] ?? null;
  const title = representative?.listing_title?.trim();
  const profileTitle = representative?.profile_text
    .split("\n")[0]
    ?.replace(/^Title:\s*/i, "")
    .trim();
  return group.display_name?.trim() || title || profileTitle ||
    (index == null ? "Untitled product" : `Product ${index + 1}`);
}

function representativeImage(group: PersistedProductGroup) {
  return (group.members[0] ?? group.triage_members[0] ?? null)?.image_url ?? null;
}

function offerCount(group: PersistedProductGroup) {
  return group.commercial_subgroups.filter((subgroup) => subgroup.member_count > 0).length;
}

function priceRange(group: PersistedProductGroup) {
  const ranges = group.commercial_subgroups.flatMap((subgroup) =>
    subgroup.price_range ? [subgroup.price_range] : []
  );
  if (ranges.length === 0) return null;
  const minimum = Math.min(...ranges.map((range) => range.minimum));
  const maximum = Math.max(...ranges.map((range) => range.maximum));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  if (minimum === maximum) return formatMoney(minimum, "USD");
  return `${formatMoney(minimum, "USD")}–${formatMoney(maximum, "USD")}`;
}

function productStatus(group: PersistedProductGroup) {
  const reviewCount = group.triage_member_count ?? 0;
  if (group.confirmation_status !== "confirmed") {
    return {
      label: "Needs confirmation",
      dotClass: "bg-amber-500",
      textClass: "text-amber-800",
    };
  }
  if (reviewCount > 0) {
    return {
      label: `${reviewCount} to review`,
      dotClass: "bg-red-600",
      textClass: "text-red-800",
    };
  }
  return {
    label: "Up to date",
    dotClass: "bg-emerald-600",
    textClass: "text-emerald-800",
  };
}

function appendPage(
  current: PersistedProductGroupOverview,
  next: PersistedProductGroupOverview,
) {
  const known = new Set(current.groups.map((group) => group.id));
  return {
    ...next,
    groups: [
      ...current.groups,
      ...next.groups.filter((group) => !known.has(group.id)),
    ],
  };
}

async function loadProductGroupPage(
  ipId: string,
  view: Exclude<ProductLabView, "history">,
  options: {
    cursor?: string | null;
    signal?: AbortSignal;
  } = {},
) {
  let accumulated: PersistedProductGroupOverview = await getPersistedProductGroups(
    ipId,
    "same",
    "all",
    { limit: PAGE_SIZE, ...options },
  );
  const seenCursors = new Set<string>();

  while (shouldLoadMoreProductGroups(
    view,
    accumulated.next_cursor,
  )) {
    const cursor = accumulated.next_cursor;
    if (!cursor || seenCursors.has(cursor)) break;
    seenCursors.add(cursor);
    const next = await getPersistedProductGroups(
      ipId,
      "same",
      "all",
      { limit: PAGE_SIZE, cursor, signal: options.signal },
    );
    accumulated = appendPage(accumulated, next);
  }

  return accumulated;
}

function reviewBucket(finding: IpReviewFinding): Exclude<ReviewBucket, "all"> {
  const key = finding.actionability?.key;
  if (key === "send_takedown") return "takedown";
  if (key === "allowed_resale") return "second_hand";
  if (key === "licensed_seller" || key === "false_positive") return "might_be_ok";
  return "needs_review";
}

async function loadProductGroupFindings(ipId: string, groupId: string) {
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

async function loadRecentDecisions(ipId: string, signal?: AbortSignal) {
  const statuses = [
    "dismissed",
    "review",
    "takedown_pending",
    "takedown_sent",
    "enforced",
  ] as const;
  const pages = await Promise.all(statuses.map((status) =>
    listMonitoringFindingsGlobal({
      ip_id: ipId,
      status,
      show_dismissed: status === "dismissed",
      sort: "updated_desc",
      limit: 30,
      signal,
    })
  ));
  const byResultId = new Map<string, IpReviewFinding>();
  for (const finding of pages.flatMap((page) => page.findings)) {
    const current = byResultId.get(finding.result_id);
    if (
      !current ||
      Date.parse(recentDecisionTimestamp(finding)) >
        Date.parse(recentDecisionTimestamp(current))
    ) byResultId.set(finding.result_id, finding);
  }
  return sortRecentDecisions([...byResultId.values()]).slice(0, 50);
}

export default function ProductLabV2() {
  const { actingTenantId } = useAuth();
  const { activeIpId, activeIp, loading: loadingIp } = useActiveIp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [scopeAvailable, setScopeAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
  const [mergeNotice, setMergeNotice] = useState<ProductMergeNotice | null>(null);
  const [undoingMerge, setUndoingMerge] = useState(false);
  const [activeFinding, setActiveFinding] = useState<IpReviewFinding | null>(null);
  const [dismissingResultId, setDismissingResultId] = useState<string | null>(null);
  const [recentDecisions, setRecentDecisions] = useState<IpReviewFinding[]>([]);
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
  const optimisticallyProcessedIdsRef = useRef<Set<string>>(new Set());

  const requestedView = searchParams.get("view");
  const view: ProductLabView = requestedView === "all" || requestedView === "history"
    ? requestedView
    : "attention";
  const selectedGroupId = searchParams.get("group");

  const selectGroup = useCallback((groupId: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (groupId) next.set("group", groupId);
    else next.delete("group");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    setMergeSourceGroup(null);
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

    void listProductClusterScopes(controller.signal)
      .then(async ({ scopes }) => {
        if (!alive) return;
        const available = scopes.some((scope) => scope.ip_id === activeIpId);
        setScopeAvailable(available);
        if (!available) return null;
        return loadProductGroupPage(activeIpId, view, { signal: controller.signal });
      })
      .then((nextOverview) => {
        if (!alive || !nextOverview) return;
        const reconciledOverview = Object.entries(exactPendingCountsRef.current)
          .reduce(
            (current, [groupId, exactPendingCount]) =>
              reconcileProductAttentionOverview(current, groupId, exactPendingCount),
            nextOverview,
          );
        setOverview(reconciledOverview);
      })
      .catch((caught: unknown) => {
        if (!alive || controller.signal.aborted) return;
        setError(messageFor(caught));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [activeIpId, actingTenantId, loadingIp, refreshToken, view]);

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
    setHistoryError(null);
    void loadRecentDecisions(activeIpId, controller.signal)
      .then((findings) => {
        if (alive) setRecentDecisions(findings);
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

  const visibleGroups = useMemo(() => {
    if (!overview) return [];
    const needle = query.trim().toLocaleLowerCase();
    return overview.groups
      .filter((group) => {
        if (
          view === "attention" &&
          !productShouldStayInAttention(group, group.id === selectedGroupId)
        ) return false;
        if (!needle) return true;
        const haystack = [
          productName(group),
          group.catalog_primary_category_name,
          group.catalog_primary_category_path,
          ...group.members.slice(0, 4).map((member) => member.listing_title),
          ...group.triage_members.slice(0, 4).map((member) => member.listing_title),
          ...group.commercial_subgroups.map((subgroup) => subgroup.variant_label),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return haystack.includes(needle);
      })
      .sort((left, right) => {
        const confirmationDelta =
          Number(left.confirmation_status === "confirmed") -
          Number(right.confirmation_status === "confirmed");
        return confirmationDelta ||
          (right.triage_member_count ?? 0) - (left.triage_member_count ?? 0) ||
          productName(left).localeCompare(productName(right));
      });
  }, [overview, query, selectedGroupId, view]);

  const categoryTree = useMemo(
    () => buildProductCategoryTree(visibleGroups),
    [visibleGroups],
  );
  const navigableGroups = useMemo(
    () => expandedCategoryGroups(
      categoryTree,
      collapsedCategoryPaths,
      Boolean(query.trim()),
    ),
    [categoryTree, collapsedCategoryPaths, query],
  );

  const toggleCategory = useCallback((path: string) => {
    setCollapsedCategoryPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const selectedGroup = selectedGroupId
    ? overview?.groups.find((group) => group.id === selectedGroupId) ?? null
    : null;
  const selectedGroupConfirmationStatus = selectedGroup?.confirmation_status;

  useEffect(() => {
    const nextBatchScope = activeIpId && selectedGroupId
      ? `${actingTenantId ?? ""}:${activeIpId}:${selectedGroupId}`
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
    if (!nextBatchScope || !activeIpId || !selectedGroupId) {
      setLoadingBatch(false);
      return;
    }

    let alive = true;
    setLoadingBatch(true);
    void loadProductGroupFindings(activeIpId, selectedGroupId)
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
        exactPendingCountsRef.current[selectedGroupId] = displayedFindings.length;
        setOverview((current) => current
          ? reconcileProductAttentionOverview(
              current,
              selectedGroupId,
              displayedFindings.length,
            )
          : current);
        if (
          view === "attention" &&
          selectedGroupConfirmationStatus &&
          !productShouldStayInAttention({
            confirmation_status: selectedGroupConfirmationStatus,
            triage_member_count: displayedFindings.length,
          }, true)
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
    selectedGroupConfirmationStatus,
    selectedGroupId,
    view,
  ]);

  useEffect(() => {
    if (!activeFinding) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-finding-inspector]")) return;
      setActiveFinding(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setActiveFinding(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activeFinding]);

  function changeView(nextView: ProductLabView) {
    const next = new URLSearchParams(searchParams);
    if (nextView === "attention") next.delete("view");
    else next.set("view", nextView);
    next.delete("group");
    setQuery("");
    setActiveFinding(null);
    setMergeSourceGroup(null);
    setSearchParams(next);
  }

  async function loadMore() {
    if (view === "history" || !activeIpId || !overview?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadProductGroupPage(activeIpId, view, {
        cursor: overview.next_cursor,
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
  const showMobileInspector = Boolean(selectedGroupId && selectedGroup);
  const visibleRecentDecisions = useMemo(() => {
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

  const selectedFindings = batchFindings?.filter((finding) =>
    selectedResultIds.has(finding.result_id)
  ) ?? [];
  const inspectorFindings = useMemo(() => view === "history"
    ? visibleRecentDecisions
    : (batchFindings ?? []).filter((finding) =>
      reviewFilter === "all" || reviewBucket(finding) === reviewFilter
    ), [batchFindings, reviewFilter, view, visibleRecentDecisions]);
  const activeFindingIndex = activeFinding
    ? inspectorFindings.findIndex((finding) => finding.result_id === activeFinding.result_id)
    : -1;

  const moveActiveFinding = useCallback((direction: -1 | 1) => {
    if (!activeFinding) return;
    const adjacent = adjacentFinding(inspectorFindings, activeFinding.result_id, direction);
    if (adjacent) setActiveFinding(adjacent);
  }, [activeFinding, inspectorFindings]);

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
      if (activeFinding?.result_id === finding.result_id) setActiveFinding(null);
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
        if (selectedGroupId && batchFindings) {
          const remainingCount = removeProcessedFindings(
            batchFindings,
            processedResultIds,
          ).length;
          exactPendingCountsRef.current[selectedGroupId] = remainingCount;
          setOverview((current) => current
            ? reconcileProductAttentionOverview(current, selectedGroupId, remainingCount)
            : current);
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
    setActiveFinding(null);
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

  async function mergeSelectedProduct(target: ProductGroupMergeCandidate) {
    if (!activeIpId || !mergeSourceGroup) return;
    const source = mergeSourceGroup;
    const { decision } = await mergePersistedProductGroups(
      activeIpId,
      source.id,
      target.group_id,
    );

    let mergedGroupId = source.id;
    try {
      const mergedOverview = await getPersistedProductGroups(
        activeIpId,
        "same",
        "all",
        {
          limit: 1,
          productId: decision.canonical_product_id,
          catalogScope: "catalog",
        },
      );
      mergedGroupId = mergedOverview.groups[0]?.id ?? mergedGroupId;
    } catch {
      // The merge itself is already durable. A normal overview refresh below
      // will recover the selected product if this follow-up read is stale.
    }

    setMergeSourceGroup(null);
    setMergeNotice({
      message: `“${productName(source)}” and “${target.display_name}” are now one product. Future matching listings will use this reviewer decision.`,
      tone: "success",
      undo: {
        decisionId: decision.id,
        groupId: mergedGroupId,
        sourceGroupId: source.id,
      },
    });
    selectGroup(mergedGroupId);
    setRefreshToken((token) => token + 1);
  }

  async function undoLastProductMerge() {
    const undo = mergeNotice?.undo;
    if (!activeIpId || !undo || undoingMerge) return;
    setUndoingMerge(true);
    try {
      await revokePersistedProductGroupMerge(
        activeIpId,
        undo.groupId,
        undo.decisionId,
      );
      setMergeNotice({
        message: "Same-product decision undone. The previous product groups will be restored.",
        tone: "success",
      });
      selectGroup(undo.sourceGroupId);
      setRefreshToken((token) => token + 1);
    } catch (caught: unknown) {
      setMergeNotice({
        message: `Unable to undo the same-product decision. ${messageFor(caught)}`,
        tone: "error",
        undo,
      });
    } finally {
      setUndoingMerge(false);
    }
  }

  return (
    <div className="min-h-[calc(100dvh-3rem)] bg-[#f7f6f3] text-stone-950 lg:h-[calc(100dvh-3rem)] lg:overflow-hidden">
      <header className="border-b border-stone-200/80 bg-[#faf9f7] px-4 py-4 sm:px-6 lg:px-7">
        <div className="flex min-h-9 items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[18px] font-semibold tracking-[-0.025em] text-stone-950">
                Product Lab
              </h1>
              <span className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-500">
                Preview
              </span>
            </div>
            <p className="mt-0.5 truncate text-[12px] text-stone-500">
              {activeIp?.name ? `${activeIp.name} · ` : ""}Review what needs attention, then move on.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              to="/monitoring/products"
              className="hidden h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 sm:inline-flex"
            >
              Legacy view
            </Link>
            <button
              type="button"
              onClick={() => setRefreshToken((token) => token + 1)}
              disabled={loading || loadingHistory}
              className="grid size-8 place-items-center rounded-md text-stone-500 transition hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
              aria-label="Refresh products"
              title="Refresh products"
            >
              <RefreshCw size={14} className={loading || loadingHistory ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:h-[calc(100%-73px)] lg:grid-cols-[minmax(340px,0.82fr)_minmax(430px,1.18fr)]">
        <section className={`${showMobileInspector ? "hidden lg:flex" : "flex"} min-h-0 flex-col border-stone-200/80 bg-[#faf9f7] lg:border-r`} aria-label="Products">
          <div className="border-b border-stone-200/80 px-4 pt-3 sm:px-6 lg:px-5">
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

          <div className="border-b border-stone-200/80 p-3 sm:px-6 lg:px-4">
            <label className="relative block">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={view === "history" ? "Search recent decisions" : "Search products"}
                className="h-8 w-full rounded-md border border-stone-200 bg-white pl-8 pr-3 text-[12px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/70"
              />
            </label>
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
                  <div role="listbox" aria-label="Recent decisions">
                    {visibleRecentDecisions.map((finding) => (
                      <RecentDecisionRow
                        key={finding.result_id}
                        finding={finding}
                        selected={activeFinding?.result_id === finding.result_id}
                        undoing={undoingResultIds.has(finding.result_id)}
                        onOpen={() => setActiveFinding(finding)}
                        onUndo={() => void undoRecentDecision(finding)}
                      />
                    ))}
                  </div>
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
                onKeyDown={(event) => {
                  if (!["ArrowDown", "ArrowUp", "j", "k"].includes(event.key)) return;
                  if (navigableGroups.length === 0) return;
                  event.preventDefault();
                  const currentIndex = navigableGroups.findIndex((group) => group.id === selectedGroup?.id);
                  const direction = event.key === "ArrowDown" || event.key === "j" ? 1 : -1;
                  const nextIndex = Math.max(0, Math.min(navigableGroups.length - 1, currentIndex + direction));
                  selectGroup(navigableGroups[nextIndex].id);
                }}
              >
                {categoryTree.map((category) => (
                  <ProductCategoryBranch
                    key={category.key}
                    category={category}
                    depth={0}
                    collapsedPaths={collapsedCategoryPaths}
                    forceExpanded={Boolean(query.trim())}
                    selectedGroupId={selectedGroup?.id ?? null}
                    onToggle={toggleCategory}
                    onSelectGroup={selectGroup}
                  />
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
                  {loadingMore ? "Loading…" : "Load more"}
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
          ) : selectedGroup ? (
            <BatchWorkspace
              group={selectedGroup}
              findings={batchFindings}
              loading={loadingBatch}
              error={batchError}
              filter={reviewFilter}
              selectedResultIds={selectedResultIds}
              batchProgress={batchProgress}
              notice={batchNotice}
              onBack={() => selectGroup(null)}
              onFilterChange={(nextFilter) => {
                setReviewFilter(nextFilter);
                setSelectedResultIds(new Set());
              }}
              onToggleFinding={(resultId) => {
                setSelectedResultIds((current) => {
                  const next = new Set(current);
                  if (next.has(resultId)) next.delete(resultId);
                  else next.add(resultId);
                  return next;
                });
                setBatchNotice(null);
              }}
              onOpenFinding={setActiveFinding}
              onSetSelection={(resultIds) => setSelectedResultIds(new Set(resultIds))}
              onBatchAction={setConfirmBatchAction}
              onMergeProduct={() => setMergeSourceGroup(selectedGroup)}
              onDismissNotice={() => setBatchNotice(null)}
            />
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
          decisionReasonRequired={partitionBatch(confirmBatchAction).eligible.some(
            (finding) => finding.actionability?.key !== "send_takedown",
          )}
          onCancel={() => setConfirmBatchAction(null)}
          onConfirm={(decisionReason, associationScopes) => {
            const action = confirmBatchAction;
            setConfirmBatchAction(null);
            void runBatch(action, decisionReason, associationScopes);
          }}
        />
      )}
      {mergeSourceGroup && activeIpId && (
        <ProductMergeDialog
          key={mergeSourceGroup.id}
          ipId={activeIpId}
          sourceGroup={mergeSourceGroup}
          onClose={() => setMergeSourceGroup(null)}
          onMerge={mergeSelectedProduct}
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
          onClose={() => setActiveFinding(null)}
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
            ? `/monitoring/products/${encodeURIComponent(selectedGroup.id)}/tasks/${encodeURIComponent(activeFinding.result_id)}`
            : undefined}
        />
      )}
    </div>
  );
}

function ViewTab({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number | null | undefined;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative h-9 shrink-0 text-[12px] font-medium transition ${
        active ? "text-stone-950" : "text-stone-500 hover:text-stone-800"
      }`}
    >
      <span>{label}</span>
      {count != null && (
        <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[9px] ${
          active ? "bg-stone-200/70 text-stone-700" : "bg-stone-100 text-stone-400"
        }`}>
          {count}
        </span>
      )}
      {active && <span className="absolute inset-x-0 bottom-0 h-px bg-stone-950" />}
    </button>
  );
}

function ProductCategoryBranch({
  category,
  depth,
  collapsedPaths,
  forceExpanded,
  selectedGroupId,
  onToggle,
  onSelectGroup,
}: {
  category: ProductCategoryNode;
  depth: number;
  collapsedPaths: Set<string>;
  forceExpanded: boolean;
  selectedGroupId: string | null;
  onToggle: (path: string) => void;
  onSelectGroup: (groupId: string) => void;
}) {
  const collapsed = !forceExpanded && collapsedPaths.has(category.path);
  const headerTone = depth === 0
    ? "sticky top-0 z-10 bg-[#f0eeea]/95 font-semibold text-stone-700 backdrop-blur"
    : "bg-[#faf9f7] font-medium text-stone-600";
  const indent = 16 + Math.min(depth, 5) * 14;

  return (
    <div role="group" aria-label={category.path}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => {
          if (!forceExpanded) onToggle(category.path);
        }}
        className={`flex w-full items-center gap-2 border-b border-stone-200/80 py-2 pr-4 text-left text-[10px] transition hover:bg-stone-100 ${headerTone}`}
        style={{ paddingLeft: indent }}
        title={category.path}
      >
        {collapsed ? (
          <ChevronRight size={12} className="shrink-0 text-stone-400" />
        ) : (
          <ChevronDown size={12} className="shrink-0 text-stone-400" />
        )}
        <span className={`min-w-0 flex-1 truncate ${depth === 0 ? "uppercase tracking-[0.07em]" : ""}`}>
          {category.label}
        </span>
        <span className="shrink-0 rounded bg-stone-200/70 px-1.5 py-0.5 text-[9px] font-medium text-stone-500">
          {category.groupCount}
        </span>
      </button>

      {!collapsed && (
        <>
          {category.groups.map(({ group, index }) => (
            <ProductRow
              key={group.id}
              group={group}
              index={index}
              depth={depth + 1}
              selected={selectedGroupId === group.id}
              onSelect={() => onSelectGroup(group.id)}
            />
          ))}
          {category.children.map((child) => (
            <ProductCategoryBranch
              key={child.key}
              category={child}
              depth={depth + 1}
              collapsedPaths={collapsedPaths}
              forceExpanded={forceExpanded}
              selectedGroupId={selectedGroupId}
              onToggle={onToggle}
              onSelectGroup={onSelectGroup}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ProductRow({
  group,
  index,
  depth = 0,
  selected,
  onSelect,
}: {
  group: PersistedProductGroup;
  index: number;
  depth?: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const image = representativeImage(group);
  const status = productStatus(group);
  const offers = offerCount(group);
  const prices = priceRange(group);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={`group flex w-full items-center gap-3 border-b border-stone-200/70 px-4 py-3 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-400 sm:px-6 lg:px-4 ${
        selected ? "bg-stone-100/90" : "bg-transparent hover:bg-stone-50"
      }`}
      style={{ paddingLeft: 16 + Math.min(depth, 5) * 14 }}
    >
      <div className="size-12 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full place-items-center text-[14px] font-semibold text-stone-400">
            {productName(group, index).slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em] text-stone-900">
            {productName(group, index)}
          </h2>
          <ChevronRight
            size={14}
            className={`shrink-0 transition ${selected ? "text-stone-600" : "text-stone-300 group-hover:text-stone-500"}`}
            aria-hidden="true"
          />
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-stone-500">
          <span className={`inline-flex min-w-0 items-center gap-1.5 font-medium ${status.textClass}`}>
            <span className={`size-1.5 shrink-0 rounded-full ${status.dotClass}`} />
            <span className="truncate">{status.label}</span>
          </span>
          <span className="text-stone-300">·</span>
          <span className="truncate">{offers} {offers === 1 ? "offer" : "offers"}</span>
          {prices && (
            <span className="hidden items-center gap-2 sm:inline-flex">
              <span className="text-stone-300">·</span>
              <span className="truncate font-mono text-[9px] text-stone-600">{prices}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ProductMergeDialog({
  ipId,
  sourceGroup,
  onClose,
  onMerge,
}: {
  ipId: string;
  sourceGroup: PersistedProductGroup;
  onClose: () => void;
  onMerge: (target: ProductGroupMergeCandidate) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ProductGroupMergeCandidate[]>([]);
  const [selected, setSelected] = useState<ProductGroupMergeCandidate | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) return;

    const controller = new AbortController();
    let alive = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      void searchPersistedProductGroupMergeCandidates(
        ipId,
        sourceGroup.id,
        trimmedQuery,
        controller.signal,
      )
        .then(({ candidates: matches }) => {
          if (alive) setCandidates(matches);
        })
        .catch((caught: unknown) => {
          if (!alive || controller.signal.aborted) return;
          setCandidates([]);
          setSearchError(messageFor(caught));
        })
        .finally(() => {
          if (alive) setSearching(false);
        });
    }, 250);

    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [ipId, query, sourceGroup.id]);

  async function submitMerge() {
    if (!selected || saving) return;
    setSaving(true);
    setSubmitError(null);
    try {
      await onMerge(selected);
    } catch (caught: unknown) {
      setSubmitError(messageFor(caught));
      setSaving(false);
    }
  }

  const sourceImage = representativeImage(sourceGroup);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="same-product-dialog-title"
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-violet-700">
              Same-product decision
            </p>
            <h2 id="same-product-dialog-title" className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-950">
              Mark another product as the same
            </h2>
            <p className="mt-1 max-w-xl text-[11px] leading-5 text-stone-500">
              Choose the matching product. Product Lab will keep every listing, combine both identities, and use your decision when grouping future matches.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close same-product dialog"
            disabled={saving}
            onClick={onClose}
            className="grid size-8 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-stone-400">
            Selected product
          </p>
          <div className="mt-2 flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-white">
              {sourceImage ? (
                <img src={sourceImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="grid h-full place-items-center text-sm font-semibold text-stone-400">
                  {productName(sourceGroup).slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-stone-950">
                {productName(sourceGroup)}
              </p>
              <p className="mt-1 text-[10px] text-stone-500">
                {offerCount(sourceGroup)} {offerCount(sourceGroup) === 1 ? "offer" : "offers"}
                {sourceGroup.catalog_primary_category_name
                  ? ` · ${sourceGroup.catalog_primary_category_name}`
                  : ""}
              </p>
            </div>
          </div>

          <label htmlFor="same-product-search" className="mt-5 block text-[10px] font-semibold text-stone-700">
            Find the matching product
          </label>
          <div className="relative mt-2">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
              aria-hidden="true"
            />
            <input
              id="same-product-search"
              type="search"
              autoFocus
              value={query}
              disabled={saving}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                setCandidates([]);
                setSearching(nextQuery.trim().length >= 2);
                setSearchError(null);
                setSelected(null);
                setSubmitError(null);
              }}
              placeholder="Search product names, categories, or offer titles"
              aria-controls="same-product-candidates"
              aria-expanded={candidates.length > 0}
              className="h-10 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 text-[12px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
            />
          </div>

          <div className="mt-2 min-h-5" aria-live="polite">
            {searching ? (
              <p className="inline-flex items-center gap-1.5 text-[10px] text-stone-500">
                <LoaderCircle size={11} className="animate-spin" />
                Searching the full product catalog…
              </p>
            ) : searchError ? (
              <p className="text-[10px] text-red-700">{searchError}</p>
            ) : query.trim().length > 0 && query.trim().length < 2 ? (
              <p className="text-[10px] text-stone-400">Type at least two characters.</p>
            ) : query.trim().length >= 2 && candidates.length === 0 ? (
              <p className="text-[10px] text-stone-500">No other products match that search.</p>
            ) : null}
          </div>

          {candidates.length > 0 && (
            <div
              id="same-product-candidates"
              role="listbox"
              aria-label="Matching products"
              className="mt-1 overflow-hidden rounded-xl border border-stone-200"
            >
              {candidates.map((candidate) => {
                const isSelected = selected?.group_id === candidate.group_id;
                return (
                  <button
                    key={candidate.group_id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={saving}
                    onClick={() => {
                      setSelected(candidate);
                      setSubmitError(null);
                    }}
                    className={`flex w-full items-start gap-3 border-b border-stone-200 px-3 py-3 text-left transition last:border-b-0 disabled:opacity-50 ${
                      isSelected
                        ? "bg-violet-50 ring-1 ring-inset ring-violet-300"
                        : "bg-white hover:bg-stone-50"
                    }`}
                  >
                    <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                      isSelected
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-stone-300 bg-white text-transparent"
                    }`}>
                      <Check size={11} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-semibold text-stone-900">
                        {candidate.display_name}
                      </span>
                      <span className="mt-1 block text-[10px] text-stone-500">
                        {candidate.member_count} {candidate.member_count === 1 ? "listing" : "listings"}
                        {candidate.category_name ? ` · ${candidate.category_name}` : ""}
                        {candidate.confirmation_status === "confirmed" ? " · Confirmed" : ""}
                      </span>
                      {candidate.representative_listing_title && (
                        <span className="mt-1 block truncate text-[9px] text-stone-400">
                          Example: {candidate.representative_listing_title}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-[10px] leading-4 text-violet-900">
              “{productName(sourceGroup)}” and “{selected.display_name}” will become one durable product identity. Listing review decisions, prices, and variants remain unchanged.
            </div>
          )}
          {submitError && (
            <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] leading-4 text-red-800">
              {submitError}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-stone-200 bg-stone-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="max-w-md text-[9px] leading-4 text-stone-500">
            This is reversible. If the products cross an active Different product correction, Product Lab will leave them separate and explain why.
          </p>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-9 rounded-lg px-3 text-[11px] font-medium text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected || saving}
              onClick={() => void submitMerge()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 text-[11px] font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? <LoaderCircle size={12} className="animate-spin" /> : <Link2 size={12} />}
              {saving ? "Combining…" : "Mark as same product"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function recentDecisionPresentation(finding: IpReviewFinding) {
  const kind = recentDecisionKind(finding);
  if (kind === "dismissed") {
    const labels: Record<string, string> = {
      false_positive: "Different product",
      do_not_pursue: "Marked OK",
      second_hand: "Second hand",
      resale: "Second hand",
      licensed: "Licensed seller",
      allowed_product: "Allowed product",
      manual_cleared: "Cleared",
    };
    return {
      label: labels[finding.dismissal_reason ?? ""] ?? "Cleared",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      undoLabel: "Undo",
    };
  }
  if (kind === "review") return {
    label: "Needs review",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
    undoLabel: "Undo",
  };
  if (kind === "takedown_pending") return {
    label: "Takedown queued",
    badge: "border-red-200 bg-red-50 text-red-800",
    undoLabel: "Undo",
  };
  if (kind === "takedown_sent") return {
    label: "Takedown sent",
    badge: "border-red-200 bg-red-50 text-red-800",
    undoLabel: "Reopen",
  };
  return {
    label: "Enforced",
    badge: "border-stone-300 bg-stone-100 text-stone-700",
    undoLabel: "Reopen",
  };
}

function decisionTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function RecentDecisionRow({
  finding,
  selected,
  undoing,
  onOpen,
  onUndo,
}: {
  finding: IpReviewFinding;
  selected: boolean;
  undoing: boolean;
  onOpen: () => void;
  onUndo: () => void;
}) {
  const presentation = recentDecisionPresentation(finding);
  const canUndo = recentDecisionCanUndo(finding);
  const title = finding.listing_title?.trim() || "Untitled listing";
  return (
    <div
      role="option"
      aria-selected={selected}
      className={`flex items-center gap-2 border-b border-stone-200/70 px-4 py-3 sm:px-6 lg:px-4 ${
        selected ? "bg-stone-100/90" : "hover:bg-stone-50"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
      >
        <div className="size-12 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
          {finding.image_url ? (
            <img src={finding.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <span className="grid h-full place-items-center text-[14px] font-semibold text-stone-400">
              {title.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-medium tracking-[-0.01em] text-stone-900">
            {title}
          </h2>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-stone-400">
            <span className={`shrink-0 rounded border px-1.5 py-0.5 font-medium ${presentation.badge}`}>
              {presentation.label}
            </span>
            <span className="truncate">{findingPlatformLabel(finding)}</span>
            <span>·</span>
            <span className="shrink-0">{decisionTime(recentDecisionTimestamp(finding))}</span>
          </div>
        </div>
      </button>
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoing}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-950 disabled:opacity-50"
        >
          {undoing ? <LoaderCircle size={11} className="animate-spin" /> : <RotateCcw size={11} />}
          {undoing ? "Undoing…" : presentation.undoLabel}
        </button>
      )}
    </div>
  );
}

const REVIEW_BUCKETS: Array<{
  key: ReviewBucket;
  label: string;
  badge: string;
}> = [
  { key: "all", label: "All", badge: "border-stone-200 bg-white text-stone-600" },
  { key: "takedown", label: "Takedown", badge: "border-red-200 bg-red-50 text-red-800" },
  { key: "second_hand", label: "Second hand", badge: "border-violet-200 bg-violet-50 text-violet-800" },
  { key: "might_be_ok", label: "Likely OK", badge: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  { key: "needs_review", label: "Review", badge: "border-amber-200 bg-amber-50 text-amber-800" },
];

function BatchWorkspace({
  group,
  findings,
  loading,
  error,
  filter,
  selectedResultIds,
  batchProgress,
  notice,
  onBack,
  onFilterChange,
  onToggleFinding,
  onOpenFinding,
  onSetSelection,
  onBatchAction,
  onMergeProduct,
  onDismissNotice,
}: {
  group: PersistedProductGroup;
  findings: IpReviewFinding[] | null;
  loading: boolean;
  error: string | null;
  filter: ReviewBucket;
  selectedResultIds: Set<string>;
  batchProgress: { done: number; total: number } | null;
  notice: string | null;
  onBack: () => void;
  onFilterChange: (filter: ReviewBucket) => void;
  onToggleFinding: (resultId: string) => void;
  onOpenFinding: (finding: IpReviewFinding) => void;
  onSetSelection: (resultIds: string[]) => void;
  onBatchAction: (action: ProductLabBatchAction) => void;
  onMergeProduct: () => void;
  onDismissNotice: () => void;
}) {
  const status = productStatus(group);
  const counts = new Map<ReviewBucket, number>([["all", findings?.length ?? 0]]);
  for (const finding of findings ?? []) {
    const bucket = reviewBucket(finding);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const visibleFindings = (findings ?? []).filter((finding) =>
    filter === "all" || reviewBucket(finding) === filter
  );
  const visibleResultIds = visibleFindings.map((finding) => finding.result_id);
  const selectedVisibleCount = visibleFindings.filter((finding) =>
    selectedResultIds.has(finding.result_id)
  ).length;
  const allVisibleSelected = visibleFindings.length > 0 &&
    selectedVisibleCount === visibleFindings.length;
  const selectedFindings = (findings ?? []).filter((finding) =>
    selectedResultIds.has(finding.result_id)
  );
  const recommendedAction = recommendedBatchActionForSelection(selectedFindings);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1040px] flex-col">
      <div className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-7">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-800 lg:hidden"
        >
          <ArrowLeft size={14} />
          Product groups
        </button>
        <div className="flex items-start gap-3">
          <div className="size-14 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100 sm:size-16">
          {representativeImage(group) ? (
            <img src={representativeImage(group)!} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="grid h-full place-items-center text-[18px] font-semibold text-stone-400">
              {productName(group).slice(0, 1).toUpperCase()}
            </span>
          )}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 text-[10px] font-medium ${status.textClass}`}>
              <span className={`size-1.5 rounded-full ${status.dotClass}`} />
              {status.label}
            </div>
            <h2 className="mt-1 truncate text-[18px] font-semibold tracking-[-0.025em] text-stone-950 sm:text-[20px]">
              {productName(group)}
            </h2>
            <p className="mt-1 text-[10px] text-stone-500">
              {findings?.length ?? group.triage_member_count ?? 0} listings in this batch
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onMergeProduct}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[10px] font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <Link2 size={12} />
              Same product
            </button>
            <Link
              to={`/monitoring/products/${encodeURIComponent(group.id)}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-200 px-2.5 text-[10px] font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800"
            >
              Settings
              <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </div>

      <div className="border-b border-stone-200 bg-[#faf9f7] px-4 py-3 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Listing recommendations">
            {REVIEW_BUCKETS.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                role="tab"
                aria-selected={filter === bucket.key}
                onClick={() => onFilterChange(bucket.key)}
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium transition ${
                  filter === bucket.key
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                {bucket.label}
                <span className={filter === bucket.key ? "text-stone-300" : "text-stone-400"}>
                  {counts.get(bucket.key) ?? 0}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={visibleFindings.length === 0 || Boolean(batchProgress)}
            onClick={() => onSetSelection(allVisibleSelected ? [] : visibleResultIds)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-medium text-stone-600 hover:border-stone-300 hover:text-stone-900 disabled:opacity-40"
          >
            {allVisibleSelected ? <CheckSquare2 size={13} /> : <Square size={13} />}
            {allVisibleSelected ? "Clear" : "Select all"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-700 sm:mx-7">
          <span>{notice}</span>
          <button type="button" onClick={onDismissNotice} className="shrink-0 font-medium text-stone-400 hover:text-stone-800">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 px-4 py-4 sm:px-7">
        {error && findings == null ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</div>
        ) : loading && findings == null ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <LoaderCircle size={18} className="mx-auto animate-spin text-stone-400" />
              <p className="mt-2 text-[11px] text-stone-500">Loading the full batch…</p>
            </div>
          </div>
        ) : visibleFindings.length === 0 ? (
          <QuietState
            icon={<Check size={18} />}
            title={filter === "all" ? "Batch complete" : "Nothing in this category"}
            detail={filter === "all"
              ? "There are no pending listings left in this product group."
              : "Choose another recommendation to keep processing."}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFindings.map((finding) => (
              <BatchListingCard
                key={finding.result_id}
                finding={finding}
                selected={selectedResultIds.has(finding.result_id)}
                disabled={Boolean(batchProgress)}
                onToggle={() => onToggleFinding(finding.result_id)}
                onOpen={() => onOpenFinding(finding)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedResultIds.size > 0 && (
        <div className="sticky bottom-0 z-20 border-t border-stone-200 bg-white/95 px-4 py-3 shadow-[0_-12px_28px_-24px_rgba(28,25,23,0.8)] backdrop-blur sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-stone-900">{selectedResultIds.size} selected</p>
              <p className="text-[9px] text-stone-400">One decision applies to the whole selection.</p>
            </div>
            {batchProgress ? (
              <span className="inline-flex items-center gap-2 text-[11px] text-stone-500">
                <LoaderCircle size={13} className="animate-spin" />
                Processing {batchProgress.done}/{batchProgress.total}
              </span>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                <BatchDecisionButton label="Takedown" primary={recommendedAction === "send"} onClick={() => onBatchAction("send")} />
                <BatchDecisionButton label="Different product" primary={recommendedAction === "false_positive"} onClick={() => onBatchAction("false_positive")} />
                <BatchDecisionButton label="Second hand" primary={recommendedAction === "second_hand"} onClick={() => onBatchAction("second_hand")} />
                <BatchDecisionButton label="Mark as OK" onClick={() => onBatchAction("do_not_pursue")} />
                <BatchDecisionButton label="Needs review" primary={recommendedAction === "review"} onClick={() => onBatchAction("review")} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BatchListingCard({
  finding,
  selected,
  disabled,
  onToggle,
  onOpen,
}: {
  finding: IpReviewFinding;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const bucket = reviewBucket(finding);
  const bucketMeta = REVIEW_BUCKETS.find((candidate) => candidate.key === bucket)!;
  const price = finding.price_value_usd != null
    ? formatMoney(finding.price_value_usd, "USD")
    : finding.price || "Price unavailable";

  return (
    <article className={`group relative overflow-hidden rounded-md border bg-white transition ${
      selected ? "border-stone-900 ring-1 ring-stone-900" : "border-stone-200 hover:border-stone-300"
    }`}>
      <button
        type="button"
        disabled={disabled}
        onClick={onOpen}
        className="absolute inset-0 z-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-stone-500 disabled:cursor-wait"
      >
        <span className="sr-only">Open {finding.listing_title ?? "listing"}</span>
      </button>
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {finding.image_url ? (
          <img src={finding.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full place-items-center text-[10px] text-stone-400">No image</span>
        )}
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${selected ? "Deselect" : "Select"} ${finding.listing_title ?? "listing"}`}
          disabled={disabled}
          onClick={onToggle}
          className={`absolute left-2 top-2 z-20 grid size-7 place-items-center rounded-md border shadow-sm transition ${
          selected ? "border-stone-900 bg-stone-900 text-white" : "border-white/80 bg-white/95 text-stone-400"
        }`}
        >
          {selected ? <Check size={15} strokeWidth={3} /> : <Square size={14} />}
        </button>
        {finding.assigned_to_account_id && (
          <span className="pointer-events-none absolute right-2 top-2 z-20">
            <AssigneeAvatar
              accountId={finding.assigned_to_account_id}
              displayName={finding.assignee_display_name}
              email={finding.assignee_email}
              pictureUrl={finding.assignee_picture_url}
              size={24}
            />
          </span>
        )}
        <span className={`absolute bottom-2 left-2 rounded border px-1.5 py-0.5 text-[8px] font-semibold ${bucketMeta.badge}`}>
          {bucketMeta.label}
        </span>
      </div>
      <div className="p-2.5">
        <h3 className="line-clamp-2 min-h-8 text-[11px] font-medium leading-4 text-stone-800">
          {finding.listing_title || "Untitled listing"}
        </h3>
        <div className="mt-2 flex items-center justify-between gap-2 text-[9px] text-stone-400">
          <div className="flex min-w-0 items-center gap-1.5">
            {finding.seller_name && <span className="truncate">{finding.seller_name}</span>}
            <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-medium text-stone-600">
              {findingPlatformLabel(finding)}
            </span>
          </div>
          <span className="shrink-0 font-mono font-medium text-stone-600">{price}</span>
        </div>
        <p className="mt-2 text-[9px] font-medium text-stone-400 group-hover:text-stone-700">
          Open details
        </p>
      </div>
    </article>
  );
}

function BatchDecisionButton({
  label,
  primary = false,
  onClick,
}: {
  label: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={primary ? `Recommended action: ${label}` : undefined}
      data-recommended-action={primary ? "Recommended" : undefined}
      className={`h-8 rounded-md px-2.5 text-[10px] font-semibold transition ${
        primary
          ? "bg-stone-950 text-white hover:bg-stone-800"
          : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
      }`}
    >
      {label}
    </button>
  );
}

function QuietState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <div className="px-8 py-16 text-center">
      <span className="mx-auto grid size-9 place-items-center rounded-full border border-stone-200 bg-white text-stone-400">
        {icon}
      </span>
      <h2 className="mt-3 text-[13px] font-medium text-stone-800">{title}</h2>
      <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-4 text-stone-400">{detail}</p>
    </div>
  );
}

function QueueSkeleton() {
  return (
    <div aria-label="Loading products" className="animate-pulse">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-stone-200/70 px-4 py-3 sm:px-6 lg:px-4">
          <div className="size-12 rounded-md bg-stone-200/70" />
          <div className="min-w-0 flex-1">
            <div className="h-2.5 w-2/3 rounded bg-stone-200/80" />
            <div className="mt-2 h-2 w-1/2 rounded bg-stone-200/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
