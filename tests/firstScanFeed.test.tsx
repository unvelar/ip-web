import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { IpFirstScanResult, IpFirstScanTotals } from "../src/api";

const happyWindow = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, { window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
  localStorage: happyWindow.localStorage, sessionStorage: happyWindow.sessionStorage,
  HTMLElement: happyWindow.HTMLElement, Event: happyWindow.Event, MouseEvent: happyWindow.MouseEvent, Node: happyWindow.Node,
  IS_REACT_ACT_ENVIRONMENT: true });
const { AuthProvider } = await import("../src/context/AuthContext");
const { ActiveIpProvider } = await import("../src/context/ActiveIpContext");
const { useFirstScanFeed } = await import("../src/features/firstScan/useFirstScanFeed");
const sourceA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const sourceB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const sources = [sourceA, sourceB].map((id, index) => ({ id, tenant_id: "tenant", ip_catalog_id: "ip",
  domain: `${index}.example`, display_name: index ? "Older market" : "Newer market", recipe: {}, source_type: "domain" }));
const rows = Array.from({ length: 1115 }, (_, index) => ({
  candidate_id: `candidate-${index}`, source_id: index < 600 ? sourceA : sourceB,
  candidate_title: index === 1114 ? "Oldest listing" : `Listing ${index}`, page_url: `https://market.example/${index}`,
  stage: index < 901 ? "ready" : "filtered", result_id: index < 901 ? `result-${index}` : null,
  discovered_at: index < 600 ? "2026-09-13T10:00:00Z" : "2026-09-12T10:00:00Z",
} as IpFirstScanResult));
function count(items: IpFirstScanResult[]): IpFirstScanTotals {
  return { discovered: items.length, processing: 0, ready: items.filter(row => row.stage === "ready").length,
    filtered: items.filter(row => row.stage === "filtered").length, failed: 0, qualified: items.filter(row => row.result_id).length };
}
const originalFetch = globalThis.fetch;
const requests: URL[] = [];
let failNextPage = false;
let delayNextFirstPage: Promise<void> | null = null;
let feed: ReturnType<typeof useFirstScanFeed>;
let root: Root | undefined;
function Harness() {
  const value = useFirstScanFeed("ip");
  useEffect(() => { feed = value; }, [value]);
  return <output>{value.totals.discovered}</output>;
}
async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(predicate()).toBe(true);
}
async function mount(platforms = sources) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "http://localhost:5173");
    let body: unknown;
    if (url.pathname.endsWith("/first-scan-results")) {
      requests.push(url);
      if (delayNextFirstPage && !url.searchParams.has("cursor")) {
        const delay = delayNextFirstPage; delayNextFirstPage = null;
        await delay;
      }
      if (failNextPage && url.searchParams.has("cursor")) return new Response("Unavailable", { status: 503 });
      const source = url.searchParams.get("source_id"), query = url.searchParams.get("q")?.toLowerCase();
      const matching = rows.filter(row => (!source || row.source_id === source) && (!query || row.candidate_title?.toLowerCase().includes(query)));
      const stage = url.searchParams.get("stage");
      const filtered = matching.filter(row => !stage || stage === "all" || row.stage === stage);
      const start = Number(url.searchParams.get("cursor") ?? "0");
      const limit = Number(url.searchParams.get("limit"));
      body = { results: filtered.slice(start, start + limit), total: filtered.length,
        next_cursor: start + limit < filtered.length ? String(start + limit) : null,
        as_of: "2026-09-14T10:00:00.123456Z", filter_totals: count(matching),
        source_totals: sources.map(source => ({ ...count(rows.filter(row => row.source_id === source.id)),
          source_id: source.id, source_domain: source.domain, source_name: source.display_name })) };
    } else if (url.pathname.endsWith("/platforms")) body = { platforms };
    else if (url.pathname.endsWith("/onboarding-status")) body = { status: null };
    else if (url.pathname.includes("/runs")) body = { runs: [] };
    else if (url.pathname === "/api/ip/ip") body = { trademark: { id: "ip", name: "Brand", keywords: [], image_count: 0, indexed_count: 0 }, images: [] };
    else if (url.pathname === "/api/auth/me") body = { user: null };
    else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<MemoryRouter><AuthProvider><ActiveIpProvider><Harness /></ActiveIpProvider></AuthProvider></MemoryRouter>); });
  await waitFor(() => Boolean(feed.snapshot) && !feed.refreshing);
}
afterEach(() => {
  if (root) act(() => root!.unmount()); root = undefined;
  document.body.replaceChildren(); globalThis.fetch = originalFetch; requests.length = 0; failNextPage = false; delayNextFirstPage = null;
});

