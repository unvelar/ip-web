import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { Window } from "happy-dom";
import type { IpReviewFinding } from "../src/api";
import { BatchResultNotice } from "../src/components/monitoring/board/BatchResultNotice";
import { summarizeTakedownBatch, takedownBatchListingResults } from "../src/components/monitoring/board/batchUtils";

const finding = (id: string, overrides: Partial<IpReviewFinding> = {}) => ({
  result_id: id, case_id: `case-${id}`, listing_title: "Same listing title",
  page_url: `https://example.com/listing/${id}`, domain: "example.com", seller_name: `Seller ${id}`,
  ip_id: `ip-${id}`, image_url: `https://example.com/images/${id}.jpg`, ...overrides,
}) as IpReviewFinding;

test("mixed batch results stay attached to the correct listing, including local skips and shared cases", () => {
  const listings = takedownBatchListingResults([
    finding("legal"), finding("queued"), finding("closed"),
    finding("preparing", { case_id: null }), finding("failed"),
    finding("also-queued", { case_id: "case-queued" }),
  ], {
    queued_case_ids: ["case-queued"],
    legal_queue: [{ case_id: "case-legal", reason: "missing_required_information" }],
    skipped: [{ case_id: "case-closed", reason: "already sent or closed" }],
    failed: [{ case_id: "case-failed", reason: "legal queue update failed" }],
  }, { preparing: "still preparing" }, "fallback-ip");
  expect(listings.map((item) => [item.resultId, item.outcome])).toEqual([
    ["legal", "legal_queue"], ["queued", "queued"], ["closed", "skipped"],
    ["preparing", "skipped"], ["failed", "failed"], ["also-queued", "queued"],
  ]);
  expect(listings[0].ipId).toBe("ip-legal");
  expect(listings[0].needsProfile).toBe(true);
  expect(listings[3].reason).toContain("Still being prepared");
  expect(listings[4].reason).toBe("legal queue update failed");
  expect(listings[5].url).toBe("https://example.com/listing/also-queued");
});

test("each visible result pairs its link, reason, and correct IP profile even with identical titles", () => {
  const listings = takedownBatchListingResults([finding("one"), finding("two"), finding("three")], {
    queued_case_ids: [],
    legal_queue: [
      { case_id: "case-two", reason: "missing_required_information" },
      { case_id: "case-one", reason: "missing_required_information" },
    ],
    skipped: [{ case_id: "case-three", reason: "already sent or closed" }], failed: [],
  });
  const window = new Window();
  window.document.body.innerHTML = renderToStaticMarkup(<MemoryRouter initialEntries={["/monitoring/tasks?status=pending&seller=Example"]}><BatchResultNotice
    result={summarizeTakedownBatch(0, 0, { missing_required_information: 2 }, { "already sent or closed": 1 }, 0, listings)}
    onDismiss={() => {}} profileIpId="wrong-global-ip"
  /></MemoryRouter>);
  const rows = [...window.document.querySelectorAll('ul[aria-label="Listing takedown results"] > li')];
  expect(rows).toHaveLength(3);
  for (const [index, id] of ["one", "two"].entries()) {
    expect(rows[index].querySelector('a[target="_blank"]:not([title="Open listing image"])')?.getAttribute("href")).toBe(`https://example.com/listing/${id}`);
    const taskHref = `/monitoring/tasks/${id}?status=pending&seller=Example&ip_id=ip-${id}`;
    expect(rows[index].querySelector('a[aria-label^="Open details for"]')?.getAttribute("href")).toBe(taskHref);
    expect(rows[index].querySelector('a[href^="/monitoring/tasks/"]:not([aria-label])')?.getAttribute("href")).toBe(taskHref);
    expect(rows[index].querySelector('a[aria-label^="Open original listing"]')?.getAttribute("target")).toBe("_blank");
    expect(rows[index].querySelector("img")?.getAttribute("src")).toBe(`https://example.com/images/${id}.jpg`);
    expect(rows[index].textContent).toContain("Missing required notice information.");
    expect(rows[index].querySelector('a[href^="/ips/"]')?.getAttribute("href")).toBe(`/ips/ip-${id}#takedown-signer`);
  }
  expect(rows[2].querySelector('a[target="_blank"]:not([title="Open listing image"])')?.getAttribute("href")).toBe("https://example.com/listing/three");
  expect(rows[2].textContent).toContain("Already sent or no longer open");
  expect(rows[2].querySelector('a[href^="/ips/"]')).toBeNull();
  expect(window.document.querySelector('a[href*="wrong-global-ip#"]')).toBeNull();
  expect(window.document.querySelector("details")?.open).toBe(true);
  expect(window.document.querySelector("summary")?.textContent).toContain("3 selected listings");
  window.close();
});

test("unsafe or missing URLs stay unlinked and unacknowledged listings never appear successful", () => {
  const listings = takedownBatchListingResults([
    finding("unsafe", { page_url: "javascript:alert(1)", ip_id: undefined }),
    finding("no-url", { page_url: "" }),
  ], { queued_case_ids: [], skipped: [], failed: [] }, {}, "fallback-ip");
  expect(listings.every((item) => item.url === null && item.outcome === "failed")).toBe(true);
  expect(listings[0].ipId).toBe("fallback-ip");
  expect(listings[0].reason).toContain("Check the listing status before retrying");
});
