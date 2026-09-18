import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SharedImagesEvidence, SharedImagesResult } from "../src/components/monitoring/board/SharedImagesPanel";
import type { MonitoringSharedImages } from "../src/api";

const shared: MonitoringSharedImages = {
  status: "ready", source_captured_at: "2026-09-04T10:00:00Z", has_more: false,
  coverage: { source_images: 1, source_images_checked: 1, source_copy_fingerprints: 1,
    candidate_images: 2, candidate_images_checked: 2, candidate_copy_fingerprints: 2 },
  matches: [{ result_id: "related-finding", case_id: "related-case", page_url: "https://example.org/item",
    domain: "example.org", listing_title: "Related product", seller_name: "Another shop", seller_key: "seller-key",
    captured_at: "2026-09-03T10:00:00Z", evidence: [{ kind: "possible_copy",
      source: { url: "https://archive.example/source.jpg", content_hash: "source", source_url: null, width: 800, height: 600 },
      target: { url: "https://archive.example/target.jpg", content_hash: "target", source_url: null, width: 600, height: 800 },
    }] }],
};
function render(data: MonitoringSharedImages) {
  return renderToStaticMarkup(<MemoryRouter><SharedImagesEvidence shared={data} /></MemoryRouter>);
}

test("shows paired archived evidence and separate listing/account links without identity confidence", () => {
  const html = render(shared);
  expect(html).toContain("Possible edited copy");
  expect(html).toContain("catalog photos alone do not link accounts");
  expect(html).toContain("Possible edit");
  expect(html).toContain("Search scope and coverage");
  expect(html).toContain("/monitoring/tasks/related-finding");
  expect(html).toContain("/monitoring/sellers/seller-key");
  expect(html).toContain("source.jpg");
  expect(html).toContain("target.jpg");
  expect(html).not.toContain("%");
  expect(html).not.toContain("takedown");
});

test("keeps photo matches collapsed until the reviewer asks to compare them", () => {
  const html = renderToStaticMarkup(<MemoryRouter><SharedImagesResult shared={shared} /></MemoryRouter>);
  expect(html).toContain("Photo matches");
  expect(html).toContain("Check for repeat listings and seller patterns");
  expect(html).toContain("1 other listing");
  expect(html).toContain("<details");
  expect(html).not.toContain("<details open");
});

test("missing analysis is not shown as no matches", () => {
  const html = render({ ...shared, status: "not_analyzed", matches: [] });
  expect(html).toContain("No archived photos are available to compare yet");
  expect(html).not.toContain("No photo matches found");
});

test("partial and empty coverage stays explicit and unavailable archives never use hotlinks", () => {
  const html = render({ ...shared, status: "partial", matches: [] });
  expect(html).toContain("Limited search · More matches may exist");
  expect(html).toContain("in the images checked");
  const missing = structuredClone(shared);
  missing.matches[0].evidence[0].source.url = null;
  missing.matches[0].evidence[0].source.source_url = "https://marketplace.example/unverified.jpg";
  expect(render(missing)).toContain("Archived photo unavailable");
  expect(render(missing)).not.toContain("unverified.jpg");
});
