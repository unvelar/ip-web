import { Eye, Images } from "lucide-react";
import type { PersistedProductGroup } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import type { ProductGroupReconciliationSuggestion } from "./clusterDomain";
import {
  productGroupPreviewProfiles,
  productGroupPriceLabel,
  productGroupRepresentativeTitle,
  productGroupReviewLabel,
  productGroupVariantLabels,
} from "./clusterDomain";
import { ProductGroupPreviewImages } from "./ProductGroupPreviewImages";

export function ProductGroupReconciliationPreview({
  suggestion,
  targetGroup,
  mergeBusy,
  loading,
  onReview,
}: {
  suggestion: ProductGroupReconciliationSuggestion;
  targetGroup: PersistedProductGroup | null;
  mergeBusy: boolean;
  loading: boolean;
  onReview: () => void;
}) {
  const minimumCoverage = Math.min(suggestion.left_coverage, suggestion.right_coverage);
  const targetLabel = targetGroup
    ? productGroupReviewLabel(targetGroup)
    : suggestion.target_display_name?.trim() ||
      `Product group · ${suggestion.target_member_count} listings`;
  const suggestedRepresentative = suggestion.target_preview_members.find(
    (profile) => profile.listing_title?.trim(),
  );
  const representativeTitle = targetGroup
    ? productGroupRepresentativeTitle(targetGroup)
    : suggestedRepresentative
      ? profileTitle(suggestedRepresentative)
      : null;
  const variants = targetGroup ? productGroupVariantLabels(targetGroup) : [];
  const targetConfirmationStatus = targetGroup?.confirmation_status ??
    suggestion.target_confirmation_status;

  return (
    <div
      data-reconciliation-target-group-id={suggestion.target_group_id}
      className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-white p-3 lg:flex-row lg:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {targetGroup || suggestion.target_preview_members.length > 0 ? (
          <ProductGroupPreviewImages
            profiles={targetGroup
              ? productGroupPreviewProfiles(targetGroup, 8)
              : suggestion.target_preview_members}
          />
        ) : (
          <div className="grid shrink-0 grid-cols-2 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((slot) => (
              <div
                key={slot}
                className="flex h-12 w-12 items-center justify-center rounded-md bg-stone-100 text-stone-300 sm:h-14 sm:w-14"
              >
                <Images size={16} />
              </div>
            ))}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-bold text-stone-950">
              {targetLabel}
            </p>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
              targetConfirmationStatus === "confirmed"
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                : "bg-stone-100 text-stone-600"
            }`}>
              {targetConfirmationStatus === "confirmed" ? "Confirmed" : "Unconfirmed"}
            </span>
          </div>
          {representativeTitle && (
            <p className="mt-1 line-clamp-1 text-[11px] font-medium text-stone-700">
              <span className="text-stone-400">Representative listing:</span>{" "}
              {representativeTitle}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {targetGroup && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                {productGroupPriceLabel(targetGroup)}
              </span>
            )}
            {variants.map((variant) => (
              <span
                key={variant}
                className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200"
              >
                {variant}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-stone-600">
            {suggestion.support_count} matching comparisons · {Math.round(minimumCoverage * 100)}%+ member coverage · median match {suggestion.median_same_product_score.toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {targetGroup && (
          <a
            href={`#product-group-${targetGroup.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800"
          >
            <Eye size={14} />
            View group
          </a>
        )}
        <button
          type="button"
          disabled={mergeBusy || loading}
          onClick={onReview}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-200 border-t-white" />
          ) : (
            <Eye size={14} />
          )}
          {loading ? "Loading preview…" : "Review & merge"}
        </button>
      </div>
    </div>
  );
}
