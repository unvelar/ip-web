import { afterEach, expect, test } from "bun:test";
import { loadTaskProductIdentities } from "../src/hooks/useTaskProductIdentities";
import {
  groupMonitoringFindings,
  hasProductGrouping,
} from "../src/lib/monitoringGrouping";
import type { TaskSummary } from "../src/api/taskQueue";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const ref = (id: string) => ({
  result_id: id,
  case_id: `case-${id}`,
  ip_id: "ip-one",
});
const product = {
  canonical_product_id: "product-one",
  display_name: "Product one",
};
const finding = (id: string, identity: unknown = product, ipId = "ip-one") => ({
  result_id: id,
  case_id: `case-${id}`,
  ip_id: ipId,
  product_identity: identity,
});
const response = (findings: object[], next_cursor: string | null = null) =>
  new Response(JSON.stringify({ findings, next_cursor }), {
    headers: { "Content-Type": "application/json" },
  });

test("identity reads are batched by exact case IDs and brand, with no facets or mutations", async () => {
  let requests = 0;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    requests++;
    expect(init?.method ?? "GET").toBe("GET");
    const url = new URL(String(input), "http://localhost");
    expect(url.searchParams.get("ip_id")).toBe("ip-one");
    expect(url.searchParams.get("case_ids")).toBe("case-one,case-two");
    expect(url.searchParams.get("include_product_identity")).toBe("true");
    expect(url.searchParams.get("include_facets")).toBe("false");
    expect(url.searchParams.get("show_dismissed")).toBe("true");
    return response([finding("one"), finding("two")], "unnecessary-next-page");
  }) as typeof fetch;
  const identities = await loadTaskProductIdentities(
    "ip-one",
    [ref("one"), ref("two")],
    new AbortController().signal,
  );
  expect(identities).toEqual({ one: product, two: product });
  expect(requests).toBe(1);
});

test("batching respects the API's 100-case cap and preserves each task mapping", async () => {
  const sizes: number[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const ids = new URL(String(input), "http://localhost").searchParams
      .get("case_ids")!
      .split(",");
    sizes.push(ids.length);
    return response(ids.map((id) => finding(id.slice(5))));
  }) as typeof fetch;
  const refs = Array.from({ length: 101 }, (_, n) => ref(String(n)));
  const identities = await loadTaskProductIdentities(
    "ip-one",
    refs,
    new AbortController().signal,
  );
  expect(sizes).toEqual([100, 1]);
  expect(Object.keys(identities)).toHaveLength(101);
});

test("missing identity stays unavailable while an explicitly unmatched task stays null", async () => {
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) =>
    init?.method === "POST"
      ? response([])
      : response([
          { result_id: "one", case_id: "case-one", ip_id: "ip-one" },
          finding("two", null),
        ])) as typeof fetch;
  const identities = await loadTaskProductIdentities(
    "ip-one",
    [ref("one"), ref("two"), { result_id: "no-case", case_id: null }],
    new AbortController().signal,
  );
  const row = {
    result_id: "one",
    ip_id: "ip-one",
    product_identity: identities.one,
  } as TaskSummary;
  expect(hasProductGrouping([row])).toBe(false);
  expect(groupMonitoringFindings([row], "product")).toEqual([]);
  expect(identities.two).toBeNull();
  expect(identities["no-case"]).toBeUndefined();
});

test("identity hydration rejects another brand or a case outside this page", async () => {
  globalThis.fetch = (async () => response([finding("other")])) as typeof fetch;
  await expect(
    loadTaskProductIdentities(
      "ip-one",
      [ref("one")],
      new AbortController().signal,
    ),
  ).rejects.toThrow("does not belong");
  globalThis.fetch = (async () =>
    response([finding("one", null, "ip-two")])) as typeof fetch;
  await expect(
    loadTaskProductIdentities(
      "ip-one",
      [ref("one")],
      new AbortController().signal,
    ),
  ).rejects.toThrow("does not belong");
});

test("leaving the page aborts before another batch can be dispatched", async () => {
  const controller = new AbortController();
  let requested = 0;
  globalThis.fetch = (async () => {
    requested++;
    controller.abort();
    return response([]);
  }) as typeof fetch;
  await expect(
    loadTaskProductIdentities(
      "ip-one",
      Array.from({ length: 101 }, (_, n) => ref(String(n))),
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(requested).toBe(1);
});

test("a missing case can paginate, but a repeated cursor cannot loop indefinitely", async () => {
  let requested = 0;
  globalThis.fetch = (async () =>
    ++requested === 1
      ? response([finding("one")], "next")
      : response([finding("two")])) as typeof fetch;
  expect(
    await loadTaskProductIdentities(
      "ip-one",
      [ref("one"), ref("two")],
      new AbortController().signal,
    ),
  ).toEqual({ one: product, two: product });
  globalThis.fetch = (async () => response([], "same-cursor")) as typeof fetch;
  await expect(
    loadTaskProductIdentities(
      "ip-one",
      [ref("one")],
      new AbortController().signal,
    ),
  ).rejects.toThrow("could not complete");
});

test("a brand scope can contain task IPs without replacing their own product identity scope", async () => {
  globalThis.fetch = (async () =>
    response([finding("one", product, "child-ip")])) as typeof fetch;
  const identities = await loadTaskProductIdentities(
    "parent-brand-ip",
    [{ ...ref("one"), ip_id: "child-ip" }],
    new AbortController().signal,
  );
  expect(identities.one).toEqual(product);
});

test("queued cases omitted by the ordinary feed are resolved by exact case with product projection", async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input), "http://localhost");
    requested.push(url.pathname);
    if (url.pathname.endsWith("/case/case-one")) {
      expect(url.searchParams.get("include_product_identity")).toBe("true");
      return new Response(JSON.stringify({ finding: finding("one") }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return response([]);
  }) as typeof fetch;
  expect(
    await loadTaskProductIdentities(
      "ip-one",
      [ref("one")],
      new AbortController().signal,
    ),
  ).toEqual({ one: product });
  expect(requested).toEqual([
    "/api/monitoring/findings",
    "/api/monitoring/findings/case/case-one",
  ]);
});

test("queue summaries missing case scope hydrate only their own detail IDs", async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = new URL(String(input), "http://localhost");
    requested.push(url.pathname);
    if (init?.method === "POST") {
      expect(JSON.parse(String(init.body))).toEqual({ ids: ["one"] });
      return response([finding("one")]);
    }
    return response([finding("one")]);
  }) as typeof fetch;
  expect(
    await loadTaskProductIdentities(
      "ip-one",
      [{ result_id: "one", case_id: null }],
      new AbortController().signal,
    ),
  ).toEqual({ one: product });
  expect(requested).toEqual([
    "/api/monitoring/tasks/details",
    "/api/monitoring/findings",
  ]);
});
