import type { ProductCatalogCategoryNode } from "./clusterDomain";

export function ProductCatalogCategoryList({
  nodes,
  selectedCategoryId,
  onSelectCategory,
  depth = 0,
}: {
  nodes: ProductCatalogCategoryNode[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  depth?: number;
}) {
  if (nodes.length === 0) return null;
  return (
    <ul className={depth === 0 ? "mt-1" : "ml-2 border-l border-stone-200 pl-1"}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            onClick={() => onSelectCategory(node.id)}
            style={{ paddingLeft: `${8 + Math.min(depth, 4) * 4}px` }}
            className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg pr-2 text-left text-xs font-semibold transition ${
              selectedCategoryId === node.id
                ? "bg-blue-50 text-blue-900"
                : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
            }`}
          >
            <span className="min-w-0 truncate">{node.name}</span>
            <span className="shrink-0 text-[10px] text-stone-400">{node.productCount}</span>
          </button>
          <ProductCatalogCategoryList
            nodes={node.children}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={onSelectCategory}
            depth={depth + 1}
          />
        </li>
      ))}
    </ul>
  );
}
