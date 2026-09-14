import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { SharedImagesEvidence } from "../src/components/monitoring/board/SharedImagesPanel";
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
  expect(html).toContain("Shared photos do not prove the same seller");
  expect(html).toContain("/monitoring/tasks/related-finding");
  expect(html).toContain("/monitoring/sellers/seller-key");
  expect(html).toContain("source.jpg");
  expect(html).toContain("target.jpg");
  expect(html).not.toContain("%");
  expect(html).not.toContain("takedown");
});

test("missing analysis is not shown as no matches", () => {
  const html = render({ ...shared, status: "not_analyzed", matches: [] });
  expect(html).toContain("No current archived images");
  expect(html).not.toContain("No shared-image candidates");
});

test("partial and empty coverage stays explicit and unavailable archives never use hotlinks", () => {
  const html = render({ ...shared, status: "partial", matches: [] });
  expect(html).toContain("Partial coverage");
  expect(html).toContain("in the images checked");
  const missing = structuredClone(shared);
  missing.matches[0].evidence[0].source.url = null;
  missing.matches[0].evidence[0].source.source_url = "https://marketplace.example/unverified.jpg";
  expect(render(missing)).toContain("Archived photo unavailable");
  expect(render(missing)).not.toContain("unverified.jpg");
});
