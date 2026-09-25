import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

export interface DiscoveryPage {
  url: string; http_status: number; observed_cards: number; extracted_cards: number;
  missing_cards: number; unique_listings: number; root_count: number; truncated: boolean;
  unmatched_cards: number; without_images: number; context: string;
  search_state?: string; continuation?: string;
}

export interface DiscoveryEvidence {
  coverage: {
    version: 1; status: "complete" | "partial"; stop_reason: string; pages: number;
    unique_listings: number; missing_cards: number; resume_url: string | null;
    recipe_digest: string; last_page?: DiscoveryPage;
  } | null;
  screening: {
    policy_version: string; harvested: number; admitted: number; rejected: number; inspected: number;
    context_key?: string;
  } | null;
  listings: { found: number; admitted: number; filtered: number; unverified: number } | null;
  items: Array<{
    page_url: string | null; title: string; outcome: "admit" | "reject";
    state: "admitted" | "filtered" | "unverified"; reason: string; matched_name: string | null;
    image_url?: string;
    identity_evidence?: { page_url: string; products: Array<{ name?: string; description?: string; brand?: string; category?: string }> };
  }>;
  items_recorded: boolean;
  pages: DiscoveryPage[];
}

export interface WebsiteDiscoveryList {
  as_of: string; total: number; next_offset: number | null;
  websites: Array<{
    domain: string; searches: number; complete: number; partial: number; unknown: number;
    failed: number; unverified: number; in_progress: number; last_search_at: string | null;
  }>;
}

export interface WebsiteDiscoveryRun {
  run_id: string; domain_id: string; tenant_name: string; ip_catalog_id: string | null;
  ip_name: string | null; keyword: string; status: string; scrape_status: string | null; error: string | null;
  country: string | null; created_at: string; completed_at: string | null;
  stored: number; evaluated: number; findings: number; discovery: DiscoveryEvidence;
}

export interface WebsiteDiscoveryRuns {
  domain: string; as_of: string; total: number; next_offset: number | null; runs: WebsiteDiscoveryRun[];
}

export interface WebsiteDiscoveryOptions {
  windowHours: number; asOf: string; query: string; offset: number; signal?: AbortSignal;
}

function parameters(options: WebsiteDiscoveryOptions) {
  return new URLSearchParams({ window_hours: String(options.windowHours), as_of: options.asOf,
    q: options.query, offset: String(options.offset) });
}

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isText = (value: unknown): value is string => typeof value === "string";
const isNullableText = (value: unknown) => value === null || isText(value);
const hasCounts = (value: Record<string, unknown>, keys: string[]) => keys.every(key => isCount(value[key]));
const isDate = (value: unknown) => isText(value) && Number.isFinite(Date.parse(value));

function isPage(value: unknown): value is DiscoveryPage {
  return isRecord(value) && isText(value.url) && isText(value.context) && typeof value.truncated === "boolean"
    && hasCounts(value, ["http_status", "observed_cards", "extracted_cards", "missing_cards", "unique_listings", "root_count", "unmatched_cards", "without_images"])
    && (value.search_state === undefined || isText(value.search_state))
    && (value.continuation === undefined || isText(value.continuation));
}

export function isDiscoveryEvidence(value: unknown): value is DiscoveryEvidence {
  if (!isRecord(value) || typeof value.items_recorded !== "boolean"
    || !Array.isArray(value.pages) || !value.pages.every(isPage)
    || !Array.isArray(value.items)) return false;
  const coverage = value.coverage, screening = value.screening, listings = value.listings;
  if (coverage !== null && (!isRecord(coverage) || coverage.version !== 1
    || !["complete", "partial"].includes(String(coverage.status)) || !isText(coverage.stop_reason)
    || !hasCounts(coverage, ["pages", "unique_listings", "missing_cards"])
    || !isNullableText(coverage.resume_url) || !isText(coverage.recipe_digest)
    || (coverage.last_page !== undefined && !isPage(coverage.last_page)))) return false;
  if (screening !== null && (!isRecord(screening) || !isText(screening.policy_version)
    || !hasCounts(screening, ["harvested", "admitted", "rejected", "inspected"])
    || (screening.context_key !== undefined && !isText(screening.context_key)))) return false;
  if (listings !== null && (!isRecord(listings) || !hasCounts(listings, ["found", "admitted", "filtered", "unverified"])
    || listings.found !== Number(listings.admitted) + Number(listings.filtered) + Number(listings.unverified))) return false;
  return value.items.every(item => isRecord(item) && isNullableText(item.page_url) && isText(item.title)
    && ["admit", "reject"].includes(String(item.outcome)) && ["admitted", "filtered", "unverified"].includes(String(item.state))
    && isText(item.reason) && isNullableText(item.matched_name) && (item.image_url === undefined || isText(item.image_url))
    && (item.identity_evidence === undefined || (isRecord(item.identity_evidence) && isText(item.identity_evidence.page_url)
      && Array.isArray(item.identity_evidence.products) && item.identity_evidence.products.every(product => isRecord(product)
        && ["name", "description", "brand", "category"].every(key => product[key] === undefined || isText(product[key]))))));
}

function isPagination(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isDate(value.as_of) && isCount(value.total)
    && (value.next_offset === null || isCount(value.next_offset));
}

function isWebsiteList(value: unknown): value is WebsiteDiscoveryList {
  return isPagination(value) && Array.isArray(value.websites) && value.websites.every(website => isRecord(website)
    && isText(website.domain) && hasCounts(website, ["searches", "complete", "partial", "unknown", "in_progress", "failed", "unverified"])
    && (website.last_search_at === null || isDate(website.last_search_at)));
}

function isRunList(value: unknown): value is WebsiteDiscoveryRuns {
  return isPagination(value) && isText(value.domain) && Array.isArray(value.runs) && value.runs.every(run => isRecord(run)
    && ["run_id", "domain_id", "tenant_name", "keyword", "status"].every(key => isText(run[key]))
    && ["ip_catalog_id", "ip_name", "scrape_status", "error", "country"].every(key => isNullableText(run[key]))
    && isDate(run.created_at) && (run.completed_at === null || isDate(run.completed_at))
    && hasCounts(run, ["stored", "evaluated", "findings"]) && isDiscoveryEvidence(run.discovery));
}

export async function getWebsiteDiscovery(options: WebsiteDiscoveryOptions) {
  const value = await request<unknown>(`/api/admin/monitoring/websites?${parameters(options)}`, { signal: options.signal });
  requireResponse(isWebsiteList(value), "website performance response");
  return value;
}

export async function getWebsiteDiscoveryRuns(domain: string, options: WebsiteDiscoveryOptions) {
  const value = await request<unknown>(`/api/admin/monitoring/websites/${encodeURIComponent(domain)}/runs?${parameters(options)}`, { signal: options.signal });
  requireResponse(isRunList(value), "website search history response");
  return value;
}
