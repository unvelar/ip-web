import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MonitoringSources } from "../src/components/monitoring/MonitoringSources";
import { PlatformsPanel } from "../src/components/monitoring/PlatformsPanel";
import { MemoryRouter } from "react-router-dom";
import type { MonitoredDomain } from "../src/api";
import { getWebsiteCatalog, parseWebsiteCatalog, type WebsiteActivity } from "../src/api/websiteCatalog";
import { legacySourceOptions, websiteHost, websiteOptions } from "../src/lib/websiteCatalog";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

const websites: WebsiteActivity[] = [
  { key: "domain:new-market.shop", kind: "domain", domain: "new-market.shop", name: "New Marketplace",
    value: "new-market.shop", search_url_template: null, findings: 90, monitored_ips: 5, other_brands: 3 },
  ...legacySourceOptions().map(source => ({ ...source, findings: source.domain === "facebook.com" ? 20 : 0,
    monitored_ips: 2, other_brands: 1 })),
];

test("catalog distinguishes marketplaces, search engines and domain patterns", () => {
  const options = websiteOptions(websites, ["*.shop"]);
  expect(options.filter(row => row.domain === "facebook.com")).toHaveLength(1);
  expect(options.find(row => row.key === "search:google")?.name).toBe("Google");
  expect(options.find(row => row.key === "search:bing")?.name).toBe("Bing");
  expect(options.find(row => row.key === "pattern:*.myshopify.com")?.kind).toBe("pattern");
  expect(options.find(row => row.key === "domain:google.com")?.name).toBe("Google Shopping");
  expect(options.find(row => row.domain === "facebook.com")?.value).toBe("facebook.com/marketplace");
  expect(options.find(row => row.domain === "new-market.shop")?.activity?.findings).toBe(90);
  expect(options.some(row => row.kind === "pattern" && row.value === "*.shop")).toBe(true);
  expect(options.find(row => row.domain === "new-market.shop")?.name).toBe("New Marketplace");
  expect(websiteOptions([websites[0]])).toHaveLength(1);
  expect(websiteHost("https://www.Etsy.com/search?q=thing")).toBe("etsy.com");
  expect(websiteHost("es.aliexpress.com")).toBe("es.aliexpress.com");
});

test("catalog boundary rejects invalid counts and scopes", () => {
  expect(() => parseWebsiteCatalog({ scope: "all_brands", websites: [{ ...websites[0], findings: -1 }] })).toThrow();
  expect(() => parseWebsiteCatalog({ scope: "global", websites })).toThrow();
  expect(() => parseWebsiteCatalog({ scope: "workspace", websites: [{ ...websites[0], other_brands: "3" }] })).toThrow();
});

test("older API falls back to explicitly workspace-scoped activity with distinct IP counts", async () => {
  globalThis.fetch = (async (url) => {
    if (String(url).endsWith("website-catalog")) return Response.json({}, { status: 404 });
    if (String(url).endsWith("/domains")) return Response.json({ domains: [
      { domain: "www.market.shop", source_type: "domain", ip_catalog_id: "ip1", enabled: true },
      { domain: "market.shop", source_type: "domain", ip_catalog_id: "ip1", enabled: true },
      { domain: "paused.shop", source_type: "domain", ip_catalog_id: "ip2", enabled: false },
      { domain: "__open_web__", source_type: "web_search", ip_catalog_id: "ip1", enabled: true },
    ] });
    return Response.json({ platforms: [{ domain: "market.shop", findings: 24 }, { domain: "found.shop", findings: 9 }] });
  }) as typeof fetch;
  const catalog = await getWebsiteCatalog();
  expect(catalog.scope).toBe("workspace");
  expect(catalog.websites.find(row => row.domain === "market.shop")).toMatchObject({ kind: "domain", domain: "market.shop", findings: 24, monitored_ips: 1, other_brands: null });
  expect(catalog.websites.some(row => row.domain === "__open_web__")).toBe(false);
  expect(catalog.websites.some(row => row.domain === "found.shop")).toBe(false);
});

function monitor(domain: string, enabled = true): MonitoredDomain {
  return { id: domain, tenant_id: "tenant", domain, source_type: "domain", display_name: null,
    source_config: {}, ip_catalog_id: "ip", ip_name: "Example", ip_keywords: ["Example"], recipe: {},
    recipe_updated_at: null, last_run_at: null, enabled, zero_yield_streak: 0, country: null,
    created_at: "2026-09-22", setup_status: "ready" };
}

