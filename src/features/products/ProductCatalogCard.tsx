import { Link } from "react-router-dom";
import type { PersistedProductGroup } from "../../api/products";
import { productGroupDisplayName, productGroupNameProvenance, productGroupPriceRange } from "./clusterDomain";

export function ProductCatalogCard({
  group,
  currentSearch,
  catalogSupported,
  historyOnly,
}: {
  group: PersistedProductGroup;
  currentSearch: string;
  catalogSupported: boolean;
  historyOnly: boolean;
}) {
  const representative = group.members[0] ?? group.triage_members[0] ?? null;
  const triageCount = group.triage_member_count ?? 0;
  const offerCount = group.commercial_subgroups.filter((subgroup) =>
    subgroup.member_count > 0
  ).length;
  const priceRange = productGroupPriceRange(group);
  const confirmed = group.confirmation_status === "confirmed";
  const nameProvenance = historyOnly ? null : productGroupNameProvenance(group);

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md">
      <div className="aspect-[4/3] w-full overflow-hidden bg-stone-100">
          {representative?.image_url ? (
            <img
              src={representative.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl font-black text-stone-400">
              {productGroupDisplayName(group).slice(0, 1).toUpperCase()}
            </span>
          )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500">
          {group.catalog_primary_category_name ?? "Unclassified"}
        </p>
        <h3 className="mt-1 line-clamp-2 text-lg font-black text-stone-950">
          {productGroupDisplayName(group)}
        </h3>
        {nameProvenance && (
          <p className="mt-1 line-clamp-1 text-[10px] font-medium text-stone-500">
            {nameProvenance}
          </p>
        )}
        <p className={`mt-2 text-sm font-black ${
          historyOnly
            ? "text-amber-800"
            : triageCount > 0 ? "text-red-800" : "text-emerald-700"
        }`}>
          {historyOnly
            ? "History only"
            : triageCount > 0 ? `${triageCount} to review` : "Review complete"}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 border-y border-stone-100 py-3 text-center">
          <span><strong className="block text-sm text-stone-950">{group.member_count}</strong><small className="text-[10px] text-stone-500">Listings</small></span>
          <span><strong className="block text-sm text-stone-950">{group.catalog_task_count}</strong><small className="text-[10px] text-stone-500">Tasks</small></span>
          <span><strong className="block text-sm text-stone-950">{offerCount}</strong><small className="text-[10px] text-stone-500">Offers</small></span>
        </div>
        <div className="mt-3 flex min-h-6 items-center justify-between gap-2 text-xs text-stone-500">
          <span className={confirmed ? "font-semibold text-emerald-700" : "font-semibold text-amber-800"}>
            {confirmed ? "Confirmed" : "Needs confirmation"}
          </span>
          {priceRange && <span className="truncate font-semibold text-stone-700">{priceRange}</span>}
        </div>
        <Link
          to={{
            pathname: `/monitoring/products/${encodeURIComponent(
              catalogSupported ? group.canonical_product_id ?? group.id : group.id,
            )}`,
            search: currentSearch,
          }}
          aria-label={`Open ${productGroupDisplayName(group)}`}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800"
        >
          {historyOnly ? "Open history" : "Open product"}
        </Link>
      </div>
    </article>
  );
}
