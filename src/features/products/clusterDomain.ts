import type { CaseReviewStatus } from "../../api/cases";
import type {
  PersistedProductGroup,
  PersistedProductGroupOverview,
  ProductClusterProfile,
  ProductGroupAuthenticityRule,
  ProductGroupAuthenticityRuleInput,
  ProductGroupPriceSignal,
  ProductGroupPriceSummary,
  ProductGroupRecommendationCounts,
  ShopifyProductTaxonomyCategory,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { formatMoney } from "../../components/monitoring/board/utils";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";

export type ProductGroupView = "triage" | "all";
export type GroupMode = "same" | "related" | "visual";
export type ProductWorkspaceSection = "review" | "history" | "offers" | "settings" | "audit";
export const PRODUCT_GROUP_VIEW = "all" as const;
export const EMPTY_AUTHENTICITY_RULE: ProductGroupAuthenticityRuleInput = {
  expected_feature: "",
  violation_pattern: "",
  inspection_instruction: "",
  visibility_rule: "",
  applicability: null,
  rationale: null,
  modality: "image",
  failure_action: "review",
};

export function authenticityRuleInput(
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
export type ActiveProductTask = {
  profileId: string;
  groupId: string | null;
  finding: IpReviewFinding;
};
export type ProductGroupBatch = {
  groupId: string;
  scopeId: string;
  groupName: string;
  commercialSubgroupKey: string | null;
  commercialCaseIds: Set<string> | null;
  bucket: ProductGroupRecommendationBucket;
  findings: IpReviewFinding[] | null;
  selectedResultIds: Set<string>;
};
export type SemanticCorrectionTarget = {
  group: PersistedProductGroup;
  profile: ProductClusterProfile;
};

export const PRODUCT_GROUP_PAGE_SIZE = 24;
export const SEMANTIC_GROUP_PAGE_SIZE = 4;
export const NEW_PRODUCT_TYPE_VALUE = "__new_product_type__";
export type ProductGroupRecommendationBucket =
  | "takedown"
  | "second_hand"
  | "might_be_ok"
  | "needs_review";

export const PRODUCT_GROUP_RECOMMENDATION_BUCKETS: Array<{
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

export function productTypeLabelFromKey(key: string) {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function appendProductGroupPage(
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

export type AcknowledgedProductTaskResolution = {
  groupId: string;
  resultId: string;
  caseId: string | null;
  profileId: string;
  recommendationBucket: ProductGroupRecommendationBucket;
  remainingFindings: IpReviewFinding[] | null;
};

export function productGroupHasReviewQueueWork(group: PersistedProductGroup) {
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

export function optimisticallyResolveProductGroupTask(
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

export function optimisticallyResolveProductGroupTaskInOverview(
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

export function applyAcknowledgedProductTaskResolutions(
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

export function productTaskResolution(
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

export function findingMatchesAcknowledgedResolution(
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

export function reconcileProductGroupTaskProjection(
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

export function reconcileProductGroupTaskProjectionInOverview(
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

export function optimisticallyExcludeProductGroupMember(
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

export type ProductCatalogCategoryNode = {
  id: string;
  name: string;
  productCount: number;
  children: ProductCatalogCategoryNode[];
};

export function buildProductCatalogCategoryTree(
  categories: PersistedProductGroupOverview["catalog_categories"],
) {
  const nodes = new Map<string, ProductCatalogCategoryNode>();
  const roots: ProductCatalogCategoryNode[] = [];
  for (const category of categories) {
    const names = category.path.split(" > ").map((name) => name.trim()).filter(Boolean);
    const handleParts = category.id.split("/").at(-1)?.split("-") ?? [];
    let parent: ProductCatalogCategoryNode | null = null;
    for (let index = 0; index < Math.min(names.length, handleParts.length); index += 1) {
      const id = `gid://shopify/TaxonomyCategory/${handleParts.slice(0, index + 1).join("-")}`;
      let node = nodes.get(id);
      if (!node) {
        node = { id, name: names[index], productCount: 0, children: [] };
        nodes.set(id, node);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      node.productCount += Number(category.product_count);
      parent = node;
    }
  }
  const sortNodes = (items: ProductCatalogCategoryNode[]) => {
    items.sort((left, right) => left.name.localeCompare(right.name));
    for (const item of items) sortNodes(item.children);
  };
  sortNodes(roots);
  return roots;
}

export function findProductCatalogCategoryName(
  nodes: ProductCatalogCategoryNode[],
  categoryId: string,
): string | null {
  for (const node of nodes) {
    if (node.id === categoryId) return node.name;
    const childName = findProductCatalogCategoryName(node.children, categoryId);
    if (childName) return childName;
  }
  return null;
}

export function productGroupDisplayName(group: PersistedProductGroup) {
  return group.catalog_display_name?.trim() || group.display_name?.trim() ||
    "Product awaiting classification";
}

export function productGroupNameProvenance(group: PersistedProductGroup) {
  if (group.catalog_name_source === "generated_traits") {
    const support = group.catalog_name_support_count;
    if ((group.catalog_name_confidence ?? 0) === 0) {
      return "Temporary catalog code · awaiting shared visual evidence";
    }
    return support && support > 1
      ? `Generated working label · shared by ${support} listings`
      : "Generated working label · gallery evidence";
  }
  if (group.catalog_name_source === "identity_facts") {
    return "Suggested identity · repeated listing evidence";
  }
  if (group.catalog_name_source === "fallback") {
    return "Category fallback · awaiting shared evidence";
  }
  return null;
}

export function productGroupShopifyCategory(
  group: PersistedProductGroup,
): ShopifyProductTaxonomyCategory | null {
  if (
    !group.catalog_primary_category_id ||
    !group.catalog_primary_category_name ||
    !group.catalog_primary_category_path ||
    !group.catalog_primary_category_version
  ) return null;
  return {
    id: group.catalog_primary_category_id,
    name: group.catalog_primary_category_name,
    path: group.catalog_primary_category_path,
    version: group.catalog_primary_category_version,
  };
}

export function productGroupPriceRange(group: PersistedProductGroup) {
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

export function productGroupRecommendationBucket(key: ProductGroupRecommendationBucket) {
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

export function recommendationBucketForProfile(profile: ProductClusterProfile) {
  return recommendationBucketForActionability(profile.actionability?.key);
}

export function recommendationBucketForFinding(finding: IpReviewFinding) {
  return recommendationBucketForActionability(finding.actionability?.key);
}

export function selectedProductGroupBatchFindings(batch: ProductGroupBatch | null) {
  if (!batch?.findings) return [];
  return batch.findings.filter((finding) =>
    batch.selectedResultIds.has(finding.result_id)
  );
}

export function findingProfileId(finding: IpReviewFinding) {
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

export function productGroupPriceSignalForFinding(
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

export function productClusterProfileForFinding(
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
    image_count: finding.archived_image_urls?.length ??
      finding.image_urls?.length ?? (finding.image_url ? 1 : 0),
    image_url: finding.archived_image_urls?.[0] ??
      finding.image_url ?? finding.screenshot_url,
    actionability: finding.actionability,
    updated_at: finding.updated_at,
  };
}

export function compareProductProfilesByPriceSignal(
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

export function productGroupSubgroupKey(
  groupId: string,
  bucket: ProductGroupRecommendationBucket,
) {
  return `${groupId}:${bucket}`;
}

export function productCommercialReviewScopeId(
  groupId: string,
  commercialSubgroupKey: string | null,
) {
  return commercialSubgroupKey
    ? `${groupId}:commercial:${commercialSubgroupKey}`
    : groupId;
}

export type ProductGroupSubgroupItem =
  | { kind: "profile"; id: string; bucket: ProductGroupRecommendationBucket; profile: ProductClusterProfile }
  | { kind: "finding"; id: string; bucket: ProductGroupRecommendationBucket; finding: IpReviewFinding };

export function fillProductGroupSubgroupPreview(
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

export type ProductGroupReconciliationSuggestion =
  PersistedProductGroup["reconciliation_suggestions"][number];

export function productGroupPreviewProfiles(
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

export function productGroupReviewLabel(group: PersistedProductGroup) {
  return group.display_name?.trim() ||
    `Product group · ${group.member_count} ${group.member_count === 1 ? "listing" : "listings"}`;
}

export function productGroupRepresentativeTitle(group: PersistedProductGroup) {
  const profiles = productGroupPreviewProfiles(group, 8);
  const titledProfile = profiles.find((profile) => profile.listing_title?.trim());
  return titledProfile ? profileTitle(titledProfile) : null;
}

export function productGroupVariantLabels(group: PersistedProductGroup) {
  return [...new Set(
    group.commercial_subgroups
      .map((subgroup) => subgroup.variant_label.trim())
      .filter(Boolean),
  )].slice(0, 3);
}

export function productGroupPriceLabel(group: PersistedProductGroup) {
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

export function productGroupRecommendationSummary(group: PersistedProductGroup) {
  const counts = group.triage_recommendation_counts;
  if (!counts) return [];
  return [
    { label: "Takedown recommended", count: counts.takedown },
    { label: "Second-hand", count: counts.second_hand },
    { label: "Might be OK", count: counts.might_be_ok },
    { label: "Needs review", count: counts.needs_review },
  ].filter(({ count }) => count > 0);
}

export function isDecisionState(state: CaseReviewStatus) {
  return state === "pending" || state === "review";
}

export function errorMessage(
  caught: unknown,
  fallback = "Could not load product relationships.",
) {
  if (caught instanceof Error && caught.message.trim()) return caught.message;
  return fallback;
}

export function rescoreNotice(count: number) {
  if (count === 0) {
    return "Rule saved. Future candidates will use it automatically.";
  }
  return `Rule saved. ${count} current listing${count === 1 ? "" : "s"} queued for automatic rescoring.`;
}

export function authenticityJobsNotice(count: number) {
  if (count === 0) {
    return "Authenticity check saved. Future listings will use it automatically.";
  }
  return `Authenticity check saved. ${count} current listing${count === 1 ? "" : "s"} queued to be checked again.`;
}
