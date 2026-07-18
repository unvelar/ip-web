import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleX,
  ExternalLink,
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
  getProductClusterGraph,
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
  type ProductClusterEdge,
  type ProductClusterGraph,
  type ProductClusterProfile,
  type ProductClusterScope,
  type ProductGroupCorrectionReason,
  type ProductGroupRule,
  type ProductGroupVisualEvidence,
} from "../api";
import ProductSimilarityRadial from "../components/product-clusters/ProductSimilarityRadial";
import {
  profileTitle,
  scoreFor,
  type RelationshipMode,
} from "../components/product-clusters/productClusterGraphUtils";
import { useAuth } from "../context/AuthContext";

const MAX_NODES = 80;
const MAX_EDGES = 400;
type LabView = "similarity" | "groups";

export default function ProductClusters() {
  const { actingTenantId } = useAuth();
  const [scopes, setScopes] = useState<ProductClusterScope[]>([]);
  const [selectedIpId, setSelectedIpId] = useState("");
  const [graph, setGraph] = useState<ProductClusterGraph | null>(null);
  const [groupOverview, setGroupOverview] = useState<PersistedProductGroupOverview | null>(null);
  const [mode, setMode] = useState<RelationshipMode>("same");
  const [view, setView] = useState<LabView>("groups");
  const [threshold, setThreshold] = useState(0.3);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scopesLoadedKey, setScopesLoadedKey] = useState<string | null>(null);
  const [graphLoadedKey, setGraphLoadedKey] = useState<string | null>(null);
  const [groupsLoadedKey, setGroupsLoadedKey] = useState<string | null>(null);
  const [refreshingGroups, setRefreshingGroups] = useState(false);
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [savingCorrectionProfileId, setSavingCorrectionProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopesRequestKey = `${actingTenantId ?? ""}:${refreshVersion}`;
  const graphRequestKey = `${scopesRequestKey}:${selectedIpId}`;
  const groupsRequestKey = `${graphRequestKey}:${mode}`;
  const loadingScopes = scopesLoadedKey !== scopesRequestKey;
  const loadingGraph = Boolean(selectedIpId) && graphLoadedKey !== graphRequestKey;
  const loadingGroups = Boolean(selectedIpId) && groupsLoadedKey !== groupsRequestKey;

  useEffect(() => {
    let alive = true;
    void listProductClusterScopes()
      .then(({ scopes: nextScopes }) => {
        if (!alive) return;
        setScopes(nextScopes);
        setSelectedIpId((current) => {
          if (nextScopes.some((scope) => scope.ip_id === current)) return current;
          return nextScopes[0]?.ip_id ?? "";
        });
        if (nextScopes.length === 0) {
          setGraph(null);
          setGroupOverview(null);
        }
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setScopes([]);
        setSelectedIpId("");
        setGraph(null);
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
    if (!selectedIpId) return;
    let alive = true;
    void getProductClusterGraph(selectedIpId, {
      maxNodes: MAX_NODES,
      maxEdges: MAX_EDGES,
    })
      .then((nextGraph) => {
        if (!alive) return;
        setGraph(nextGraph);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setGraph(null);
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (alive) setGraphLoadedKey(graphRequestKey);
      });
    return () => {
      alive = false;
    };
  }, [selectedIpId, refreshVersion, actingTenantId, graphRequestKey]);

  useEffect(() => {
    if (!selectedIpId) return;
    let alive = true;
    setGroupOverview(null);
    void getPersistedProductGroups(selectedIpId, mode)
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
  }, [selectedIpId, mode, refreshVersion, actingTenantId, groupsRequestKey]);

  const visibleEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges
      .filter((edge) => scoreFor(edge, mode) >= threshold)
      .sort((left, right) => scoreFor(right, mode) - scoreFor(left, mode));
  }, [graph, mode, threshold]);
  const profileById = useMemo(
    () => new Map(graph?.profiles.map((profile) => [profile.id, profile]) ?? []),
    [graph],
  );
  const effectiveProfileId = selectedProfileId && profileById.has(selectedProfileId)
    ? selectedProfileId
    : graph?.profiles[0]?.id ?? null;
  const reference = effectiveProfileId ? profileById.get(effectiveProfileId) ?? null : null;
  const referenceEdges = useMemo(
    () => effectiveProfileId
      ? visibleEdges.filter((edge) =>
        edge.left_profile_id === effectiveProfileId || edge.right_profile_id === effectiveProfileId
      )
      : [],
    [effectiveProfileId, visibleEdges],
  );
  const effectiveSelectedEdgeId = referenceEdges.some((edge) => edge.id === selectedEdgeId)
    ? selectedEdgeId
    : referenceEdges[0]?.id ?? null;
  const selectedEdge = referenceEdges.find((edge) => edge.id === effectiveSelectedEdgeId) ?? null;
  const comparisonProfile = selectedEdge && effectiveProfileId
    ? profileById.get(otherProfileId(selectedEdge, effectiveProfileId)) ?? null
    : null;

  function selectReference(profileId: string, edgeId: string | null = null) {
    setSelectedProfileId(profileId);
    setSelectedEdgeId(edgeId);
  }

  async function refreshAll() {
    setError(null);
    if (selectedIpId && view === "groups") {
      setRefreshingGroups(true);
      try {
        setGroupOverview(await refreshPersistedProductGroups(selectedIpId, mode));
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
      setGroupOverview(await getPersistedProductGroups(selectedIpId, mode));
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
            Compare listing-to-listing product evidence. Image similarity, multimodal
            similarity, and relationship scores do not measure similarity to the IP itself.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={loadingScopes || loadingGraph || loadingGroups || refreshingGroups}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loadingScopes || loadingGraph || loadingGroups || refreshingGroups ? "animate-spin" : ""}
          />
          Refresh
        </button>
      </header>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(15rem,1fr)_auto_minmax(15rem,1fr)] lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-500">
              Intellectual property
            </span>
            <select
              value={selectedIpId}
              onChange={(event) => {
                setError(null);
                setSelectedIpId(event.target.value);
                setSelectedProfileId(null);
                setSelectedEdgeId(null);
              }}
              disabled={loadingScopes || scopes.length === 0}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-stone-50"
            >
              {scopes.length === 0 && <option value="">No profiles available</option>}
              {scopes.map((scope) => (
                <option value={scope.ip_id} key={scope.ip_id}>
                  {scope.ip_name} · {scope.profile_count} listings · {scope.pair_count} pairs
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-500">
              Final relationship score
            </span>
            <div className="inline-flex rounded-lg border border-stone-300 bg-stone-50 p-1">
              <ModeButton active={mode === "same"} onClick={() => setMode("same")}>
                Same product
              </ModeButton>
              <ModeButton active={mode === "related"} onClick={() => setMode("related")}>
                Related
              </ModeButton>
            </div>
          </div>

          {view === "similarity" ? (
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-stone-500">
                Minimum relationship score
                <span className="font-mono text-stone-900">{threshold.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
                className="h-2 w-full cursor-pointer accent-red-700"
              />
            </label>
          ) : (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <span className="block text-xs font-bold uppercase tracking-wide text-stone-500">
                Final grouping policy
              </span>
              <span className="mt-1 block text-sm font-semibold text-stone-900">
                Strict pairwise {mode === "same" ? "same-product" : "related-product"} score ≥{" "}
                {(groupOverview?.threshold ?? 0.3).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {graph && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
            {view === "groups" ? (
              <>
                <span>
                  <strong className="text-stone-800">
                    {groupOverview?.scope.profile_count ?? graph.scope.profile_count}
                  </strong> profiled listings
                </span>
                {groupOverview?.snapshot_profile_count != null && (
                  <span>
                    <strong className="text-stone-800">{groupOverview.snapshot_profile_count}</strong>{" "}
                    represented in current snapshot
                  </span>
                )}
                <span>
                  <strong className="text-stone-800">{groupOverview?.group_count ?? 0}</strong>{" "}
                  persistent groups
                </span>
              </>
            ) : (
              <>
                <span><strong className="text-stone-800">{graph.profiles.length}</strong> listings loaded</span>
                <span><strong className="text-stone-800">{visibleEdges.length}</strong> relationships above score filter</span>
              </>
            )}
            <span><strong className="text-stone-800">{graph.scope.pair_count}</strong> scored pairs total</span>
            {view === "similarity" && graph.truncated && (
              <span className="text-amber-700">Showing the strongest bounded subset</span>
            )}
            {view === "groups" && groupOverview?.dirty && (
              <span className="text-amber-700">
                {groupOverview.pending_snapshot_count != null && groupOverview.pending_snapshot_count > 0 ? (
                  <>
                    <strong>{groupOverview.pending_snapshot_count}</strong>{" "}
                    profiled {groupOverview.pending_snapshot_count === 1 ? "listing" : "listings"} awaiting grouping refresh
                  </>
                ) : (
                  <>A newer snapshot is being rebuilt</>
                )}
              </span>
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {graph && (
        <div className="mt-5 flex border-b border-stone-200" role="tablist" aria-label="Clustering lab view">
          <ViewTab
            active={view === "similarity"}
            onClick={() => setView("similarity")}
          >
            Similarity from one listing
          </ViewTab>
          <ViewTab active={view === "groups"} onClick={() => setView("groups")}>
            Product groups
          </ViewTab>
        </div>
      )}

      {loadingScopes ? (
        <LoadingState />
      ) : scopes.length === 0 ? (
        <EmptyState />
      ) : (loadingGraph && !graph) || (view === "groups" && loadingGroups && !groupOverview) ? (
        <LoadingState />
      ) : view === "similarity" && graph && reference ? (
          <SimilarityView
            graph={graph}
            reference={reference}
            referenceEdges={referenceEdges}
            profileById={profileById}
            mode={mode}
            selectedEdgeId={effectiveSelectedEdgeId}
            selectedEdge={selectedEdge}
            comparisonProfile={comparisonProfile}
            loading={loadingGraph}
            onSelectReference={selectReference}
          />
      ) : view === "groups" && groupOverview ? (
          <ProductGroupsOverview
            overview={groupOverview}
            mode={mode}
            onSelectReference={(profileId) => {
              selectReference(profileId);
              setView("similarity");
            }}
            canSelectReference={(profileId) => profileById.has(profileId)}
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

function SimilarityView({
  graph,
  reference,
  referenceEdges,
  profileById,
  mode,
  selectedEdgeId,
  selectedEdge,
  comparisonProfile,
  loading,
  onSelectReference,
}: {
  graph: ProductClusterGraph;
  reference: ProductClusterProfile;
  referenceEdges: ProductClusterEdge[];
  profileById: Map<string, ProductClusterProfile>;
  mode: RelationshipMode;
  selectedEdgeId: string | null;
  selectedEdge: ProductClusterEdge | null;
  comparisonProfile: ProductClusterProfile | null;
  loading: boolean;
  onSelectReference: (profileId: string, edgeId?: string | null) => void;
}) {
  return (
    <>
      <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <label className="block max-w-2xl">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-500">
            Reference listing shown in the center
          </span>
          <select
            value={reference.id}
            onChange={(event) => onSelectReference(event.target.value)}
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
          >
            {graph.profiles.map((profile) => (
              <option value={profile.id} key={profile.id}>
                {profileTitle(profile)}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-stone-500">
          Every distance is calculated only from this listing. Select another node to make it the new reference.
        </p>
      </div>

      <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={loading ? "min-w-0 opacity-60" : "min-w-0"}>
          <ProductSimilarityRadial
            reference={reference}
            edges={referenceEdges}
            profileById={profileById}
            mode={mode}
            selectedEdgeId={selectedEdgeId}
            onSelectNeighbor={onSelectReference}
          />
        </div>
        <NearestListings
          referenceId={reference.id}
          edges={referenceEdges}
          mode={mode}
          profileById={profileById}
          selectedEdgeId={selectedEdgeId}
          onSelect={onSelectReference}
        />
      </div>

      {selectedEdge && comparisonProfile && (
        <PairInspector
          edge={selectedEdge}
          reference={reference}
          comparison={comparisonProfile}
        />
      )}
    </>
  );
}

function NearestListings({
  referenceId,
  edges,
  mode,
  profileById,
  selectedEdgeId,
  onSelect,
}: {
  referenceId: string;
  edges: ProductClusterEdge[];
  mode: RelationshipMode;
  profileById: Map<string, ProductClusterProfile>;
  selectedEdgeId: string | null;
  onSelect: (profileId: string, edgeId: string) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-bold text-stone-900">Most similar to the reference</h2>
        <p className="mt-0.5 text-xs text-stone-500">Select one to move it into the center</p>
      </div>
      <div className="max-h-[512px] overflow-y-auto p-2">
        {edges.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-stone-500">
            No direct relationships meet this score filter. Lower it to reveal more.
          </p>
        ) : (
          edges.slice(0, 50).map((edge, index) => {
            const profileId = otherProfileId(edge, referenceId);
            const profile = profileById.get(profileId);
            if (!profile) return null;
            const selected = edge.id === selectedEdgeId;
            return (
              <button
                type="button"
                key={edge.id}
                onClick={() => onSelect(profileId, edge.id)}
                className={`mb-1 w-full rounded-xl border px-3 py-2.5 text-left transition last:mb-0 ${
                  selected
                    ? "border-red-200 bg-red-50"
                    : "border-transparent hover:border-stone-200 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-[10px] font-bold text-stone-400">#{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800">
                    {profileTitle(profile)}
                  </span>
                  <span className="font-mono text-xs font-bold text-red-800">
                    {scoreFor(edge, mode).toFixed(3)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 pl-7 text-[10px] text-stone-400">
                  <span>{profile.platform || "Unknown platform"}</span>
                  {edge.price_ratio != null && <span>{edge.price_ratio.toFixed(2)}× price ratio</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function ProductGroupsOverview({
  overview,
  mode,
  onSelectReference,
  canSelectReference,
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
  mode: RelationshipMode;
  onSelectReference: (profileId: string) => void;
  canSelectReference: (profileId: string) => boolean;
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
  const generatedAt = overview.generated_at
    ? new Date(overview.generated_at).toLocaleString()
    : null;

  return (
    <div className="mt-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        These groups are stored on the backend across the full IP corpus. In each {mode === "same" ? "product group" : "related family"}, every listing has a final pairwise {mode === "same" ? "same-product" : "related-product"} score of at least {overview.threshold.toFixed(2)} with every other member.
        {mode === "same"
          ? " New listings are assigned automatically. Image similarity is explanatory only. A listing must pass the product’s multimodal candidate gate; rules and the final pairwise same-product score then decide membership. Open Manage product to configure the gate, references, rules, or corrections."
          : " Related families remain review candidates and cannot be confirmed as one product."}
        {" "}These relationships do not measure similarity to the IP.
        {generatedAt && <span className="ml-1 text-blue-700">Snapshot: {generatedAt}.</span>}
      </div>

      {overview.dirty && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {overview.pending_snapshot_count != null && overview.pending_snapshot_count > 0 ? (
            <>
              A backend grouping rebuild is queued. <strong>{overview.pending_snapshot_count} profiled {overview.pending_snapshot_count === 1 ? "listing is" : "listings are"}</strong>{" "}
              awaiting it and {overview.pending_snapshot_count === 1 ? "is" : "are"} not represented in this snapshot yet.
            </>
          ) : (
            <>New product evidence arrived after this snapshot. A refreshed backend grouping is queued.</>
          )}
        </div>
      )}
      {overview.last_error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          The latest automatic group refresh failed: {overview.last_error}
        </div>
      )}

      {overview.groups.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
          <h2 className="text-base font-bold text-stone-900">
            {overview.dirty ? "Building the first persistent snapshot" : "No multi-listing groups in this snapshot"}
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            {overview.dirty
              ? "The backend will publish groups after the queued refresh completes."
              : "The remaining listings are stored as one-listing product candidates."}
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {overview.groups.map((group, index) => (
            <ProductGroupCard
              key={group.id}
              group={group}
              index={index}
              ipId={overview.scope.ip_id}
              mode={mode}
              saving={savingGroupId === group.id}
              savingCorrectionProfileId={savingCorrectionProfileId}
              onConfirmGroup={onConfirmGroup}
              onUpdateEmbeddingThreshold={onUpdateEmbeddingThreshold}
              onCorrectGroupMember={onCorrectGroupMember}
              onCreateRule={onCreateRule}
              onUpdateRule={onUpdateRule}
              onDeleteRule={onDeleteRule}
              onSelectReference={onSelectReference}
              canSelectReference={canSelectReference}
            />
          ))}
        </div>
      )}

      {overview.truncated && (
        <p className="mt-3 text-xs text-amber-700">
          Showing 200 of {overview.group_count} persistent groups. Tasks can still filter every stored group.
        </p>
      )}

      {overview.ungrouped_count > 0 && (
        <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-stone-900">
            One-listing product candidates · {overview.ungrouped_count}
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            These are persisted too, but no second listing has enough complete pairwise evidence to join them yet.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-10">
            {overview.ungrouped.map((profile) => (
              <ListingTile
                key={profile.id}
                profile={profile}
                onClick={canSelectReference(profile.id)
                  ? () => onSelectReference(profile.id)
                  : undefined}
              />
            ))}
          </div>
          {overview.ungrouped_count > overview.ungrouped.length && (
            <p className="mt-3 text-xs text-stone-500">
              +{overview.ungrouped_count - overview.ungrouped.length} more one-listing candidates
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function ProductGroupCard({
  group,
  index,
  ipId,
  mode,
  saving,
  savingCorrectionProfileId,
  onConfirmGroup,
  onUpdateEmbeddingThreshold,
  onCorrectGroupMember,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onSelectReference,
  canSelectReference,
}: {
  group: PersistedProductGroup;
  index: number;
  ipId: string;
  mode: RelationshipMode;
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
  onSelectReference: (profileId: string) => void;
  canSelectReference: (profileId: string) => boolean;
}) {
  const [editingName, setEditingName] = useState(false);
  const [managing, setManaging] = useState(false);
  const [correctingProfileId, setCorrectingProfileId] = useState<string | null>(null);
  const [name, setName] = useState(group.display_name);
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
  const canConfirm = mode === "same";
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
      confirmed ? "border-emerald-200" : "border-stone-200"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
            confirmed ? "text-emerald-700" : "text-stone-500"
          }`}>
            {confirmed && <CheckCircle2 size={13} />}
            {confirmed
              ? "Confirmed product"
              : mode === "same"
                ? `Potential product group ${index + 1}`
                : `Related family ${index + 1}`}
          </p>
          <h2 className="mt-1 line-clamp-2 text-sm font-bold text-stone-900">
            {group.display_name}
          </h2>
          {confirmed && group.confirmed_at && (
            <p className="mt-1 text-[10px] text-emerald-700">
              Confirmed {new Date(group.confirmed_at).toLocaleString()}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-stone-900">{group.member_count} listings</p>
          <p className="mt-0.5 text-[10px] text-stone-500">
            Avg {mode === "same" ? "same-product" : "related-product"} score{" "}
            {group.average_score?.toFixed(3) ?? "—"}
          </p>
          {confirmed && (
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
              setName(group.display_name);
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
            {confirmed ? (managing ? "Close product settings" : "Manage product") : "Confirm & manage"}
          </button>
          {confirmed && !managing && (
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
            <span className="text-xs font-bold text-emerald-900">Product name</span>
            <input
              autoFocus
              type="text"
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
              {saving ? "Saving…" : confirmed ? "Save name" : "Confirm & manage"}
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
                Product settings
              </p>
              <p className="mt-1 text-[11px] text-blue-700">
                Rename the product, tune its multimodal candidate gate, manage
                representative images and rules, or remove a listing below.
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
              <span className="text-xs font-bold text-stone-800">Product name</span>
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
        {group.members.map((profile) => {
          const primaryVisualEvidence = primaryVisualEvidenceByProfileId.get(profile.id);
          const matchedReferenceRank = primaryVisualEvidence?.matched_reference_image_id
            ? referenceRankByImageId.get(primaryVisualEvidence.matched_reference_image_id)
            : null;
          return (
            <div key={profile.id} className="group/member relative min-w-0">
              <ListingTile
                profile={profile}
                visualSupportScore={primaryVisualEvidence?.visual_support_score}
                visualSupportReferenceRank={matchedReferenceRank}
                visualSupportIsReference={primaryVisualEvidence?.is_reference}
                onClick={canSelectReference(profile.id)
                  ? () => onSelectReference(profile.id)
                  : undefined}
              />
              {canConfirm && confirmed && managing && group.member_count > 1 && (
                <button
                  type="button"
                  aria-label={`Remove ${profileTitle(profile)} from this product`}
                  title="This listing is not this product"
                  disabled={Boolean(savingCorrectionProfileId)}
                  onClick={() => setCorrectingProfileId(profile.id)}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white/90 text-stone-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-700 focus:opacity-100 disabled:opacity-40 group-hover/member:opacity-100"
                >
                  <CircleX size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {correctingProfile && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-950">
            Remove “{profileTitle(correctingProfile)}” from this product?
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            It will be categorized automatically again, but it will not be placed back with these same members.
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
              Not this product
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
          {group.member_count > group.members.length
            ? `+${group.member_count - group.members.length} more listings`
            : `Minimum ${mode === "same" ? "same-product" : "related-product"} score ${
              group.minimum_score?.toFixed(3) ?? "—"
            }`}
        </p>
        <Link
          to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}&product_group_id=${encodeURIComponent(group.id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-800 transition hover:border-red-300 hover:bg-red-100"
        >
          <ListFilter size={13} />
          Open tasks
        </Link>
      </div>
    </section>
  );
}

function ListingTile({
  profile,
  onClick,
  visualSupportScore,
  visualSupportReferenceRank,
  visualSupportIsReference = false,
}: {
  profile: ProductClusterProfile;
  onClick?: () => void;
  visualSupportScore?: number | null;
  visualSupportReferenceRank?: number | null;
  visualSupportIsReference?: boolean;
}) {
  const hasVisualSupport = visualSupportScore !== undefined;
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
        {hasVisualSupport && (
          <span
            className="absolute right-1.5 top-1.5 rounded-md border border-indigo-100 bg-white/95 px-1.5 py-1 font-mono text-[10px] font-bold text-indigo-900 shadow-sm"
            title={
              visualSupportScore == null
                ? "No reference image from another listing was available"
                : `Raw image similarity to ${
                  visualSupportReferenceRank
                    ? `product reference #${visualSupportReferenceRank}`
                    : "the closest product reference"
                }`
            }
          >
            {visualSupportScore == null
              ? "Image sim —"
              : `Image sim ${visualSupportScore.toFixed(2)}`}
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

function PairInspector({
  edge,
  reference,
  comparison,
}: {
  edge: ProductClusterEdge;
  reference: ProductClusterProfile;
  comparison: ProductClusterProfile;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Selected relationship</p>
          <h2 className="mt-1 text-lg font-black text-stone-900">Pair evidence</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-stone-500">
            The final product scores combine whole-listing multimodal similarity,
            exact-product model evidence and, when available, price evidence.
            Per-image similarity is separate and explanatory only.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-2 sm:grid-cols-6">
          <Metric label="Same-product" value={edge.same_product_score} />
          <Metric label="Related-product" value={edge.related_product_score} />
          <Metric label="Multimodal listing" value={edge.vector_similarity} />
          <Metric label="Exact-product model" value={edge.exact_reranker_score} />
          <Metric label="Price ratio" value={edge.price_ratio} suffix="×" />
          <Metric label="Low-price signal" value={edge.too_cheap_signal} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ListingCard
          profile={reference}
          label="Reference listing"
          cheaper={edge.cheaper_profile_id === reference.id}
        />
        <ListingCard
          profile={comparison}
          label="Compared listing"
          cheaper={edge.cheaper_profile_id === comparison.id}
        />
      </div>
    </section>
  );
}

function ListingCard({
  profile,
  label,
  cheaper,
}: {
  profile: ProductClusterProfile;
  label: string;
  cheaper: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50">
      <div className="flex min-h-40">
        <div className="h-40 w-36 shrink-0 bg-stone-100 sm:w-44">
          {profile.image_url ? (
            <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-stone-400">
              No image available
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-stone-500">
            <span className="text-red-800">{label}</span>
            <span>{profile.platform || "Unknown platform"}</span>
            {cheaper && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Cheaper listing</span>
            )}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-stone-900">
            {profileTitle(profile)}
          </h3>
          <p className="mt-2 text-sm font-semibold text-stone-800">{formatPrice(profile)}</p>
          {profile.description_summary && (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">
              {profile.description_summary}
            </p>
          )}
          {profile.source_url && (
            <a
              href={profile.source_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-red-800 hover:text-red-950"
            >
              Open listing <ExternalLink size={12} />
            </a>
          )}
        </div>
      </div>
      <details className="border-t border-stone-200 px-4 py-3">
        <summary className="cursor-pointer text-xs font-semibold text-stone-600">View model product profile</summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-stone-600">
          {profile.profile_text}
        </pre>
      </details>
    </article>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-stone-900 text-white shadow-sm" : "text-stone-600 hover:bg-white hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

function ViewTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
        active ? "border-red-800 text-red-900" : "border-transparent text-stone-500 hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, suffix = "" }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div>
      <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold text-stone-800">
        {value == null ? "—" : `${value.toFixed(3)}${suffix}`}
      </p>
    </div>
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

function EmptyState() {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
      <h2 className="text-base font-bold text-stone-900">No product profiles yet</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-stone-500">
        Run the product-profile backfill or let new enrichment jobs populate the model before using this lab.
      </p>
    </div>
  );
}

function otherProfileId(edge: ProductClusterEdge, profileId: string) {
  return edge.left_profile_id === profileId ? edge.right_profile_id : edge.left_profile_id;
}

function formatPrice(profile: ProductClusterProfile) {
  if (profile.price_value == null) return "Price unavailable";
  const currency = profile.price_currency?.toUpperCase();
  if (currency?.match(/^[A-Z]{3}$/)) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(profile.price_value);
    } catch {
      // Fall through to a plain value if a marketplace supplied an invalid code.
    }
  }
  return `${profile.price_value.toLocaleString()}${currency ? ` ${currency}` : ""}`;
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
