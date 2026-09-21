import { afterEach, expect, test } from "bun:test";
import { listMonitoringFindingRowsGlobal, listMonitoringFindingsGlobal } from "../src/api/monitoring";
import { parseFilters, writeFilters } from "../src/lib/monitoringFilters";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("price bounds round-trip zero, decimal and open-ended ranges", () => {
  for (const [min, max] of [[0, 0], [0, 42.5], [5, null], [null, 10], [null, null]] as const) {
    const filters = { ...parseFilters(new URLSearchParams()), min_price_usd: min, max_price_usd: max };
    const written = writeFilters(new URLSearchParams(), filters);
    expect(written.get("min_price_usd")).toBe(min == null ? null : String(min));
    expect(written.get("max_price_usd")).toBe(max == null ? null : String(max));
    expect(parseFilters(written)).toEqual(filters);
  }
});

test("malformed or reversed price ranges cannot become active URL filters", () => {
  for (const value of ["", " ", "-1", "NaN", "Infinity", "1000000000001", "USD 25", "0x10", "1e-7", "+1", "1."]) {
    const parsed = parseFilters(new URLSearchParams({ min_price_usd: value, max_price_usd: "25" }));
    expect(parsed.min_price_usd).toBeNull();
    expect(parsed.max_price_usd).toBe(25);
  }
  const reversed = parseFilters(new URLSearchParams({ min_price_usd: "26", max_price_usd: "25" }));
  expect(reversed.min_price_usd).toBeNull();
  expect(reversed.max_price_usd).toBeNull();
});

test("updating a range preserves search, source, product, workflow and unrelated route state", () => {
  const base = new URLSearchParams({
    status: "review", q: "  serum & cleanser / 30ml  ", source: "search:google",
    platform: "store.example", catalog_product_id: "product-one", ip_id: "ip-one",
    finding: "finding-one", sort: "price_asc", min_price_usd: "5", max_price_usd: "20",
  });
  const before = base.toString();
  const filters = parseFilters(base);
  const changed = writeFilters(base, { ...filters, min_price_usd: 0, max_price_usd: null });
  expect(base.toString()).toBe(before);
  expect(Object.fromEntries(changed)).toEqual({
    status: "review", q: "serum & cleanser / 30ml", source: "search:google",
    platform: "store.example", catalog_product_id: "product-one", ip_id: "ip-one",
    finding: "finding-one", sort: "price_asc", min_price_usd: "0",
  });
  expect(parseFilters(changed)).toEqual({ ...filters, min_price_usd: 0, max_price_usd: null });
  const cleared = writeFilters(changed, { ...filters, min_price_usd: null, max_price_usd: null });
  expect(cleared.has("min_price_usd")).toBe(false);
  expect(cleared.has("max_price_usd")).toBe(false);
  expect(cleared.get("q")).toBe("serum & cleanser / 30ml");
});

test("default workflow and all-open workflow retain their distinct refresh behavior", () => {
  const defaults = parseFilters(new URLSearchParams());
  expect(defaults.status).toBe("pending");
  expect(writeFilters(new URLSearchParams("status=review"), defaults).has("status")).toBe(false);
  const all = writeFilters(new URLSearchParams(), { ...defaults, status: null });
  expect(all.get("status")).toBe("all");
  expect(parseFilters(all).status).toBeNull();
});

test("findings and rows APIs serialize zero and open bounds without losing search or source", async () => {
  const urls: URL[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(new URL(String(input), "http://localhost:5173"));
    return Response.json({ findings: [], next_cursor: null, facets: {} });
  }) as typeof fetch;
  const query = { min_price_usd: 0, max_price_usd: null, query: "cleanser & serum / 30ml", source: "search:google", platform: "store.example" };
  await listMonitoringFindingsGlobal(query);
  await listMonitoringFindingRowsGlobal({ ...query, min_price_usd: null, max_price_usd: 0 });
  expect(Object.fromEntries(urls[0].searchParams)).toEqual({
    min_price_usd: "0", q: query.query, source: query.source, platform: query.platform, limit: "50",
  });
  expect(Object.fromEntries(urls[1].searchParams)).toEqual({
    max_price_usd: "0", q: query.query, source: query.source, platform: query.platform, limit: "50",
    include_facets: "false", include_seller_prior_enforcement: "false",
  });
});

test("small price bounds remain decimal through URL refresh and both API request paths", async () => {
  const filters = { ...parseFilters(new URLSearchParams()), min_price_usd: 1e-7, max_price_usd: 1.234e-6 };
  const written = writeFilters(new URLSearchParams("q=cleanser"), { ...filters, query: "cleanser" });
  expect(written.get("min_price_usd")).toBe("0.0000001");
  expect(written.get("max_price_usd")).toBe("0.000001234");
  expect(parseFilters(written)).toMatchObject({ min_price_usd: filters.min_price_usd, max_price_usd: filters.max_price_usd });
  const urls: URL[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(new URL(String(input), "http://localhost:5173"));
    return Response.json({ findings: [], next_cursor: null, facets: {} });
  }) as typeof fetch;
  await listMonitoringFindingsGlobal(filters);
  await listMonitoringFindingRowsGlobal(filters);
  for (const url of urls) {
    expect(url.searchParams.get("min_price_usd")).toBe("0.0000001");
    expect(url.searchParams.get("max_price_usd")).toBe("0.000001234");
  }
});


test("price changes preserve existing evidence filters through URL and API requests", async () => {
  const params = new URLSearchParams({ match_basis: "text_only", protected_term_id: "term-one", min_price_usd: "10" });
  const filters = parseFilters(params);
  const next = writeFilters(params, { ...filters, max_price_usd: 25 });
  expect(next.get("match_basis")).toBe("text_only");
  expect(next.get("protected_term_id")).toBe("term-one");
  const urls: URL[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(new URL(String(input), "http://localhost:5173"));
    return Response.json({ findings: [], next_cursor: null, facets: {} });
  }) as typeof fetch;
  await listMonitoringFindingsGlobal(parseFilters(next));
  expect(urls[0].searchParams.get("match_basis")).toBe("text_only");
  expect(urls[0].searchParams.get("protected_term_id")).toBe("term-one");
  expect(urls[0].searchParams.get("max_price_usd")).toBe("25");
});
