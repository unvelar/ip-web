import type { PersistedProductGroup } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import {
  productGroupPreviewProfiles,
  productGroupPriceLabel,
  productGroupRecommendationSummary,
  productGroupRepresentativeTitle,
  productGroupReviewLabel,
  productGroupVariantLabels,
} from "./clusterDomain";
import { ProductGroupPreviewImages } from "./ProductGroupPreviewImages";

export function ProductGroupMergeComparisonPanel({
  group,
  eyebrow,
}: {
  group: PersistedProductGroup;
  eyebrow: string;
}) {
  const profiles = productGroupPreviewProfiles(group, 6);
  const variants = productGroupVariantLabels(group);
  const recommendations = productGroupRecommendationSummary(group);
  const representativeTitle = productGroupRepresentativeTitle(group);
  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
        {eyebrow}
      </p>
      <h3 className="mt-1 line-clamp-2 text-base font-black text-stone-950">
        {productGroupReviewLabel(group)}
      </h3>
      <p className="mt-1 text-[11px] font-semibold text-stone-500">
        {group.confirmation_status === "confirmed" ? "Confirmed product" : "Unconfirmed product group"}
      </p>

      <div className="mt-3">
        <ProductGroupPreviewImages
          profiles={productGroupPreviewProfiles(group, 8)}
          size="large"
        />
      </div>

      {representativeTitle && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Representative listing
          </p>
          <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-stone-800">
            {representativeTitle}
          </p>
        </div>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <dt className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Listings</dt>
          <dd className="mt-0.5 font-black text-stone-900">{group.member_count}</dd>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white px-3 py-2">
          <dt className="text-[9px] font-bold uppercase tracking-wide text-stone-400">Price</dt>
          <dd className="mt-0.5 truncate font-black text-stone-900">{productGroupPriceLabel(group)}</dd>
        </div>
      </dl>

      {variants.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Comparable variants
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {variants.map((variant) => (
              <span
                key={variant}
                className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold text-sky-800 ring-1 ring-inset ring-sky-200"
              >
                {variant}
              </span>
            ))}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Current triage mix
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {recommendations.map(({ label, count }) => (
              <span
                key={label}
                className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-stone-700 ring-1 ring-inset ring-stone-200"
              >
                {label} {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {profiles.length > 1 && (
        <div className="mt-3">
          <p className="text-[9px] font-black uppercase tracking-wide text-stone-400">
            Other examples
          </p>
          <ul className="mt-1.5 space-y-1">
            {profiles.slice(1, 4).map((profile) => (
              <li key={profile.id} className="truncate text-[10px] font-medium text-stone-600">
                {profileTitle(profile)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
