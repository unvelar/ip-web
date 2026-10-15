import { expect, test } from "bun:test";
import type { IpReviewFinding } from "../src/api/reviews";
import { groupMonitoringFindings, hasProductGrouping, parseMonitoringGroupBy } from "../src/lib/monitoringGrouping";
import { parseFilters, writeFilters } from "../src/lib/monitoringFilters";

const finding = (id: string, extra: Partial<IpReviewFinding> = {}) => ({
  result_id: id, ip_id: "ip-one", seller_name: "Same shop name", seller_key: "seller-one",
  product_identity: null, ...extra,
} as IpReviewFinding);

test("grouping is presentation state, preserves filters, and never enters the API filter key", () => {
  const first = new URLSearchParams({ q: "miniatures", status: "review", group_by: "seller" });
  const second = new URLSearchParams(first); second.set("group_by", "product");
  expect(parseFilters(first)).toEqual(parseFilters(second));
  expect(writeFilters(second, { ...parseFilters(second), platform: "etsy.com" }).get("group_by")).toBe("product");
  expect(parseMonitoringGroupBy("invalid")).toBe("none");
});

test("canonical seller keys separate namesakes and unknown identities stay explicit", () => {
  const groups = groupMonitoringFindings([
    finding("a"), finding("b", { seller_key: "seller-two" }),
    finding("c", { seller_key: null }), finding("d"),
  ], "seller");
  expect(groups.map((group) => group.findings.map((row) => row.result_id))).toEqual([["a", "d"], ["b"], ["c"]]);
  expect(groups[2].label).toBe("Seller identity unavailable");
});

test("product identity uses canonical IDs and IP scope, never listing titles or labels", () => {
  const product = { canonical_product_id: "product-one", display_name: "Same display name" };
  const groups = groupMonitoringFindings([
    finding("a", { product_identity: product }),
    finding("b", { product_identity: { ...product, canonical_product_id: "product-two" } }),
    finding("c", { product_identity: product, ip_id: "ip-two" }),
    finding("d", { product_identity: product }), finding("unmatched"),
  ], "product");
  expect(groups.map((group) => group.findings.map((row) => row.result_id))).toEqual([["a", "d"], ["b"], ["c"], ["unmatched"]]);
  expect(groups[3].label).toBe("Unmatched listings");
});

test("an old or mixed API response cannot falsely classify tasks as unmatched products", () => {
  const rows = [finding("a"), finding("b", { product_identity: undefined })];
  expect(hasProductGrouping(rows)).toBe(false);
  expect(groupMonitoringFindings(rows, "product")).toEqual([]);
  expect(hasProductGrouping([finding("unmatched")])).toBe(true);
});
