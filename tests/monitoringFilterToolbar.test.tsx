import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MonitoringFacets } from "../src/api/monitoring";
import { parseFilters, type InboxFilters } from "../src/lib/monitoringFilters";
import { MonitoringFilters } from "../src/components/monitoring/board/MonitoringFilters";

const facets: MonitoringFacets = {
  statuses: { pending: 202, review: 3, takedown_pending: 1, takedown_sent: 0, dismissed: 13 },
  priorities: { high: 50, med: 102, low: 50 },
  platforms: [{ domain: "ebay.com", n: 99 }, { domain: "one.shop", n: 3 }, { domain: "two.shop", n: 2 }],
  sources: [
    { key: "domain:ebay.com", label: "ebay.com", kind: "domain", n: 99, websites: [{ domain: "ebay.com", n: 99 }] },
    { key: "search:google", label: "Google", kind: "search", n: 5, websites: [{ domain: "one.shop", n: 3 }, { domain: "two.shop", n: 2 }] },
  ],
  ips: [{ ip_id: "ip-one", name: "Brand one", n: 202 }],
  product_groups: [], sellers: [{ seller_name: "Shop One", n: 3 }], dismissal_reasons: {},
  candidate_outcomes: { takedown: 20, second_hand: 3, false_positive: 10, do_not_pursue: 0, none: 169 },
  total: 202,
};
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

async function setup(initial: Partial<InboxFilters> = {}) {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let filters: InboxFilters = { ...parseFilters(new URLSearchParams()), ...initial };
  function render() {
    root!.render(<MonitoringFilters filters={filters} facets={facets} ipId={null} showIpFilter={false}
      members={[]} membersLoading={false} membersError="" currentMemberId={null}
      onChange={(change) => { filters = { ...filters, ...change }; render(); }} />);
  }
  await act(async () => render());
  const button = (text: string) => [...container.querySelectorAll("button")].find((node) => node.textContent?.startsWith(text))!;
  const click = async (text: string) => { await act(async () => button(text).click()); };
  const remove = async (label: string) => {
    await act(async () => (container.querySelector(`[aria-label="Remove ${label} filter"]`) as HTMLButtonElement).click());
  };
  const select = async (label: string, value: string) => {
    const node = [...container.querySelectorAll("label")].find((item) => item.textContent?.startsWith(label))!.querySelector("select")!;
    await act(async () => { node.value = value; node.dispatchEvent(new window.Event("change", { bubbles: true })); });
  };
  const escape = async () => {
    await act(async () => document.activeElement?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  };
  return { container, filters: () => filters, button, click, remove, select, escape };
}

test("Google website selection is reversible one level at a time", async () => {
  const ui = await setup();
  await ui.click("Source");
  await ui.click("Google");
  expect(ui.filters().source).toBeNull();
  await ui.click("one.shop");
  expect(ui.filters()).toMatchObject({ source: "search:google", platform: "one.shop" });
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  await ui.remove("Website: one.shop");
  expect(ui.filters()).toMatchObject({ source: "search:google", platform: null });
  await ui.click("Source");
  await ui.click("two.shop");
  await ui.remove("Found via: Google");
  expect(ui.filters()).toMatchObject({ source: null, platform: null });
});

test("all websites selects the complete engine and marketplaces never inherit its website", async () => {
  const ui = await setup({ source: "search:google", platform: "one.shop" });
  await ui.click("Source");
  await ui.click("All Google websites");
  expect(ui.filters()).toMatchObject({ source: "search:google", platform: null });
  await ui.click("Source");
  await ui.click("All sources");
  await ui.click("eBay");
  expect(ui.filters()).toMatchObject({ source: "domain:ebay.com", platform: null });
});

test("Clear filters preserves workflow, IP and sort while removing all restrictions", async () => {
  const ui = await setup({ status: "dismissed", show_dismissed: true, ip_id: "ip-one", sort: "price_desc",
    catalog_product_id: "product-one", query: "cleanser", source: "search:google", platform: "one.shop",
    min_price_usd: 0, max_price_usd: 40, assignee: "unassigned", seller: "Shop One", dismissal_reason: "second_hand", priority: "high" });
  await ui.click("Clear filters");
  expect(ui.filters()).toEqual({ ...parseFilters(new URLSearchParams()), status: "dismissed", show_dismissed: true,
    ip_id: "ip-one", sort: "price_desc" });
  expect(ui.container.querySelector('[aria-label="Active filters"]')).toBeNull();
  expect((ui.container.querySelector('[aria-label="Search listings or sellers"]') as HTMLInputElement).value).toBe("");
});

test("suggestions go to triage and switching workflow clears the suggestion", async () => {
  const ui = await setup({ status: "dismissed", dismissal_reason: "licensed", show_dismissed: true });
  await ui.click("More filters");
  await ui.select("Suggested action", "takedown");
  expect(ui.filters()).toMatchObject({ status: "pending", candidate_outcome: "takedown", dismissal_reason: null, show_dismissed: false });
  await ui.click("Done");
  await ui.click("In review");
  expect(ui.filters()).toMatchObject({ status: "review", candidate_outcome: null });
});

test("Escape dismisses the source panel and returns focus to its trigger", async () => {
  const ui = await setup();
  const trigger = ui.button("Source");
  await ui.click("Source");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Find a source");
  await ui.escape();
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("drilling into Google keeps keyboard focus inside the panel and Escape remains usable", async () => {
  const ui = await setup();
  const trigger = ui.button("Source");
  await ui.click("Source");
  await act(async () => ui.button("Google").focus());
  await ui.click("Google");
  expect(ui.container.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
  await ui.escape();
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
