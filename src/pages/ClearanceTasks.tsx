import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listIpReviews, type IpReview } from "../api";
import { TaskRow } from "./Clearance";

type ClearanceState =
  | "processing"
  | "awaiting"
  | "cleared"
  | "not_cleared"
  | "failed";

type ClearanceSort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc";

const DEFAULT_SORT: ClearanceSort = "created_desc";

interface ClearanceFilters {
  state: ClearanceState | null;
  sort: ClearanceSort;
}

function parseFilters(params: URLSearchParams): ClearanceFilters {
  const state = params.get("state");
  const sort = params.get("sort");
  return {
    state:
      state === "processing" || state === "awaiting" ||
      state === "cleared" || state === "not_cleared" || state === "failed"
        ? state
        : null,
    sort:
      sort === "created_desc" || sort === "created_asc" ||
      sort === "updated_desc" || sort === "updated_asc"
        ? sort
        : DEFAULT_SORT,
  };
}

function writeFilters(base: URLSearchParams, f: ClearanceFilters): URLSearchParams {
  const next = new URLSearchParams(base);
  const setOrDel = (k: string, v: string | null) => {
    if (v) next.set(k, v);
    else next.delete(k);
  };
  setOrDel("state", f.state);
  setOrDel("sort", f.sort === DEFAULT_SORT ? null : f.sort);
  return next;
}

function classify(r: IpReview): ClearanceState {
  if (r.status === "processing") return "processing";
  if (r.status === "failed") return "failed";
  if (r.decision === "cleared") return "cleared";
  if (r.decision === "not_cleared") return "not_cleared";
  return "awaiting";
}

const STATE_PILLS: { key: ClearanceState; label: string }[] = [
  { key: "processing", label: "Processing" },
  { key: "awaiting", label: "Awaiting" },
  { key: "cleared", label: "Cleared" },
  { key: "not_cleared", label: "Not cleared" },
  { key: "failed", label: "Failed" },
];

const SORT_OPTIONS: { key: ClearanceSort; label: string }[] = [
  { key: "created_desc", label: "Newest" },
  { key: "created_asc", label: "Oldest" },
  { key: "updated_desc", label: "Recently updated" },
  { key: "updated_asc", label: "Least recently updated" },
];

const FILTER_SELECT =
  "px-2.5 py-1.5 rounded-lg border border-stone-200 text-[11px] bg-white text-stone-700 " +
  "max-w-[14rem] focus:outline-none focus:ring-1 focus:ring-stone-300";

/**
 * `/clearance/tasks` — clearance review list with URL-driven state + sort
 * filters. The full clearance-mode review set is fetched once (limit 200);
 * filtering and sorting are client-side, mirroring the previous Inbox tab
 * but with deep-linkable state.
 */
export default function ClearanceTasks() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);

  const [reviews, setReviews] = useState<IpReview[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    listIpReviews({ mode: "clearance", limit: 200 })
      .then(({ reviews }) => {
        if (!alive) return;
        setReviews(reviews);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  const counts = useMemo(() => {
    const out: Record<ClearanceState, number> = {
      processing: 0, awaiting: 0, cleared: 0, not_cleared: 0, failed: 0,
    };
    for (const r of reviews) out[classify(r)] += 1;
    return out;
  }, [reviews]);

  const filtered = useMemo(() => {
    const sortKey = (r: IpReview) =>
      filters.sort.startsWith("updated_") ? r.updated_at : r.created_at;
    const direction = filters.sort.endsWith("_desc") ? -1 : 1;
    const subset = filters.state
      ? reviews.filter((r) => classify(r) === filters.state)
      : reviews;
    return [...subset].sort((a, b) => {
      const av = new Date(sortKey(a)).getTime();
      const bv = new Date(sortKey(b)).getTime();
      return direction * (av - bv);
    });
  }, [reviews, filters.state, filters.sort]);

  function onFiltersChange(next: Partial<ClearanceFilters>) {
    setParams(writeFilters(params, { ...filters, ...next }), { replace: true });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Tasks</h1>
          <p className="mt-1 text-sm text-stone-500">
            Clearance reviews — pre-launch checks across uploaded assets.
          </p>
        </div>
        <Link
          to="/clearance/new"
          className="px-3 py-1.5 rounded-lg border border-stone-300 text-stone-800 text-xs font-semibold hover:bg-stone-50"
        >
          + New clearance
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StatePills
          counts={counts}
          active={filters.state}
          onSelect={(s) => onFiltersChange({ state: s })}
        />
        <select
          value={filters.sort}
          onChange={(e) => onFiltersChange({ sort: e.target.value as ClearanceSort })}
          title="Sort reviews"
          className={FILTER_SELECT}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
        {!loaded && (
          <div className="text-sm text-stone-400 py-8 text-center">Loading…</div>
        )}

        {loaded && reviews.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-stone-600">No clearance reviews yet.</p>
            <p className="text-xs text-stone-400 mt-1">
              <Link to="/clearance/new" className="underline">Start a clearance review</Link> to populate this list.
            </p>
          </div>
        )}

        {loaded && reviews.length > 0 && (
          <div className="divide-y divide-stone-100">
            {filtered.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-400">
                No reviews match the current filters.
              </div>
            ) : (
              filtered.map((r) => (
                <TaskRow
                  key={r.id}
                  review={r}
                  muted={classify(r) === "cleared" || classify(r) === "not_cleared"}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatePills({
  counts,
  active,
  onSelect,
}: {
  counts: Record<ClearanceState, number>;
  active: ClearanceState | null;
  onSelect: (s: ClearanceState | null) => void;
}) {
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const pillCls = (selected: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
      selected
        ? "bg-stone-900 text-white border-stone-900"
        : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
    }`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        type="button"
        className={pillCls(active === null)}
        onClick={() => onSelect(null)}
      >
        All ({total})
      </button>
      {STATE_PILLS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={pillCls(active === p.key)}
          onClick={() => onSelect(p.key === active ? null : p.key)}
        >
          {p.label} ({counts[p.key]})
        </button>
      ))}
    </div>
  );
}
