import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  getProductClusterGraph,
  listProductClusterScopes,
  type ProductClusterEdge,
  type ProductClusterGraph,
  type ProductClusterProfile,
  type ProductClusterScope,
} from "../api";
import ProductClusterGraphView from "../components/product-clusters/ProductClusterGraph";
import {
  profileTitle,
  scoreFor,
  type RelationshipMode,
} from "../components/product-clusters/productClusterGraphUtils";
import { useAuth } from "../context/AuthContext";

const MAX_NODES = 80;
const MAX_EDGES = 400;

export default function ProductClusters() {
  const { actingTenantId } = useAuth();
  const [scopes, setScopes] = useState<ProductClusterScope[]>([]);
  const [selectedIpId, setSelectedIpId] = useState("");
  const [graph, setGraph] = useState<ProductClusterGraph | null>(null);
  const [mode, setMode] = useState<RelationshipMode>("same");
  const [threshold, setThreshold] = useState(0.3);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scopesLoadedKey, setScopesLoadedKey] = useState<string | null>(null);
  const [graphLoadedKey, setGraphLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopesRequestKey = `${actingTenantId ?? ""}:${refreshVersion}`;
  const graphRequestKey = `${scopesRequestKey}:${selectedIpId}`;
  const loadingScopes = scopesLoadedKey !== scopesRequestKey;
  const loadingGraph = Boolean(selectedIpId) && graphLoadedKey !== graphRequestKey;

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
        if (nextScopes.length === 0) setGraph(null);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setScopes([]);
        setSelectedIpId("");
        setGraph(null);
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
  const effectiveSelectedEdgeId = visibleEdges.some(
    (edge) => edge.id === selectedEdgeId,
  )
    ? selectedEdgeId
    : visibleEdges[0]?.id ?? null;
  const selectedEdge =
    visibleEdges.find((edge) => edge.id === effectiveSelectedEdgeId) ?? null;
  const selectedLeft = selectedEdge
    ? profileById.get(selectedEdge.left_profile_id) ?? null
    : null;
  const selectedRight = selectedEdge
    ? profileById.get(selectedEdge.right_profile_id) ?? null
    : null;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-stone-900">
              Product Clustering Lab
            </h1>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Review only
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Explore listings that the model considers the same product or closely related.
            Nothing you do here changes monitoring decisions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRefreshVersion((version) => version + 1);
          }}
          disabled={loadingScopes || loadingGraph}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={loadingScopes || loadingGraph ? "animate-spin" : ""}
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
              }}
              disabled={loadingScopes || scopes.length === 0}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:bg-stone-50"
            >
              {scopes.length === 0 && <option value="">No profiles available</option>}
              {scopes.map((scope) => (
                <option value={scope.ip_id} key={scope.ip_id}>
                  {scope.ip_name} · {scope.profile_count} products · {scope.pair_count} pairs
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-stone-500">
              Relationship
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

          <label className="block">
            <span className="mb-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-stone-500">
              Minimum confidence
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
        </div>

        {graph && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-stone-100 pt-3 text-xs text-stone-500">
            <span><strong className="text-stone-800">{graph.profiles.length}</strong> listings shown</span>
            <span><strong className="text-stone-800">{visibleEdges.length}</strong> visible relationships</span>
            <span><strong className="text-stone-800">{graph.scope.pair_count}</strong> scored pairs total</span>
            {graph.truncated && (
              <span className="text-amber-700">Showing the strongest bounded subset for readability</span>
            )}
          </div>
        )}
      </section>

      {error && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {loadingScopes ? (
        <LoadingState />
      ) : scopes.length === 0 ? (
        <EmptyState />
      ) : loadingGraph && !graph ? (
        <LoadingState />
      ) : graph ? (
        <>
          <div className="mt-5 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className={loadingGraph ? "min-w-0 opacity-60" : "min-w-0"}>
              <ProductClusterGraphView
                profiles={graph.profiles}
                edges={visibleEdges}
                layoutEdges={graph.edges}
                mode={mode}
                selectedEdgeId={effectiveSelectedEdgeId}
              />
            </div>
            <RankedPairs
              edges={visibleEdges}
              mode={mode}
              profileById={profileById}
              selectedEdgeId={effectiveSelectedEdgeId}
              onSelect={setSelectedEdgeId}
            />
          </div>

          {selectedEdge && selectedLeft && selectedRight && (
            <PairInspector
              edge={selectedEdge}
              left={selectedLeft}
              right={selectedRight}
            />
          )}
        </>
      ) : null}
    </div>
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
        active
          ? "bg-stone-900 text-white shadow-sm"
          : "text-stone-600 hover:bg-white hover:text-stone-900"
      }`}
    >
      {children}
    </button>
  );
}

function RankedPairs({
  edges,
  mode,
  profileById,
  selectedEdgeId,
  onSelect,
}: {
  edges: ProductClusterEdge[];
  mode: RelationshipMode;
  profileById: Map<string, ProductClusterProfile>;
  selectedEdgeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-bold text-stone-900">Closest pairs</h2>
        <p className="mt-0.5 text-xs text-stone-500">Ranked by exact combined score</p>
      </div>
      <div className="max-h-[472px] overflow-y-auto p-2">
        {edges.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-stone-500">
            No pairs meet this confidence. Lower the threshold to reveal more.
          </p>
        ) : (
          edges.slice(0, 50).map((edge, index) => {
            const left = profileById.get(edge.left_profile_id);
            const right = profileById.get(edge.right_profile_id);
            const selected = edge.id === selectedEdgeId;
            return (
              <button
                type="button"
                key={edge.id}
                onClick={() => onSelect(edge.id)}
                className={`mb-1 w-full rounded-xl border px-3 py-2.5 text-left transition last:mb-0 ${
                  selected
                    ? "border-red-200 bg-red-50"
                    : "border-transparent hover:border-stone-200 hover:bg-stone-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-[10px] font-bold text-stone-400">#{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-stone-800">
                    {left ? profileTitle(left) : "Unknown listing"}
                  </span>
                  <span className="font-mono text-xs font-bold text-red-800">
                    {scoreFor(edge, mode).toFixed(3)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 pl-7">
                  <span className="min-w-0 flex-1 truncate text-xs text-stone-500">
                    ↔ {right ? profileTitle(right) : "Unknown listing"}
                  </span>
                  {edge.price_ratio != null && (
                    <span className="shrink-0 text-[10px] text-stone-400">
                      {edge.price_ratio.toFixed(2)}× price
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function PairInspector({
  edge,
  left,
  right,
}: {
  edge: ProductClusterEdge;
  left: ProductClusterProfile;
  right: ProductClusterProfile;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500">Pair evidence</p>
          <h2 className="mt-1 text-lg font-black text-stone-900">
            Why these listings are connected
          </h2>
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-2 sm:grid-cols-6">
          <Metric label="Same" value={edge.same_product_score} />
          <Metric label="Related" value={edge.related_product_score} />
          <Metric label="Vector" value={edge.vector_similarity} />
          <Metric label="Exact" value={edge.exact_reranker_score} />
          <Metric label="Price ratio" value={edge.price_ratio} suffix="×" />
          <Metric label="Too cheap" value={edge.too_cheap_signal} />
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <ListingCard profile={left} cheaper={edge.cheaper_profile_id === left.id} />
        <ListingCard profile={right} cheaper={edge.cheaper_profile_id === right.id} />
      </div>
    </section>
  );
}

function ListingCard({
  profile,
  cheaper,
}: {
  profile: ProductClusterProfile;
  cheaper: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/50">
      <div className="flex min-h-40">
        <div className="h-40 w-36 shrink-0 bg-stone-100 sm:w-44">
          {profile.image_url ? (
            <img
              src={profile.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-stone-400">
              No image available
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 p-4">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-stone-500">
            <span>{profile.platform || "Unknown platform"}</span>
            {cheaper && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                Cheaper listing
              </span>
            )}
          </div>
          <h3 className="mt-1.5 line-clamp-2 text-sm font-bold text-stone-900">
            {profileTitle(profile)}
          </h3>
          <p className="mt-2 text-sm font-semibold text-stone-800">
            {formatPrice(profile)}
          </p>
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
        <summary className="cursor-pointer text-xs font-semibold text-stone-600">
          View model product profile
        </summary>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-stone-600">
          {profile.profile_text}
        </pre>
      </details>
    </article>
  );
}

function Metric({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <div>
      <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-wide text-stone-400">
        {label}
      </p>
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
