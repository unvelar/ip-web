import { ArrowLeft, ArrowUpRight, Check, Link2, LoaderCircle, Settings2, Square } from "lucide-react";
import { Link } from "react-router-dom";
import type { PersistedProductGroup, ProductGroupCommercialSubgroup } from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { ListingDecisionBar } from "../../components/monitoring/board/ListingDecisionBar";
import { BatchListingCard } from "./BatchListingCard";
import type { ReviewBucket } from "./labDomain";
import {
  commercialReviewLaneLabel,
  productName,
  productStatus,
  representativeImage,
  REVIEW_BUCKETS,
  reviewBucket,
} from "./labDomain";
import { QuietState } from "./QuietState";
import type { ProductCommercialReviewLane, ProductLabBatchAction } from "./reviewDecisions";
import { recommendedBatchActionForSelection } from "./reviewDecisions";

export function BatchWorkspace({
  group,
  ipId,
  findings,
  commercialReviewLanes,
  selectedCommercialSubgroupKey,
  loading,
  error,
  filter,
  selectedResultIds,
  batchProgress,
  notice,
  selectingSameProduct,
  onBack,
  onFilterChange,
  onCommercialSubgroupChange,
  onToggleFinding,
  onSetFindingsSelected,
  onOpenFinding,
  onBatchAction,
  onMergeProduct,
  onOpenSettings,
  onDismissNotice,
}: {
  group: PersistedProductGroup;
  ipId: string;
  findings: IpReviewFinding[] | null;
  commercialReviewLanes: ProductCommercialReviewLane<ProductGroupCommercialSubgroup>[];
  selectedCommercialSubgroupKey: string | null;
  loading: boolean;
  error: string | null;
  filter: ReviewBucket;
  selectedResultIds: Set<string>;
  batchProgress: { done: number; total: number } | null;
  notice: string | null;
  selectingSameProduct: boolean;
  onBack: () => void;
  onFilterChange: (filter: ReviewBucket) => void;
  onCommercialSubgroupChange: (subgroupKey: string | null) => void;
  onToggleFinding: (resultId: string) => void;
  onSetFindingsSelected: (resultIds: string[], selected: boolean) => void;
  onOpenFinding: (finding: IpReviewFinding) => void;
  onBatchAction: (action: ProductLabBatchAction) => void;
  onMergeProduct: () => void;
  onOpenSettings: () => void;
  onDismissNotice: () => void;
}) {
  const status = productStatus(group);
  const taskParams = new URLSearchParams({
    ip_id: ipId,
    [group.canonical_product_id ? "catalog_product_id" : "product_group_id"]:
      group.canonical_product_id ?? group.id,
  });
  const listingCount = findings?.length ?? group.triage_member_count ?? 0;
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
  const visibleResultIds = visibleFindings.map((finding) => finding.result_id);
  const allVisibleSelected = visibleResultIds.length > 0 && visibleResultIds.every((resultId) =>
    selectedResultIds.has(resultId)
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
        <div className="flex flex-wrap items-start gap-3">
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
              {listingCount} {listingCount === 1 ? "listing" : "listings"} in this batch
            </p>
          </div>
          <div className="ml-auto flex w-full shrink-0 flex-wrap items-center justify-end gap-1.5 sm:w-auto">
            <button
              type="button"
              disabled={selectingSameProduct}
              onClick={onMergeProduct}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-violet-200 bg-violet-50 px-2.5 text-[10px] font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 disabled:cursor-default disabled:border-violet-300 disabled:bg-violet-100"
            >
              <Link2 size={12} />
              {selectingSameProduct ? "Selecting in list" : "Same product"}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stone-200 px-2.5 text-[10px] font-medium text-stone-500 hover:bg-stone-50 hover:text-stone-800"
            >
              <Settings2 size={11} />
              Group settings
            </button>
            <Link
              to={`/monitoring/tasks?${taskParams}`}
              aria-label={`View tasks for ${productName(group)}`}
              title={`View tasks for ${productName(group)}`}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-50 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
            >
              <ArrowUpRight size={14} aria-hidden="true" />
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
            disabled={visibleResultIds.length === 0 || Boolean(batchProgress)}
            aria-pressed={allVisibleSelected}
            onClick={() => onSetFindingsSelected(visibleResultIds, !allVisibleSelected)}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2 text-[10px] font-medium text-stone-600 transition hover:border-stone-300 hover:bg-stone-50 hover:text-stone-900 disabled:cursor-default disabled:opacity-50"
          >
            {allVisibleSelected ? <Check size={12} strokeWidth={3} /> : <Square size={12} />}
            {allVisibleSelected ? "Deselect all" : "Select all"}
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
        <div className="mb-3 flex items-center justify-between gap-3">
          {commercialReviewLanes.length > 0 && (
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-1 -my-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter listings by size">
              {[
                { key: null, label: "All sizes", count: group.triage_member_count ?? 0 },
                ...commercialReviewLanes.map(({ subgroup, findingCount }) => ({
                  key: subgroup.key,
                  label: commercialReviewLaneLabel(subgroup),
                  count: findingCount,
                })),
              ].map(({ key, label, count }) => {
                const selected = key === selectedCommercialSubgroupKey;
                return (
                  <button
                    key={key ?? "all"}
                    type="button"
                    aria-pressed={selected}
                    disabled={Boolean(batchProgress)}
                    onClick={() => onCommercialSubgroupChange(key)}
                    className={`inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[10px] font-medium outline-none transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none ${
                      selected
                        ? "bg-stone-100 text-stone-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]"
                        : "bg-transparent text-stone-500 hover:bg-stone-50 hover:text-stone-800"
                    }`}
                  >
                    {label}
                    <span className={`text-[9px] tabular-nums transition-colors duration-150 motion-reduce:transition-none ${
                      selected ? "text-stone-500" : "text-stone-400"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="shrink-0 text-[10px] tabular-nums text-stone-400" aria-live="polite">
            {loading && findings == null
              ? "Loading listings…"
              : `${visibleFindings.length} ${visibleFindings.length === 1 ? "listing" : "listings"}`}
          </p>
        </div>
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
            title={selectedCommercialSubgroupKey ? "No matching listings" : filter === "all" ? "Batch complete" : "Nothing in this category"}
            detail={selectedCommercialSubgroupKey
              ? "Choose another size or recommendation to see more listings."
              : filter === "all"
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

      <ListingDecisionBar
        selectedCount={selectedFindings.length}
        actions={["send", "false_positive", "second_hand", "do_not_pursue", "allow_product", "review"] as const}
        recommendedAction={recommendedAction}
        progress={batchProgress}
        onAction={onBatchAction}
      />
    </div>
  );
}
