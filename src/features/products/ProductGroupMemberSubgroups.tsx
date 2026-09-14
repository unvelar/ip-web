import { Check, ChevronDown, ChevronUp, MoreHorizontal, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type {
  ProductClusterProfile,
  ProductGroupCommercialSubgroup,
  ProductGroupPriceSignal,
  ProductGroupPriceSummary,
  ProductGroupRecommendationCounts,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { BatchOperationBar } from "../../components/monitoring/board/BatchOperationBar";
import type { BatchAction } from "../../components/monitoring/board/batchUtils";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import type { ProductGroupBatch, ProductGroupRecommendationBucket, ProductGroupSubgroupItem } from "./clusterDomain";
import {
  compareProductProfilesByPriceSignal,
  fillProductGroupSubgroupPreview,
  PRODUCT_GROUP_RECOMMENDATION_BUCKETS,
  productClusterProfileForFinding,
  productGroupPriceSignalForFinding,
  productGroupSubgroupKey,
  recommendationBucketForFinding,
  recommendationBucketForProfile,
  selectedProductGroupBatchFindings,
} from "./clusterDomain";

export function ProductGroupMemberSubgroups({
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
