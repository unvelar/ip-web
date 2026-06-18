import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { browseTrademarkCatalog, type TrademarkCatalogItem } from "../api";

const PAGE_SIZE = 50;

/**
 * Browse the EUIPO trademark catalog. The catalog is large (1,000+ rows and
 * growing), so we never try to render the whole thing at once:
 *   - The server returns a slice of `PAGE_SIZE` items per request.
 *   - Search is debounced (300ms) and re-runs from offset 0.
 *   - "Load more" appends pages onto the existing list.
 *
 * Per-tenant trademarks (the user's own IPs) live on /ips —
 * we link there from the header instead of merging the two views.
 */
export default function BrandsCatalog() {
  const [items, setItems] = useState<TrademarkCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Counter that increments per-search; in-flight responses for older counters
  // are dropped on arrival so a slow search can't overwrite a faster one.
  const reqIdRef = useRef(0);

  // Debounce the search input → debouncedQuery.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset + first page on debounced query change.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setItems([]);
    browseTrademarkCatalog({ q: debouncedQuery, limit: PAGE_SIZE, offset: 0 })
      .then((r) => {
        if (reqIdRef.current !== myReq) return;
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e: any) => {
        if (reqIdRef.current !== myReq) return;
        setError(e?.message ?? "Failed to load");
      })
      .finally(() => {
        if (reqIdRef.current === myReq) setLoading(false);
      });
  }, [debouncedQuery]);

  const loadMore = useCallback(async () => {
    if (loadingMore || items.length >= total) return;
    const myReq = reqIdRef.current;
    setLoadingMore(true);
    try {
      const r = await browseTrademarkCatalog({
        q: debouncedQuery,
        limit: PAGE_SIZE,
        offset: items.length,
      });
      if (reqIdRef.current !== myReq) return;
      setItems((prev) => [...prev, ...r.items]);
      setTotal(r.total);
    } catch (e: any) {
      if (reqIdRef.current === myReq) setError(e?.message ?? "Failed to load more");
    } finally {
      if (reqIdRef.current === myReq) setLoadingMore(false);
    }
  }, [debouncedQuery, items.length, total, loadingMore]);

  const hasMore = items.length < total;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Indexed Trademarks</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Browse the EUIPO catalog used for brand clearance. Per-tenant marks live on{" "}
            <Link to="/ips" className="font-medium text-stone-700 hover:text-stone-900 underline">
              your IPs
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by brand name…"
            className="w-full px-4 py-2 pr-10 text-sm border border-stone-200 rounded-full focus:outline-none focus:border-stone-400 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-xs text-stone-500 tabular-nums whitespace-nowrap">
          {loading ? "Loading…" : `${items.length.toLocaleString()} of ${total.toLocaleString()}`}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="py-12 flex justify-center">
          <div className="w-5 h-5 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center text-sm text-stone-500">
          {debouncedQuery ? `No matches for "${debouncedQuery}"` : "Catalog is empty"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {items.map((it) => (
              <BrandCard key={it.id} item={it} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-sm font-medium border border-stone-200 rounded-full hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading…" : `Load more (${(total - items.length).toLocaleString()} left)`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function BrandCard({ item }: { item: TrademarkCatalogItem }) {
  const niceClasses = item.nice_classes ?? [];
  return (
    <a
      href={item.detail_url ?? undefined}
      target={item.detail_url ? "_blank" : undefined}
      rel={item.detail_url ? "noopener noreferrer" : undefined}
      className="group border border-stone-200 rounded-xl bg-white overflow-hidden hover:border-stone-300 hover:shadow-sm transition-all"
    >
      <div className="aspect-square bg-stone-50 flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.verbal_element ?? item.application_number}
            loading="lazy"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-[11px] text-stone-300 px-3 text-center">
            {item.mark_kind ?? "no preview"}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-stone-900 truncate">
          {item.verbal_element || <span className="italic text-stone-400">untitled</span>}
        </div>
        <div className="mt-0.5 text-[11px] text-stone-400 truncate">
          {item.application_number}
        </div>
        {(item.status || item.mark_kind) && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-500">
            {item.mark_kind && <span className="truncate">{item.mark_kind}</span>}
            {item.mark_kind && item.status && <span>·</span>}
            {item.status && <span className="truncate">{item.status}</span>}
          </div>
        )}
        {niceClasses.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {niceClasses.slice(0, 4).map((c) => (
              <span
                key={c}
                className="text-[10px] font-medium text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded"
              >
                Nice {c}
              </span>
            ))}
            {niceClasses.length > 4 && (
              <span className="text-[10px] text-stone-400">+{niceClasses.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </a>
  );
}