test("connected count follows source setup even when cached recipes and old results exist", async () => {
  const platforms = sources.map((source, index) => ({
    ...source, setup_status: index ? "retry_needed" : "processing",
  }));
  await mount(platforms);
  expect(feed.totals.connected).toBe(0);
  expect(feed.totals.discovered).toBe(1115);
  platforms[0]!.setup_status = "ready";
  await act(async () => { await feed.refresh(); });
  expect(feed.totals.connected).toBe(1);
});

test("full source totals survive pagination, refresh, and a failed next page", async () => {
  await mount();
  expect(feed.visibleResults).toHaveLength(100);
  expect(feed.totals.discovered).toBe(1115);
  expect(feed.snapshot!.sources.find(source => source.source.id === sourceB)).toMatchObject({ discovered: 515, ready: 301, filtered: 214 });
  expect(feed.snapshot!.sources.find(source => source.source.id === sourceB)!.results).toHaveLength(0);
  await act(async () => { await feed.loadMore(); });
  expect(feed.visibleResults).toHaveLength(200);
  await act(async () => { await feed.refresh(); });
  expect(feed.visibleResults).toHaveLength(200);
  failNextPage = true;
  await act(async () => { await feed.loadMore(); });
  expect(feed.error).not.toBeNull();
  expect(feed.visibleResults).toHaveLength(200);
  expect(feed.totals.discovered).toBe(1115);
  failNextPage = false;
  while (feed.hasMore) await act(async () => { await feed.loadMore(); });
  expect(feed.visibleResults).toHaveLength(1115);
  expect(new Set(feed.visibleResults.map(row => row.candidate_id)).size).toBe(1115);
  expect(feed.hasMore).toBe(false);
  expect(requests.some(url => url.searchParams.get("cursor") === "1000")).toBe(true);
});

test("source, stage, and text filters search beyond the loaded rows and reset pagination", async () => {
  await mount();
  await act(async () => { await feed.loadMore(); });
  act(() => feed.setSourceFilter(sourceB));
  await waitFor(() => !feed.refreshing && feed.visibleResults.length === 100);
  expect(feed.filteredTotal).toBe(515);
  expect(feed.resultFilterTotals.ready).toBe(301);
  expect(feed.totals.discovered).toBe(1115);
  expect(feed.visibleResults.every(row => row.source_id === sourceB)).toBe(true);
  act(() => feed.setResultFilter("ready"));
  await waitFor(() => !feed.refreshing && feed.filteredTotal === 301);
  expect(feed.visibleResults.every(row => row.stage === "ready")).toBe(true);
  act(() => { feed.setResultFilter("all"); feed.setQuery("Oldest listing"); });
  await waitFor(() => !feed.refreshing && feed.visibleResults.length === 1);
  expect(feed.visibleResults[0]!.candidate_id).toBe("candidate-1114");
  expect(feed.filteredTotal).toBe(1);
  expect(feed.hasMore).toBe(false);
  expect(requests.at(-1)!.searchParams.get("q")).toBe("Oldest listing");
  expect(requests.at(-1)!.searchParams.has("cursor")).toBe(false);
});

test("a changed filter replaces an in-flight refresh immediately and ignores its stale response", async () => {
  await mount();
  let release!: () => void;
  delayNextFirstPage = new Promise<void>(resolve => { release = resolve; });
  let pending!: Promise<void>;
  act(() => { pending = feed.refresh(); });
  try {
    act(() => feed.setSourceFilter(sourceB));
    await waitFor(() => !feed.refreshing && feed.filteredTotal === 515);
    expect(feed.visibleResults.every(row => row.source_id === sourceB)).toBe(true);
  } finally {
    await act(async () => { release(); await pending; });
  }
  expect(feed.filteredTotal).toBe(515);
  expect(feed.visibleResults.every(row => row.source_id === sourceB)).toBe(true);
});
