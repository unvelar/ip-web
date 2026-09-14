import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProductGroupMergeCandidate } from "../../api/products";
import { searchPersistedProductGroupMergeCandidates } from "../../api/products";
import { errorMessage } from "./clusterDomain";

export function ProductMergeCandidatePicker({
  ipId,
  sourceGroupId,
  selected,
  onSelect,
  disabled = false,
}: {
  ipId: string;
  sourceGroupId: string;
  selected: ProductGroupMergeCandidate | null;
  onSelect: (candidate: ProductGroupMergeCandidate | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ProductGroupMergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (disabled || trimmedQuery.length < 2) return;
    const controller = new AbortController();
    let alive = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchPersistedProductGroupMergeCandidates(
        ipId,
        sourceGroupId,
        trimmedQuery,
        controller.signal,
      )
        .then(({ candidates }) => {
          if (alive) setMatches(candidates);
        })
        .catch((caught: unknown) => {
          if (!alive || controller.signal.aborted) return;
          setMatches([]);
          setError(errorMessage(caught, "Unable to search products."));
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 250);
    return () => {
      alive = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [disabled, ipId, query, sourceGroupId]);

  return (
    <div className="min-w-0 flex-1">
      {selected && (
        <div className="rounded-lg border border-violet-200 bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-stone-950">
                {selected.display_name}
              </p>
              <p className="mt-0.5 text-[10px] font-semibold text-stone-500">
                {selected.member_count} {selected.member_count === 1 ? "listing" : "listings"}
                {selected.category_name ? ` · ${selected.category_name}` : ""}
                {selected.confirmation_status === "confirmed" ? " · Confirmed" : ""}
              </p>
              {selected.representative_listing_title && (
                <p className="mt-1 line-clamp-1 text-[10px] text-stone-500">
                  Example offer: {selected.representative_listing_title}
                </p>
              )}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(null)}
              aria-label="Clear selected merge target"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className={`relative ${selected ? "mt-2" : ""}`}>
        <Search
          size={15}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3.5 text-stone-400"
        />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setMatches([]);
            setLoading(nextQuery.trim().length >= 2);
            setError(null);
          }}
          placeholder={selected ? "Search for a different product" : "Search all products"}
          aria-label="Search products to merge"
          className="min-h-11 w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
        />
      </div>
      {loading && <p className="mt-1.5 text-[10px] text-stone-500">Searching all products…</p>}
      {error && <p className="mt-1.5 text-[10px] text-red-700">{error}</p>}
      {!loading && query.trim().length >= 2 && !error && matches.length === 0 && (
        <p className="mt-1.5 text-[10px] text-stone-500">
          No other product matches this search.
        </p>
      )}
      {matches.length > 0 && (
        <div
          role="listbox"
          aria-label="Product merge candidates"
          className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
        >
          {matches.map((candidate) => (
            <button
              key={candidate.group_id}
              type="button"
              role="option"
              aria-selected={selected?.group_id === candidate.group_id}
              onClick={() => {
                onSelect(candidate);
                setQuery("");
                setMatches([]);
              }}
              className={`block w-full rounded-md px-3 py-2.5 text-left transition ${
                selected?.group_id === candidate.group_id
                  ? "bg-violet-100 text-violet-950"
                  : "hover:bg-stone-100"
              }`}
            >
              <span className="block truncate text-xs font-black">{candidate.display_name}</span>
              <span className="mt-0.5 block text-[10px] font-semibold text-stone-500">
                {candidate.member_count} {candidate.member_count === 1 ? "listing" : "listings"}
                {candidate.category_name ? ` · ${candidate.category_name}` : ""}
                {candidate.confirmation_status === "confirmed" ? " · Confirmed" : ""}
              </span>
              {candidate.representative_listing_title && (
                <span className="mt-1 block truncate text-[10px] text-stone-500">
                  Example offer: {candidate.representative_listing_title}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-4 text-stone-500">
        Search the full Product Lab catalog by product name, category, or offer title.
      </p>
    </div>
  );
}
