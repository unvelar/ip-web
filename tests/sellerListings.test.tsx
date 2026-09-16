import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { SellerListings } from "../src/components/monitoring/SellerListings";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

async function setup() {
  const window = new Window({ url: "http://localhost:5173/monitoring/sellers" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const requests: { url: URL; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = ((url, options) => new Promise<Response>((resolve) => {
    requests.push({ url: new URL(String(url), window.location.origin), signal: options?.signal as AbortSignal, resolve });
  })) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(SellerListings, {
    sellerKey: "seller/one", sellerName: "One", ipId: "ip-one", initialStatus: "open",
  }))));
  const button = (text: string) => Array.from(container.querySelectorAll("button")).find((element) => element.textContent === text)!;
  const respond = async (index: number, names: string[], cursor: string | null = null) => {
    await act(async () => requests[index].resolve(Response.json({
      findings: names.map((name) => ({
        result_id: name, listing_title: name, page_url: `https://example.org/${name}`,
        found_at: "2026-09-11T12:00:00Z", availability: "live", price_value_usd: 12,
        images: [], ip_id: "ip-one", ip_name: "Example",
      })), next_cursor: cursor,
    })));
  };
  return { container, requests, button, respond };
}

test("listing requests keep IP scope, abort on filter change, and ignore an older response", async () => {
  const { container, requests, button, respond } = await setup();
  expect(requests[0].url.pathname).toContain("seller%2Fone");
  expect(requests[0].url.searchParams.get("ip_id")).toBe("ip-one");
  expect(requests[0].url.searchParams.get("status")).toBe("open");
  await act(async () => button("Closed").click());
  expect(requests[0].signal.aborted).toBe(true);
  expect(requests[1].url.searchParams.get("status")).toBe("dismissed");
  await respond(1, ["Closed item"]);
  await respond(0, ["Stale open item"]);
  expect(container.textContent).toContain("Closed item");
  expect(container.textContent).not.toContain("Stale open item");
  expect(container.querySelector('a.seller-item-title')?.getAttribute("href")).toBe("/monitoring/tasks/Closed item");
});

test("pagination retains loaded items on failure and retries the same cursor", async () => {
  const { container, requests, button, respond } = await setup();
  await respond(0, ["First"], "next-page");
  await act(async () => button("Load more listings").click());
  expect(requests[1].url.searchParams.get("cursor")).toBe("next-page");
  await act(async () => requests[1].resolve(Response.json({ error: "Temporary failure" }, { status: 503 })));
  expect(container.textContent).toContain("First");
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => button("Try again").click());
  expect(requests[2].url.searchParams.get("cursor")).toBe("next-page");
  await respond(2, ["Second"]);
  expect(container.querySelectorAll('.seller-item')).toHaveLength(2);
  expect(container.textContent).toContain("2 listings");
  expect(container.querySelector('[role="alert"]')).toBeNull();
});

test("closing an expanded seller cancels its pending request", async () => {
  const { requests } = await setup();
  await act(async () => root?.unmount());
  root = undefined;
  expect(requests[0].signal.aborted).toBe(true);
});
