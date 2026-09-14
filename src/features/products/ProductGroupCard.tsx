import {
  Check,
  CheckCircle2,
  Images,
  ListFilter,
  LockKeyhole,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type {
  PersistedProductGroup,
  ProductClusterProfile,
  ProductGroupAuthenticityRule,
  ProductGroupAuthenticityRuleInput,
  ProductGroupCommercialSubgroup,
  ProductGroupCorrectionReason,
  ProductGroupMergeCandidate,
  ProductGroupPriceSummary,
  ProductGroupRule,
  ProductGroupVisualEvidence,
  ShopifyProductTaxonomyCategory,
} from "../../api/products";
import {
  calculatePersistedProductGroupVisualEvidence,
  pinPersistedProductGroupReferenceImage,
  removePersistedProductGroupReferenceImage,
  resetPersistedProductGroupReferenceImages,
} from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import { AssigneeAvatar } from "../../components/monitoring/board/AssigneeAvatar";
import type { BatchAction } from "../../components/monitoring/board/batchUtils";
import { formatMoney } from "../../components/monitoring/board/utils";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import type {
  GroupMode,
  ProductGroupBatch,
  ProductGroupRecommendationBucket,
  ProductWorkspaceSection,
} from "./clusterDomain";
import {
  authenticityJobsNotice,
  authenticityRuleInput,
  EMPTY_AUTHENTICITY_RULE,
  errorMessage,
  productClusterProfileForFinding,
  productCommercialReviewScopeId,
  productGroupDisplayName,
  productGroupNameProvenance,
  productGroupShopifyCategory,
  rescoreNotice,
} from "./clusterDomain";
import { ListingTile } from "./ListingTile";
import { ProductGroupMemberSubgroups } from "./ProductGroupMemberSubgroups";
import { ProductGroupMergeReviewDialog } from "./ProductGroupMergeReviewDialog";
import { ProductGroupPriceSummaryView } from "./ProductGroupPriceSummaryView";
import { ProductGroupReconciliationPreview } from "./ProductGroupReconciliationPreview";
import { ProductListingRow } from "./ProductListingRow";
import { ProductMergeCandidatePicker } from "./ProductMergeCandidatePicker";
import { ShopifyCategoryPicker } from "./ShopifyCategoryPicker";

export function ProductGroupCard({
  workspace = false,
  settingsOnly = false,
  group,
  availableGroups,
  reconciliationSuggestions,
  index,
  ipId,
  mode,
  showPersistedMembers,
  triageProjectionAvailable,
  saving,
  mergeSourceGroup,
  savingMergeKey,
  revokingMergeDecisionId,
  savingCorrectionProfileId,
  activeTaskProfileId,
  loadingTaskProfileId,
  allFindings,
  taskHistory = null,
  loadingTaskHistory = false,
  catalogSupported = false,
  expandedSubgroupKeys,
  loadingAllFindings,
  activeBatch,
  batchProgress,
  batchDisabled,
  onSelectBatch,
  onBatchAction,
  onClearBatch,
  onToggleBatchFinding,
  onSetAllBatchFindings,
  onToggleSubgroupListings,
  onOpenTask,
  onOpenFinding,
  onLoadTaskHistory = () => undefined,
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
  workspace?: boolean;
  settingsOnly?: boolean;
  group: PersistedProductGroup;
  availableGroups: PersistedProductGroup[];
  reconciliationSuggestions: PersistedProductGroup["reconciliation_suggestions"];
  index: number;
  ipId: string;
  mode: GroupMode;
  showPersistedMembers: boolean;
  triageProjectionAvailable: boolean;
  saving: boolean;
  mergeSourceGroup: PersistedProductGroup | null;
  savingMergeKey: string | null;
  revokingMergeDecisionId: string | null;
  savingCorrectionProfileId: string | null;
  activeTaskProfileId: string | null;
  loadingTaskProfileId: string | null;
  allFindings: IpReviewFinding[] | null;
  taskHistory?: IpReviewFinding[] | null;
  loadingTaskHistory?: boolean;
  catalogSupported?: boolean;
  expandedSubgroupKeys: ReadonlySet<string>;
  loadingAllFindings: boolean;
  activeBatch: ProductGroupBatch | null;
  batchProgress: { done: number; total: number } | null;
  batchDisabled: boolean;
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
  onOpenTask: (profile: ProductClusterProfile, groupId: string | null) => void;
  onOpenFinding: (finding: IpReviewFinding, groupId: string) => void;
  onLoadTaskHistory?: () => void;
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
  const [workspaceSection, setWorkspaceSection] =
    useState<ProductWorkspaceSection>(settingsOnly ? "settings" : "review");
  const [selectedCommercialSubgroupKey, setSelectedCommercialSubgroupKey] =
    useState<string | null>(() => group.commercial_subgroups[0]?.key ?? null);
  const [workspaceMergeTarget, setWorkspaceMergeTarget] =
    useState<ProductGroupMergeCandidate | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [managing, setManaging] = useState(
    settingsOnly && group.confirmation_status === "confirmed",
  );
  const [name, setName] = useState(
    group.confirmation_status === "confirmed" ? group.display_name ?? "" : "",
  );
  const [selectedShopifyCategory, setSelectedShopifyCategory] =
    useState<ShopifyProductTaxonomyCategory | null>(() =>
      productGroupShopifyCategory(group)
    );
  const [ruleDraft, setRuleDraft] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleNotice, setRuleNotice] = useState<string | null>(null);
  const [authenticityDraft, setAuthenticityDraft] =
    useState<ProductGroupAuthenticityRuleInput>(EMPTY_AUTHENTICITY_RULE);
  const [editingAuthenticityRuleId, setEditingAuthenticityRuleId] =
    useState<string | null>(null);
  const [savingAuthenticityRule, setSavingAuthenticityRule] = useState(false);
  const [authenticityNotice, setAuthenticityNotice] = useState<string | null>(null);
  const [embeddingThresholdEnabled, setEmbeddingThresholdEnabled] = useState(
    group.embedding_match_threshold != null,
  );
  const [embeddingThresholdDraft, setEmbeddingThresholdDraft] = useState(
    group.embedding_match_threshold ?? 0.5,
  );
  const [savingEmbeddingThreshold, setSavingEmbeddingThreshold] = useState(false);
  const [embeddingThresholdNotice, setEmbeddingThresholdNotice] = useState<string | null>(null);
  const [visualEvidence, setVisualEvidence] = useState<ProductGroupVisualEvidence | null>(null);
  const [loadingVisualEvidence, setLoadingVisualEvidence] = useState(false);
  const [visualEvidenceError, setVisualEvidenceError] = useState<string | null>(null);
  const [savingReferenceImageId, setSavingReferenceImageId] = useState<string | null>(null);
  const [resettingReferences, setResettingReferences] = useState(false);
  const [mergeReviewTargetId, setMergeReviewTargetId] = useState<string | null>(null);
  const [mergeReviewError, setMergeReviewError] = useState<string | null>(null);
  const [resolvedMergeReviewTarget, setResolvedMergeReviewTarget] =
    useState<PersistedProductGroup | null>(null);
  const [loadingMergeReviewTargetId, setLoadingMergeReviewTargetId] =
    useState<string | null>(null);
  const confirmed = group.confirmation_status === "confirmed";
  const selectedAsMergeSource = mergeSourceGroup?.id === group.id;
  const selectedMergeKey = mergeSourceGroup
    ? [mergeSourceGroup.id, group.id].sort().join(":")
    : null;
  const savingThisMerge = selectedMergeKey != null && savingMergeKey === selectedMergeKey;
  const alreadySameCanonicalProduct = Boolean(
    mergeSourceGroup?.canonical_product_id &&
      mergeSourceGroup.canonical_product_id === group.canonical_product_id,
  );
  const mergeReviewSuggestion = mergeReviewTargetId
    ? reconciliationSuggestions.find(
        (suggestion) => suggestion.target_group_id === mergeReviewTargetId,
      ) ?? null
    : null;
  const mergeReviewTarget = mergeReviewTargetId
    ? availableGroups.find((candidate) => candidate.id === mergeReviewTargetId) ??
      (resolvedMergeReviewTarget?.id === mergeReviewTargetId
        ? resolvedMergeReviewTarget
        : null)
    : null;
  const triageMemberCount = group.triage_member_count ?? 0;
  const showingPersistedMembers = showPersistedMembers || managing ||
    (workspace && workspaceSection === "settings");
  const displayedMembers = showingPersistedMembers ? group.members : group.triage_members;
  const displayedMemberCount = showingPersistedMembers ? group.member_count : triageMemberCount;
  const workspaceRepresentative = group.triage_members[0] ?? group.members[0] ?? null;
  const taskLinkMode = triageProjectionAvailable && triageMemberCount === 0
    ? "history"
    : !showingPersistedMembers || triageMemberCount > 0
      ? "pending"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const taskProductFilter = taskLinkMode === "pending"
    ? `product_group_id=${encodeURIComponent(group.id)}`
    : catalogSupported
      ? `catalog_product_id=${encodeURIComponent(group.canonical_product_id ?? group.id)}`
      : `product_group_id=${encodeURIComponent(group.id)}`;
  const canConfirm = mode === "same" || mode === "visual";
  const trimmedName = name.trim();
  const canEditShopifyCategory = mode === "same" && Boolean(group.canonical_product_id);
  const shopifyCategoryChanged = canEditShopifyCategory &&
    (selectedShopifyCategory?.id ?? null) !== group.catalog_primary_category_id;
  const productDetailsChanged = confirmed
    ? trimmedName !== group.display_name || shopifyCategoryChanged
    : Boolean(trimmedName);
  const nextEmbeddingThreshold = embeddingThresholdEnabled
    ? embeddingThresholdDraft
    : null;
  const embeddingThresholdChanged =
    nextEmbeddingThreshold !== group.embedding_match_threshold;
  const authenticityDraftValid = [
    authenticityDraft.expected_feature,
    authenticityDraft.violation_pattern,
    authenticityDraft.inspection_instruction,
    authenticityDraft.visibility_rule,
  ].every((value) => value.trim().length >= 10) && (
    authenticityDraft.failure_action !== "takedown" ||
    (authenticityDraft.rationale?.trim().length ?? 0) >= 10
  );
  const referenceRankByImageId = new Map(
    visualEvidence?.references.map((reference) => [
      reference.image_id,
      reference.reference_rank,
    ]) ?? [],
  );
  const referenceByImageId = new Map(
    visualEvidence?.references.map((reference) => [reference.image_id, reference]) ?? [],
  );
  const primaryVisualEvidenceByProfileId = new Map(
    visualEvidence?.members.flatMap((member) => {
      const primaryImage = member.images.reduce(
        (current, image) =>
          current == null || image.position < current.position ? image : current,
        null as ProductGroupVisualEvidence["members"][number]["images"][number] | null,
      );
      return primaryImage ? [[member.profile_id, primaryImage] as const] : [];
    }) ?? [],
  );
  const manualReferenceCount = visualEvidence?.references.filter(
    (reference) => reference.selection_source === "manual",
  ).length ?? 0;

  function beginProductConfirmation() {
    setName("");
    setSelectedShopifyCategory(productGroupShopifyCategory(group));
    setManaging(false);
    setEditingName(true);
  }

  async function saveName() {
    if (!trimmedName) return;
    try {
      await onConfirmGroup(
        group.id,
        trimmedName,
        shopifyCategoryChanged && selectedShopifyCategory
          ? selectedShopifyCategory
          : undefined,
      );
      setEditingName(false);
      setManaging(true);
    } catch {
      // The parent keeps the editor open and displays the API error.
    }
  }

  async function loadVisualEvidence() {
    setLoadingVisualEvidence(true);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await calculatePersistedProductGroupVisualEvidence(ipId, group.id),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setLoadingVisualEvidence(false);
    }
  }

  async function pinReferenceImage(imageId: string) {
    setSavingReferenceImageId(imageId);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await pinPersistedProductGroupReferenceImage(ipId, group.id, imageId),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setSavingReferenceImageId(null);
    }
  }

  async function removeReferenceImage(imageId: string) {
    setSavingReferenceImageId(imageId);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await removePersistedProductGroupReferenceImage(ipId, group.id, imageId),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setSavingReferenceImageId(null);
    }
  }

  async function resetReferenceImages() {
    setResettingReferences(true);
    setVisualEvidenceError(null);
    try {
      setVisualEvidence(
        await resetPersistedProductGroupReferenceImages(ipId, group.id),
      );
    } catch (caught: unknown) {
      setVisualEvidenceError(errorMessage(caught));
    } finally {
      setResettingReferences(false);
    }
  }

  async function openMergeReview(targetGroupId: string) {
    setLoadingMergeReviewTargetId(targetGroupId);
    setMergeReviewError(null);
    try {
      const target = availableGroups.find((candidate) => candidate.id === targetGroupId) ??
        await onLoadGroupForReview(targetGroupId);
      if (!target) return;
      setResolvedMergeReviewTarget(target);
      setMergeReviewTargetId(targetGroupId);
    } finally {
      setLoadingMergeReviewTargetId(null);
    }
  }

  const displayedCommercialSubgroups = mode === "same"
    ? group.commercial_subgroups.filter((subgroup) =>
        showingPersistedMembers
          ? subgroup.member_count > 0
          : subgroup.triage_member_count > 0
      )
    : [];
  const availableCommercialSubgroups = mode === "same"
    ? group.commercial_subgroups.filter((subgroup) => subgroup.member_count > 0)
    : [];
  const selectedCommercialSubgroup = displayedCommercialSubgroups.find(
    (subgroup) => subgroup.key === selectedCommercialSubgroupKey,
  ) ?? displayedCommercialSubgroups[0] ?? null;
  const renderedCommercialSubgroups = workspace
    ? selectedCommercialSubgroup ? [selectedCommercialSubgroup] : []
    : displayedCommercialSubgroups;

  const renderProductMember = (profile: ProductClusterProfile) => {
    const primaryVisualEvidence = primaryVisualEvidenceByProfileId.get(profile.id);
    if (workspace) {
      return (
        <ProductListingRow
          key={profile.id}
          profile={profile}
          active={activeTaskProfileId === profile.id}
          loading={loadingTaskProfileId === profile.id}
          onOpen={() => onOpenTask(profile, group.id)}
          correctionDisabled={Boolean(savingCorrectionProfileId)}
          onRemove={canConfirm && group.member_count > 1 && (!confirmed || managing)
            ? () => void onCorrectGroupMember(group.id, profile.id, "wrong_product")
              .catch(() => undefined)
            : undefined}
        />
      );
    }
    return (
      <div key={profile.id} className="group/member relative min-w-0">
        <ListingTile
          profile={profile}
          active={activeTaskProfileId === profile.id}
          loading={loadingTaskProfileId === profile.id}
          onClick={() => onOpenTask(profile, group.id)}
          groupImageSimilarity={mode === "visual"
            ? profile.group_image_similarity
            : undefined}
          groupImagePosition={mode === "visual"
            ? profile.group_image_position
            : undefined}
          visualSupportIsReference={primaryVisualEvidence?.is_reference}
        />
        {canConfirm && group.member_count > 1 && (!confirmed || managing) && (
          <button
            type="button"
            aria-label={`Remove ${profileTitle(profile)} from this product`}
            title="This listing belongs to a different underlying product"
            disabled={Boolean(savingCorrectionProfileId)}
            onClick={() => {
              void onCorrectGroupMember(group.id, profile.id, "wrong_product")
                .catch(() => undefined);
            }}
            className={`mt-2 inline-flex w-full items-center justify-center rounded-md px-2 py-1.5 text-[10px] font-semibold text-stone-500 transition hover:bg-red-50 hover:text-red-700 focus:bg-red-50 focus:text-red-700 disabled:opacity-40 ${
              confirmed ? "opacity-0 group-hover/member:opacity-100 group-focus-within/member:opacity-100" : "opacity-100"
            }`}
          >
            Different product
          </button>
        )}
      </div>
    );
  };

  const renderProductFinding = (
    finding: IpReviewFinding,
    priceSummary: ProductGroupPriceSummary | null,
  ) => {
    const profile = productClusterProfileForFinding(finding, priceSummary);
    if (workspace) {
      return (
        <ProductListingRow
          profile={profile}
          active={activeTaskProfileId === profile.id}
          onOpen={() => onOpenFinding(finding, group.id)}
          assignee={finding.assigned_to_account_id ? (
            <AssigneeAvatar
              accountId={finding.assigned_to_account_id}
              displayName={finding.assignee_display_name}
              email={finding.assignee_email}
              pictureUrl={finding.assignee_picture_url}
              size={24}
            />
          ) : null}
        />
      );
    }
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
  };

  return (
    <section
      id={`product-group-${group.id}`}
      data-product-group-id={group.id}
      className={`scroll-mt-4 bg-white transition target:ring-4 target:ring-violet-200 ${
        workspace ? "rounded-xl border border-stone-200 p-4 sm:p-5" : "rounded-2xl border p-4 shadow-sm"
      } ${
        confirmed
          ? "border-emerald-200"
          : mode === "visual"
            ? "border-indigo-200"
            : "border-stone-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          {workspace && (
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-20 sm:w-20">
              {workspaceRepresentative?.image_url ? (
                <img
                  src={workspaceRepresentative.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xl font-black text-stone-400">
                  {productGroupDisplayName(group).slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
          )}
          <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
            confirmed
              ? "text-emerald-700"
              : mode === "visual"
                ? "text-indigo-700"
                : "text-stone-500"
          }`}>
            {confirmed && <CheckCircle2 size={13} />}
            {confirmed
              ? "Confirmed group"
              : mode === "same"
                ? `Potential product group ${index + 1}`
                : mode === "related"
                  ? `Related family ${index + 1}`
                  : `Visual group ${index + 1}`}
          </p>
          {confirmed && group.display_name ? (
            <h2 className={`mt-1 line-clamp-2 font-black text-stone-950 ${
              workspace ? "text-xl sm:text-2xl" : "text-sm"
            }`}>
              {group.display_name}
            </h2>
          ) : (
            <>
              {workspace && (
                <h2 className="mt-1 line-clamp-2 text-xl font-black text-stone-950 sm:text-2xl">
                  {productGroupDisplayName(group)}
                </h2>
              )}
              <p className="mt-1 text-[11px] text-stone-500">
                {mode === "visual"
                  ? "Automatically grouped by shared gallery appearance"
                  : productGroupNameProvenance(group) ?? "Awaiting confirmation"}
              </p>
            </>
          )}
          {confirmed && group.confirmed_at && (
            <p className="mt-1 text-[10px] text-emerald-700">
              Confirmed {new Date(group.confirmed_at).toLocaleString()}
            </p>
          )}
          {workspace && group.catalog_primary_category_path && (
            <p className="mt-1 line-clamp-2 text-xs text-stone-500">
              {group.catalog_primary_category_path}
              {group.catalog_primary_category_source === "reviewer" && (
                <span className="font-semibold text-blue-700"> · Reviewer selected</span>
              )}
            </p>
          )}
          {mode === "same" && group.atomic_cohort_count > 1 && (
            <p className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
              {group.atomic_cohort_count} evidence cohorts combined
            </p>
          )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-stone-900">
            {showingPersistedMembers
              ? `${group.member_count} persisted ${group.member_count === 1 ? "listing" : "listings"}`
              : `${triageMemberCount} to triage`}
          </p>
          <p className="mt-0.5 text-[10px] text-stone-500">
            {!showingPersistedMembers && <>{group.member_count} persisted · </>}
            Avg {mode === "same"
              ? "same-product"
              : mode === "related"
                ? "related-product"
                : "image similarity"}{" "}
            {group.average_score?.toFixed(3) ?? "—"}
          </p>
          {group.price_summary && displayedCommercialSubgroups.length === 0 && (
            <ProductGroupPriceSummaryView summary={group.price_summary} />
          )}
          {showingPersistedMembers && triageProjectionAvailable && (
            <p className={`mt-0.5 text-[10px] font-semibold ${
              triageMemberCount > 0 ? "text-red-700" : "text-emerald-700"
            }`}>
              {triageMemberCount > 0
                ? `${triageMemberCount} still to triage`
                : "No listings need triage"}
            </p>
          )}
          {confirmed && mode === "same" && (
            <>
              <p className="mt-1 text-[10px] font-semibold text-blue-700">
                {group.rules.length} active rule{group.rules.length === 1 ? "" : "s"}
              </p>
              {group.embedding_match_threshold != null && (
                <p className="mt-0.5 text-[10px] font-semibold text-violet-700">
                  Multimodal gate ≥ {group.embedding_match_threshold.toFixed(2)}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {canConfirm && !editingName && !settingsOnly && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (confirmed) {
                setName(group.display_name ?? "");
                setSelectedShopifyCategory(productGroupShopifyCategory(group));
                if (workspace) {
                  setWorkspaceSection("settings");
                  setManaging(true);
                } else {
                  setManaging((current) => !current);
                }
              } else {
                beginProductConfirmation();
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
              confirmed
                ? "border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 hover:bg-blue-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"
            }`}
          >
            {confirmed ? <Settings2 size={14} /> : <CheckCircle2 size={14} />}
            {confirmed
              ? workspace
                ? "Manage product"
                : (managing ? "Close group settings" : "Manage group")
              : "Confirm & edit"}
          </button>
          {confirmed && mode === "same" && !managing && (
            <button
              type="button"
              disabled={loadingVisualEvidence}
              onClick={() => {
                if (workspace) {
                  setWorkspaceSection("settings");
                  setManaging(true);
                }
                void loadVisualEvidence();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
            >
              <Images size={14} />
              {loadingVisualEvidence
                ? "Calculating…"
                : visualEvidence
                  ? "Refresh image similarity"
                  : "Show image similarity"}
            </button>
          )}
          {!workspace && mode === "same" && (
            mergeSourceGroup ? (
              selectedAsMergeSource ? (
                <button
                  type="button"
                  disabled={Boolean(savingMergeKey)}
                  onClick={() => onSelectMergeSource(null)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
                >
                  <X size={14} />
                  Cancel selection
                </button>
              ) : (
                <button
                  type="button"
                  disabled={Boolean(savingMergeKey) || alreadySameCanonicalProduct}
                  onClick={() => {
                    void onMergeGroups(mergeSourceGroup.id, group.id).catch(() => undefined);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Check size={14} />
                  {alreadySameCanonicalProduct
                    ? "Already one product"
                    : savingThisMerge
                      ? "Combining…"
                      : "Merge with selected product"}
                </button>
              )
            ) : (
              <button
                type="button"
                disabled={Boolean(savingMergeKey)}
                onClick={() => onSelectMergeSource(group.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:border-violet-300 hover:bg-violet-100 disabled:opacity-40"
              >
                <Plus size={14} />
                Merge with…
              </button>
            )
          )}
        </div>
      )}
      {workspace && !settingsOnly && (
        <nav
          className="mt-5 flex gap-1 overflow-x-auto border-b border-stone-200"
          aria-label="Product workspace sections"
        >
          {([
            ["review", `Review queue · ${triageMemberCount}`],
            ["history", `Task history · ${group.catalog_task_count}`],
            ["offers", `Offers · ${availableCommercialSubgroups.length}`],
            [
              "settings",
              confirmed ? "Group settings" : "Group settings · Confirm first",
            ],
            ["audit", `Merge audit · ${group.canonical_decisions.length}`],
          ] as Array<[ProductWorkspaceSection, string]>).map(([section, label]) => (
            <button
              key={section}
              type="button"
              aria-current={workspaceSection === section ? "page" : undefined}
              onClick={() => {
                setWorkspaceSection(section);
                setManaging(section === "settings" && confirmed);
                if (section === "history") {
                  onLoadTaskHistory();
                }
              }}
              className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-bold transition ${
                workspaceSection === section
                  ? "border-stone-950 text-stone-950"
                  : "border-transparent text-stone-500 hover:border-stone-300 hover:text-stone-800"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {!managing && visualEvidenceError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
          {visualEvidenceError}
        </p>
      )}

      {mode === "same" && reconciliationSuggestions.length > 0 &&
        (!workspace || workspaceSection === "audit") && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-bold text-amber-950">Possible duplicate product group</p>
          <p className="mt-0.5 text-[11px] leading-4 text-amber-800">
            Distributed cross-listing evidence supports the same underlying product. Review the target before combining them.
          </p>
          <div className="mt-2 space-y-2">
            {reconciliationSuggestions.map((suggestion) => (
              <ProductGroupReconciliationPreview
                key={suggestion.target_group_id}
                suggestion={suggestion}
                targetGroup={availableGroups.find(
                  (candidate) => candidate.id === suggestion.target_group_id,
                ) ?? null}
                mergeBusy={Boolean(savingMergeKey)}
                loading={loadingMergeReviewTargetId === suggestion.target_group_id}
                onReview={() => void openMergeReview(suggestion.target_group_id)}
              />
            ))}
          </div>
        </div>
      )}

      {mode === "same" && group.canonical_decisions.length > 0 &&
        (!workspace || workspaceSection === "audit") && (
        <details className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-bold text-violet-900">
            Merge history · {group.canonical_decisions.length}
          </summary>
          <p className="mt-1 text-[10px] leading-4 text-violet-700">
            Undo removes this decision. Other decisions in the history may still keep some cohorts combined.
          </p>
          <div className="mt-2 space-y-2">
            {group.canonical_decisions.map((decision) => (
              <div
                key={decision.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-inset ring-violet-100"
              >
                <div>
                  <p className="text-[11px] font-semibold text-stone-800">
                    {decision.decision_source === "reviewer"
                      ? "Reviewer-confirmed merge"
                      : "High-confidence automatic merge"}
                  </p>
                  <p className="mt-0.5 text-[9px] text-stone-500">
                    {new Date(decision.created_at).toLocaleString()} · confidence {Math.round(decision.confidence * 100)}%
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(revokingMergeDecisionId)}
                  onClick={() => {
                    void onRevokeMerge(group.id, decision.id).catch(() => undefined);
                  }}
                  className="rounded-md border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-700 hover:border-red-200 hover:bg-red-50 hover:text-red-800 disabled:opacity-40"
                >
                  {revokingMergeDecisionId === decision.id ? "Undoing…" : "Undo merge"}
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {canConfirm && editingName && (
        <form
          className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <label className="block">
            <span className="text-xs font-bold text-emerald-900">Product name</span>
            <input
              autoFocus
              type="text"
              required
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <span className="mt-1 block text-[10px] leading-4 text-emerald-800">
              Use a concise, generic English name for this product—not one marketplace listing title.
            </span>
          </label>
          {canEditShopifyCategory && (
            <div className="mt-3 border-t border-emerald-200 pt-3">
              <ShopifyCategoryPicker
                ipId={ipId}
                selected={selectedShopifyCategory}
                onSelect={setSelectedShopifyCategory}
                disabled={saving}
              />
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingName(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !trimmedName || !productDetailsChanged}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {saving ? "Saving…" : confirmed ? "Save details" : "Confirm product"}
            </button>
          </div>
        </form>
      )}

      {workspace && workspaceSection === "settings" && !confirmed && !editingName && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-white p-2 text-amber-700 ring-1 ring-inset ring-amber-200">
              <LockKeyhole size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-amber-950">
                Confirm this product to unlock group settings
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-800">
                Review the product name and category first. After confirmation, you can change matching, representative images, and reviewer rules.
              </p>
              <button
                type="button"
                onClick={beginProductConfirmation}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-800"
              >
                <CheckCircle2 size={14} />
                Confirm &amp; edit product
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmed && managing && (!workspace || workspaceSection === "settings") && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                <Settings2 size={14} />
                Group settings
              </p>
              <p className="mt-1 text-[11px] text-blue-700">
                {mode === "same"
                  ? settingsOnly
                    ? "Update the product name or Shopify category, adjust how closely new listings must match, and manage representative images and rules."
                    : "Update the product name or Shopify category, adjust how closely new listings must match, manage representative images and rules, or remove a listing below."
                  : "Rename this confirmed group or remove an incorrect image-backed placement below."}
              </p>
            </div>
            {!settingsOnly && (
              <button
                type="button"
                onClick={() => setManaging(false)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
              >
                Done
              </button>
            )}
          </div>

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <div className={`grid gap-4 ${canEditShopifyCategory ? "lg:grid-cols-2" : ""}`}>
              <label className="block">
                <span className="text-xs font-bold text-stone-800">Product name</span>
                <input
                  type="text"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <span className="mt-1 block text-[10px] leading-4 text-stone-500">
                  Keep it concise, generic and independent of any one listing title.
                </span>
              </label>
              {canEditShopifyCategory && (
                <ShopifyCategoryPicker
                  ipId={ipId}
                  selected={selectedShopifyCategory}
                  onSelect={setSelectedShopifyCategory}
                  disabled={saving}
                />
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={saving || !trimmedName || !productDetailsChanged}
                className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save product details"}
              </button>
            </div>
          </form>

          {mode === "same" && (
            <>
          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold text-stone-900">
                  <Images size={14} />
                  Image similarity
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Compare every stored listing image with this product’s persisted
                  reference images from other listings in the group. Each number is
                  raw image-to-image cosine similarity to the closest reference.
                  It is explanatory only: it does not control group membership,
                  indicate authenticity probability, or represent the final
                  same-product score. Pin authoritative views, or remove an
                  unsuitable reference to suppress it from automatic selection.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingVisualEvidence}
                onClick={() => void loadVisualEvidence()}
                className="shrink-0 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
              >
                {loadingVisualEvidence
                  ? "Calculating…"
                  : visualEvidence
                    ? "Refresh similarity"
                    : "Show image similarity"}
              </button>
            </div>

            {visualEvidenceError && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
                {visualEvidenceError}
              </p>
            )}

            {visualEvidence && (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-indigo-100 bg-white p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-bold text-stone-800">
                        Product reference images
                      </p>
                      <p className="mt-0.5 text-[9px] text-stone-500">
                        {manualReferenceCount} manual · automatic images fill the remaining slots
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={resettingReferences || Boolean(savingReferenceImageId)}
                      onClick={() => void resetReferenceImages()}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-40"
                    >
                      <RotateCcw size={11} />
                      {resettingReferences ? "Resetting…" : "Reset to automatic"}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {visualEvidence.references.map((reference) => (
                      <div key={reference.id} className="min-w-0">
                        <div className="relative aspect-square overflow-hidden rounded-md bg-stone-100">
                          {reference.image_url ? (
                            <img
                              src={reference.image_url}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center text-[10px] text-stone-400">
                              No image
                            </span>
                          )}
                          <span className="absolute left-1 top-1 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            Ref #{reference.reference_rank}
                          </span>
                          <button
                            type="button"
                            title="Remove and suppress this reference"
                            aria-label={`Remove reference ${reference.reference_rank}`}
                            disabled={Boolean(savingReferenceImageId) || resettingReferences}
                            onClick={() => void removeReferenceImage(reference.image_id)}
                            className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-stone-500 shadow-sm hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                          >
                            <X size={11} />
                          </button>
                          <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                            reference.selection_source === "manual"
                              ? "bg-emerald-700/90"
                              : "bg-stone-700/85"
                          }`}>
                            {reference.selection_source === "manual" ? "Manual" : "Auto"}
                          </span>
                        </div>
                        <p
                          className="mt-1 truncate text-[9px] text-stone-500"
                          title={reference.listing_title ?? undefined}
                        >
                          {reference.listing_title || `View ${reference.position + 1}`}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {visualEvidence.members.map((member) => (
                  <div
                    key={member.profile_id}
                    className="rounded-lg border border-stone-200 bg-white p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-[11px] font-bold text-stone-800">
                        {member.listing_title || "Untitled listing"}
                      </p>
                      <span className="shrink-0 text-[9px] text-stone-500">
                        {member.platform || `Listing #${member.member_rank}`}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {member.images.map((image) => {
                        const matchedReferenceRank = image.matched_reference_image_id
                          ? referenceRankByImageId.get(image.matched_reference_image_id)
                          : null;
                        const reference = referenceByImageId.get(image.image_id);
                        const savingThisReference = savingReferenceImageId === image.image_id;
                        return (
                          <div
                            key={image.image_id}
                            className="overflow-hidden rounded-md border border-stone-200 bg-stone-50"
                          >
                            <div className="relative aspect-square overflow-hidden bg-stone-100">
                              {image.image_url ? (
                                <img
                                  src={image.image_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <span className="flex h-full items-center justify-center text-[10px] text-stone-400">
                                  No image
                                </span>
                              )}
                              <span
                                className="absolute right-1 top-1 rounded bg-white/95 px-1.5 py-0.5 font-mono text-[9px] font-bold text-indigo-900 shadow-sm"
                                title="Raw cosine similarity to the closest product reference image"
                              >
                                {image.visual_support_score == null
                                  ? "Image sim —"
                                  : `Image sim ${image.visual_support_score.toFixed(2)}`}
                              </span>
                              {image.is_reference && (
                                <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${
                                  reference?.selection_source === "manual"
                                    ? "bg-emerald-700/90"
                                    : "bg-indigo-900/85"
                                }`}>
                                  {reference?.selection_source === "manual"
                                    ? "Manual reference"
                                    : "Auto reference"}
                                </span>
                              )}
                            </div>
                            <div className="px-1.5 py-1.5">
                              <p className="text-[9px] text-stone-500">
                                {matchedReferenceRank
                                  ? `Closest to ref #${matchedReferenceRank}`
                                  : "No separate reference available"}
                              </p>
                              <div className="mt-1 flex gap-1">
                                {reference?.selection_source !== "manual" && (
                                  <button
                                    type="button"
                                    disabled={Boolean(savingReferenceImageId) || resettingReferences}
                                    onClick={() => void pinReferenceImage(image.image_id)}
                                    className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-1 text-[9px] font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40"
                                  >
                                    <Pin size={9} />
                                    {savingThisReference
                                      ? "Saving…"
                                      : image.is_reference
                                        ? "Make manual"
                                        : "Use as reference"}
                                  </button>
                                )}
                                {image.is_reference && (
                                  <button
                                    type="button"
                                    disabled={Boolean(savingReferenceImageId) || resettingReferences}
                                    onClick={() => void removeReferenceImage(image.image_id)}
                                    className="rounded bg-stone-100 px-1.5 py-1 text-[9px] font-semibold text-stone-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                                  >
                                    {savingThisReference ? "Removing…" : "Remove"}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {visualEvidence.truncated && (
                  <p className="text-[10px] text-stone-500">
                    Showing image evidence for {visualEvidence.members.length} of{" "}
                    {visualEvidence.member_count} listings.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">
                  Extra similarity check for new matches
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Unvelar already compares each listing’s photos and product details.
                  Leave this extra check off unless unrelated listings keep appearing
                  in this product.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  When it is on, listings must first look and read similar enough to
                  the listings already here. Genuine offers often use different
                  photos, angles, backgrounds, packaging, languages, or incomplete
                  descriptions. Those differences can make a real match fail this
                  early check before the full product matcher can assess it.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  Use it when reducing incorrect matches matters more than finding
                  every genuine offer. It only affects new listings and listings not
                  yet in this product; it will not remove listings already here.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-bold text-violet-800">
                {embeddingThresholdEnabled
                  ? `On · ${embeddingThresholdDraft.toFixed(2)}`
                  : "Off"}
              </span>
            </div>

            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={embeddingThresholdEnabled}
                onChange={(event) => {
                  setEmbeddingThresholdEnabled(event.target.checked);
                  setEmbeddingThresholdNotice(null);
                }}
                className="h-4 w-4 rounded border-stone-300 text-violet-700 focus:ring-violet-200"
              />
              Use this extra check for new matches
            </label>

            <div className={`mt-3 ${embeddingThresholdEnabled ? "" : "opacity-45"}`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                disabled={!embeddingThresholdEnabled}
                value={embeddingThresholdDraft}
                onChange={(event) => {
                  setEmbeddingThresholdDraft(Number(event.target.value));
                  setEmbeddingThresholdNotice(null);
                }}
                className="w-full accent-violet-700"
                aria-label="How closely new listings must resemble this product"
              />
              <div className="mt-1 flex justify-between text-[10px] text-stone-500">
                <span>Allow more variation</span>
                <span>Require a closer overall match</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-stone-500">
                Listings that pass this extra check still go through the normal
                product matching process. This setting does not decide whether a
                listing is authentic or should be taken down.
              </p>
              <button
                type="button"
                disabled={savingEmbeddingThreshold || !embeddingThresholdChanged}
                onClick={() => {
                  setSavingEmbeddingThreshold(true);
                  setEmbeddingThresholdNotice(null);
                  void onUpdateEmbeddingThreshold(group.id, nextEmbeddingThreshold)
                    .then(() => {
                      setEmbeddingThresholdNotice(
                        "Saved. The extra check now applies to new matches. We’re refreshing this product in the background.",
                      );
                    })
                    .catch(() => undefined)
                    .finally(() => setSavingEmbeddingThreshold(false));
                }}
                className="shrink-0 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
              >
                {savingEmbeddingThreshold ? "Saving…" : "Save matching setting"}
              </button>
            </div>
            {embeddingThresholdNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {embeddingThresholdNotice}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">What belongs to this product</p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Use these rules only to distinguish this product from a different
                  design, model or formula. Do not use size, price, condition or signs
                  of a possible counterfeit here. Those listings should still join
                  this product so Unvelar can inspect them correctly.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-800">
                {group.rules.length} active
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {group.rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-stone-200 bg-white p-2.5">
                  {editingRuleId === rule.id ? (
                    <>
                      <textarea
                        autoFocus
                        value={editingRuleText}
                        maxLength={1000}
                        rows={3}
                        onChange={(event) => setEditingRuleText(event.target.value)}
                        className="w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={savingRule}
                          onClick={() => setEditingRuleId(null)}
                          className="rounded-lg px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={savingRule || editingRuleText.trim().length < 10}
                          onClick={() => {
                            setSavingRule(true);
                            void onUpdateRule(group.id, rule.id, editingRuleText.trim())
                              .then((result) => {
                                setEditingRuleId(null);
                                setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                              })
                              .catch(() => undefined)
                              .finally(() => setSavingRule(false));
                          }}
                          className="rounded-lg bg-blue-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                        >
                          Save rule
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-xs leading-5 text-stone-800">
                        {rule.instruction}
                      </p>
                      <button
                        type="button"
                        title="Edit rule"
                        onClick={() => {
                          setEditingRuleId(rule.id);
                          setEditingRuleText(rule.instruction);
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Remove rule"
                        disabled={savingRule}
                        onClick={() => {
                          setSavingRule(true);
                          void onDeleteRule(group.id, rule.id)
                            .then((result) => {
                              setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                            })
                            .catch(() => undefined)
                            .finally(() => setSavingRule(false));
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {group.rules.length === 0 && (
                <p className="rounded-lg border border-dashed border-stone-300 bg-white/70 px-3 py-3 text-xs text-stone-500">
                  No product-specific rules yet. Add only characteristics that distinguish this underlying product from a different design or model.
                </p>
              )}
            </div>

            <form
              className="mt-2"
              onSubmit={(event) => {
                event.preventDefault();
                const instruction = ruleDraft.trim();
                if (instruction.length < 10) return;
                setSavingRule(true);
                void onCreateRule(group.id, instruction)
                  .then((result) => {
                    setRuleDraft("");
                    setRuleNotice(rescoreNotice(result.rescore_jobs_enqueued));
                  })
                  .catch(() => undefined)
                  .finally(() => setSavingRule(false));
              }}
            >
              <textarea
                value={ruleDraft}
                maxLength={1000}
                rows={3}
                placeholder='Example: "This product is the Bianco Latte fragrance, not another Giardini di Toscana fragrance."'
                onChange={(event) => setRuleDraft(event.target.value)}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Changes recheck current membership and automatically apply to future listings.
                </p>
                <button
                  type="submit"
                  disabled={savingRule || ruleDraft.trim().length < 10}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  <Plus size={13} />
                  {savingRule ? "Saving…" : "Add rule"}
                </button>
              </div>
            </form>
            {ruleNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {ruleNotice}
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-blue-200 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-stone-900">Authenticity checks</p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  These checks run after a listing has joined this product. They never
                  remove it from the product. Current listings are rechecked when a
                  check changes, and future listings are checked automatically.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-stone-600">
                  A check fails only when the listing clearly shows the required area
                  and the feature is demonstrably wrong or missing. If the right photo
                  is absent, cropped or blurry, the result is <strong>Not visible</strong>—
                  it is not treated as counterfeit.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[10px] font-bold text-blue-800">
                {group.authenticity_rules.length} active
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {group.authenticity_rules.map((rule) => (
                <div key={rule.id} className="rounded-lg border border-stone-200 bg-white p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="text-xs font-bold text-stone-900">
                          {rule.expected_feature}
                        </p>
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          rule.failure_action === "takedown"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-800"
                        }`}>
                          {rule.failure_action === "takedown"
                            ? "Can recommend takedown"
                            : "Review only"}
                        </span>
                      </div>
                      <dl className="mt-2 grid gap-1.5 text-[10px] leading-4 text-stone-600 sm:grid-cols-2">
                        <div>
                          <dt className="font-bold text-stone-700">Clear failure</dt>
                          <dd>{rule.violation_pattern}</dd>
                        </div>
                        <div>
                          <dt className="font-bold text-stone-700">Enough evidence to judge</dt>
                          <dd>{rule.visibility_rule}</dd>
                        </div>
                        {rule.applicability && (
                          <div className="sm:col-span-2">
                            <dt className="font-bold text-stone-700">Applies to</dt>
                            <dd>{rule.applicability}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                    <button
                      type="button"
                      title="Edit authenticity check"
                      disabled={savingAuthenticityRule}
                      onClick={() => {
                        setEditingAuthenticityRuleId(rule.id);
                        setAuthenticityDraft(authenticityRuleInput(rule));
                        setAuthenticityNotice(null);
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      title="Remove authenticity check"
                      disabled={savingAuthenticityRule}
                      onClick={() => {
                        setSavingAuthenticityRule(true);
                        setAuthenticityNotice(null);
                        void onDeleteAuthenticityRule(group.id, rule.id)
                          .then((result) => {
                            if (editingAuthenticityRuleId === rule.id) {
                              setEditingAuthenticityRuleId(null);
                              setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                            }
                            setAuthenticityNotice(
                              authenticityJobsNotice(result.assessment_jobs_enqueued),
                            );
                          })
                          .catch(() => undefined)
                          .finally(() => setSavingAuthenticityRule(false));
                      }}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {group.authenticity_rules.length === 0 && (
                <p className="rounded-lg border border-dashed border-stone-300 bg-white/70 px-3 py-3 text-xs leading-5 text-stone-500">
                  No authenticity checks yet. Add only facts confirmed by the
                  rightsholder or reliable genuine samples across the packaging
                  versions this check covers.
                </p>
              )}
            </div>

            <form
              className="mt-3 rounded-lg border border-stone-200 bg-white p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!authenticityDraftValid) return;
                const input: ProductGroupAuthenticityRuleInput = {
                  ...authenticityDraft,
                  expected_feature: authenticityDraft.expected_feature.trim(),
                  violation_pattern: authenticityDraft.violation_pattern.trim(),
                  inspection_instruction: authenticityDraft.inspection_instruction.trim(),
                  visibility_rule: authenticityDraft.visibility_rule.trim(),
                  applicability: authenticityDraft.applicability?.trim() || null,
                  rationale: authenticityDraft.rationale?.trim() || null,
                };
                setSavingAuthenticityRule(true);
                setAuthenticityNotice(null);
                const save = editingAuthenticityRuleId
                  ? onUpdateAuthenticityRule(
                      group.id,
                      editingAuthenticityRuleId,
                      input,
                    )
                  : onCreateAuthenticityRule(group.id, input);
                void save
                  .then((result) => {
                    setEditingAuthenticityRuleId(null);
                    setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                    setAuthenticityNotice(
                      authenticityJobsNotice(result.assessment_jobs_enqueued),
                    );
                  })
                  .catch(() => undefined)
                  .finally(() => setSavingAuthenticityRule(false));
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold text-stone-900">
                  {editingAuthenticityRuleId ? "Edit authenticity check" : "Add an authenticity check"}
                </p>
                {editingAuthenticityRuleId && (
                  <button
                    type="button"
                    disabled={savingAuthenticityRule}
                    onClick={() => {
                      setEditingAuthenticityRuleId(null);
                      setAuthenticityDraft(EMPTY_AUTHENTICITY_RULE);
                    }}
                    className="text-[10px] font-bold text-stone-500 hover:text-stone-800"
                  >
                    Cancel editing
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-stone-700">
                  What genuine items should show
                  <textarea
                    value={authenticityDraft.expected_feature}
                    maxLength={1000}
                    rows={3}
                    placeholder="Example: A printed lot number appears in the bottom-right corner of the box’s bottom panel."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      expected_feature: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  What counts as a clear failure
                  <textarea
                    value={authenticityDraft.violation_pattern}
                    maxLength={1000}
                    rows={3}
                    placeholder="Example: The complete bottom panel is clear, but no lot number is present in that area."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      violation_pattern: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  How Unvelar should check it
                  <textarea
                    value={authenticityDraft.inspection_instruction}
                    maxLength={1000}
                    rows={3}
                    placeholder="Inspect every gallery image for the bottom panel and compare the position and format of the printed code."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      inspection_instruction: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  When there is enough evidence to judge
                  <textarea
                    value={authenticityDraft.visibility_rule}
                    maxLength={1000}
                    rows={3}
                    placeholder="Only judge when the whole bottom panel is visible, uncropped and sharp enough to read."
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      visibility_rule: event.target.value,
                    }))}
                    className="mt-1 w-full resize-y rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </div>

              <label className="mt-3 block text-[10px] font-bold text-stone-700">
                Which packaging versions or markets this applies to <span className="font-normal text-stone-400">(optional)</span>
                <input
                  value={authenticityDraft.applicability ?? ""}
                  maxLength={1000}
                  placeholder="Example: 100 ml European retail boxes introduced in 2025."
                  onChange={(event) => setAuthenticityDraft((current) => ({
                    ...current,
                    applicability: event.target.value || null,
                  }))}
                  className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-bold text-stone-700">
                  Where to check
                  <select
                    value={authenticityDraft.modality}
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      modality: event.target.value as ProductGroupAuthenticityRuleInput["modality"],
                    }))}
                    className="mt-1 min-h-9 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="image">Listing photos</option>
                    <option value="description">Listing text</option>
                    <option value="both">Photos and text</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold text-stone-700">
                  If it clearly fails
                  <select
                    value={authenticityDraft.failure_action}
                    onChange={(event) => setAuthenticityDraft((current) => ({
                      ...current,
                      failure_action: event.target.value as ProductGroupAuthenticityRuleInput["failure_action"],
                    }))}
                    className="mt-1 min-h-9 w-full rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-normal text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="review">Send to human review</option>
                    <option value="takedown">Allow a takedown recommendation</option>
                  </select>
                </label>
              </div>

              {authenticityDraft.failure_action === "takedown" && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-[10px] leading-4 text-red-800">
                    This does not send a takedown automatically. It can recommend one
                    only when the product identity is strong, the rule is clearly
                    violated, and current evidence reaches high confidence.
                  </p>
                  <label className="mt-2 block text-[10px] font-bold text-red-900">
                    Why this is reliable enough to support takedown
                    <textarea
                      value={authenticityDraft.rationale ?? ""}
                      maxLength={2000}
                      rows={3}
                      placeholder="Describe the rightsholder source, genuine samples and packaging versions that confirm this feature."
                      onChange={(event) => setAuthenticityDraft((current) => ({
                        ...current,
                        rationale: event.target.value || null,
                      }))}
                      className="mt-1 w-full resize-y rounded-lg border border-red-200 bg-white px-2.5 py-2 text-xs font-normal text-stone-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                    />
                  </label>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Passed checks support authenticity but never prove it by themselves.
                </p>
                <button
                  type="submit"
                  disabled={savingAuthenticityRule || !authenticityDraftValid}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-900 disabled:opacity-40"
                >
                  <Plus size={13} />
                  {savingAuthenticityRule
                    ? "Saving…"
                    : editingAuthenticityRuleId
                      ? "Save check"
                      : "Add check"}
                </button>
              </div>
            </form>

            {authenticityNotice && (
              <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-800">
                {authenticityNotice}
              </p>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {workspace && workspaceSection === "review" && displayedCommercialSubgroups.length > 1 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-stone-500">
            Comparable offer
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {displayedCommercialSubgroups.map((subgroup) => {
              const count = showingPersistedMembers
                ? subgroup.member_count
                : subgroup.triage_member_count;
              const selected = selectedCommercialSubgroup?.key === subgroup.key;
              return (
                <button
                  key={subgroup.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedCommercialSubgroupKey(subgroup.key)}
                  className={`min-h-11 shrink-0 rounded-lg border px-3 text-left text-sm font-bold transition ${
                    selected
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span>{subgroup.variant_label}</span>
                    {subgroup.price_band === "unusually_low" ? (
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ring-1 ring-inset ${
                        selected
                          ? "bg-red-400/20 text-red-100 ring-red-300/30"
                          : "bg-red-50 text-red-700 ring-red-200"
                      }`}>
                        {count} low-price {count === 1 ? "listing" : "listings"}
                      </span>
                    ) : (
                      <span className={`text-xs ${selected ? "text-stone-300" : "text-stone-400"}`}>
                        {count}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {workspace && workspaceSection === "history" && (
        <div className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-stone-950">All linked tasks</h3>
              <p className="mt-1 text-sm text-stone-500">
                {catalogSupported
                  ? "Current and resolved tasks stay attached to this canonical product."
                  : "Current and resolved tasks linked to this product group."}
              </p>
            </div>
            {taskHistory && (
              <span className="text-xs font-semibold text-stone-500">
                {taskHistory.length} {taskHistory.length === 1 ? "task" : "tasks"}
              </span>
            )}
          </div>
          {loadingTaskHistory ? (
            <div className="mt-3 flex min-h-32 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-sm font-semibold text-stone-500">
              <RefreshCw size={16} className="mr-2 animate-spin" />
              Loading task history…
            </div>
          ) : taskHistory && taskHistory.length > 0 ? (
            <div className="mt-3 space-y-2">
              {taskHistory.map((finding) => {
                const profile = productClusterProfileForFinding(finding, group.price_summary);
                const statusLabel = finding.dismissed_at
                  ? (finding.dismissal_reason ?? "dismissed").replaceAll("_", " ")
                  : (finding.review_status ?? "pending").replaceAll("_", " ");
                return (
                  <div key={finding.result_id} className="rounded-xl bg-stone-50 p-2">
                    <ProductListingRow
                      profile={profile}
                      active={activeTaskProfileId === profile.id}
                      statusLabel={statusLabel}
                      onOpen={() => onOpenFinding(finding, group.id)}
                    />
                    <p className="mt-1 px-1 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                      Updated {new Date(finding.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : taskHistory ? (
            <div className="mt-3 rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center">
              <p className="text-sm font-bold text-stone-900">No linked tasks found</p>
              <p className="mt-1 text-sm text-stone-500">
                New discoveries will appear here when they are assigned to this product.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={onLoadTaskHistory}
              className="mt-3 min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 hover:bg-stone-50"
            >
              Load task history
            </button>
          )}
        </div>
      )}

      {workspace && workspaceSection === "offers" && (
        <div className="mt-5 overflow-hidden rounded-xl border border-stone-200">
          {availableCommercialSubgroups.length > 0 ? availableCommercialSubgroups.map((subgroup) => {
            const count = subgroup.member_count;
            const needsTriageCount = subgroup.triage_member_count;
            const triagedCount = Math.max(0, subgroup.member_count - needsTriageCount);
            const triageComplete = needsTriageCount === 0;
            const subgroupMembers = group.members.filter(
              (member) => member.commercial_subgroup_key === subgroup.key,
            );
            const representative = subgroupMembers.find((member) => member.image_url) ??
              subgroupMembers[0] ?? null;
            const priceRange = subgroup.price_range;
            const priceLabel = !priceRange
              ? "Price unavailable"
              : priceRange.minimum === priceRange.maximum
                ? formatMoney(priceRange.minimum, "USD")
                : `${formatMoney(priceRange.minimum, "USD")}–${formatMoney(priceRange.maximum, "USD")}`;
            return (
              <button
                key={subgroup.key}
                type="button"
                onClick={() => {
                  setSelectedCommercialSubgroupKey(subgroup.key);
                  setWorkspaceSection("review");
                  setManaging(false);
                }}
                className={`flex min-h-24 w-full items-center gap-3 border-b border-stone-200 p-3 text-left transition last:border-b-0 sm:gap-4 sm:p-4 ${
                  triageComplete
                    ? "bg-emerald-50/40 hover:bg-emerald-50/70"
                    : "bg-white hover:bg-amber-50/50"
                }`}
              >
                <span className="flex h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-20 sm:w-20">
                  {representative?.image_url ? (
                    <img
                      src={representative.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-lg font-black text-stone-400">
                      {subgroup.variant_label.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-stone-950">
                    {subgroup.variant_label}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    {subgroup.price_band === "unusually_low" ? (
                      <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                        {count} low-price {count === 1 ? "listing" : "listings"}
                      </span>
                    ) : (
                      <span>{count} {count === 1 ? "listing" : "listings"}</span>
                    )}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    {needsTriageCount > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-inset ring-amber-200">
                        {needsTriageCount} {needsTriageCount === 1 ? "needs triage" : "need triage"}
                      </span>
                    )}
                    {triagedCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <Check size={10} aria-hidden="true" />
                        {triagedCount} triaged
                      </span>
                    )}
                    {triageComplete && triagedCount === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 ring-1 ring-inset ring-emerald-200">
                        <Check size={10} aria-hidden="true" />
                        Triage complete
                      </span>
                    )}
                  </span>
                </span>
                <span className={`shrink-0 text-right text-sm font-black ${
                  subgroup.price_band === "unusually_low" ? "text-red-700" : "text-stone-700"
                }`}>
                  <span className="block">{priceLabel}</span>
                  <span className="mt-1 block text-xs font-bold text-stone-400">View listings →</span>
                </span>
              </button>
            );
          }) : (
            <p className="px-4 py-8 text-center text-sm text-stone-500">
              No comparable offers are available for this product.
            </p>
          )}
        </div>
      )}

      {workspace && workspaceSection === "audit" && (
        <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <p className="text-sm font-black text-stone-950">Merge another product</p>
          <p className="mt-1 text-sm text-stone-500">
            Find the existing product anywhere in this IP catalog and combine the identities. The decision remains reversible.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <ProductMergeCandidatePicker
              ipId={ipId}
              sourceGroupId={group.id}
              selected={workspaceMergeTarget}
              onSelect={setWorkspaceMergeTarget}
              disabled={Boolean(savingMergeKey)}
            />
            <button
              type="button"
              disabled={!workspaceMergeTarget || Boolean(savingMergeKey)}
              onClick={() => {
                if (!workspaceMergeTarget) return;
                void onMergeGroups(group.id, workspaceMergeTarget.group_id)
                  .then(() => setWorkspaceMergeTarget(null))
                  .catch(() => undefined);
              }}
              className="min-h-11 self-start rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
            >
              {savingMergeKey ? "Merging…" : "Merge products"}
            </button>
          </div>
        </div>
      )}

      {workspace && workspaceSection === "audit" &&
        reconciliationSuggestions.length === 0 && group.canonical_decisions.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-stone-300 px-4 py-10 text-center">
          <p className="text-sm font-bold text-stone-900">No merge history yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Merge suggestions and reversible decisions will appear here.
          </p>
        </div>
      )}

      {workspace && workspaceSection === "review" &&
        !showingPersistedMembers && displayedMemberCount === 0 && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
            <p className="text-sm font-black text-emerald-950">Review queue complete</p>
            <p className="mt-1 text-sm text-emerald-800">
              No current tasks remain for this product. Resolved listings stay in task history
              and return here only if they are reopened.
            </p>
          </div>
        )}

      {(!workspace || workspaceSection === "review") && displayedMemberCount > 0 &&
        (displayedCommercialSubgroups.length > 0 ? (
        <div className="mt-4 space-y-3" data-product-commercial-groups>
          {renderedCommercialSubgroups.map((commercialSubgroup) => {
            const scopeId = productCommercialReviewScopeId(
              group.id,
              commercialSubgroup.key,
            );
            const profiles = showingPersistedMembers
              ? commercialSubgroup.preview_members.length > 0
                ? commercialSubgroup.preview_members
                : displayedMembers.filter(
                  (profile) => profile.commercial_subgroup_key === commercialSubgroup.key,
                )
              : displayedMembers.filter(
                (profile) => profile.commercial_subgroup_key === commercialSubgroup.key,
              );
            const commercialCaseIds = new Set(commercialSubgroup.triage_case_ids);
            const subgroupFindings = !showingPersistedMembers && allFindings
              ? allFindings.filter((finding) =>
                  Boolean(finding.case_id && commercialCaseIds.has(finding.case_id))
                )
              : null;
            const priceRange = commercialSubgroup.price_range;
            const priceRangeLabel = !priceRange
              ? "Price unavailable"
              : priceRange.minimum === priceRange.maximum
                ? formatMoney(priceRange.minimum, "USD")
                : `${formatMoney(priceRange.minimum, "USD")}–${formatMoney(
                    priceRange.maximum,
                    "USD",
                  )}`;
            return (
              <section
                key={commercialSubgroup.key}
                data-product-commercial-subgroup={commercialSubgroup.key}
                className={`rounded-xl border p-3 ${
                  commercialSubgroup.price_band === "unusually_low"
                    ? "border-red-200 bg-red-50/40"
                    : "border-stone-200 bg-stone-50/70"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">
                      Comparable offer
                    </p>
                    <h3 className="mt-0.5 text-sm font-black text-stone-900">
                      {commercialSubgroup.variant_label}
                    </h3>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      commercialSubgroup.price_band === "unusually_low"
                        ? "bg-red-100 text-red-800"
                        : commercialSubgroup.price_band === "unpriced"
                          ? "bg-stone-200 text-stone-700"
                          : "bg-emerald-100 text-emerald-800"
                    }`}>
                      {commercialSubgroup.price_band === "unusually_low"
                        ? `Low-price range · ${priceRangeLabel}`
                        : priceRangeLabel}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-stone-600 ring-1 ring-inset ring-stone-200">
                      {showingPersistedMembers
                        ? commercialSubgroup.member_count
                        : commercialSubgroup.triage_member_count} listings
                    </span>
                  </div>
                </div>
                {commercialSubgroup.price_band === "unusually_low" && (
                  <p className="mt-2 rounded-lg border border-red-100 bg-white/70 px-2.5 py-2 text-[11px] font-medium text-red-800">
                    <span className="font-bold">Price signal:</span>{" "}
                    {commercialSubgroup.price_summary?.unusually_low_threshold_usd
                      ? `Below ${formatMoney(
                          commercialSubgroup.price_summary.unusually_low_threshold_usd,
                          "USD",
                        )} compared with other ${commercialSubgroup.variant_label} listings.`
                      : `Priced unusually low compared with other ${commercialSubgroup.variant_label} listings.`}
                  </p>
                )}
                <ProductGroupMemberSubgroups
                  profiles={profiles}
                  priceSummary={commercialSubgroup.price_summary}
                  priceSignalByCaseId={null}
                  totalCount={showingPersistedMembers
                    ? commercialSubgroup.member_count
                    : commercialSubgroup.triage_member_count}
                  recommendationCounts={!showingPersistedMembers
                    ? commercialSubgroup.triage_recommendation_counts
                    : null}
                  separateByRecommendation={!showingPersistedMembers}
                  allFindings={subgroupFindings}
                  expandedSubgroupKeys={expandedSubgroupKeys}
                  loadingAllFindings={loadingAllFindings}
                  groupId={scopeId}
                  groupName={`${group.display_name ?? `Product group ${index + 1}`} · ${commercialSubgroup.variant_label}`}
                  activeBatch={activeBatch}
                  batchProgress={batchProgress}
                  batchDisabled={batchDisabled}
                  previewLimit={4}
                  gridClassName={workspace ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}
                  renderMember={renderProductMember}
                  renderFinding={(finding) => renderProductFinding(
                    finding,
                    commercialSubgroup.price_summary,
                  )}
                  onSelectBatch={(bucket) => onSelectBatch(bucket, commercialSubgroup)}
                  onBatchAction={onBatchAction}
                  onClearBatch={onClearBatch}
                  onToggleBatchFinding={onToggleBatchFinding}
                  onSetAllBatchFindings={onSetAllBatchFindings}
                  onToggleSubgroupListings={(bucket) =>
                    onToggleSubgroupListings(bucket, commercialSubgroup)}
                />
                {showingPersistedMembers && profiles.length > 0 &&
                  profiles.length < commercialSubgroup.member_count && (
                    <p className="mt-2 text-[11px] text-stone-500">
                      Showing {profiles.length} representative listings from this offer.
                    </p>
                  )}
                {profiles.length === 0 && (
                  <p className="mt-2 text-[11px] text-stone-500">
                    A listing preview could not be loaded for this offer.
                  </p>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ProductGroupMemberSubgroups
          profiles={displayedMembers}
          priceSummary={group.price_summary}
          priceSignalByCaseId={null}
          totalCount={displayedMemberCount}
          recommendationCounts={!showingPersistedMembers
            ? group.triage_recommendation_counts ?? null
            : null}
          separateByRecommendation={!showingPersistedMembers}
          allFindings={!showingPersistedMembers ? allFindings : null}
          expandedSubgroupKeys={expandedSubgroupKeys}
          loadingAllFindings={loadingAllFindings}
          groupId={group.id}
          groupName={group.display_name ?? `Product group ${index + 1}`}
          activeBatch={activeBatch}
          batchProgress={batchProgress}
          batchDisabled={batchDisabled}
          previewLimit={4}
          gridClassName={workspace ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"}
          renderMember={renderProductMember}
          renderFinding={(finding) => renderProductFinding(finding, group.price_summary)}
          onSelectBatch={onSelectBatch}
          onBatchAction={onBatchAction}
          onClearBatch={onClearBatch}
          onToggleBatchFinding={onToggleBatchFinding}
          onSetAllBatchFindings={onSetAllBatchFindings}
          onToggleSubgroupListings={onToggleSubgroupListings}
        />
      ))}
      {(!workspace || workspaceSection === "review") && (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-3">
        <span className="text-xs text-stone-500">
          {!showingPersistedMembers
            ? `${displayedMemberCount} current to-triage listings`
            : <>
                Minimum {mode === "same"
                  ? "same-product"
                  : mode === "related"
                    ? "related-product"
                    : "pairwise image similarity"}{" "}
                {group.minimum_score?.toFixed(3) ?? "—"}
              </>}
        </span>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&${taskProductFilter}`}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
            taskLinkMode === "pending"
              ? "border-red-200 bg-red-50 text-red-800 hover:border-red-300 hover:bg-red-100"
              : "border-stone-200 bg-stone-50 text-stone-700 hover:border-stone-300 hover:bg-stone-100"
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
      )}
      {mergeReviewSuggestion && (
        <ProductGroupMergeReviewDialog
          sourceGroup={group}
          targetGroup={mergeReviewTarget}
          targetVisibleOnPage={availableGroups.some(
            (candidate) => candidate.id === mergeReviewSuggestion.target_group_id,
          )}
          suggestion={mergeReviewSuggestion}
          error={mergeReviewError}
          saving={savingMergeKey === [group.id, mergeReviewSuggestion.target_group_id]
            .sort().join(":")}
          onClose={() => {
            setMergeReviewTargetId(null);
            setMergeReviewError(null);
          }}
          onMerge={async () => {
            setMergeReviewError(null);
            try {
              await onMergeGroups(group.id, mergeReviewSuggestion.target_group_id);
              setMergeReviewTargetId(null);
            } catch (caught: unknown) {
              setMergeReviewError(errorMessage(caught, "Unable to merge these products."));
            }
          }}
        />
      )}
    </section>
  );
}
