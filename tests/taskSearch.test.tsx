import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TaskSearch from "../src/components/TaskSearch";
import type { TaskQueueQuery } from "../src/api/taskQueue";

let root: Root | undefined;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});
async function setup(query = "status=pending") {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const requests: Record<string, unknown>[] = [];
  const started: string[] = [];
  const searching: boolean[] = [];
  const cancelled: string[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    if (init?.method === "POST") requests.push(JSON.parse(String(init.body)));
    if (init?.method === "DELETE") cancelled.push(String(url));
    return new Response(
      JSON.stringify({
        id: "search-one",
        state: "pending",
        scanned: 0,
        matched: 0,
        options: [],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  root = createRoot(container);
  let status = (new URLSearchParams(query).get("status") ??
    "pending") as TaskQueueQuery["status"];
  const render = () =>
    root!.render(
      <TaskSearch
        ipId="ip-one"
        product="product-one"
        members={[]}
        status={status}
        params={new URLSearchParams(query)}
        onStart={(result) => {
          if (result.id) started.push(result.id);
        }}
        onError={(error) => {
          if (error) throw new Error(error);
        }}
        onSearching={(value) => searching.push(value)}
      />,
    );
  await act(async () => render());
  const changeStatus = async (next: TaskQueueQuery["status"]) => {
    status = next;
    await act(async () => render());
  };
  const button = (name: string) =>
    [...container.querySelectorAll("button")].find(
      (el) =>
        el.textContent?.trim() === name ||
        el.getAttribute("aria-label") === name,
    )!;
  const click = async (name: string) => {
    await act(async () => button(name).click());
  };
  const setInput = async (label: string, value: string) => {
    const input = [...container.querySelectorAll("label")]
      .find((el) => el.textContent?.startsWith(label))!
      .querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const submit = async () => {
    await act(async () => {
      container
        .querySelector("form")!
        .dispatchEvent(
          new window.Event("submit", { bubbles: true, cancelable: true }),
        );
    });
  };
  return {
    container,
    requests,
    started,
    searching,
    cancelled,
    button,
    click,
    setInput,
    submit,
    changeStatus,
    window,
    settleSearch: () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); }),
  };
}

test("filter drafts cancel without applying or starting a search", async () => {
  const ui = await setup();
  await ui.click("Add filter");
  await ui.click("Country");
  await ui.setInput("Country", "Spain");
  await ui.click("Cancel");
  expect(ui.container.querySelector(".task-search-chip")).toBeNull();
  expect(ui.container.textContent).not.toContain("Spain");
  expect(ui.requests).toHaveLength(0);
  expect(ui.container.ownerDocument.activeElement).toBe(
    ui.button("Add filter"),
  );
});

test("marketplace country and seller origin are independent filters", async () => {
  const ui = await setup();
  await ui.click("Add filter");
  await ui.click("Country");
  expect(ui.container.querySelector('[role="dialog"]')?.textContent).toContain("marketplace");
  await ui.setInput("Country", "Spain");
  await ui.click("Apply filter");
  await ui.click("Add filter");
  await ui.click("Seller Origin");
  await ui.setInput("Seller Origin", "China");
  await ui.click("Apply filter");
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({ country: "Spain", seller_origin: "China" });
  await ui.click("Remove country filter");
  await ui.submit();
  expect(ui.requests[1]).not.toHaveProperty("country");
  expect(ui.requests[1]).toHaveProperty("seller_origin", "China");
  await ui.click("Clear filters");
  await ui.submit();
  expect(ui.requests[2]).not.toHaveProperty("seller_origin");
});

test("applied zero price survives editing, and removing a filter omits it from the search request", async () => {
  const ui = await setup();
  await ui.click("Add filter");
  await ui.click("Price");
  await ui.setInput("Min (USD)", "0");
  await ui.setInput("Max (USD)", "10");
  await ui.click("Apply filter");
  await ui.click("Price: $0 – $10");
  await ui.setInput("Min (USD)", "15");
  expect(ui.button("Apply filter").disabled).toBe(true);
  await ui.click("Cancel");
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({
    ip_id: "ip-one",
    catalog_product_id: "product-one",
    status: "pending",
    min_price_usd: 0,
    max_price_usd: 10,
    history: false,
  });
  expect(
    new Date(String(ui.requests[0].to)).getTime() -
      new Date(String(ui.requests[0].from)).getTime(),
  ).toBe(30 * 86400_000);
  await ui.click("Remove price filter");
  await ui.submit();
  expect(ui.requests[1]).not.toHaveProperty("min_price_usd");
  expect(ui.requests[1]).not.toHaveProperty("max_price_usd");
});

test("Enter in a filter editor applies the draft and automatically searches", async () => {
  const ui = await setup();
  await ui.click("Add filter");
  await ui.click("Country");
  await ui.setInput("Country", "Spain");
  await ui.submit();
  expect(ui.button("Country: Spain")).toBeDefined();
  expect(ui.requests).toHaveLength(0);
  expect(ui.container.querySelector('[role="dialog"]')).toBeNull();
  expect(ui.searching.at(-1)).toBe(true);
  await ui.settleSearch();
  expect(ui.requests).toHaveLength(1);
  expect(ui.requests[0]).toMatchObject({ country: "Spain" });
  expect(ui.searching.at(-1)).toBe(false);
});

test("linked filters remain in the request and clear keeps search scope and dates", async () => {
  const ui = await setup(
    "status=dismissed&seller=LegacyShop&match_basis=both&min_price_usd=0&q=helmet",
  );
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({
    seller_name: "LegacyShop",
    evidence: "both",
    min_price_usd: 0,
    q: "helmet",
    status: "dismissed",
  });
  await ui.click("Clear filters");
  await ui.submit();
  expect(ui.requests[1]).toMatchObject({
    q: "helmet",
    ip_id: "ip-one",
    catalog_product_id: "product-one",
    status: "dismissed",
    from: ui.requests[0].from,
    to: ui.requests[0].to,
  });
  expect(ui.requests[1]).not.toHaveProperty("seller_name");
  expect(ui.requests[1]).not.toHaveProperty("evidence");
});

test("the queue's selected filter carries into search as the same identity", async () => {
  const ui = await setup("selector=seller&value=seller-one");
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({
    status: "pending",
    seller: "seller-one",
  });
  expect(ui.requests[0]).not.toHaveProperty("seller_name");
});

test("the merged search preserves staff-triage criteria and current suggestion choices", async () => {
  const ui = await setup("selector=suggestion&value=needs_triage");
  expect(ui.button("Suggested action: Staff triage")).toBeDefined();
  await ui.click("Suggested action: Staff triage");
  const choices = [...ui.container.querySelectorAll("option")].map(
    (option) => option.textContent,
  );
  expect(choices).toContain("No suggestion yet");
  expect(choices).toContain("Staff triage");
  expect(choices).toContain("Legal review");
  await ui.click("Apply filter");
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({ candidate_outcome: "needs_triage" });
});

test("changing the primary status preserves optional filters and uses the new status for search", async () => {
  const ui = await setup("status=pending&country=Spain&seller_origin=China");
  await ui.changeStatus("review");
  expect(ui.button("Country: Spain")).toBeDefined();
  await ui.submit();
  expect(ui.requests[0]).toMatchObject({ status: "review", country: "Spain", seller_origin: "China" });
  await ui.click("Clear filters");
  await ui.submit();
  expect(ui.requests[1]).toMatchObject({ status: "review" });
  expect(ui.requests[1]).not.toHaveProperty("country");
  expect(ui.requests[1]).not.toHaveProperty("seller_origin");
  await ui.click("Add filter");
  expect(
    ui.container.querySelector('[role="dialog"]')?.textContent,
  ).not.toContain("Workflow");
  expect(
    ui.container.querySelector('[role="dialog"]')?.textContent,
  ).not.toContain("Status");
});

test("a delayed search response cannot restore a status the user has left", async () => {
  const ui = await setup();
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = (() =>
    new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })) as typeof fetch;
  await ui.submit();
  await ui.changeStatus("review");
  await act(async () => {
    resolveRequest(
      new Response(
        JSON.stringify({
          id: "old-status-search",
          state: "pending",
          scanned: 0,
          matched: 0,
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
  });
  expect(ui.started).toEqual([]);
});

test("rapid filter changes coalesce and automatically replace the previous search", async () => {
  const ui = await setup();
  await ui.settleSearch();
  expect(ui.requests).toHaveLength(0);
  await ui.submit();
  await ui.click("Add filter");
  await ui.click("Country");
  await ui.setInput("Country", "Spain");
  await ui.click("Apply filter");
  await ui.click("Remove country filter");
  await ui.settleSearch();
  expect(ui.requests).toHaveLength(2);
  expect(ui.requests[1]).not.toHaveProperty("country");
  expect(ui.cancelled).toHaveLength(1);
  expect(ui.cancelled[0]).toEndWith("/api/monitoring/tasks/searches/search-one");
});

test("a superseded response in the same scope is discarded and its job is cancelled", async () => {
  const ui = await setup();
  const fetch = globalThis.fetch;
  let resolveRequest!: (response: Response) => void;
  globalThis.fetch = ((url: unknown, init?: RequestInit) => init?.method === "POST"
    ? new Promise<Response>((resolve) => { resolveRequest = resolve; })
    : fetch(url as RequestInfo, init)) as typeof fetch;
  await ui.submit();
  await ui.click("Add filter");
  await ui.click("Country");
  await ui.setInput("Country", "Spain");
  await ui.click("Apply filter");
  await act(async () => {
    resolveRequest(new Response(JSON.stringify({ id: "stale-search", state: "running", scanned: 5, matched: 0 })));
  });
  expect(ui.started).toEqual([]);
  expect(ui.searching.at(-1)).toBe(true);
  expect(ui.cancelled[0]).toEndWith("/api/monitoring/tasks/searches/stale-search");
});

test("slow creates are serialized so the replacement starts after cancelling the stale job", async () => {
  const ui = await setup();
  const fetch = globalThis.fetch;
  let posts = 0;
  let resolveFirst!: (response: Response) => void;
  const order: string[] = [];
  globalThis.fetch = ((url: unknown, init?: RequestInit) => {
    order.push(init?.method ?? "GET");
    if (init?.method === "POST" && ++posts === 1)
      return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    return fetch(url as RequestInfo, init);
  }) as typeof fetch;
  await ui.submit();
  await ui.click("Add filter");
  await ui.click("Country");
  await ui.setInput("Country", "Spain");
  await ui.click("Apply filter");
  await ui.settleSearch();
  expect(posts).toBe(1);
  await act(async () => {
    resolveFirst(new Response(JSON.stringify({ id: "slow-search", state: "running", scanned: 0, matched: 0 })));
  });
  expect(order).toEqual(["POST", "DELETE", "POST"]);
  expect(ui.requests[0]).toMatchObject({ country: "Spain" });
  expect(ui.started).toEqual(["search-one"]);
});
