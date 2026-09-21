import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import { ActiveIpProvider } from "../src/context/ActiveIpContext";
import Sellers from "../src/pages/Sellers";
import { useSellerNavigation } from "../src/features/sellers/useSellerNavigation";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  const [, selectSeller] = useSellerNavigation();
  return <><output>{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
    <button onClick={() => selectSeller("seller-one", "finding-one", "ip-one")}>Open scoped task</button></>;
}

const finding = {
  result_id: "finding-one", listing_title: "Shared listing", review_status: "pending",
  page_url: "https://example.org/listing", images: [], found_at: "2026-09-11T12:00:00Z", ip_id: "ip-one",
};

async function setup(query = "?scope=all&platform=etsy.com") {
  const window = new Window({ url: `http://localhost:5173/monitoring/sellers${query}` });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    Element: window.Element, HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true });
  const requests: URL[] = [];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input), window.location.origin);
    requests.push(url);
    if (url.pathname === "/api/monitoring/sellers") return Response.json({
      total_sellers: 2, returned_seller_count: 0, platforms: ["etsy.com"], next_cursor: "next",
      sellers: [{ seller_key: "seller-one", seller_name: "Seller One", domain: "etsy.com",
        open_listing_count: 1, prior_enforcement_count: 0, returned_listing_count: 0,
        monitored_market_usd: 12, affected_ip_count: 1, ip_names: ["First IP"],
        latest_found_at: "2026-09-11T12:00:00Z" }],
    });
    if (url.pathname === "/api/monitoring/sellers/seller-one") return Response.json({
      findings: [finding], ips: [], next_cursor: null,
    });
    if (url.pathname === "/api/monitoring/findings/finding-one") return Response.json({ finding });
    return new Promise<Response>(() => {});
  }) as typeof fetch;
  const container = document.createElement("div");
  container.className = "app-shell";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <MemoryRouter initialEntries={[`/monitoring/sellers${query}`]}>
      <AuthProvider><ActiveIpProvider><RouteProbe /><Sellers /></ActiveIpProvider></AuthProvider>
    </MemoryRouter>,
  ));
  const click = async (selector: string) => {
    await act(async () => container.querySelector<HTMLButtonElement>(selector)!.click());
  };
  const history = async (label: string) => {
    await act(async () => [...container.querySelectorAll("button")].find((button) => button.textContent === label)!.click());
  };
  const params = () => new URL(container.querySelector("output")!.textContent!, window.location.origin).searchParams;
  const panel = () => container.querySelector('[aria-label="Finding details"]');
  return { container, requests, click, history, params, panel };
}

test("opening a listing from Sellers updates the URL, preserves filters, and follows history", async () => {
  const { click, params, panel, history } = await setup();
  await click('[aria-label="Expand listings from Seller One"]');
  await click(".seller-item-title");
  expect(Object.fromEntries(params())).toEqual({ scope: "all", platform: "etsy.com", seller: "seller-one", finding: "finding-one" });
  expect(panel()?.textContent).toContain("Shared listing");
  await history("Back");
  expect(params().has("finding")).toBe(false);
  expect(panel()).toBeNull();
  await history("Forward");
  expect(panel()?.textContent).toContain("Shared listing");
  await click('[aria-label="Close finding details"]');
  expect(Object.fromEntries(params())).toEqual({ scope: "all", platform: "etsy.com", seller: "seller-one" });
  expect(panel()).toBeNull();
  await click('[aria-label="Collapse listings from Seller One"]');
  expect(Object.fromEntries(params())).toEqual({ scope: "all", platform: "etsy.com" });
  expect(panel()).toBeNull();
});

test("a shared Sellers URL expands its seller and opens the task on a fresh mount", async () => {
  const { container, panel, click, params } = await setup("?scope=all&seller=seller-one&finding=finding-one");
  expect(container.querySelector('[aria-label="Collapse listings from Seller One"]')).not.toBeNull();
  expect(panel()?.textContent).toContain("Shared listing");
  expect(container.querySelectorAll('[aria-label="Finding details"]')).toHaveLength(1);
  await click('[aria-label="Collapse listings from Seller One"]');
  expect(Object.fromEntries(params())).toEqual({ scope: "all" });
  expect(panel()).toBeNull();
});

test("a shared task opens even when its seller is outside the loaded page", async () => {
  const { panel, requests, click, params } = await setup("?scope=all&seller=seller-on-later-page&finding=finding-one");
  expect(panel()?.textContent).toContain("Shared listing");
  expect(requests.some((url) => url.pathname === "/api/monitoring/findings/finding-one")).toBe(true);
  await click('[aria-label="Close finding details"]');
  expect(Object.fromEntries(params())).toEqual({ scope: "all" });
  expect(panel()).toBeNull();
});

test.each(["", "?ip_id=ip-one&platform=etsy.com"])("closing restores the original URL without task-only IP context: %s", async (query) => {
  const { history, params, click, panel } = await setup(query);
  await history("Open scoped task");
  expect(params().get("ip_id")).toBe("ip-one");
  await click('[aria-label="Close finding details"]');
  expect(params().get("seller")).toBe("seller-one");
  await click('[aria-label="Collapse listings from Seller One"]');
  expect(params().toString()).toBe(new URLSearchParams(query).toString());
  expect(panel()).toBeNull();
});

test("a seller-only URL restores expansion and collapsing clears the seller ID", async () => {
  const { container, params, panel, click } = await setup("?scope=all&seller=seller-one");
  expect(container.querySelector('[aria-label="Collapse listings from Seller One"]')).not.toBeNull();
  expect(panel()).toBeNull();
  await click('[aria-label="Collapse listings from Seller One"]');
  expect(Object.fromEntries(params())).toEqual({ scope: "all" });
  expect(container.querySelector('[aria-label="Expand listings from Seller One"]')).not.toBeNull();
});
