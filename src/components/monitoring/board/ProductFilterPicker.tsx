import { Check, ImageOff, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getPersistedProductGroups, type PersistedProductGroup } from "../../../api/products";

export interface ProductFilterSelection {
  catalog_product_id: string | null;
  product_group_id: string | null;
  label?: string;
}

interface ProductFilterPickerProps {
  ipId: string | null;
  productId: string | null;
  groupId: string | null;
  onChange: (selection: ProductFilterSelection) => void;
}

type Relationship = "same" | "visual";

function ProductThumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="product-filter-thumbnail flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-200 bg-white text-stone-300">
      {url && !failed ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-contain p-0.5"
          onError={() => setFailed(true)} />
      ) : <ImageOff size={17} aria-hidden="true" />}
    </span>
  );
}

function groupKey(group: PersistedProductGroup, relationship: Relationship) {
  return relationship === "same" ? group.canonical_product_id ?? group.id : group.id;
}

function ProductOptions({ ipId, productId, groupId, onChange, relationship, query }: ProductFilterPickerProps & {
  ipId: string;
  relationship: Relationship;
  query: string;
}) {
  const [groups, setGroups] = useState<PersistedProductGroup[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const seenCursors = useRef(new Set<string>());

  const load = useCallback(async (cursor: string | null) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await getPersistedProductGroups(ipId, relationship, "all", {
        limit: 20,
        cursor,
        query,
        catalogScope: relationship === "same" ? "catalog" : undefined,
        includeUngrouped: false,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (cursor) seenCursors.current.add(cursor);
      setGroups((current) => {
        const merged = cursor ? [...current, ...result.groups] : result.groups;
        return [...new Map(merged.map((group) => [groupKey(group, relationship), group])).values()];
      });
      setNextCursor(result.next_cursor && !seenCursors.current.has(result.next_cursor)
        ? result.next_cursor : null);
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "Products could not be loaded.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [ipId, relationship, query]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(null), query ? 200 : 0);
    return () => {
      window.clearTimeout(timeout);
      request.current?.abort();
    };
  }, [load, query]);

  return (
    <div className="max-h-72 overflow-y-auto overscroll-contain" aria-busy={loading}>
      <ul aria-label={relationship === "same" ? "Products" : "Visual groups"} className="space-y-0.5">
        {groups.map((group) => {
          const canonicalId = relationship === "same" ? group.canonical_product_id : null;
          const selected = canonicalId ? productId === canonicalId : !productId && groupId === group.id;
          const label = relationship === "same" ? group.catalog_display_name
            : group.display_name?.trim() || "Unnamed visual group";
          const imageUrl = group.members.find((member) => member.image_url)?.image_url ?? null;
          return (
            <li key={groupKey(group, relationship)}>
              <button type="button" aria-pressed={selected}
                onClick={() => onChange({
                  catalog_product_id: canonicalId,
                  product_group_id: canonicalId ? null : group.id,
                  label,
                })}
                className={`flex w-full items-center gap-3 rounded-lg p-2 text-left focus-visible:outline-2 focus-visible:outline-stone-500 ${selected ? "bg-stone-100" : "hover:bg-stone-50"}`}>
                <ProductThumbnail key={imageUrl} url={imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-xs font-medium leading-4 text-stone-800">{label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-stone-500">
                    {relationship === "visual" ? "Grouped by visual similarity" : group.catalog_primary_category_name || "Product"}
                  </span>
                </span>
                {selected && <Check size={15} className="shrink-0 text-stone-700" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      {loading && <p role="status" className="px-2 py-5 text-center text-xs text-stone-500">{groups.length ? "Loading more…" : query ? "Searching…" : "Loading…"}</p>}
      {error && <div role="alert" className="px-2 py-3 text-xs text-stone-600">
        <p>{error}</p>
        <button type="button" onClick={() => void load(nextCursor)} className="mt-2 font-medium underline underline-offset-2">Try again</button>
      </div>}
      {!loading && !error && groups.length === 0 && (
        <p className="px-3 py-6 text-center text-xs leading-5 text-stone-500">
          {query ? "No matches. Try another product name." : relationship === "same" ? "No products available for this IP yet." : "No visual groups available for this IP yet."}
        </p>
      )}
      {!loading && !error && nextCursor && <button type="button" onClick={() => void load(nextCursor)}
        className="mt-1 min-h-9 w-full rounded-md text-xs font-medium text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-500">Load more</button>}
    </div>
  );
}

/** Searches the complete catalog; the surrounding filter owns its applied selection. */
export function ProductFilterPicker(props: ProductFilterPickerProps) {
  const [relationship, setRelationship] = useState<Relationship>("same");
  const [query, setQuery] = useState("");
  return (
    <div className="product-filter-picker w-full min-w-0 px-3 pb-3">
      <button type="button" aria-pressed={!props.productId && !props.groupId}
        onClick={() => props.onChange({ catalog_product_id: null, product_group_id: null })}
        className="mb-3 flex min-h-9 w-full items-center justify-between rounded-md px-2 text-xs font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-500">
        All products and groups
        {!props.productId && !props.groupId && <Check size={15} aria-hidden="true" />}
      </button>
      {!props.ipId ? <p className="px-2 pb-3 text-xs text-stone-500">Select an IP to browse its products.</p> : <>
        <div role="group" aria-label="Product grouping" className="mb-3 flex gap-1 rounded-lg bg-stone-100 p-1">
          {([['same', 'Products'], ['visual', 'Visual groups']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={relationship === value}
              onClick={() => setRelationship(value)}
              className={`min-h-8 flex-1 rounded-md px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-stone-500 ${relationship === value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="relative mb-2 block">
          <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-stone-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
            aria-label={relationship === "same" ? "Search all products" : "Search all visual groups"}
            placeholder={relationship === "same" ? "Search all products…" : "Search all visual groups…"}
            className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-xs text-stone-800 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none" />
        </label>
        <ProductOptions key={`${props.ipId}:${relationship}:${query.trim()}`} {...props} ipId={props.ipId}
          relationship={relationship} query={query.trim()} />
      </>}
    </div>
  );
}
