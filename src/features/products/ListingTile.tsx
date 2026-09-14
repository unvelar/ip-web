import type { ReactNode } from "react";
import type { ProductClusterProfile } from "../../api/products";
import { formatMoney } from "../../components/monitoring/board/utils";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";

export function ListingTile({
  profile,
  onClick,
  active = false,
  loading = false,
  groupImageSimilarity,
  groupImagePosition,
  visualSupportIsReference = false,
  assignee,
}: {
  profile: ProductClusterProfile;
  onClick?: () => void;
  active?: boolean;
  loading?: boolean;
  groupImageSimilarity?: number | null;
  groupImagePosition?: number | null;
  visualSupportIsReference?: boolean;
  assignee?: ReactNode;
}) {
  const hasGroupImageSimilarity = groupImageSimilarity !== undefined;
  const priceValueUsd = profile.price_value_usd == null
    ? null
    : Number(profile.price_value_usd);
  const price = priceValueUsd != null && Number.isFinite(priceValueUsd)
    ? formatMoney(priceValueUsd, "USD")
    : null;
  const unusualPrice = profile.price_signal?.unusually_low === true
    ? profile.price_signal
    : null;
  const priceSignalReference = unusualPrice?.comparison_scope === "visual_cohort"
    ? unusualPrice?.source_group_name?.trim() || "its exact visual cohort"
    : unusualPrice?.comparison_scope === "commercial_variant"
      ? "the same size or commercial variant"
      : "the learned group";
  const priceComparisonLabel = unusualPrice?.comparison_scope === "visual_cohort"
    ? "visual cohort"
    : unusualPrice?.comparison_scope === "commercial_variant"
      ? "same variant"
      : "typical";
  const taskTitle = onClick
    ? `Open task details: ${profileTitle(profile)}`
    : `Task details unavailable: ${profileTitle(profile)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={unusualPrice
        ? `${taskTitle}. Price is ${unusualPrice.percent_below_reference}% below the USD median for ${priceSignalReference}; treat this as review evidence, not an automatic verdict.`
        : taskTitle}
      data-product-price-currency={price ? "USD" : undefined}
      data-product-price-signal={unusualPrice ? "unusually-low" : undefined}
      data-product-price-comparison={unusualPrice?.comparison_scope}
      className={`w-full min-w-0 rounded-lg border p-2 text-left transition disabled:cursor-default ${
        active
          ? "border-blue-400 bg-blue-50 ring-2 ring-blue-100"
          : unusualPrice
            ? "border-red-300 bg-red-50 enabled:hover:border-red-400 enabled:hover:bg-red-100"
            : "border-stone-200 bg-stone-50 enabled:hover:border-blue-300 enabled:hover:bg-blue-50"
      }`}
    >
      <span className="relative block aspect-square overflow-hidden rounded-md bg-stone-100">
        {profile.image_url ? (
          <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-sm font-bold text-stone-400">
            {profileTitle(profile).slice(0, 1).toUpperCase()}
          </span>
        )}
        {price && (
          <span className={`absolute bottom-1.5 right-1.5 max-w-[calc(100%-0.75rem)] truncate rounded-md px-2 py-1 text-xs font-extrabold tracking-tight text-white shadow-md ring-1 ring-white/30 ${
            unusualPrice ? "bg-red-700/95" : "bg-stone-950/90"
          }`}>
            {price}
          </span>
        )}
        {unusualPrice && (
          <span className="absolute left-1.5 top-1.5 rounded bg-red-700/95 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
            {unusualPrice.percent_below_reference}% below {priceComparisonLabel}
          </span>
        )}
        {assignee && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 z-10">
            {assignee}
          </span>
        )}
        {hasGroupImageSimilarity && groupImagePosition != null && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Gallery view {groupImagePosition + 1} of {profile.image_count}
          </span>
        )}
        {visualSupportIsReference && (
          <span className="absolute bottom-1.5 left-1.5 rounded bg-indigo-900/85 px-1.5 py-0.5 text-[9px] font-bold text-white">
            Reference
          </span>
        )}
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70" aria-hidden="true">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
          </span>
        )}
      </span>
      <span className="mt-2 block truncate text-[11px] font-semibold text-stone-700">
        {profileTitle(profile)}
      </span>
    </button>
  );
}
