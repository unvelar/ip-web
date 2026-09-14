import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Registry from "../src/pages/Registry";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

test("registry load failure offers retry and never claims there are no IPs", async () => {
  const window = new Window({ url: "http://localhost:5173/ips" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true });
  let attempts = 0;
  globalThis.fetch = (async () => ++attempts === 1
    ? new Response("Unavailable", { status: 503, statusText: "Unavailable" })
    : Response.json({ trademarks: [] })) as typeof fetch;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(createElement(MemoryRouter, {}, createElement(Registry))));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Unable to load your IPs");
  expect(container.textContent).not.toContain("No IPs registered yet");
  const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "Try again");
  expect(retry).toBeDefined();
  await act(async () => retry?.click());
  expect(attempts).toBe(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain("No IPs registered yet");
});
