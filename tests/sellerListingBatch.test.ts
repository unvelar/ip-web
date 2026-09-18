import { afterEach, expect, test } from "bun:test";
import type { IpReviewFinding } from "../src/api";
import { partitionSellerListings, runSellerListingBatch } from "../src/features/sellers/sellerListingBatch";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const finding = (id: string, status = "pending", overrides = {}) => ({
  result_id: id, case_id: `case-${id}`, ip_id: "ip-one", review_status: status,
  dismissed_at: null, image_url: "https://example.org/product.jpg", ...overrides,
}) as IpReviewFinding;

test("bulk action eligibility respects enforcement state, linked cases, IP scope, and product images", () => {
  const rows = [finding("triage"), finding("legal", "takedown_pending"), finding("sent", "takedown_sent"), finding("closed", "enforced")];
  expect(partitionSellerListings(rows, "send", null).eligible.map((row) => row.result_id)).toEqual(["triage"]);
  expect(partitionSellerListings(rows, "submit", null).eligible.map((row) => row.result_id)).toEqual(["legal"]);
  expect(partitionSellerListings(rows, "enforce", null).eligible.map((row) => row.result_id)).toEqual(["sent"]);
  expect(partitionSellerListings([finding("missing", "takedown_sent", { case_id: null })], "enforce", null).eligible).toHaveLength(0);
  expect(partitionSellerListings([finding("no-ip", "pending", { ip_id: null })], "review", null).eligible).toHaveLength(0);
  expect(partitionSellerListings([finding("no-image", "pending", { image_url: null })], "allow_product", null).eligible).toHaveLength(0);
});

test("takedown batches preserve the reviewer reason and scopes, deduplicate cases, and acknowledge only handled listings", async () => {
  let payload: unknown;
  globalThis.fetch = (async (_url, options) => {
    payload = JSON.parse(String(options?.body));
    return Response.json({ queued_case_ids: ["case-first"], legal_queue: [{ case_id: "case-legal", reason: "manual_submission_required" }], email_count: 1, skipped: [], failed: [{ case_id: "case-failed", reason: "error" }] });
  }) as typeof fetch;
  const result = await runSellerListingBatch({ action: "send", findings: [finding("first"), finding("same-case", "pending", { case_id: "case-first" }), finding("legal"), finding("failed")], ipId: null,
    decisionReason: "Confirmed copied product", associationScopes: [], isActive: () => true, onProgress: () => {} });
  expect(payload).toEqual({ case_ids: ["case-first", "case-legal", "case-failed"], decision_reason: "Confirmed copied product", association_scopes: [] });
  expect([...result.processed]).toEqual(["first", "same-case", "legal"]);
  expect(typeof result.result).toBe("object");
  if (typeof result.result !== "string") {
    expect(result.result.tone).toBe("warning");
    expect(result.result.showLegalQueueLink).toBe(true);
  }
});

test("closing the request scope prevents queued mutations from starting", async () => {
  let active = true;
  const requests: ((response: Response) => void)[] = [];
  globalThis.fetch = (() => new Promise<Response>((resolve) => requests.push(resolve))) as typeof fetch;
  const operation = runSellerListingBatch({ action: "enforce", findings: Array.from({ length: 6 }, (_, index) => finding(String(index), "takedown_sent")), ipId: null,
    isActive: () => active, onProgress: () => {} });
  expect(requests).toHaveLength(4);
  active = false;
  for (const resolve of requests) resolve(Response.json({ ok: true }));
  const result = await operation;
  expect(requests).toHaveLength(4);
  expect(result.processed.size).toBe(4);
});
