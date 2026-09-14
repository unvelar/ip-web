import { Check, Eye, X } from "lucide-react";
import { useEffect } from "react";
import type { PersistedProductGroup } from "../../api/products";
import { ProductGroupMergeComparisonPanel } from "./ProductGroupMergeComparisonPanel";
import type { ProductGroupReconciliationSuggestion } from "./clusterDomain";
import { productGroupReviewLabel } from "./clusterDomain";

export function ProductGroupMergeReviewDialog({
  sourceGroup,
  targetGroup,
  targetVisibleOnPage,
  suggestion,
  saving,
  error,
  onClose,
  onMerge,
}: {
  sourceGroup: PersistedProductGroup;
  targetGroup: PersistedProductGroup | null;
  targetVisibleOnPage: boolean;
  suggestion: ProductGroupReconciliationSuggestion;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onMerge: () => Promise<void>;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  const minimumCoverage = Math.min(suggestion.left_coverage, suggestion.right_coverage);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-group-merge-review-title"
        data-product-group-merge-review
        className="max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-violet-200 bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-stone-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
              Same-product decision
            </p>
            <h2 id="product-group-merge-review-title" className="mt-1 text-xl font-black text-stone-950">
              Review product merge
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-600">
              Compare both groups before creating one durable product identity. The decision can be undone from merge history.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close merge review"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-950">Why this was suggested</p>
            <p className="mt-1 text-[11px] leading-5 text-amber-800">
              {suggestion.support_count} matching comparisons across at least {Math.round(minimumCoverage * 100)}% of each group · median same-product match {suggestion.median_same_product_score.toFixed(2)} · minimum match {suggestion.minimum_same_product_score.toFixed(2)}
            </p>
          </div>

          {targetGroup ? (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <ProductGroupMergeComparisonPanel group={sourceGroup} eyebrow="Current group" />
              <ProductGroupMergeComparisonPanel group={targetGroup} eyebrow="Suggested target" />
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">
              The target group could not be loaded for review. No merge can be submitted until its listings are available.
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold leading-5 text-red-800"
            >
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              {targetGroup && (
                <p className="text-xs font-bold text-stone-800">
                  Combine “{productGroupReviewLabel(sourceGroup)}” and “{productGroupReviewLabel(targetGroup)}” as one underlying product?
                </p>
              )}
              <p className="mt-1 text-[10px] text-stone-500">
                Listings keep their size, price, and review lanes after the product identities are combined.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {targetGroup && targetVisibleOnPage && (
                <a
                  href={`#product-group-${targetGroup.id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
                >
                  <Eye size={14} />
                  View target on page
                </a>
              )}
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !targetGroup}
                onClick={() => void onMerge().catch(() => undefined)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-4 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
                ) : (
                  <Check size={14} />
                )}
                {saving ? "Combining…" : "Merge these groups"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
