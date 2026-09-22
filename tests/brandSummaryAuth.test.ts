import { afterEach, expect, test } from "bun:test";
import { getPublicBrandSumup } from "../src/api/intakes";
import { getToken, setToken } from "../src/api/transport";

const originalFetch = globalThis.fetch;
const originalToken = getToken();
afterEach(() => {
  globalThis.fetch = originalFetch;
  setToken(originalToken);
});

test("summary requests send the browser session and never reuse a cached preview", async () => {
  setToken("admin-session-fixture");
  globalThis.fetch = (async (url, init) => {
    expect(String(url)).toEndWith("/api/brand-sumups/other-tenant/private-ip");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer admin-session-fixture");
    expect(init?.cache).toBe("no-store");
    return Response.json({ ip: { public_summary_enabled: false } });
  }) as typeof fetch;
  expect((await getPublicBrandSumup("other-tenant", "private-ip")).ip.public_summary_enabled).toBe(false);
});

test("signed-out visitors can still request public summaries without credentials", async () => {
  setToken(null);
  globalThis.fetch = (async (_url, init) => {
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
    return Response.json({ ip: { public_summary_enabled: true } });
  }) as typeof fetch;
  expect((await getPublicBrandSumup("tenant", "published-ip")).ip.public_summary_enabled).toBe(true);
});
