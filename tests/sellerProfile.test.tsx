import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import SellerProfile from "../src/pages/SellerProfile";

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
  return <><output>{location.pathname}{location.search}</output><button onClick={() => navigate(-1)}>Back</button></>;
}

async function setup(query = "") {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    Event: window.Event, MouseEvent: window.MouseEvent, PointerEvent: window.PointerEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const requests: { url: URL; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = ((url, options) => new Promise<Response>((resolve) => {
    requests.push({ url: new URL(String(url), window.location.origin), signal: options?.signal as AbortSignal, resolve });
  })) as typeof fetch;
  const container = document.createElement("div");
  container.className = "app-shell";
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(
    <MemoryRouter initialEntries={[`/monitoring/sellers/seller-one${query}`]}>
      <AuthProvider>
      <RouteProbe />
      <Routes>
        <Route path="/monitoring/sellers/:sellerKey" element={<SellerProfile />} />
      </Routes>
      </AuthProvider>
    </MemoryRouter>,
  ));
  const respond = async (index: number, names: string[], cursor: string | null = null) => {
    await act(async () => requests[index].resolve(Response.json({
      seller: { key: "seller-one", name: "Seller One", domain: "etsy.com", sales: null, rating: null },
      summary: { monitored_listings: 12, available_listings: 10, blocked_listings: 1, unknown_availability: 1,
        monitored_market_usd: 144, affected_ip_count: 2, prior_enforcement_count: 3, returned_listing_count: 0 },
      ips: [{ ip_id: "ip-one", ip_name: "First IP", findings: 10 }, { ip_id: "ip-two", ip_name: "Second IP", findings: 2 }],
      findings: names.map((name) => ({ result_id: name, case_id: `case-${name}`, listing_title: name,
        page_url: `https://example.org/${name}`, found_at: "2026-09-11T12:00:00Z", images: [],
        review_status: "pending", availability: "live", price_value_usd: 12, ip_id: "ip-one" })),
      next_cursor: cursor,
    })));
  };
  const select = async (label: string, value: string) => {
    await act(async () => {
      const element = container.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
      element.value = value;
      element.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
  return { container, requests, respond, select, button };
}

test("profile shares one listing request, keeps URL filters and IP scope, and restores browser history", async () => {
  const { container, requests, respond, select, button } = await setup("?status=all&sort=risk_desc&availability=blocked&ip_id=ip-one");
  expect(requests).toHaveLength(1);
  expect(Object.fromEntries(requests[0].url.searchParams)).toMatchObject({ status: "all", sort: "risk_desc", availability: "blocked", ip_id: "ip-one" });
  await respond(0, ["First"]);
  expect(container.querySelector("h1")?.textContent).toBe("Seller One");
  expect(container.querySelector('button.seller-item-title')?.getAttribute("aria-haspopup")).toBe("dialog");
  expect(container.querySelector('[aria-label="Select all loaded listings"]')).not.toBeNull();
  await select("Listing status", "dismissed");
  expect(container.querySelector("output")?.textContent).toContain("status=dismissed");
  expect(requests[1].url.searchParams.get("ip_id")).toBe("ip-one");
  await respond(1, ["Closed"]);
  await act(async () => button("Back").click());
  expect(requests[2].url.searchParams.get("status")).toBe("all");
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Listing status"]')?.value).toBe("all");
  await respond(2, ["Restored"]);
  await select("Listing IP", "");
  expect(requests[3].url.searchParams.has("ip_id")).toBe(false);
  await respond(3, ["All IPs"]);
  await select("Listing IP", "ip-two");
  expect(requests[4].url.searchParams.get("ip_id")).toBe("ip-two");
  expect(container.querySelector("output")?.textContent).toContain("ip_id=ip-two");
});

test("profile discards pagination responses from a previous filter", async () => {
  const { container, requests, respond, select, button } = await setup();
  await respond(0, ["First"], "next-page");
  await act(async () => button("Load more listings").click());
  expect(requests[1].url.searchParams.get("cursor")).toBe("next-page");
  await select("Listing availability", "unavailable");
  expect(requests[1].signal.aborted).toBe(true);
  await respond(2, ["Unavailable"]);
  await respond(1, ["Stale"]);
  expect(container.textContent).toContain("Unavailable");
  expect(container.textContent).not.toContain("Stale");
  expect(container.querySelectorAll(".seller-item")).toHaveLength(1);
});

test("seller listing clicks open and close the reusable inspector without leaving the profile", async () => {
  const { container, respond } = await setup("?status=all&ip_id=ip-one");
  await respond(0, ["First"]);
  await act(async () => container.querySelector<HTMLButtonElement>("button.seller-item-title")!.click());
  expect(container.querySelector('[role="dialog"][aria-label="Finding details"]')).not.toBeNull();
  expect(container.querySelector('.sellers-page [role="dialog"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?status=all&ip_id=ip-one&finding=First");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Close finding details"]')!.click());
  expect(document.querySelector('[aria-label="Finding details"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?status=all&ip_id=ip-one");
});

test("bookmarked findings open in place even outside the loaded seller page", async () => {
  const { container, requests, respond } = await setup("?finding=finding-one&status=all");
  await respond(0, ["Another"]);
  expect(requests[1].url.pathname).toBe("/api/monitoring/findings/finding-one");
  expect(document.querySelector('[aria-label="Finding details"]')?.textContent).toContain("Loading listing");
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?finding=finding-one&status=all");
  await act(async () => requests[1].resolve(Response.json({ finding: {
    result_id: "finding-one", listing_title: "Bookmarked listing", review_status: "pending", domain: "etsy.com",
    page_url: "https://example.org/listing", images: [], found_at: "2026-09-11T12:00:00Z", ip_id: "ip-one",
  } })));
  expect(document.querySelector('[aria-label="Finding details"]')?.textContent).toContain("Bookmarked listing");
});

test("missing seller profiles show the error and can retry through the shared workspace", async () => {
  const { container, requests, respond, button } = await setup();
  await act(async () => requests[0].resolve(Response.json({ error: "Not found" }, { status: 404 })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("This seller profile could not be found.");
  await act(async () => button("Try again").click());
  await respond(1, []);
  expect(container.querySelector("h1")?.textContent).toBe("Seller One");
  expect(container.textContent).toContain("No listings match these filters.");
});

test("a decision in the inspector refreshes seller listings without changing route or filters", async () => {
  const { container, requests, respond } = await setup("?ip_id=ip-one");
  await respond(0, ["First"]);
  await act(async () => container.querySelector<HTMLButtonElement>("button.seller-item-title")!.click());
  const panel = document.querySelector('[aria-label="Finding details"]')!;
  const dismiss = [...panel.querySelectorAll("button")].find((button) => button.textContent?.includes("Different product"))!;
  await act(async () => dismiss.click());
  const mutation = requests.find((request) => request.url.pathname.endsWith("/dismiss"))!;
  expect(mutation).toBeDefined();
  await act(async () => mutation.resolve(Response.json({ ok: true })));
  expect(document.querySelector('[aria-label="Finding details"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?ip_id=ip-one");
  const refreshIndex = requests.findLastIndex((request) => request.url.pathname.includes("/monitoring/sellers/"));
  expect(refreshIndex).toBeGreaterThan(0);
  expect(requests[refreshIndex].url.searchParams.get("ip_id")).toBe("ip-one");
  await respond(refreshIndex, []);
  expect(container.querySelectorAll(".seller-item")).toHaveLength(0);
});

test("outside clicks dismiss the inspector, but inside clicks and portaled confirmations do not", async () => {
  const { container, respond } = await setup("?status=all&ip_id=ip-one");
  await respond(0, ["First"]);
  await act(async () => container.querySelector<HTMLButtonElement>("button.seller-item-title")!.click());
  const panel = document.querySelector('[aria-label="Finding details"]')!;
  await act(async () => panel.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 })));
  expect(document.querySelector('[aria-label="Finding details"]')).toBe(panel);

  const confirmation = document.createElement("div");
  confirmation.setAttribute("aria-modal", "true");
  document.body.append(confirmation);
  await act(async () => confirmation.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 })));
  expect(document.querySelector('[aria-label="Finding details"]')).toBe(panel);
  confirmation.remove();

  await act(async () => container.querySelector("h1")!.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 })));
  expect(document.querySelector('[aria-label="Finding details"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?status=all&ip_id=ip-one");
});

test("outside clicks also close a bookmarked finding while it is loading", async () => {
  const { container, respond } = await setup("?finding=not-loaded&status=all");
  await respond(0, []);
  expect(document.querySelector('[aria-label="Finding details"]')).not.toBeNull();
  await act(async () => container.querySelector("h1")!.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0 })));
  expect(document.querySelector('[aria-label="Finding details"]')).toBeNull();
  expect(container.querySelector("output")?.textContent).toBe("/monitoring/sellers/seller-one?status=all");
});
