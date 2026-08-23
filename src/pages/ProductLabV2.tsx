import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
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
  undismissIpFinding,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type PersistedProductGroup,
  type PersistedProductGroupOverview,
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
  sortRecentDecisions,
  type ProductLabBatchAction,
} from "./productLabV2Utils";

type ProductLabView = "attention" | "history" | "all";
type ReviewBucket =
  | "all"
  | "takedown"
  | "second_hand"
  | "different_product"
  | "licensed"
  | "needs_review";
const PAGE_SIZE = 24;

type ProductMergeNotice = {
  message: string;
  tone: "success" | "error";
  undo?: {
    decisions: Array<{
      decisionId: string;
      canonicalProductId: string;
    }>;
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
    query?: string | null;
    allProducts?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  const { allProducts = false, ...requestOptions } = options;
  return getPersistedProductGroups(
    ipId,
    "same",
    view === "attention" && !allProducts ? "triage" : "all",
    { limit: PAGE_SIZE, ...requestOptions },
  );
}

async function loadCanonicalProductGroup(
  ipId: string,
  canonicalProductId: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const overview = await getPersistedProductGroups(
        ipId,
        "same",
        "all",
        {
          limit: 1,
          productId: canonicalProductId,
          catalogScope: "catalog",
        },
      );
      const group = overview.groups[0];
      if (group) return group;
    } catch (caught: unknown) {
      lastError = caught;
    }
    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  throw new Error("The merged product is still being prepared. Refresh and try again.");
}

