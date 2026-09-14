import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProductCategoryNode } from "./labDomain";

export function CategoryPathToggle({
  category,
  collapsed,
  forceExpanded,
  onToggle,
  closeMenuOnToggle = false,
  className = "",
}: {
  category: ProductCategoryNode;
  collapsed: boolean;
  forceExpanded: boolean;
  onToggle: (path: string) => void;
  closeMenuOnToggle?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      aria-label={`${collapsed ? "Expand" : "Collapse"} ${category.path}`}
      disabled={forceExpanded}
      onClick={(event) => {
        onToggle(category.path);
        if (closeMenuOnToggle) event.currentTarget.closest("details")?.removeAttribute("open");
      }}
      className={`inline-flex min-w-0 items-center gap-0.5 rounded-sm py-0.5 transition hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 disabled:cursor-default ${className}`}
      title={`${collapsed ? "Expand" : "Collapse"} ${category.path}`}
    >
      {collapsed ? (
        <ChevronRight size={11} className="shrink-0 text-stone-400" />
      ) : (
        <ChevronDown size={11} className="shrink-0 text-stone-400" />
      )}
      <span className="truncate">{category.label}</span>
    </button>
  );
}
