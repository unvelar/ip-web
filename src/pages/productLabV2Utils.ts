type ProductAttentionFields = {
  confirmation_status: string;
  triage_member_count: number | null;
};

type ProductAttentionGroup = ProductAttentionFields & {
  id: string;
};

type ProductAttentionOverview<T extends ProductAttentionGroup> = {
  groups: T[];
  triage_group_count: number | null;
  triage_profile_count: number | null;
};

export type ProductLabBatchAction =
  | "send"
  | "false_positive"
  | "do_not_pursue"
  | "allow_product"
  | "second_hand"
  | "review";

type AllowProductImageFields = {
  screenshot_url?: string | null;
  archived_image_urls?: string[] | null;
  gallery_scores?: Array<{ url: string; similarity: number }> | null;
  image_urls?: string[] | null;
  image_url?: string | null;
};

export function preferredAllowedProductImage(
  finding: AllowProductImageFields,
): string | null {
  const blocked = new Set([
    finding.screenshot_url,
    ...(finding.archived_image_urls ?? []),
  ].filter((url): url is string => Boolean(url)));
  const scored = [...(finding.gallery_scores ?? [])]
    .sort((left, right) => right.similarity - left.similarity)
    .map((entry) => entry.url);
  const candidates = [
    ...scored,
    ...(finding.image_urls ?? []),
    finding.image_url,
  ];
  return candidates.find((url): url is string =>
    typeof url === "string" && url.length > 0 && !blocked.has(url)
  ) ?? null;
}

export type RecentDecisionKind =
  | "dismissed"
  | "review"
  | "takedown_pending"
  | "takedown_sent"
  | "enforced";

type RecentDecisionFields = {
  dismissed_at: string | null;
  dismissal_reason: string | null;
  review_status: string | null;
  updated_at: string;
  takedown_pending_at: string | null;
  takedown_sent_at: string | null;
  enforced_at: string | null;
};

const HUMAN_DISMISSAL_REASONS = new Set([
  "false_positive",
  "do_not_pursue",
  "second_hand",
  "resale",
  "manual_cleared",
  "licensed",
  "allowed_product",
]);

export function recentDecisionKind(
  finding: RecentDecisionFields,
): RecentDecisionKind | null {
  if (
    finding.dismissed_at &&
    finding.dismissal_reason &&
    HUMAN_DISMISSAL_REASONS.has(finding.dismissal_reason)
  ) return "dismissed";
  if (finding.review_status === "review") return "review";
  if (finding.review_status === "takedown_pending") return "takedown_pending";
  if (finding.review_status === "takedown_sent") return "takedown_sent";
  if (finding.review_status === "enforced") return "enforced";
  return null;
}

export function recentDecisionTimestamp(finding: RecentDecisionFields) {
  switch (recentDecisionKind(finding)) {
    case "dismissed":
      return finding.dismissed_at ?? finding.updated_at;
    case "takedown_pending":
      return finding.takedown_pending_at ?? finding.updated_at;
    case "takedown_sent":
      return finding.takedown_sent_at ?? finding.updated_at;
    case "enforced":
      return finding.enforced_at ?? finding.updated_at;
    case "review":
    default:
      return finding.updated_at;
  }
}

export function recentDecisionCanUndo(finding: RecentDecisionFields) {
  const kind = recentDecisionKind(finding);
  if (!kind) return false;
  if (kind !== "dismissed") return true;
  return finding.dismissal_reason !== "licensed" &&
    finding.dismissal_reason !== "allowed_product";
}

export function sortRecentDecisions<T extends RecentDecisionFields>(findings: T[]) {
  return [...findings]
    .filter((finding) => recentDecisionKind(finding) != null)
    .sort((left, right) =>
      Date.parse(recentDecisionTimestamp(right)) - Date.parse(recentDecisionTimestamp(left))
    );
}

type ProductRecommendationFields = {
  actionability?: { key: string } | null;
  offer_subject?: string | null;
  suggested_review_outcome?:
    | "false_positive"
    | "do_not_pursue"
    | "takedown"
    | "second_hand"
    | "none"
    | null;
};

export type ProductCommercialSubgroupFields = {
  key: string;
  triage_member_count: number;
  triage_case_ids: string[];
};

export type ProductCommercialReviewLane<T extends ProductCommercialSubgroupFields> = {
  subgroup: T;
  findingCount: number;
};

type ProductCommercialFindingFields = {
  case_id: string | null;
};

export function productCommercialReviewLanes<
  T extends ProductCommercialSubgroupFields,
