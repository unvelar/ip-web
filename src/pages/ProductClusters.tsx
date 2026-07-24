import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Images,
  ListFilter,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  calculatePersistedProductGroupVisualEvidence,
  confirmPersistedProductGroup,
  createPersistedProductGroupRule,
  deletePersistedProductGroupRule,
  excludePersistedProductGroupMember,
  getPersistedProductGroups,
  listProductClusterScopes,
  pinPersistedProductGroupReferenceImage,
  refreshPersistedProductGroups,
  removePersistedProductGroupReferenceImage,
  resetPersistedProductGroupReferenceImages,
  updatePersistedProductGroupEmbeddingSettings,
  updatePersistedProductGroupRule,
  type PersistedProductGroup,
  type PersistedProductGroupOverview,
  type ProductClusterProfile,
  type ProductClusterScope,
  type ProductGroupCorrectionReason,
  type ProductGroupRule,
  type ProductGroupVisualEvidence,
} from "../api";
import { profileTitle } from "../components/product-clusters/productClusterGraphUtils";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";

type ProductGroupView = "triage" | "all";
type GroupMode = "same" | "related" | "visual";

export default function ProductClusters() {
  const { actingTenantId } = useAuth();
  const {
    activeIpId: selectedIpId,
    activeIp,
    loading: loadingActiveIp,
  } = useActiveIp();
  const [scopes, setScopes] = useState<ProductClusterScope[]>([]);
  const [groupOverview, setGroupOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [productGroupView, setProductGroupView] = useState<ProductGroupView>("triage");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scopesLoadedKey, setScopesLoadedKey] = useState<string | null>(null);
  const [groupsLoadedKey, setGroupsLoadedKey] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savingCorrectionProfileId, setSavingCorrectionProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopesRequestKey = `${actingTenantId ?? ""}:${refreshVersion}`;
  const groupsRequestKey = `${scopesRequestKey}:${selectedIpId ?? ""}:visual:${productGroupView}`;
  const selectedScope = scopes.find((scope) => scope.ip_id === selectedIpId) ?? null;
  const selectedScopeAvailable =
    scopesLoadedKey === scopesRequestKey && selectedScope != null;
  const loadingScopes = loadingActiveIp || scopesLoadedKey !== scopesRequestKey;
  const loadingGroups =
    Boolean(selectedIpId && selectedScopeAvailable) && groupsLoadedKey !== groupsRequestKey;

  useEffect(() => {
    let alive = true;
    void listProductClusterScopes()
      .then(({ scopes: nextScopes }) => {
        if (!alive) return;
        setScopes(nextScopes);
        if (nextScopes.length === 0) {
          setGroupOverview(null);
        }
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setScopes([]);
        setGroupOverview(null);
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (alive) setScopesLoadedKey(scopesRequestKey);
      });
    return () => {
      alive = false;
    };
  }, [actingTenantId, refreshVersion, scopesRequestKey]);

  useEffect(() => {
    if (!selectedIpId || !selectedScopeAvailable) {
      setGroupOverview(null);
      return;
    }
    let alive = true;
    setGroupOverview(null);
    void getPersistedProductGroups(selectedIpId, "visual", productGroupView)
      .then((overview) => {
        if (!alive) return;
        setGroupOverview(overview);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setGroupOverview(null);
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (alive) setGroupsLoadedKey(groupsRequestKey);
      });
    return () => {
      alive = false;
    };
  }, [
    selectedIpId,
    selectedScopeAvailable,
    productGroupView,
    refreshVersion,
    actingTenantId,
    groupsRequestKey,
  ]);

  useEffect(() => {
    setError(null);
  }, [selectedIpId]);

  async function refreshAll() {
    setError(null);
    if (selectedIpId && selectedScopeAvailable) {
      setRefreshingGroups(true);
      try {
        setGroupOverview(await refreshPersistedProductGroups(
          selectedIpId,
          "visual",
          productGroupView,
        ));
      } catch (caught: unknown) {
        setError(errorMessage(caught));
      } finally {
        setRefreshingGroups(false);
      }
    }
    setRefreshVersion((version) => version + 1);
  }

  async function confirmGroup(groupId: string, displayName: string) {
    if (!selectedIpId) return;
    setError(null);
    setSavingGroupId(groupId);
    try {
      const { group } = await confirmPersistedProductGroup(
        selectedIpId,
        groupId,
        displayName,
      );
      setGroupOverview((current) => current ? {
        ...current,
        groups: current.groups.map((candidate) =>
          candidate.id === group.id ? { ...candidate, ...group } : candidate
        ),
      } : current);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingGroupId(null);
    }
  }

  async function correctGroupMember(
    groupId: string,
    profileId: string,
    reason: ProductGroupCorrectionReason,
  ) {
    if (!selectedIpId) return;
    setError(null);
    setSavingCorrectionProfileId(profileId);
    try {
      await excludePersistedProductGroupMember(selectedIpId, groupId, {
        profile_id: profileId,
        reason,
      });
      setGroupOverview(await getPersistedProductGroups(selectedIpId, "visual", productGroupView));
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    } finally {
      setSavingCorrectionProfileId(null);
    }
  }

  async function updateGroupEmbeddingThreshold(
    groupId: string,
    embeddingMatchThreshold: number | null,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await updatePersistedProductGroupEmbeddingSettings(
        selectedIpId,
        groupId,
        embeddingMatchThreshold,
      );
      setGroupOverview((current) => current ? {
        ...current,
        dirty: result.regrouping_queued || current.dirty,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, ...result.group } : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function createGroupRule(groupId: string, instruction: string) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await createPersistedProductGroupRule(
        selectedIpId,
        groupId,
        instruction,
      );
      setGroupOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? { ...group, rules: [...group.rules, result.rule] }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function updateGroupRule(
    groupId: string,
    ruleId: string,
    instruction: string,
  ) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await updatePersistedProductGroupRule(
        selectedIpId,
        groupId,
        ruleId,
        instruction,
      );
      setGroupOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? {
              ...group,
              rules: group.rules.map((rule) =>
                rule.id === result.rule.id ? result.rule : rule
              ),
            }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  async function deleteGroupRule(groupId: string, ruleId: string) {
    if (!selectedIpId) throw new Error("No product scope selected");
    setError(null);
    try {
      const result = await deletePersistedProductGroupRule(
        selectedIpId,
        groupId,
        ruleId,
      );
      setGroupOverview((current) => current ? {
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId
            ? { ...group, rules: group.rules.filter((rule) => rule.id !== ruleId) }
            : group
        ),
      } : current);
      return result;
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      throw caught;
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-stone-900">
              Product Clustering Lab
            </h1>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Beta
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Review overlapping groups built from every stored listing image. A listing
            can appear in several groups through different views; name a group only
            when you confirm it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={loadingScopes || loadingGroups || refreshingGroups}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loadingScopes || loadingGroups || refreshingGroups ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      {groupOverview && (
        <section className="mt-6 rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone-500">
            <span>
              <strong className="text-stone-800">{groupOverview.scope.profile_count}</strong>{" "}
              profiled listings
            </span>
            {productGroupView === "triage" && groupOverview.triage_projection_available && (
              <>
                <span>
                  <strong className="text-stone-800">{groupOverview.triage_profile_count ?? 0}</strong>{" "}
                  {(groupOverview.triage_profile_count ?? 0) === 1 ? "listing" : "listings"} to triage
                </span>
                <span>
                  <strong className="text-stone-800">{groupOverview.triage_group_count ?? 0}</strong>{" "}
                  {(groupOverview.triage_group_count ?? 0) === 1 ? "group" : "groups"} with work
                </span>
              </>
            )}
            {productGroupView === "all" && (
              <>
                <span>
                  <strong className="text-stone-800">{groupOverview.group_count}</strong>{" "}
                  {groupOverview.group_count === 1 ? "stored group" : "stored groups"}
                </span>
                {groupOverview.triage_projection_available && (
                  <span>
                    <strong className="text-stone-800">{groupOverview.triage_profile_count ?? 0}</strong>{" "}
                    {(groupOverview.triage_profile_count ?? 0) === 1 ? "listing" : "listings"} to triage
                  </span>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loadingScopes ? (
        <LoadingState />
      ) : !selectedIpId || !selectedScope ? (
        <EmptyState ipName={activeIp?.name ?? null} />
      ) : loadingGroups && !groupOverview ? (
        <LoadingState />
      ) : groupOverview ? (
        <ProductGroupsOverview
          overview={groupOverview}
          mode="visual"
          groupView={productGroupView}
          onGroupViewChange={setProductGroupView}
          savingGroupId={savingGroupId}
          savingCorrectionProfileId={savingCorrectionProfileId}
          onConfirmGroup={confirmGroup}
          onUpdateEmbeddingThreshold={updateGroupEmbeddingThreshold}
          onCorrectGroupMember={correctGroupMember}
          onCreateRule={createGroupRule}
          onUpdateRule={updateGroupRule}
          onDeleteRule={deleteGroupRule}
        />
      ) : null}
    </div>
  );
}

function ProductGroupsOverview({
  overview,
  mode,
  groupView,
  onGroupViewChange,
  savingGroupId,
  savingCorrectionProfileId,
  onConfirmGroup,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: {
  overview: PersistedProductGroupOverview;
  mode: GroupMode;
  groupView: ProductGroupView;
  onGroupViewChange: (view: ProductGroupView) => void;
  savingGroupId: string | null;
  savingCorrectionProfileId: string | null;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
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
}) {
  const showingTriage = groupView === "triage";
  const displayedGroups = showingTriage
    ? overview.triage_projection_available
      ? overview.groups.filter((group) => (group.triage_member_count ?? 0) > 0)
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

  return (
    <div className="mt-5">
      <div
        className="inline-flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
        role="group"
        aria-label="Product group listing view"
      >
        <button
          type="button"
          aria-pressed={showingTriage}
          onClick={() => onGroupViewChange("triage")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            showingTriage
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }`}
        >
          Needs triage
        </button>
        <button
          type="button"
          aria-pressed={!showingTriage}
          onClick={() => onGroupViewChange("all")}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            !showingTriage
              ? "bg-stone-900 text-white"
              : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          }`}
        >
          All stored groups
        </button>
      </div>

      {overview.last_error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The latest automatic group refresh failed: {overview.last_error}
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
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              {displayedGroups.map((group, index) => (
                <ProductGroupCard
                  key={group.id}
                  group={group}
                  index={index}
                  ipId={overview.scope.ip_id}
                  mode={mode}
                  showPersistedMembers={!showingTriage}
                  triageProjectionAvailable={overview.triage_projection_available}
                  saving={savingGroupId === group.id}
                  savingCorrectionProfileId={savingCorrectionProfileId}
                  onConfirmGroup={onConfirmGroup}
                  onUpdateEmbeddingThreshold={onUpdateEmbeddingThreshold}
                  onCorrectGroupMember={onCorrectGroupMember}
                  onCreateRule={onCreateRule}
                  onUpdateRule={onUpdateRule}
                  onDeleteRule={onDeleteRule}
                />
              ))}
            </div>
          )}

          {overview.truncated && (
            <p className="mt-3 text-xs text-amber-700">
              Showing {displayedGroups.length} of {showingTriage
                ? overview.triage_group_count ?? 0
                : overview.group_count} {showingTriage ? "grouped batches with work" : "stored groups"}.
            </p>
          )}

          {displayedUngroupedCount > 0 && (
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

function ProductGroupCard({
  group,
  index,
  ipId,
  mode,
  showPersistedMembers,
  triageProjectionAvailable,
  saving,
  savingCorrectionProfileId,
  onConfirmGroup,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: {
  group: PersistedProductGroup;
  index: number;
  ipId: string;
  mode: GroupMode;
  showPersistedMembers: boolean;
  triageProjectionAvailable: boolean;
  saving: boolean;
  savingCorrectionProfileId: string | null;
  onConfirmGroup: (groupId: string, displayName: string) => Promise<void>;
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
}) {
  const [editingName, setEditingName] = useState(false);
  const [managing, setManaging] = useState(false);
  const [correctingProfileId, setCorrectingProfileId] = useState<string | null>(null);
  const [name, setName] = useState(
    group.confirmation_status === "confirmed" ? group.display_name ?? "" : "",
  );
  const [ruleDraft, setRuleDraft] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingRuleText, setEditingRuleText] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [ruleNotice, setRuleNotice] = useState<string | null>(null);
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
  const confirmed = group.confirmation_status === "confirmed";
  const triageMemberCount = group.triage_member_count ?? 0;
  const showingPersistedMembers = showPersistedMembers || managing;
  const displayedMembers = showingPersistedMembers ? group.members : group.triage_members;
  const displayedMemberCount = showingPersistedMembers ? group.member_count : triageMemberCount;
  const taskLinkMode = !showingPersistedMembers || (
    triageProjectionAvailable && triageMemberCount > 0
  )
    ? "pending"
    : triageProjectionAvailable
      ? "history"
      : "all";
  const taskQuery = taskLinkMode === "pending"
    ? "status=pending"
    : "status=all&show_dismissed=true";
  const canConfirm = mode === "same" || mode === "visual";
  const trimmedName = name.trim();
  const correctingProfile = group.members.find((profile) => profile.id === correctingProfileId) ?? null;
  const nextEmbeddingThreshold = embeddingThresholdEnabled
    ? embeddingThresholdDraft
    : null;
  const embeddingThresholdChanged =
    nextEmbeddingThreshold !== group.embedding_match_threshold;
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

  async function saveName() {
    if (!trimmedName) return;
    try {
      await onConfirmGroup(group.id, trimmedName);
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

  return (
    <section className={`rounded-2xl border bg-white p-4 shadow-sm ${
      confirmed
        ? "border-emerald-200"
        : mode === "visual"
          ? "border-indigo-200"
          : "border-stone-200"
    }`}>
      <div className="flex items-start justify-between gap-3">
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
                  : `Potential group ${index + 1}`}
          </p>
          {confirmed && group.display_name ? (
            <h2 className="mt-1 line-clamp-2 text-sm font-bold text-stone-900">
              {group.display_name}
            </h2>
          ) : (
            <p className="mt-1 text-[11px] text-stone-500">
              Unnamed until confirmed
            </p>
          )}
          {confirmed && group.confirmed_at && (
            <p className="mt-1 text-[10px] text-emerald-700">
              Confirmed {new Date(group.confirmed_at).toLocaleString()}
            </p>
          )}
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

      {canConfirm && !editingName && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setName(confirmed ? group.display_name ?? "" : "");
              if (confirmed) {
                setManaging((current) => !current);
              } else {
                setEditingName(true);
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
              ? (managing ? "Close group settings" : "Manage group")
              : "Confirm & name"}
          </button>
          {confirmed && mode === "same" && !managing && (
            <button
              type="button"
              disabled={loadingVisualEvidence}
              onClick={() => void loadVisualEvidence()}
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
        </div>
      )}
      {!managing && visualEvidenceError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-800">
          {visualEvidenceError}
        </p>
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
            <span className="text-xs font-bold text-emerald-900">Group name</span>
            <input
              autoFocus
              type="text"
              required
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
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
              disabled={saving || !trimmedName || (confirmed && trimmedName === group.display_name)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={13} />
              {saving ? "Saving…" : confirmed ? "Save name" : "Confirm & name"}
            </button>
          </div>
        </form>
      )}

      {confirmed && managing && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-900">
                <Settings2 size={14} />
                Group settings
              </p>
              <p className="mt-1 text-[11px] text-blue-700">
                {mode === "same"
                  ? "Rename the product, tune its multimodal candidate gate, manage representative images and rules, or remove a listing below."
                  : "Rename this confirmed group or remove an incorrect image-backed placement below."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setManaging(false)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Done
            </button>
          </div>

          <form
            className="mt-3"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <label className="block">
              <span className="text-xs font-bold text-stone-800">Group name</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="text"
                  value={name}
                  maxLength={200}
                  onChange={(event) => setName(event.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="submit"
                  disabled={saving || !trimmedName || trimmedName === group.display_name}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-40"
                >
                  {saving ? "Saving…" : "Save name"}
                </button>
              </div>
            </label>
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
                  Multimodal candidate gate
                </p>
                <p className="mt-0.5 text-[11px] leading-4 text-stone-600">
                  Require the whole-listing embedding—up to six images plus title,
                  description and product attributes—to reach this raw cosine
                  similarity against another listing before exact-product reranking
                  and rules are applied. Passing the gate does not add a listing to
                  the product; the final same-product score still decides membership.
                  A failed pair may still be recognized as a related product. Higher
                  is stricter.
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-2 py-1 font-mono text-[10px] font-bold text-violet-800">
                {embeddingThresholdEnabled
                  ? embeddingThresholdDraft.toFixed(2)
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
              Use a product-specific multimodal candidate gate
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
                aria-label="Minimum multimodal listing similarity"
              />
              <div className="mt-1 flex justify-between font-mono text-[10px] text-stone-500">
                <span>0.00 broad</span>
                <span>1.00 strict</span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[10px] text-stone-500">
                Turning this off removes this extra gate; normal embedding retrieval,
                reranking and final same-product scoring still run.
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
                        "Saved. Future candidates use this immediately; the stored group snapshot will rebuild in the background.",
                      );
                    })
                    .catch(() => undefined)
                    .finally(() => setSavingEmbeddingThreshold(false));
                }}
                className="shrink-0 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 hover:bg-violet-50 disabled:opacity-40"
              >
                {savingEmbeddingThreshold ? "Saving…" : "Save threshold"}
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
                <p className="text-xs font-bold text-stone-900">Automatic membership rules</p>
                <p className="mt-0.5 text-[11px] text-stone-600">
                  The product reranker checks these instructions for new candidates. If evidence is not visible, it remains unknown.
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
                  No product-specific rules yet. Add only characteristics that distinguish this exact product or variant.
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
                placeholder='Example: "For this exact product, the case should show a lot number in the bottom-right corner."'
                onChange={(event) => setRuleDraft(event.target.value)}
                className="w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="text-[10px] text-stone-500">
                  Rules are versioned; changes automatically queue this product for rescoring.
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
            </>
          )}
        </div>
      )}

      {visualEvidence && (
        <p className="mt-4 text-[10px] text-indigo-700">
          Image similarity compares the displayed image with the closest product
          reference image from another listing. It is explanatory only—not an
          authenticity probability, multimodal candidate score, or final
          same-product score.
        </p>
      )}
      <div className={`${visualEvidence ? "mt-2" : "mt-4"} grid grid-cols-3 gap-2 sm:grid-cols-4`}>
        {displayedMembers.map((profile) => {
          const primaryVisualEvidence = primaryVisualEvidenceByProfileId.get(profile.id);
          const matchedReferenceRank = primaryVisualEvidence?.matched_reference_image_id
            ? referenceRankByImageId.get(primaryVisualEvidence.matched_reference_image_id)
            : null;
          return (
            <div key={profile.id} className="group/member relative min-w-0">
              <ListingTile
                profile={profile}
                groupImageSimilarity={mode === "visual"
                  ? profile.group_image_similarity
                  : undefined}
                groupImagePosition={mode === "visual"
                  ? profile.group_image_position
                  : undefined}
                visualSupportScore={primaryVisualEvidence?.visual_support_score}
                visualSupportReferenceRank={matchedReferenceRank}
                visualSupportIsReference={primaryVisualEvidence?.is_reference}
              />
              {canConfirm && group.member_count > 1 && (!confirmed || managing) && (
                <button
                  type="button"
                  aria-label={`Exclude ${profileTitle(profile)} from this group`}
                  title="Exclude this gallery view from this group"
                  disabled={Boolean(savingCorrectionProfileId)}
                  onClick={() => setCorrectingProfileId(profile.id)}
                  className={`absolute right-2 top-10 inline-flex h-7 items-center justify-center rounded-full border border-red-200 bg-white/95 px-2.5 text-[10px] font-bold text-red-700 shadow-sm transition hover:bg-red-50 focus:opacity-100 disabled:opacity-40 ${
                    confirmed ? "opacity-0 group-hover/member:opacity-100" : "opacity-100"
                  }`}
                >
                  Exclude
                </button>
              )}
            </div>
          );
        })}
      </div>
      {correctingProfile && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-950">
            Remove “{profileTitle(correctingProfile)}” from this group?
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            The exact gallery-image placement will be categorized again, but it will
            not be paired with these same group images after a refresh.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => {
                void onCorrectGroupMember(group.id, correctingProfile.id, "wrong_product")
                  .then(() => setCorrectingProfileId(null))
                  .catch(() => undefined);
              }}
              className="rounded-lg bg-amber-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-950 disabled:opacity-50"
            >
              Exclude
            </button>
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => {
                void onCorrectGroupMember(group.id, correctingProfile.id, "different_variant")
                  .then(() => setCorrectingProfileId(null))
                  .catch(() => undefined);
              }}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
            >
              Different variant
            </button>
            <button
              type="button"
              disabled={Boolean(savingCorrectionProfileId)}
              onClick={() => setCorrectingProfileId(null)}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-stone-500">
          {displayedMemberCount > displayedMembers.length
            ? `+${displayedMemberCount - displayedMembers.length} more ${showingPersistedMembers ? "persisted" : "to-triage"} listings`
            : `Minimum ${mode === "same"
              ? "same-product"
              : mode === "related"
                ? "related-product"
                : "pairwise image similarity"} ${
              group.minimum_score?.toFixed(3) ?? "—"
            }`}
        </p>
        <Link
          to={`/monitoring/tasks?${taskQuery}&ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}`}
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
    </section>
  );
}

function ListingTile({
  profile,
  onClick,
  groupImageSimilarity,
  groupImagePosition,
  visualSupportScore,
  visualSupportReferenceRank,
  visualSupportIsReference = false,
}: {
  profile: ProductClusterProfile;
  onClick?: () => void;
  groupImageSimilarity?: number | null;
  groupImagePosition?: number | null;
  visualSupportScore?: number | null;
  visualSupportReferenceRank?: number | null;
  visualSupportIsReference?: boolean;
}) {
  const hasVisualSupport = visualSupportScore !== undefined;
  const hasGroupImageSimilarity = groupImageSimilarity !== undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={onClick ? `Inspect similarity from: ${profileTitle(profile)}` : profileTitle(profile)}
      className="w-full min-w-0 rounded-lg border border-stone-200 bg-stone-50 p-1.5 text-left transition enabled:hover:border-red-300 enabled:hover:bg-red-50 disabled:cursor-default"
    >
      <span className="relative block aspect-square overflow-hidden rounded-md bg-stone-100">
        {profile.image_url ? (
          <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm font-bold text-stone-400">
            {profileTitle(profile).slice(0, 1).toUpperCase()}
          </span>
        )}
        {(hasVisualSupport || hasGroupImageSimilarity) && (
          <span
            className="absolute right-1.5 top-1.5 rounded-md border border-indigo-100 bg-white/95 px-1.5 py-1 font-mono text-[10px] font-bold text-indigo-900 shadow-sm"
            title={
              hasGroupImageSimilarity
                ? groupImageSimilarity == null
                  ? "No pairwise score is available for this singleton view"
                  : "Average pairwise similarity for this exact gallery image within the visual group"
                : visualSupportScore == null
                  ? "No reference image from another listing was available"
                  : `Raw image similarity to ${
                    visualSupportReferenceRank
                      ? `product reference #${visualSupportReferenceRank}`
                      : "the closest product reference"
                  }`
            }
          >
            {(hasGroupImageSimilarity ? groupImageSimilarity : visualSupportScore) == null
              ? "Image sim —"
              : `Image sim ${(
                hasGroupImageSimilarity ? groupImageSimilarity! : visualSupportScore!
              ).toFixed(2)}`}
          </span>
        )}
        {hasGroupImageSimilarity && groupImagePosition != null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Gallery view {groupImagePosition + 1} of {profile.image_count}
          </span>
        )}
        {visualSupportIsReference && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Reference
          </span>
        )}
      </span>
      <span className="mt-1.5 block truncate text-[10px] font-semibold text-stone-700">
        {profileTitle(profile)}
      </span>
    </button>
  );
}

function LoadingState() {
  return (
    <div className="mt-5 flex min-h-96 items-center justify-center rounded-2xl border border-stone-200 bg-white">
      <div className="flex items-center gap-3 text-sm text-stone-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-800" />
        Loading product relationships…
      </div>
    </div>
  );
}

function EmptyState({ ipName }: { ipName: string | null }) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <h2 className="text-base font-bold text-stone-900">
        {ipName ? `No product profiles for ${ipName}` : "No product profiles yet"}
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">
        Let new enrichment jobs populate this IP before using the lab, or choose another
        working IP from the top bar.
      </p>
    </div>
  );
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : "Could not load product relationships.";
}

function rescoreNotice(count: number) {
  if (count === 0) {
    return "Rule saved. Future candidates will use it automatically.";
  }
  return `Rule saved. ${count} current listing${count === 1 ? "" : "s"} queued for automatic rescoring.`;
}
