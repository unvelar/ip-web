import type { MonitoringSellerAvailability, MonitoringSellerSort, MonitoringSellerStatus } from "../../api";

export interface SellerListingFilters {
  status: MonitoringSellerStatus;
  availability: MonitoringSellerAvailability | null;
  sort: MonitoringSellerSort;
}

export function sellerListingFilters(params: URLSearchParams): SellerListingFilters {
  const status = params.get("status");
  const availability = params.get("availability");
  const sort = params.get("sort");
  return {
    status: status === "all" || status === "dismissed" || status === "enforced" ? status : "open",
    availability: availability === "available" || availability === "blocked" || availability === "unknown" || availability === "unavailable" ? availability : null,
    sort: sort === "price_desc" || sort === "risk_desc" ? sort : "found_desc",
  };
}

export function writeSellerListingFilters(params: URLSearchParams, filters: SellerListingFilters) {
  const next = new URLSearchParams(params);
  for (const [key, value, defaultValue] of [
    ["status", filters.status, "open"],
    ["availability", filters.availability, null],
    ["sort", filters.sort, "found_desc"],
  ] as const) {
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
  }
  return next;
}
