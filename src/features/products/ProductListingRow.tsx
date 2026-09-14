import type { ReactNode } from "react";
import type { ProductClusterProfile } from "../../api/products";
import { formatMoney } from "../../components/monitoring/board/utils";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import { productGroupRecommendationBucket, recommendationBucketForProfile } from "./clusterDomain";

export function ProductListingRow({
  profile,
  active = false,
  loading = false,
  correctionDisabled = false,
  statusLabel,
  assignee,
  onOpen,
  onRemove,
}: {
  profile: ProductClusterProfile;
  active?: boolean;
  loading?: boolean;
  correctionDisabled?: boolean;
  statusLabel?: string;
  assignee?: ReactNode;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const priceValueUsd = profile.price_value_usd == null
    ? null
    : Number(profile.price_value_usd);
  const price = priceValueUsd != null && Number.isFinite(priceValueUsd)
    ? formatMoney(priceValueUsd, "USD")
    : "Price unavailable";
  const bucket = productGroupRecommendationBucket(recommendationBucketForProfile(profile));
  const displayedStatus = statusLabel
    ? statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)
    : bucket.label;
  const unusualPrice = profile.price_signal?.unusually_low === true;

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg border bg-white p-2 transition ${
      active ? "border-blue-400 ring-2 ring-blue-100" : "border-stone-200"
    }`}>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100 sm:h-20 sm:w-20">
          {profile.image_url ? (
            <img src={profile.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-lg font-black text-stone-400">
              {profileTitle(profile).slice(0, 1).toUpperCase()}
            </span>
          )}
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center bg-white/75">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700" />
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-sm font-bold text-stone-950">
            {profileTitle(profile)}
          </span>
          <span className="mt-1 block truncate text-xs text-stone-500">
            {profile.platform || "Marketplace listing"}
          </span>
        </span>
        {assignee && <span className="shrink-0">{assignee}</span>}
        <span className="hidden shrink-0 text-right sm:block">
          <span className={`block text-sm font-black ${unusualPrice ? "text-red-700" : "text-stone-950"}`}>
            {price}
          </span>
          <span className={`mt-1 block text-xs font-bold ${
            statusLabel ? "text-stone-700" : bucket.labelClassName
          }`}>
            {displayedStatus}
          </span>
        </span>
        <span className="shrink-0 text-stone-400" aria-hidden="true">→</span>
      </button>
      {onRemove && (
        <button
          type="button"
          disabled={correctionDisabled}
          onClick={onRemove}
          className="hidden min-h-11 shrink-0 rounded-lg px-3 text-xs font-bold text-stone-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40 md:inline-flex md:items-center"
        >
          Different product
        </button>
      )}
    </div>
  );
}
