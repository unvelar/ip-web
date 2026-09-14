import { RefreshCw, Search } from "lucide-react";
import type { PersistedProductGroupOverview, ProductCatalogScope } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import {
  buildProductCatalogCategoryTree,
  findProductCatalogCategoryName,
  productGroupDisplayName,
} from "./clusterDomain";
import { ProductCatalogCard } from "./ProductCatalogCard";
import { ProductCatalogCategoryList } from "./ProductCatalogCategoryList";

export function ProductQueue({
  overview,
  search,
  sort,
  loadingMore,
  currentSearch,
  selectedCategoryId,
  catalogScope,
  onSearchChange,
  onSortChange,
  onLoadMore,
  onSelectCategory,
  onSelectScope,
}: {
  overview: PersistedProductGroupOverview;
  search: string;
  sort: "work" | "name";
  loadingMore: boolean;
  currentSearch: string;
  selectedCategoryId: string | null;
  catalogScope: ProductCatalogScope;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: "work" | "name") => void;
  onLoadMore: () => void;
  onSelectCategory: (categoryId: string | null) => void;
  onSelectScope: (scope: ProductCatalogScope) => void;
}) {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleGroups = overview.groups
    .filter((group) => {
      if (!normalizedSearch) return true;
      const searchable = [
        productGroupDisplayName(group),
        group.display_name,
        group.catalog_primary_category_name,
        group.catalog_primary_category_path,
        ...group.members.slice(0, 4).map((member) => profileTitle(member)),
        ...group.triage_members.slice(0, 4).map((member) => profileTitle(member)),
        ...group.commercial_subgroups.map((subgroup) => subgroup.variant_label),
      ].filter(Boolean).join(" ").toLocaleLowerCase();
      return searchable.includes(normalizedSearch);
    })
    .sort((left, right) => {
      if (sort === "name") {
        return productGroupDisplayName(left).localeCompare(productGroupDisplayName(right));
      }
      return (right.triage_member_count ?? 0) - (left.triage_member_count ?? 0) ||
        right.member_count - left.member_count;
    });
  const categoryTree = buildProductCatalogCategoryTree(overview.catalog_categories);
  const productCount = catalogScope === "history"
    ? overview.catalog_history_product_count
    : overview.catalog_product_count;
  const selectedCategoryName = selectedCategoryId === "unclassified"
    ? "Unclassified"
    : selectedCategoryId
      ? findProductCatalogCategoryName(categoryTree, selectedCategoryId) ?? "Products"
      : catalogScope === "history"
        ? "Discovery history"
        : "All products";

  return (
    <section className="mt-5" aria-labelledby="product-queue-heading">
      <div className="border-y border-stone-200 bg-white py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-stone-600">
          {catalogScope === "catalog" && (
            <span>
              <strong className="font-black text-stone-950">
                {overview.triage_profile_count ?? 0}
              </strong>{" "}
              catalog listings need review
            </span>
          )}
          <span>
            <strong className="font-black text-stone-950">{productCount}</strong>{" "}
            {catalogScope === "history"
              ? productCount === 1 ? "historical candidate" : "historical candidates"
              : productCount === 1 ? "product" : "products"}
          </span>
          {overview.pending_snapshot_count ? (
            <span className="text-amber-800">
              <strong>{overview.pending_snapshot_count}</strong> still grouping
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border border-stone-200 bg-white p-3 lg:sticky lg:top-4">
          <p className="px-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
            Catalog views
          </p>
          <nav className="mt-2 space-y-1" aria-label="Catalog views">
            <button
              type="button"
              onClick={() => onSelectScope("catalog")}
              className={`flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-sm font-bold transition ${
                catalogScope === "catalog"
                  ? "bg-stone-950 text-white"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <span>Product catalog</span>
              <span className={catalogScope === "catalog" ? "text-stone-300" : "text-stone-400"}>
                {overview.catalog_product_count}
              </span>
            </button>
            {overview.catalog_history_product_count > 0 && (
              <button
                type="button"
                onClick={() => onSelectScope("history")}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-sm font-semibold transition ${
                  catalogScope === "history"
                    ? "bg-amber-100 text-amber-950"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span>Discovery history</span>
                <span className={catalogScope === "history" ? "text-amber-700" : "text-stone-400"}>
                  {overview.catalog_history_product_count}
                </span>
              </button>
            )}
          </nav>
          <p className="mt-4 px-2 text-xs font-black uppercase tracking-[0.12em] text-stone-500">
            Categories
          </p>
          <nav className="mt-2" aria-label="Product categories">
            <button
              type="button"
              onClick={() => onSelectCategory(null)}
              className={`flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-sm font-bold transition ${
                selectedCategoryId == null
                  ? "bg-stone-950 text-white"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <span>{catalogScope === "history" ? "All history" : "All products"}</span>
              <span className={selectedCategoryId == null ? "text-stone-300" : "text-stone-400"}>
                {productCount}
              </span>
            </button>
            <ProductCatalogCategoryList
              nodes={categoryTree}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={onSelectCategory}
            />
            {overview.unclassified_product_count > 0 && (
              <button
                type="button"
                onClick={() => onSelectCategory("unclassified")}
                className={`mt-1 flex min-h-10 w-full items-center justify-between rounded-lg px-2 text-left text-sm font-semibold transition ${
                  selectedCategoryId === "unclassified"
                    ? "bg-stone-950 text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                <span>Unclassified</span>
                <span className={selectedCategoryId === "unclassified" ? "text-stone-300" : "text-stone-400"}>
                  {overview.unclassified_product_count}
                </span>
              </button>
            )}
          </nav>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            <label className="relative block min-w-0 sm:w-72">
              <span className="sr-only">Search products</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search products or offers"
                className="min-h-11 w-full rounded-lg border border-stone-300 bg-white py-2 pl-9 pr-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-700">
              <span className="text-stone-500">Sort</span>
              <select value={sort} onChange={(event) => onSortChange(event.target.value as "work" | "name")} className="min-w-0 flex-1 bg-transparent text-stone-950 outline-none">
                <option value="work">Most work</option>
                <option value="name">Product name</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex items-end justify-between gap-4">
            <div>
              <h2 id="product-queue-heading" className="text-lg font-black text-stone-950">
                {selectedCategoryName}
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                {catalogScope === "history"
                  ? "Low-relevance discoveries stay auditable here without defining the catalog."
                  : "Open a product to review current tasks, history, offers and settings."}
              </p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-stone-500">
              {visibleGroups.length} shown
            </span>
          </div>

          {visibleGroups.length > 0 ? (
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleGroups.map((group) => (
                <ProductCatalogCard
                  key={group.id}
                  group={group}
                  currentSearch={currentSearch}
                  catalogSupported={overview.catalog_supported}
                  historyOnly={catalogScope === "history"}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
              <h3 className="text-base font-black text-stone-900">
                {search
                  ? "No products match this search"
                  : catalogScope === "history"
                    ? "No historical discoveries in this category"
                    : "No products in this category"}
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-stone-500">
                {search
                  ? "Try a product name, category or comparable offer."
                  : catalogScope === "history"
                    ? "Choose another history category or return to the product catalog."
                    : "Choose another category or show all products."}
              </p>
              {search && (
                <button type="button" onClick={() => onSearchChange("")} className="mt-4 min-h-11 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 hover:bg-stone-50">
                  Clear search
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {overview.next_cursor && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-300 bg-white px-4 text-sm font-bold text-stone-800 transition hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore && <RefreshCw size={15} className="animate-spin" />}
            {loadingMore ? "Loading products…" : "Load more products"}
          </button>
        </div>
      )}
    </section>
  );
}
