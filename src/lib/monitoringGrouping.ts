import type { IpReviewFinding } from "../api/reviews";

export type MonitoringGroupBy = "none" | "seller" | "product";

export type MonitoringGroupFinding = Pick<IpReviewFinding,
  "seller_key" | "seller_name" | "ip_id" | "product_identity" | "domain"
>;

export interface MonitoringListingGroup<T extends MonitoringGroupFinding = IpReviewFinding> {
  key: string;
  kind: Exclude<MonitoringGroupBy, "none">;
  label: string;
  findings: T[];
  sellerKey: string | null;
  productId: string | null;
  ipId: string | null;
}

/** Presentation state stays outside the server filter contract. */
export function parseMonitoringGroupBy(value: string | null): MonitoringGroupBy {
  return value === "seller" || value === "product" ? value : "none";
}

export function hasProductGrouping(findings: MonitoringGroupFinding[]) {
  return findings.every((finding) => finding.product_identity !== undefined);
}

/** Group only the loaded, server-filtered rows. Never infer identity from a title/name. */
export function groupMonitoringFindings<T extends MonitoringGroupFinding>(
  findings: T[],
  by: MonitoringGroupBy,
): MonitoringListingGroup<T>[] {
  if (by === "none" || (by === "product" && !hasProductGrouping(findings))) return [];
  const groups = new Map<string, MonitoringListingGroup<T>>();
  for (const finding of findings) {
    const product = finding.product_identity;
    const key = by === "seller"
      ? finding.seller_key ? `seller:${finding.seller_key}` : "seller:unidentified"
      : product ? `product:${finding.ip_id ?? ""}:${product.canonical_product_id}` : "product:unmatched";
    let group = groups.get(key);
    if (!group) {
      group = {
        key, kind: by,
        label: by === "seller"
          ? finding.seller_key ? finding.seller_name?.trim() || "Unnamed seller" : "Seller identity unavailable"
          : product?.display_name || "Unmatched listings",
        findings: [],
        sellerKey: by === "seller" ? finding.seller_key : null,
        productId: by === "product" ? product?.canonical_product_id ?? null : null,
        ipId: finding.ip_id ?? null,
      };
      groups.set(key, group);
    }
    group.findings.push(finding);
  }
  // Map insertion order preserves the first occurrence in the server's sort.
  return [...groups.values()];
}
