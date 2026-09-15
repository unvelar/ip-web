import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { PlatformsPanel } from "../src/components/monitoring/PlatformsPanel";
import type { MonitoringFrequency } from "../src/api/registry";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

async function renderPanel(rejectSave = false) {
  const window = new Window({ url: "http://localhost:5173/ips/test-ip" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true });
  const patches: unknown[] = [];
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === "PATCH") {
      const patch = JSON.parse(String(init.body));
      patches.push(patch);
      return rejectSave
        ? Response.json({ error: "Could not save frequency" }, { status: 503 })
        : Response.json({ trademark: patch });
    }
    return Response.json({ platforms: [] });
  }) as typeof fetch;
  function Host() {
    const [frequency, setFrequency] = useState<MonitoringFrequency>("weekly");
    return createElement(PlatformsPanel, { ipId: "test-ip", keywords: ["Example"],
      monitoringFrequency: frequency, onMonitoringFrequencyChanged: setFrequency });
  }
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(Host))));
  const button = (label: string) => Array.from(container.querySelectorAll("button"))
    .find((item) => item.textContent === label)!;
  return { container, patches, button };
}

test("Off saves through the API and a cadence resumes scheduled monitoring", async () => {
  const { container, patches, button } = await renderPanel();
  expect(button("Weekly").getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("Off").click());
  expect(patches).toEqual([{ monitoring_frequency: "off" }]);
  expect(button("Off").getAttribute("aria-pressed")).toBe("true");
  expect(container.textContent).toContain("Scheduled scans are off");
  await act(async () => button("Daily").click());
  expect(patches).toEqual([{ monitoring_frequency: "off" }, { monitoring_frequency: "daily" }]);
  expect(button("Daily").getAttribute("aria-pressed")).toBe("true");
  expect(container.textContent).not.toContain("Scheduled scans are off");
});

test("a failed Off save keeps the previous cadence selected", async () => {
  const { container, button } = await renderPanel(true);
  await act(async () => button("Off").click());
  expect(button("Weekly").getAttribute("aria-pressed")).toBe("true");
  expect(button("Off").getAttribute("aria-pressed")).toBe("false");
  expect(container.textContent).toContain("Could not save frequency");
});
