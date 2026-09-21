import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductFilterPicker, type ProductFilterSelection } from "../src/components/monitoring/board/ProductFilterPicker";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

async function setup() {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const requests: { url: URL; signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = ((url, options) => new Promise<Response>((resolve) => {
    requests.push({ url: new URL(String(url), window.location.origin), signal: options?.signal as AbortSignal, resolve });
  })) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let selection: ProductFilterSelection = { catalog_product_id: null, product_group_id: null };
  let ipId: string | null = "ip-one";
  const render = () => root?.render(<ProductFilterPicker ipId={ipId}
    productId={selection.catalog_product_id} groupId={selection.product_group_id}
    onChange={(next) => { selection = next; render(); }} />);
  await act(async () => render());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  const button = (text: string) => [...container.querySelectorAll("button")].find((item) => item.textContent?.startsWith(text))!;
  const respond = async (index: number, names: string[], cursor: string | null = null) => {
    await act(async () => requests[index].resolve(Response.json({
      scope: { profile_count: names.length },
      groups: names.map((name) => ({
        id: `group-${name}`, canonical_product_id: `product-${name}`,
        display_name: name, catalog_display_name: name, member_count: 5,
        members: [{ id: `image-${name}`, image_url: `https://images.example/${name}.jpg` }],
      })),
      group_count: names.length, ungrouped_count: 0, next_cursor: cursor, catalog_categories: [],
    })));
  };
  return { container, requests, respond, button, selection: () => selection,
    setIp: async (next: string | null) => { ipId = next; await act(async () => render());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); },
    click: async (text: string) => { await act(async () => button(text).click());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); },
  };
}

test("product picker uses canonical product identity, visual group identity, and a clear selection", async () => {
  const ui = await setup();
  expect(Object.fromEntries(ui.requests[0].url.searchParams)).toMatchObject({
    relationship: "same", view: "all", limit: "20", catalog_scope: "catalog", include_ungrouped: "false",
  });
  await ui.respond(0, ["Cleanser"]);
  expect(ui.container.querySelector("img")?.getAttribute("src")).toBe("https://images.example/Cleanser.jpg");
  await ui.click("Cleanser");
  expect(ui.selection()).toEqual({ catalog_product_id: "product-Cleanser", product_group_id: null, label: "Cleanser" });
  await ui.click("Visual groups");
  expect(ui.requests[1].url.searchParams.get("relationship")).toBe("visual");
  await ui.respond(1, ["Blue bottles"]);
  await ui.click("Blue bottles");
  expect(ui.selection()).toEqual({ catalog_product_id: null, product_group_id: "group-Blue bottles", label: "Blue bottles" });
  await ui.click("All products and groups");
  expect(ui.selection()).toEqual({ catalog_product_id: null, product_group_id: null });
});

test("pagination from an old IP is aborted and cannot populate the new product picker", async () => {
  const ui = await setup();
  await ui.respond(0, ["First"], "page-two");
  await ui.click("Load more");
  expect(ui.requests[1].url.searchParams.get("cursor")).toBe("page-two");
  await ui.setIp("ip-two");
  expect(ui.requests[1].signal.aborted).toBe(true);
  await ui.respond(2, ["Current"]);
  await ui.respond(1, ["Stale"]);
  expect(ui.container.textContent).toContain("Current");
  expect(ui.container.textContent).not.toContain("Stale");
  expect(ui.container.textContent).not.toContain("First");
});

test("broken thumbnails have a quiet fallback, and no IP does not fetch products", async () => {
  const ui = await setup();
  await ui.respond(0, ["Cleanser"]);
  await act(async () => ui.container.querySelector("img")!.dispatchEvent(new window.Event("error")));
  expect(ui.container.querySelector("img")).toBeNull();
  expect(ui.container.textContent).toContain("Cleanser");
  await ui.setIp(null);
  expect(ui.requests).toHaveLength(1);
  expect(ui.container.textContent).toContain("Select an IP");
});
