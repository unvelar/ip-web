import type { DiscoveryEvidence, WebsiteDiscoveryList, WebsiteDiscoveryRuns } from "../../src/api/websiteDiscovery";

export const discoveryFixture: DiscoveryEvidence = {
  coverage: { version: 1, status: "partial", stop_reason: "listing_budget", pages: 4,
    unique_listings: 200, missing_cards: 0, resume_url: "https://shop.example/search?q=cream&page=5", recipe_digest: "a".repeat(64) },
  screening: { policy_version: "product_identity_v3", harvested: 200, admitted: 156, rejected: 44, inspected: 30 },
  listings: { found: 200, admitted: 156, filtered: 42, unverified: 2 },
  items_recorded: false,
  items: [
    { page_url: "https://shop.example/item/1", title: "Moonlight cream, 50 ml", outcome: "admit", state: "admitted", reason: "product_description", matched_name: "Moonlight",
      identity_evidence: { page_url: "https://shop.example/item/1", products: [{ name: "Moisturizer", description: "Acme Moonlight cream, 50 ml. Sealed box." }] } },
    { page_url: "https://shop.example/item/2", title: "Acme moisturizer", outcome: "reject", state: "unverified", reason: "description_unavailable", matched_name: null },
    { page_url: "https://shop.example/item/3", title: "Another brand cream", outcome: "reject", state: "filtered", reason: "identity_not_found", matched_name: null },
  ],
  pages: [{ url: "https://shop.example/search?q=cream&page=1", http_status: 200, observed_cards: 62,
    extracted_cards: 62, missing_cards: 0, unique_listings: 60, root_count: 1, truncated: false,
    unmatched_cards: 0, without_images: 1, context: "Showing 1 to 60 results for cream", search_state: "results", continuation: "a1" }],
};

export const websitesFixture: WebsiteDiscoveryList = {
  as_of: "2026-09-25T12:00:00Z", total: 3, next_offset: null, websites: [
    { domain: "shop.example", searches: 8, complete: 5, partial: 2, in_progress: 0, unknown: 1, unverified: 1, failed: 0, last_search_at: "2026-09-25T11:30:00Z" },
    { domain: "market.example", searches: 12, complete: 10, partial: 0, in_progress: 2, unknown: 0, unverified: 0, failed: 0, last_search_at: "2026-09-25T11:10:00Z" },
    { domain: "new-shop.example", searches: 0, complete: 0, partial: 0, in_progress: 0, unknown: 0, unverified: 0, failed: 0, last_search_at: null },
  ],
};

export const runsFixture: WebsiteDiscoveryRuns = {
  domain: "shop.example", as_of: websitesFixture.as_of, total: 2, next_offset: null,
  runs: [
    { run_id: "run-partial", domain_id: "source-a", tenant_name: "Demo tenant", ip_catalog_id: "ip-a", ip_name: "Acme Moonlight", keyword: "moonlight cream",
      status: "completed", scrape_status: "completed", error: null, country: "se", created_at: "2026-09-25T11:30:00Z", completed_at: "2026-09-25T11:45:00Z",
      stored: 156, evaluated: 150, findings: 39, discovery: discoveryFixture },
    { run_id: "run-legacy", domain_id: "source-a", tenant_name: "Demo tenant", ip_catalog_id: "ip-a", ip_name: "Acme Moonlight", keyword: "acme moisturizer",
      status: "completed", scrape_status: "completed", error: null, country: "se", created_at: "2026-09-25T10:30:00Z", completed_at: "2026-09-25T10:45:00Z",
      stored: 4, evaluated: 4, findings: 1, discovery: { coverage: null, screening: null, listings: null, items: [], items_recorded: false, pages: [] } },
  ],
};

export const runDetailFixture = {
  generated_at: websitesFixture.as_of,
  run: { run_id: "run-partial", status: "completed", ip_retired_at: null, created_at: "2026-09-25T11:30:00Z", started_at: "2026-09-25T11:30:00Z" },
  discovery: discoveryFixture,
  jobs: [], pages: [], candidates: [], unmatched_candidate_audits: [],
};
