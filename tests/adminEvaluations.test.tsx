import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import AdminEvaluations from "../src/pages/AdminEvaluations";

let root: Root | undefined;
const originalFetch = globalThis.fetch;
const originalObserver = globalThis.ResizeObserver;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
  globalThis.ResizeObserver = originalObserver;
});

test("admin demo requires an independent assessment before revealing AI and performs no requests", async () => {
  let requests = 0;
  globalThis.fetch = (() => { requests++; throw new Error("Evaluation demo must not call the API"); }) as typeof fetch;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter><AdminEvaluations /></MemoryRouter>));
  expect(container.querySelector('a[href="/admin/evaluations"]')?.getAttribute("aria-current")).toBe("page");
  expect(container.textContent).toContain("Demo · synthetic data");
  const click = async (text: string) => {
    const button = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === text);
    expect(button).toBeDefined();
    await act(async () => button?.click());
  };
  await click("Review examples");
  expect(container.textContent).not.toContain("AI suggestion:");
  const form = container.querySelector("form")!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Choose an assessment");
  expect(container.textContent).not.toContain("AI suggestion:");
  await act(async () => container.querySelector<HTMLInputElement>('input[value="clearance"]')!.click());
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "The capture describes a used original bottle without independent violation evidence.");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(container.textContent).toContain("AI suggestion:");
  expect(container.textContent).toContain("Reviewer disagrees");
  expect(container.querySelector("textarea")?.disabled).toBe(true);
  await click("Queue preview");
  await click("Review examples");
  expect(container.textContent).toContain("Reviewer disagrees");
  expect(requests).toBe(0);
  container.remove();
});
