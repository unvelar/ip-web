import { RefreshCw } from "lucide-react";
import type {
  PersistedProductGroup,
  PersistedProductGroupOverview,
  ProductClusterProfile,
  ProductGroupAuthenticityRule,
  ProductGroupAuthenticityRuleInput,
  ProductGroupCommercialSubgroup,
  ProductGroupCorrectionReason,
  ProductGroupRule,
  ShopifyProductTaxonomyCategory,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import type { BatchAction } from "../../components/monitoring/board/batchUtils";
import type {
  GroupMode,
  ProductGroupBatch,
  ProductGroupRecommendationBucket,
  ProductGroupView,
} from "./clusterDomain";
import { productGroupHasReviewQueueWork } from "./clusterDomain";
import { ListingTile } from "./ListingTile";
import { ProductGroupCard } from "./ProductGroupCard";
import { ProductGroupViewToggle } from "./ProductGroupViewToggle";

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
  onConfirmGroup: (
    groupId: string,
    displayName: string,
    shopifyCategory?: ShopifyProductTaxonomyCategory,
  ) => Promise<void>;
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