>(
  subgroups: T[],
  findings: ProductCommercialFindingFields[] | null,
): ProductCommercialReviewLane<T>[] {
  return subgroups.flatMap((subgroup) => {
    let findingCount = subgroup.triage_member_count;
    if (findings != null) {
      const caseIds = new Set(subgroup.triage_case_ids);
      findingCount = findings.reduce(
        (count, finding) => count + Number(
          finding.case_id != null && caseIds.has(finding.case_id),
        ),
        0,
      );
    }
    return findingCount > 0 ? [{ subgroup, findingCount }] : [];
  });
}

export function productCommercialSubgroupKeyForCaseId<
  T extends ProductCommercialSubgroupFields,
>(
  lanes: ProductCommercialReviewLane<T>[],
  caseId: string | null,
): string | null {
  if (!caseId) return null;
  return lanes.find(({ subgroup }) => subgroup.triage_case_ids.includes(caseId))
    ?.subgroup.key ?? null;
}

export function scopeFindingsToCommercialSubgroup<
  T extends ProductCommercialFindingFields,
  S extends ProductCommercialSubgroupFields,
>(findings: T[] | null, subgroup: S | null): T[] | null {
  if (!findings || !subgroup) return findings;
  const caseIds = new Set(subgroup.triage_case_ids);
  return findings.filter((finding) => finding.case_id != null && caseIds.has(finding.case_id));
}

export function productNeedsAttention(group: ProductAttentionFields) {
  const triageMemberCount = group.triage_member_count ?? 0;
  return triageMemberCount > 0;
}

export function reconcileProductAttentionOverview<
  T extends ProductAttentionGroup,
  O extends ProductAttentionOverview<T>,
>(overview: O, groupId: string, exactPendingCount: number): O {
  let previousPendingCount: number | null = null;
  let queueGroupDelta = 0;
  const groups = overview.groups.map((group) => {
    if (group.id !== groupId) return group;
    previousPendingCount = group.triage_member_count ?? 0;
    const nextGroup = {
      ...group,
      triage_member_count: exactPendingCount,
    };
    queueGroupDelta = Number(productNeedsAttention(nextGroup)) -
      Number(productNeedsAttention(group));
    return nextGroup;
  });

  if (previousPendingCount == null) return overview;
  const profileDelta = exactPendingCount - previousPendingCount;
  return {
    ...overview,
    groups,
    triage_group_count: overview.triage_group_count == null
      ? null
      : Math.max(0, overview.triage_group_count + queueGroupDelta),
    triage_profile_count: overview.triage_profile_count == null
      ? null
      : Math.max(0, overview.triage_profile_count + profileDelta),
  } as O;
}

function recommendedBatchAction(
  finding: ProductRecommendationFields,
): ProductLabBatchAction | null {
  if (finding.offer_subject === "packaging_only") return null;
  switch (finding.suggested_review_outcome) {
    case "takedown":
      return "send";
    case "second_hand":
      return "second_hand";
    case "false_positive":
      return "false_positive";
    case "do_not_pursue":
      return "do_not_pursue";
    default:
      return null;
  }
}

export function takedownDecisionReasonRequiredForSelection(
  findings: ProductRecommendationFields[],
) {
  return findings.some((finding) => finding.suggested_review_outcome !== "takedown");
}

export function recommendedBatchActionForSelection(
  findings: ProductRecommendationFields[],
): ProductLabBatchAction | null {
  if (findings.length === 0) return null;
  const recommendations = findings.map(recommendedBatchAction);
  const first = recommendations[0];
  if (!first || recommendations.some((recommendation) => recommendation !== first)) {
    return null;
  }
  return first;
}

export function removeProcessedFindings<T extends { result_id: string }>(
  findings: T[],
  processedResultIds: ReadonlySet<string>,
): T[] {
  if (processedResultIds.size === 0) return findings;
  return findings.filter((finding) => !processedResultIds.has(finding.result_id));
}

export function resetOptimisticProductStateAfterUndo(
  processedResultIds: ReadonlySet<string>,
  restoredResultId: string,
) {
  const nextProcessedResultIds = new Set(processedResultIds);
  nextProcessedResultIds.delete(restoredResultId);
  return {
    exactPendingCounts: {} as Record<string, number>,
    processedResultIds: nextProcessedResultIds,
  };
}

export function adjacentFinding<T extends { result_id: string }>(
  findings: T[],
  activeResultId: string,
  direction: -1 | 1,
): T | null {
  const activeIndex = findings.findIndex((finding) => finding.result_id === activeResultId);
  if (activeIndex < 0) return null;
  return findings[activeIndex + direction] ?? null;
}
