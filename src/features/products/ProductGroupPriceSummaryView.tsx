import type { ProductGroupPriceSummary } from "../../api/products";
import { formatMoney } from "../../components/monitoring/board/utils";

export function ProductGroupPriceSummaryView({
  summary,
}: {
  summary: ProductGroupPriceSummary;
}) {
  const typicalPrice = summary.typical_low_usd === summary.typical_high_usd
    ? formatMoney(summary.typical_low_usd, "USD")
    : `${formatMoney(summary.typical_low_usd, "USD")}–${formatMoney(summary.typical_high_usd, "USD")}`;
  const learningLabel = summary.reference_source === "reviewed"
    ? `Learned from ${summary.reviewed_clear_count} cleared reviews`
    : "Comparable-variant baseline · learns from cleared reviews";
  const title = [
    "Only USD-normalized prices are compared.",
    `The typical range and low-price cutoff use ${summary.reference_count} reference listings.`,
    "Second-hand and false-positive outcomes are kept out of the baseline.",
    "An unusually low price is supporting evidence for review, not an automatic counterfeit verdict.",
  ].join(" ");

  return (
    <div className="mt-1.5" title={title} data-product-group-price-summary="USD">
      <div className="flex flex-wrap justify-end gap-1">
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-800 ring-1 ring-inset ring-sky-200">
          USD typical {typicalPrice}
        </span>
        {summary.unusually_low_count > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800 ring-1 ring-inset ring-red-200">
            {summary.unusually_low_count} unusually low
          </span>
        )}
      </div>
      <p className="mt-1 text-[9px] font-medium text-stone-500">
        {learningLabel}
      </p>
    </div>
  );
}
