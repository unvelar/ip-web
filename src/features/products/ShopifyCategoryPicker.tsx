import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ShopifyProductTaxonomyCategory } from "../../api/products";
import { searchShopifyProductTaxonomy } from "../../api/products";
import { errorMessage } from "./clusterDomain";

export function ShopifyCategoryPicker({
  ipId,
  selected,
  onSelect,
  disabled = false,
}: {
  ipId: string;
  selected: ShopifyProductTaxonomyCategory | null;
  onSelect: (category: ShopifyProductTaxonomyCategory) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ShopifyProductTaxonomyCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (disabled || trimmedQuery.length < 2) return;
    let alive = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      void searchShopifyProductTaxonomy(ipId, trimmedQuery)
        .then(({ categories }) => {
          if (alive) setMatches(categories);
        })
        .catch((caught: unknown) => {
          if (alive) {
            setMatches([]);
            setError(errorMessage(caught, "Unable to search Shopify categories."));
          }
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      window.clearTimeout(timeout);
    };
  }, [disabled, ipId, query]);

  return (
    <div>
      <span className="text-xs font-bold text-stone-800">Shopify category</span>
      {selected && (
        <div className="mt-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2">
          <p className="text-xs font-bold text-stone-900">{selected.name}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-stone-500">{selected.path}</p>
        </div>
      )}
      <div className="relative mt-2">
        <Search
          size={14}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-3 text-stone-400"
        />
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (nextQuery.trim().length < 2) {
              setMatches([]);
              setLoading(false);
              setError(null);
            }
          }}
          placeholder="Search all Shopify categories"
          aria-label="Search Shopify categories"
          className="w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
        />
      </div>
      {loading && <p className="mt-1.5 text-[10px] text-stone-500">Searching categories…</p>}
      {error && <p className="mt-1.5 text-[10px] text-red-700">{error}</p>}
      {!loading && query.trim().length >= 2 && !error && matches.length === 0 && (
        <p className="mt-1.5 text-[10px] text-stone-500">No matching Shopify category.</p>
      )}
      {matches.length > 0 && (
        <div
          role="listbox"
          aria-label="Shopify category results"
          className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
        >
          {matches.map((category) => (
            <button
              key={category.id}
              type="button"
              role="option"
              aria-selected={selected?.id === category.id}
              onClick={() => {
                onSelect(category);
                setQuery("");
                setMatches([]);
              }}
              className={`block w-full rounded-md px-3 py-2 text-left transition ${
                selected?.id === category.id
                  ? "bg-blue-100 text-blue-950"
                  : "hover:bg-stone-100"
              }`}
            >
              <span className="block text-xs font-bold">{category.name}</span>
              <span className="mt-0.5 block text-[10px] leading-4 text-stone-500">
                {category.path}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] leading-4 text-stone-500">
        A reviewer-selected category takes precedence over future classifier refreshes.
      </p>
    </div>
  );
}
