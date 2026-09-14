import type {
  PersistedProductGroup,
  PersistedProductGroupOverview,
  ProductGroupCommercialSubgroup,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { formatMoney } from "../../components/monitoring/board/utils";
import { recentDecisionKind, recentDecisionTimestamp, sortRecentDecisions } from "./reviewDecisions";

export type ProductLabView = "attention" | "history" | "all";
export type ReviewBucket =
  | "all"
  | "takedown"
  | "second_hand"
  | "different_product"
  | "licensed"
  | "needs_review";
export const PAGE_SIZE = 24;

export type ProductMergeNotice = {
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

export type ProductCategoryNode = {
  key: string;
  label: string;
  path: string;
  groups: CategorizedProduct[];
  children: ProductCategoryNode[];
  groupCount: number;
};

export function buildProductCategoryTree(groups: PersistedProductGroup[]): ProductCategoryNode[] {
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
      .map(finalize);
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
    .map(finalize);
}

export function expandedCategoryGroups(
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

export function messageFor(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function productName(group: PersistedProductGroup, index?: number) {
  const representative = group.members[0] ?? group.triage_members[0] ?? null;
  const title = representative?.listing_title?.trim();
  const profileTitle = representative?.profile_text
    .split("\n")[0]
    ?.replace(/^Title:\s*/i, "")
    .trim();
  return group.display_name?.trim() || title || profileTitle ||
    (index == null ? "Untitled product" : `Product ${index + 1}`);
}

export function representativeImage(group: PersistedProductGroup) {
  return (group.members[0] ?? group.triage_members[0] ?? null)?.image_url ?? null;
}

export function commercialReviewLaneLabel(subgroup: ProductGroupCommercialSubgroup) {
  if (subgroup.price_band === "unusually_low") {
    return `${subgroup.variant_label} · unusually low`;
  }
  if (subgroup.price_band === "unpriced") {
    return `${subgroup.variant_label} · price unavailable`;
  }
  return subgroup.variant_label;
}

export function priceRange(group: PersistedProductGroup) {
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

export function productStatus(group: PersistedProductGroup) {
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

export function appendPage(
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

export function reviewBucket(finding: IpReviewFinding): Exclude<ReviewBucket, "all"> {
  const key = finding.actionability?.key;
  if (key === "send_takedown") return "takedown";
  if (key === "allowed_resale") return "second_hand";
  if (key === "licensed_seller") return "licensed";
  if (key === "false_positive") return "different_product";
  return "needs_review";
}

export const RECENT_DECISION_STATUSES = [
  "dismissed",
  "review",
  "takedown_pending",
  "takedown_sent",
  "enforced",
] as const;
type RecentDecisionStatus = typeof RECENT_DECISION_STATUSES[number];
export type RecentDecisionCursors = Record<RecentDecisionStatus, string | null>;

export function mergeRecentDecisions(
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

export function recentDecisionPresentation(finding: IpReviewFinding) {
  const kind = recentDecisionKind(finding);
  if (kind === "dismissed") {
    const labels: Record<string, string> = {
      false_positive: "Different product",
      do_not_pursue: "Not pursued",
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

export function decisionTime(value: string) {
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

export function decisionExactTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const REVIEW_BUCKETS: Array<{
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
