import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { IpReviewFinding } from "../src/api/reviews";
import type { MonitoringSortMode } from "../src/api/monitoring";
import { MonitoringResultList } from "../src/components/monitoring/board/MonitoringResultList";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
});

function finding(id: string, title: string, price: number): IpReviewFinding {
  return {
    result_id: id, listing_title: title, domain: "example.shop",
    page_url: `https://example.shop/${id}`, seller_name: "Beauty seller",
    seller_key: "beauty-seller", price_value_usd: price, price: `$${price}`,
    image_url: null, gallery_scores: [], image_urls: [], ready_for_review: true,
    review_status: "pending", suggested_review_outcome: "none", manual_candidate_outcome: null,
    actionability: { key: "needs_review", label: "Needs review", reason: "Inspect listing evidence." },
  } as IpReviewFinding;
}

const listings = [finding("high", "Moisturizer, 50 ml", 30), finding("low", "Cleanser, 200 ml", 10)];

async function setup(options: { findings?: IpReviewFinding[]; total?: number; clear?: boolean; emptyMessage?: string } = {}) {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let selected = new Set<string>();
  const opened: string[] = [], selections: string[] = [], sorts: MonitoringSortMode[] = [];
  let clears = 0;
  function render() {
    root!.render(<MemoryRouter><MonitoringResultList
      findings={options.findings ?? listings} total={options.total ?? 202}
      sort="score_desc" selected={selected} activeId={null} dismissing={new Set()}
      showIp={false} showStatus={false}
      onOpen={(id) => opened.push(id)}
      onSelect={(id) => {
        selections.push(id);
        selected = new Set(selected);
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        render();
      }}
      onSort={(sort) => sorts.push(sort)}
      emptyMessage={options.emptyMessage}
      onClearFilters={options.clear ? () => { clears++; } : undefined}
    /></MemoryRouter>);
  }
  await act(async () => render());
  return {
    container, opened, selections, sorts, clears: () => clears,
    click: async (selector: string) => {
      await act(async () => (container.querySelector(selector) as HTMLElement).click());
    },
    key: async (selector: string, key: string) => {
      await act(async () => container.querySelector(selector)!.dispatchEvent(
        new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      ));
    },
    sort: async (value: MonitoringSortMode) => {
      const select = container.querySelector("select")!;
      await act(async () => {
        select.value = value;
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
    },
  };
}

test("listing clicks and row Enter/Space open evidence without changing selection", async () => {
  const ui = await setup();
  await ui.click("tbody tr:first-child .monitoring-listing-title");
  await ui.key("tbody tr:first-child", "Enter");
  await ui.key("tbody tr:last-child", " ");
  await ui.key("tbody tr:first-child", "ArrowDown");
  expect(ui.opened).toEqual(["high", "high", "low"]);
  expect(ui.selections).toEqual([]);
});

test("checking and unchecking a listing never opens its inspector", async () => {
  const ui = await setup();
  const checkbox = () => ui.container.querySelector("input[type=checkbox]") as HTMLInputElement;
  await ui.click("input[type=checkbox]");
  expect(checkbox().checked).toBe(true);
  await ui.key("input[type=checkbox]", "Enter");
  await ui.key("input[type=checkbox]", " ");
  expect(ui.opened).toEqual([]);
  await ui.click("input[type=checkbox]");
  expect(checkbox().checked).toBe(false);
  expect(ui.selections).toEqual(["high", "high"]);
  expect(ui.opened).toEqual([]);
});

test("seller navigation does not also open the listing inspector", async () => {
  const ui = await setup();
  const link = ui.container.querySelector(".monitoring-listing-meta a")!;
  expect(link.getAttribute("href")).toBe("/monitoring/sellers/beauty-seller");
  await ui.key(".monitoring-listing-meta a", "Enter");
  await ui.click(".monitoring-listing-meta a");
  expect(ui.opened).toEqual([]);
  expect(ui.selections).toEqual([]);
});

test("sort choices request a server sort without rearranging only the loaded page", async () => {
  const ui = await setup();
  await ui.sort("price_asc");
  expect(ui.sorts).toEqual(["price_asc"]);
  expect(Array.from(ui.container.querySelectorAll(".monitoring-listing-title"), (node) => node.textContent))
    .toEqual(["Moisturizer, 50 ml", "Cleanser, 200 ml"]);
  expect(ui.opened).toEqual([]);
});

test("the summary reports the server count instead of the loaded-page count", async () => {
  const ui = await setup();
  expect(ui.container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(ui.container.querySelector('[aria-live="polite"]')?.textContent)
    .toBe("202 listings matching this view");
});

test("an empty filtered view offers a working reset without changing workflow itself", async () => {
  const ui = await setup({ findings: [], total: 0, clear: true });
  expect(ui.container.querySelector(".monitoring-results-empty")?.textContent).toContain("No listings match these filters");
  await ui.click(".monitoring-results-empty button");
  expect(ui.clears()).toBe(1);
  expect(ui.opened).toEqual([]);
  expect(ui.sorts).toEqual([]);
});

test("an unfiltered empty view preserves the supplied setup message without a misleading reset", async () => {
  const ui = await setup({ findings: [], total: 0, emptyMessage: "Your first scan is preparing." });
  expect(ui.container.querySelector(".monitoring-results-empty")?.textContent).toBe("Your first scan is preparing.");
  expect(ui.container.querySelector(".monitoring-results-empty button")).toBeNull();
});
