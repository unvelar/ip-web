import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { IpReviewFinding } from "../src/api/reviews";
import { FindingRow } from "../src/components/monitoring/board/FindingRow";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
});

function finding(overrides: Partial<IpReviewFinding> = {}): IpReviewFinding {
  return {
    result_id: "finding-one", listing_title: "Daily cleanser for sensitive skin, 200 ml bottle",
    domain: "www.example.shop", page_url: "https://example.shop/listing", seller_name: "Beauty store",
    seller_key: "seller-one", ip_name: "Protected brand", price_value_usd: 12.75, price: "€11.00",
    image_url: "https://images.example/one.jpg", gallery_scores: [], image_urls: [],
    suggested_review_outcome: "none", manual_candidate_outcome: null,
    actionability: { key: "needs_review", label: "Needs review", reason: "Evidence needs inspection." },
    ...overrides,
  } as IpReviewFinding;
}

async function setup(initial = finding(), showStatus = false) {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let rowOpens = 0;
  const render = (f: IpReviewFinding) => root?.render(<MemoryRouter><table><tbody>
    <tr onClick={() => rowOpens++}><FindingRow f={f} active={false} showIp showStatus={showStatus} /></tr>
  </tbody></table></MemoryRouter>);
  await act(async () => render(initial));
  return {
    container, rowOpens: () => rowOpens,
    render: async (f: IpReviewFinding) => { await act(async () => render(f)); },
    click: async (selector: string) => {
      const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
      event.preventDefault();
      await act(async () => container.querySelector(selector)!.dispatchEvent(event));
    },
    imageError: async () => { await act(async () => container.querySelector("img")!.dispatchEvent(new window.Event("error"))); },
  };
}

test("the compact row keeps the full listing and seller identity together and links do not open the inspector", async () => {
  const f = finding();
  const ui = await setup(f);
  expect(ui.container.querySelectorAll("td")).toHaveLength(3);
  expect(ui.container.querySelector(".monitoring-listing-title")?.textContent).toBe(f.listing_title);
  expect(ui.container.querySelector(".monitoring-listing-meta")?.textContent).toBe("Beauty store · example.shop · Protected brand");
  expect(ui.container.querySelector('.monitoring-listing-meta a')?.getAttribute("href")).toBe("/monitoring/sellers/seller-one");
  await ui.click(".monitoring-listing-meta a");
  await ui.click("a.monitoring-listing-thumbnail");
  expect(ui.rowOpens()).toBe(0);
  await ui.click(".monitoring-listing-title");
  expect(ui.rowOpens()).toBe(1);
});

test("thumbnail errors advance through real images and fall back without breaking the row", async () => {
  const ui = await setup(finding({ image_urls: ["https://images.example/two.jpg"] }));
  await ui.imageError();
  expect(ui.container.querySelector("img")?.getAttribute("src")).toBe("https://images.example/two.jpg");
  await ui.imageError();
  expect(ui.container.querySelector("img")).toBeNull();
  expect(ui.container.querySelector('[aria-label="No listing image"]')).not.toBeNull();
  await ui.render(finding({ image_url: "https://images.example/new.jpg" }));
  expect(ui.container.querySelector("img")?.getAttribute("src")).toBe("https://images.example/new.jpg");
});

test("the USD column preserves cents and zero but never substitutes a native currency", async () => {
  const ui = await setup(finding({ price_value_usd: null, price: "€125.50" }));
  expect(ui.container.querySelector(".monitoring-listing-price")?.textContent).toBe("—");
  expect(ui.container.querySelector(".monitoring-listing-price")?.getAttribute("title")).toContain("Listed €125.50");
  await ui.render(finding({ price_value_usd: 0 }));
  expect(ui.container.querySelector(".monitoring-listing-price")?.textContent).toBe("$0.00");
  await ui.render(finding({ price_value_usd: 250.75 }));
  expect(ui.container.querySelector(".monitoring-listing-price")?.textContent).toBe("$250.75");
});

test("suggested actions preserve clearance guidance and describe takedown as a recommendation", async () => {
  const ui = await setup();
  for (const [key, expected] of [
    ["send_takedown", "Takedown recommended"], ["licensed_seller", "Licensed seller"],
    ["allowed_resale", "Second hand"], ["false_positive", "Different product"], ["needs_review", "Needs review"],
  ] as const) {
    const f = finding();
    await ui.render(finding({ actionability: { ...f.actionability, key, label: "Likely counterfeit", reason: "Current backend recommendation." } }));
    expect(ui.container.querySelector(".monitoring-listing-assessment")?.textContent).toBe(expected);
    expect(ui.container.querySelector(".monitoring-listing-assessment")?.getAttribute("title")).toBe("Current backend recommendation.");
  }
  await ui.render(finding({ manual_candidate_outcome: "do_not_pursue" }));
  expect(ui.container.querySelector(".monitoring-listing-assessment")?.textContent).toBe("Do not pursue");
  const f = finding();
  await ui.render(finding({ manual_candidate_outcome: "takedown", actionability: { ...f.actionability, key: "licensed_seller" } }));
  expect(ui.container.querySelector(".monitoring-listing-assessment")?.textContent).toBe("Licensed seller");
});

test("mixed workflow views show lifecycle separately from suggested action", async () => {
  const ui = await setup(finding({ review_status: "takedown_sent" }), true);
  expect(ui.container.querySelector(".monitoring-listing-meta")?.textContent).toContain("Takedown sent");
  expect(ui.container.querySelector(".monitoring-listing-assessment")?.textContent).toBe("Needs review");
  await ui.render(finding({ dismissed_at: "2026-09-21T14:00:00Z", dismissal_reason: "second_hand" }));
  expect(ui.container.querySelector(".monitoring-listing-meta")?.textContent).toContain("Dismissed");
  await ui.render(finding({ ready_for_review: false, review_status: "pending" }));
  expect(ui.container.querySelector(".monitoring-listing-meta")?.textContent).toContain("Preparing");
});
