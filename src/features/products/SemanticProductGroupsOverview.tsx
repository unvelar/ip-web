import { RefreshCw } from "lucide-react";
import type {
  PersistedProductGroup,
  PersistedProductGroupOverview,
  ProductClusterProfile,
  ProductGroupCommercialSubgroup,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import type { BatchAction } from "../../components/monitoring/board/batchUtils";
import type { ProductGroupBatch, ProductGroupRecommendationBucket, ProductGroupView } from "./clusterDomain";
import { productGroupHasReviewQueueWork } from "./clusterDomain";
import { ProductGroupViewToggle } from "./ProductGroupViewToggle";
import { SemanticProductGroupCard } from "./SemanticProductGroupCard";

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
