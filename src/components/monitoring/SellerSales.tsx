import type { SellerSalesObservation } from "../../api/monitoring";

export function SellerSales({ count, observation, showCaptureDate = true }: {
  count: number | null;
  observation?: SellerSalesObservation | null;
  showCaptureDate?: boolean;
}) {
  if (count == null) return null;
  // During rolling deployment, legacy counts have no verified observation.
  const verified = observation?.value === count ? observation : null;
  const checked = verified ? new Date(verified.observed_at) : null;
  const date = checked && Number.isFinite(checked.getTime())
    ? checked.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;
  return (
    <span title={verified?.source_text ?? "Seller sales from an earlier capture; its observation date is unavailable."}>
      {count.toLocaleString()}{verified?.lower_bound ? "+" : ""} sales
      {showCaptureDate && <span className="text-stone-400"> · {date ? `checked ${date}` : "capture date unknown"}</span>}
    </span>
  );
}
