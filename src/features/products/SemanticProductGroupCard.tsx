import { ListFilter } from "lucide-react";
import { Link } from "react-router-dom";
import type { PersistedProductGroup, ProductClusterProfile } from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { AssigneeAvatar } from "../../components/monitoring/board/AssigneeAvatar";
import type { BatchAction } from "../../components/monitoring/board/batchUtils";
import { ListingTile } from "./ListingTile";
import { ProductGroupMemberSubgroups } from "./ProductGroupMemberSubgroups";
import { SemanticListingActionsMenu } from "./SemanticListingActionsMenu";
import type { ProductGroupBatch, ProductGroupRecommendationBucket } from "./clusterDomain";
import { productClusterProfileForFinding } from "./clusterDomain";

export function SemanticProductGroupCard({
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
                assignee={finding.assigned_to_account_id ? (
                  <AssigneeAvatar
                    accountId={finding.assigned_to_account_id}
                    displayName={finding.assignee_display_name}
                    email={finding.assignee_email}
                    pictureUrl={finding.assignee_picture_url}
                    size={22}
                  />
                ) : null}
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
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}`}
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