function reviewBucket(finding: IpReviewFinding): Exclude<ReviewBucket, "all"> {
  const key = finding.actionability?.key;
  if (key === "send_takedown") return "takedown";
  if (key === "allowed_resale") return "second_hand";
  if (key === "licensed_seller") return "licensed";
  if (key === "false_positive") return "different_product";
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

const RECENT_DECISION_STATUSES = [
  "dismissed",
  "review",
  "takedown_pending",
  "takedown_sent",
  "enforced",
] as const;
type RecentDecisionStatus = typeof RECENT_DECISION_STATUSES[number];
type RecentDecisionCursors = Record<RecentDecisionStatus, string | null>;

function mergeRecentDecisions(
  current: IpReviewFinding[],
  incoming: IpReviewFinding[],
) {
  const byResultId = new Map(current.map((finding) => [finding.result_id, finding]));
  for (const finding of incoming) {
    const existing = byResultId.get(finding.result_id);
    if (
      !existing ||
      Date.parse(recentDecisionTimestamp(finding)) >
        Date.parse(recentDecisionTimestamp(existing))
    ) byResultId.set(finding.result_id, finding);
  }
  return sortRecentDecisions([...byResultId.values()]);
}

async function loadRecentDecisionPages(
  ipId: string,
  cursors?: RecentDecisionCursors,
  signal?: AbortSignal,
) {
  const statuses = RECENT_DECISION_STATUSES.filter((status) =>
    cursors === undefined || Boolean(cursors[status])
  );
  const pages = await Promise.all(statuses.map((status) =>
    listMonitoringFindingsGlobal({
      ip_id: ipId,
      status,
      show_dismissed: status === "dismissed",
      sort: "updated_desc",
      limit: 50,
      cursor: cursors?.[status] ?? null,
      signal,
    })
  ));
  const nextCursors = Object.fromEntries(
    RECENT_DECISION_STATUSES.map((status) => [status, null]),
  ) as RecentDecisionCursors;
  if (cursors) Object.assign(nextCursors, cursors);
  statuses.forEach((status, index) => {
    nextCursors[status] = pages[index].next_cursor;
  });
  return {
    findings: mergeRecentDecisions([], pages.flatMap((page) => page.findings)),
    cursors: nextCursors,
  };
}

export default function ProductLabV2() {
  const { actingTenantId } = useAuth();
  const { activeIpId, activeIp, loading: loadingIp } = useActiveIp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [overview, setOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [scopeAvailable, setScopeAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
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
  const optimisticallyProcessedIdsRef = useRef<Set<string>>(new Set());

  const requestedView = searchParams.get("view");
  const view: ProductLabView = requestedView === "all" || requestedView === "history"
    ? requestedView
    : "attention";
  const selectedGroupId = searchParams.get("group");

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
    setSearchParams(next);
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
    setBackgroundLoading(false);
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
        setLoading(false);

        if (view !== "attention" || mergeSourceGroup || !accumulated.next_cursor) return;
        setBackgroundLoading(true);
        const seenCursors = new Set<string>();
        while (alive && accumulated.next_cursor) {
          const cursor = accumulated.next_cursor;
          if (seenCursors.has(cursor)) break;
          seenCursors.add(cursor);
          const next = await loadProductGroupPage(activeIpId, view, {
            cursor,
            query: debouncedProductQuery || null,
            allProducts: Boolean(mergeSourceGroup),
            signal: controller.signal,
          });
          if (!alive) return;
          accumulated = appendPage(accumulated, next);
          setOverview(accumulated);
        }
      } catch (caught: unknown) {
        if (!alive || controller.signal.aborted) return;
        setError(messageFor(caught));
      } finally {
        if (alive) {
          setLoading(false);
          setBackgroundLoading(false);
        }
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
  const mergeTargetGroups = useMemo(() => (overview?.groups ?? []).filter(
    (group) => mergeTargetGroupIds.has(group.id),
  ), [mergeTargetGroupIds, overview]);
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
  const showMobileInspector = Boolean(selectedGroupId && selectedGroup && !mergeSourceGroup);
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
                      : "Search products needing attention"}
                className="h-8 w-full rounded-md border border-stone-200 bg-white pl-8 pr-3 text-[12px] text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-400 focus:ring-2 focus:ring-stone-200/70"
              />
            </label>
            {view !== "history" && backgroundLoading && overview && (
              <div className="mt-2" role="status" aria-live="polite">
                <div className="flex items-center justify-between gap-3 text-[10px] text-stone-500">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <LoaderCircle size={11} className="shrink-0 animate-spin" aria-hidden="true" />
                    <span className="truncate">
                      Loading the complete {query.trim() ? "matching " : ""}product list
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {overview.groups.length} / {overview.pagination_group_count}
                  </span>
                </div>
                <progress
                  value={overview.groups.length}
                  max={Math.max(overview.pagination_group_count, overview.groups.length, 1)}
                  className="mt-1 h-1 w-full accent-stone-700"
                />
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
                          onOpen={() => setActiveFinding(finding)}
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
                {categoryTree.map((category) => (
                  <ProductCategoryBranch
                    key={category.key}
                    category={category}
                    depth={0}
                    collapsedPaths={collapsedCategoryPaths}
                    forceExpanded={Boolean(query.trim())}
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
              selectingSameProduct={Boolean(mergeSourceGroup)}
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
              onBatchAction={setConfirmBatchAction}
              onMergeProduct={() => beginProductMergeSelection(selectedGroup)}
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
  mergeSourceGroupId,
  mergeTargetGroupIds,
  mergeDisabled,
  onToggle,
  onSelectGroup,
  onToggleMergeGroup,
}: {
  category: ProductCategoryNode;
  depth: number;
  collapsedPaths: Set<string>;
  forceExpanded: boolean;
  selectedGroupId: string | null;
  mergeSourceGroupId: string | null;
  mergeTargetGroupIds: Set<string>;
  mergeDisabled: boolean;
  onToggle: (path: string) => void;
  onSelectGroup: (groupId: string) => void;
  onToggleMergeGroup: (groupId: string) => void;
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
              mergeState={mergeSourceGroupId
                ? mergeSourceGroupId === group.id
                  ? "source"
                  : mergeTargetGroupIds.has(group.id)
                    ? "selected"
                    : "available"
                : null}
              mergeDisabled={mergeDisabled}
              onSelect={() => onSelectGroup(group.id)}
              onToggleMerge={() => onToggleMergeGroup(group.id)}
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
              mergeSourceGroupId={mergeSourceGroupId}
              mergeTargetGroupIds={mergeTargetGroupIds}
              mergeDisabled={mergeDisabled}
              onToggle={onToggle}
              onSelectGroup={onSelectGroup}
              onToggleMergeGroup={onToggleMergeGroup}
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
  mergeState,
  mergeDisabled,
  onSelect,
  onToggleMerge,
}: {
  group: PersistedProductGroup;
  index: number;
  depth?: number;
  selected: boolean;
  mergeState: "source" | "selected" | "available" | null;
  mergeDisabled: boolean;
  onSelect: () => void;
  onToggleMerge: () => void;
}) {
  const image = representativeImage(group);
  const status = productStatus(group);
  const offers = offerCount(group);
  const prices = priceRange(group);
  const mergeSelected = mergeState === "source" || mergeState === "selected";
  const rowSelected = mergeState ? mergeSelected : selected;
  const rowTone = mergeState === "source"
    ? "bg-violet-100/90 ring-1 ring-inset ring-violet-300"
    : mergeState === "selected"
      ? "bg-violet-50 ring-1 ring-inset ring-violet-200"
      : mergeState === "available"
        ? "bg-transparent hover:bg-violet-50/70"
        : selected
          ? "bg-stone-100/90"
          : "bg-transparent hover:bg-stone-50";

  return (
    <button
      type="button"
      role="option"
      aria-selected={rowSelected}
      aria-disabled={mergeState === "source" || mergeDisabled || undefined}
      disabled={mergeDisabled}
      onClick={mergeState ? onToggleMerge : onSelect}
      className={`group flex w-full items-center gap-3 border-b border-stone-200/70 px-4 py-3 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-wait disabled:opacity-60 sm:px-6 lg:px-4 ${
        mergeState ? "focus-visible:ring-violet-400" : "focus-visible:ring-stone-400"
      } ${rowTone}`}
      style={{ paddingLeft: 16 + Math.min(depth, 5) * 14 }}
    >
      {mergeState && (
        <span className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${
          mergeSelected
            ? "border-violet-700 bg-violet-700 text-white"
            : "border-stone-300 bg-white text-transparent group-hover:border-violet-400"
        }`} aria-hidden="true">
          <Check size={11} />
        </span>
      )}
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
          {mergeState === "source" ? (
            <span className="shrink-0 rounded bg-violet-700 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              Starting product
            </span>
          ) : mergeState === "selected" ? (
            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-800">
              Same product
            </span>
          ) : mergeState ? null : (
            <ChevronRight
              size={14}
              className={`shrink-0 transition ${selected ? "text-stone-600" : "text-stone-300 group-hover:text-stone-500"}`}
              aria-hidden="true"
            />
          )}
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

function decisionExactTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
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
  const decisionAuthor = finding.decision_by_display_name?.trim() ||
    finding.decision_by_email?.trim() || null;
  const decisionReason = finding.decision_reason?.trim() || null;
  const decisionBatchSize = Math.max(1, finding.decision_batch_size ?? 1);
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
            <span
              className="shrink-0"
              title={decisionTime(recentDecisionTimestamp(finding))}
            >
              {decisionExactTime(recentDecisionTimestamp(finding))}
            </span>
          </div>
          {(decisionAuthor || decisionReason || decisionBatchSize > 1) && (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px] text-stone-500">
              {finding.decision_by_account_id && (
                <AssigneeAvatar
                  accountId={finding.decision_by_account_id}
                  displayName={finding.decision_by_display_name}
                  email={finding.decision_by_email}
                  pictureUrl={finding.decision_by_picture_url}
                  size={16}
                />
              )}
              <span className="shrink-0">{decisionAuthor ?? "Legacy or system action"}</span>
              {decisionBatchSize > 1 && (
                <span className="shrink-0 rounded bg-stone-100 px-1 py-0.5">
                  Batch of {decisionBatchSize}
                </span>
              )}
              {decisionReason && (
                <span className="truncate" title={decisionReason}>· {decisionReason}</span>
              )}
            </div>
          )}
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
  { key: "different_product", label: "Different product", badge: "border-sky-200 bg-sky-50 text-sky-800" },
  { key: "licensed", label: "Licensed seller", badge: "border-emerald-200 bg-emerald-50 text-emerald-800" },
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
  selectingSameProduct,
  onBack,
  onFilterChange,
  onToggleFinding,
  onOpenFinding,
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
  selectingSameProduct: boolean;
  onBack: () => void;
  onFilterChange: (filter: ReviewBucket) => void;
  onToggleFinding: (resultId: string) => void;
  onOpenFinding: (finding: IpReviewFinding) => void;
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
              disabled={selectingSameProduct}
              onClick={onMergeProduct}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[10px] font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-default disabled:border-violet-300 disabled:bg-violet-100"
            >
              <Link2 size={12} />
              {selectingSameProduct ? "Selecting in list" : "Same product"}
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
          <span className="shrink-0 text-[10px] text-stone-500">
            Select reviewed cards individually
          </span>
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
              <p className="text-[11px] font-semibold text-stone-900">{selectedResultIds.size} manually selected</p>
              <p className="text-[9px] text-stone-400">Only cards you selected will be changed.</p>
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
      className={`inline-flex h-8 items-center rounded-md px-2.5 text-[10px] font-semibold transition ${
        primary
          ? "bg-stone-950 text-white hover:bg-stone-800"
          : "border border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900"
      }`}
    >
      {primary && (
        <span className="mr-1 rounded bg-white/15 px-1 py-0.5 text-[8px] uppercase tracking-wide">
          Recommended
        </span>
      )}
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
