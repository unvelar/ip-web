import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { browseDesignCatalog, type DesignCatalogItem } from "../api";

const PAGE_SIZE = 50;

/**
 * Browse the WIPO design-patents catalog. Same pagination + debounced search
 * shape as BrandsCatalog. The server collapses sibling design views (same
 * `base_id`, different `-0001/-0002/...` suffixes) into one row each so the
 * grid stays readable even when the underlying table has tens of thousands.
 */
export default function DesignsCatalog() {
  const [items, setItems] = useState<DesignCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setItems([]);
    browseDesignCatalog({ q: debouncedQuery, limit: PAGE_SIZE, offset: 0 })
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
      const r = await browseDesignCatalog({
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
          <h1 className="text-xl font-bold tracking-tight">Indexed Designs</h1>
          <p className="text-xs text-stone-400 mt-0.5">
            Browse the WIPO Global Design Database catalog used for design clearance.
          </p>
        </div>
        <Link
          to="/clearance/tasks"
          className="text-xs font-medium text-stone-500 hover:text-stone-900 whitespace-nowrap"
        >
          ← Back to clearance
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by registration ID or product class…"
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
              <DesignCard key={it.id} item={it} />
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

function DesignCard({ item }: { item: DesignCatalogItem }) {
  return (
    <a
      href={item.wipo_link ?? undefined}
      target={item.wipo_link ? "_blank" : undefined}
      rel={item.wipo_link ? "noopener noreferrer" : undefined}
      className="group border border-stone-200 rounded-xl bg-white overflow-hidden hover:border-stone-300 hover:shadow-sm transition-all"
    >
      <div className="aspect-square bg-stone-50 flex items-center justify-center overflow-hidden">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.registration_id}
            loading="lazy"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-[11px] text-stone-300 px-3 text-center">no preview</div>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold text-stone-900 truncate">
          {item.base_id || item.registration_id}
        </div>
        {item.product_class && (
          <div className="mt-0.5 text-[11px] text-stone-500 truncate">{item.product_class}</div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-stone-400">
          {item.design_office && <span>{item.design_office}</span>}
          {item.design_office && item.status && <span>·</span>}
          {item.status && <span className="truncate">{item.status}</span>}
        </div>
      </div>
    </a>
  );
}