function mount() {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  return container;
}

function button(container: Element, label: string) {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].find(button =>
    button.getAttribute("aria-label") === label || button.textContent?.trim() === label)!;
}

test("one source list combines configured sources with discovery; web settings never add a direct domain", async () => {
  globalThis.fetch = (async () => Response.json({ scope: "all_brands", websites })) as typeof fetch;
  const container = mount();
  const selected: string[] = [];
  const patterns: string[] = [];
  await act(async () => root?.render(createElement(MonitoringSources, {
    platforms: [monitor("www.facebook.com"), monitor("private.shop", false)], patterns: [],
    monitoringOn: true, hasKeywords: true, busy: null, loading: false,
    onAdd: source => selected.push(source.value), onPreparePattern: pattern => patterns.push(pattern),
    onToggle: () => {}, onRemove: () => {}, onRefresh: () => {}, onCountryChange: () => {},
    renderOpenWeb: () => createElement("div", {}, "Shared web search settings"), renderCustomSource: () => null,
  })));
  expect(container.querySelectorAll("ul")).toHaveLength(1);
  expect(container.querySelector("table")).toBeNull();
  expect(container.querySelector("li")?.textContent).toContain("Facebook Marketplace");
  expect(button(container, "Add Facebook Marketplace")).toBeUndefined();
  expect(button(container, "Settings for private.shop")).toBeDefined();
  await act(async () => button(container, "Add New Marketplace").click());
  expect(selected).toEqual(["new-market.shop"]);
  await act(async () => button(container, "Add Google").click());
  expect(container.textContent).toContain("Shared web search settings");
  await act(async () => button(container, "Add Shopify").click());
  expect(patterns).toEqual(["*.myshopify.com"]);
  expect(selected).toEqual(["new-market.shop"]);
  await act(async () => button(container, "Settings for private.shop").click());
  expect(button(container, "Resume")).toBeDefined();
  const available = [...container.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent?.startsWith("Available"))!;
  await act(async () => available.click());
  expect(container.querySelector("ul")?.textContent).not.toContain("Facebook Marketplace");
  expect(container.querySelector("ul")?.textContent).not.toContain("private.shop");
});

test("Add saves the catalog target and template, then the same row becomes active; pause updates its state", async () => {
  const container = mount();
  const platforms: MonitoredDomain[] = [];
  const writes: unknown[] = [];
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("website-catalog")) return Response.json({ scope: "workspace", websites });
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      platforms.push(monitor("google.com"));
      return Response.json({ platform: platforms[0], jobs_enqueued: 1 });
    }
    if (init?.method === "PATCH") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      platforms[0] = { ...platforms[0], enabled: body.enabled };
      return Response.json({ platform: platforms[0] });
    }
    return Response.json({ platforms });
  }) as typeof fetch;
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(PlatformsPanel, {
    ipId: "ip", keywords: ["Example"], monitoringFrequency: "weekly",
  }))));
  await act(async () => button(container, "Add Google Shopping").click());
  expect(writes).toEqual([{ domain: "google.com/shopping", country: null, search_url_template: "https://www.google.com/search?tbm=shop&q={q}" }]);
  expect(button(container, "Add Google Shopping")).toBeUndefined();
  expect(button(container, "Settings for Google Shopping").closest("li")?.textContent).toContain("Active");
  await act(async () => button(container, "Settings for Google Shopping").click());
  await act(async () => button(container, "Pause").click());
  expect(writes.at(-1)).toEqual({ enabled: false });
  expect(button(container, "Settings for Google Shopping").closest("li")?.textContent).toContain("Paused");
  expect(button(container, "Resume")).toBeDefined();
});

test("a failed add keeps the source available and reports the failure", async () => {
  const container = mount();
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith("website-catalog")) return Response.json({ scope: "workspace", websites });
    if (init?.method === "POST") return Response.json({ error: "Source could not be added" }, { status: 503 });
    return Response.json({ platforms: [] });
  }) as typeof fetch;
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(PlatformsPanel, {
    ipId: "ip", keywords: ["Example"], monitoringFrequency: "weekly",
  }))));
  await act(async () => button(container, "Add New Marketplace").click());
  expect(button(container, "Add New Marketplace").disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Source could not be added");
});
