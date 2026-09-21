import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MonitoringFacets } from "../src/api/monitoring";
import { MonitoringFilters } from "../src/components/monitoring/board/MonitoringFilters";
import { parseFilters, type InboxFilters } from "../src/lib/monitoringFilters";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

const facets: MonitoringFacets = {
  statuses: {}, priorities: { high: 0, med: 0, low: 0 }, platforms: [], ips: [], sellers: [],
  product_groups: [{ product_group_id: "visual-one", name: "Blue bottles", n: 5 }],
  dismissal_reasons: {}, candidate_outcomes: { takedown: 0, false_positive: 0, do_not_pursue: 0, second_hand: 0, none: 0 }, total: 0,
};

async function setup(initial: Partial<InboxFilters> = { catalog_product_id: "product-one" }) {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const requests: { url: URL; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = ((url, options) => new Promise<Response>((resolve) => {
    requests.push({ url: new URL(String(url), window.location.origin), signal: options?.signal as AbortSignal, resolve });
  })) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let filters = { ...parseFilters(new URLSearchParams()), ...initial };
  let ipId = "ip-one";
  const render = () => root?.render(<MonitoringFilters filters={filters} facets={facets} ipId={ipId}
    showIpFilter={false} members={[]} membersLoading={false} membersError="" currentMemberId={null}
    onChange={(change) => { filters = { ...filters, ...change }; render(); }} />);
  await act(async () => render());
  return {
    container, requests,
    update: async (change: Partial<InboxFilters>, nextIp = ipId) => {
      filters = { ...filters, ...change }; ipId = nextIp;
      await act(async () => render());
    },
    respond: async (index: number, name: string, id = "product-one") => {
      await act(async () => requests[index].resolve(Response.json({
        scope: { profile_count: 5 }, groups: [{ id: "group-one", canonical_product_id: id,
          catalog_display_name: name, member_count: 5, members: [] }], group_count: 1,
        ungrouped_count: 0, next_cursor: null, catalog_categories: [],
      })));
    },
  };
}

test("a product deep link restores its label once and retains it across other filter changes", async () => {
  const ui = await setup();
  expect(ui.container.textContent).toContain("Selected product");
  expect(ui.requests).toHaveLength(1);
  expect(Object.fromEntries(ui.requests[0].url.searchParams)).toEqual({
    relationship: "same", view: "all", include_ungrouped: "false", limit: "1",
    product_id: "product-one", catalog_scope: "catalog",
  });
  await ui.respond(0, "Daily cleanser");
  expect(ui.container.textContent).toContain("Daily cleanser");
  expect(ui.container.textContent).not.toContain("Selected product");
  await ui.update({ min_price_usd: 0, max_price_usd: 20, source: "search:google" });
  expect(ui.requests).toHaveLength(1);
  expect(ui.container.textContent).toContain("Daily cleanser");
  await ui.update({}, "ip-two");
  expect(ui.requests).toHaveLength(2);
  expect(ui.container.textContent).not.toContain("Daily cleanser");
  expect(ui.container.textContent).toContain("Selected product");
  await ui.respond(1, "Other IP product");
  expect(ui.container.textContent).toContain("Other IP product");
});

test("label lookups abort on product change and ignore stale or mismatched responses", async () => {
  const ui = await setup();
  await ui.update({ catalog_product_id: "product-two" });
  expect(ui.requests[0].signal.aborted).toBe(true);
  await ui.respond(0, "Stale product");
  expect(ui.container.textContent).not.toContain("Stale product");
  await ui.respond(1, "Wrong product", "different-product");
  expect(ui.container.textContent).not.toContain("Wrong product");
  expect(ui.container.textContent).toContain("Selected product");
  expect(ui.requests).toHaveLength(2);
});

test("visual group labels use existing facets without fetching product catalog data", async () => {
  const ui = await setup({ product_group_id: "visual-one" });
  expect(ui.requests).toHaveLength(0);
  expect(ui.container.textContent).toContain("Blue bottles");
});
