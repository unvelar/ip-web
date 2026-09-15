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

async function renderPanel(rejectSave = false, initialFrequency: MonitoringFrequency = "weekly") {
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
    const [frequency, setFrequency] = useState<MonitoringFrequency>(initialFrequency);
    return createElement(PlatformsPanel, { ipId: "test-ip", keywords: ["Example"],
      monitoringFrequency: frequency, onMonitoringFrequencyChanged: setFrequency });
  }
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(Host))));
  const toggle = () => container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  const cadence = () => container.querySelector<HTMLSelectElement>('select[aria-label="Monitoring frequency"]');
  return { container, patches, toggle, cadence };
}

test("toggle saves Off, hides cadence, and resumes the selected cadence", async () => {
  const { patches, toggle, cadence } = await renderPanel(false, "monthly");
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(cadence()?.value).toBe("monthly");
  await act(async () => toggle().click());
  expect(patches).toEqual([{ monitoring_frequency: "off" }]);
  expect(toggle().getAttribute("aria-checked")).toBe("false");
  expect(cadence()).toBeNull();
  await act(async () => toggle().click());
  expect(patches).toEqual([{ monitoring_frequency: "off" }, { monitoring_frequency: "monthly" }]);
  expect(cadence()?.value).toBe("monthly");
  await act(async () => {
    cadence()!.value = "daily";
    cadence()!.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  expect(patches.at(-1)).toEqual({ monitoring_frequency: "daily" });
  expect(cadence()?.value).toBe("daily");
});

test("a saved Off state enables with Weekly as the default", async () => {
  const { patches, toggle, cadence } = await renderPanel(false, "off");
  expect(cadence()).toBeNull();
  await act(async () => toggle().click());
  expect(patches).toEqual([{ monitoring_frequency: "weekly" }]);
  expect(cadence()?.value).toBe("weekly");
});

test("a failed Off save keeps the previous cadence and toggle state", async () => {
  const { container, toggle, cadence } = await renderPanel(true);
  await act(async () => toggle().click());
  expect(toggle().getAttribute("aria-checked")).toBe("true");
  expect(cadence()?.value).toBe("weekly");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not save frequency");
});
