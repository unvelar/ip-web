import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { discoveryFixture, websitesFixture, runsFixture, runDetailFixture } from "./fixtures/websiteDiscovery";
import { CoverageBadge, DiscoveryRunEvidence } from "../src/features/adminMonitoring/DiscoveryRunEvidence";
import { WebsitePerformance, YieldComparison } from "../src/features/adminMonitoring/WebsitePerformance";

const happy = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, { window: happy, document: happy.document, navigator: happy.navigator,
  HTMLElement: happy.HTMLElement, Event: happy.Event, MouseEvent: happy.MouseEvent, Node: happy.Node, IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; document.body.replaceChildren(); globalThis.fetch = originalFetch; });

test("coverage stays unknown without evidence and active checkpoints do not claim a terminal budget stop", () => {
  const html = renderToStaticMarkup(<DiscoveryRunEvidence evidence={undefined} />);
  expect(html).toContain("Search completeness was not recorded");
  expect(html).not.toContain("Reached the observed end");
  expect(html).not.toContain(">0<");
  expect(renderToStaticMarkup(<CoverageBadge coverage={discoveryFixture.coverage} active />)).toContain("In progress");
  expect(renderToStaticMarkup(<DiscoveryRunEvidence evidence={discoveryFixture} active />)).not.toContain("Stopped at the listing limit");
});

test("yield comparisons require complete searches with the same source, keyword and recipe", () => {
  const current = { ...runsFixture.runs[0], discovery: { ...discoveryFixture, coverage: { ...discoveryFixture.coverage!, status: "complete" as const, stop_reason: "exhausted", unique_listings: 10 } } };
  const prior = { ...current, discovery: { ...current.discovery, coverage: { ...current.discovery.coverage, unique_listings: 100 } } };
  expect(renderToStaticMarkup(<YieldComparison run={current} previous={[prior]} />)).toContain("Yield drop");
  expect(renderToStaticMarkup(<YieldComparison run={runsFixture.runs[0]} previous={[prior]} />)).toBe("");
  expect(renderToStaticMarkup(<YieldComparison run={current} previous={[{ ...prior, keyword: "different" }]} />)).toBe("");
});

test("website to keyword to rejected-listing evidence is navigable without triggering work", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    const path = String(input); requests.push(path);
    const value = path.includes("/monitoring/runs/") ? runDetailFixture : path.includes("/shop.example/runs") ? runsFixture : websitesFixture;
    return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root!.render(<WebsitePerformance windowHours={24} asOf={websitesFixture.as_of} />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)); });
  const button = (name: string) => [...container.querySelectorAll("button")].find(b => b.textContent?.trim() === name)!;
  expect(container.textContent).toContain("None in period");
  await act(async () => { button("shop.example").click(); });
  expect(container.textContent).toContain("acme moisturizer");
  expect(container.textContent).toContain("Unknown");
  await act(async () => { button("moonlight cream").click(); });
  expect(container.textContent).toContain("Stopped at the listing limit");
  expect(container.textContent).toContain("Acme moisturizer");
  await act(async () => { button("Unverified").click(); });
  expect(container.textContent).toContain("Product description evidence was unavailable");
  expect(container.textContent).not.toContain("Another brand cream");
  expect(requests).toHaveLength(3);
});
