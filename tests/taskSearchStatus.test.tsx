import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Window } from "happy-dom";
import TaskSearchStatus from "../src/components/TaskSearchStatus";
import type { TaskSearchResult } from "../src/api/taskQueue";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

async function render(state: TaskSearchResult["state"], starting = false, scanned = 5, requiresComplete = false, completionReason?:TaskSearchResult["completion_reason"]) {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  let stops = 0;
  await act(async () => root!.render(<TaskSearchStatus
    search={{ id: "search-one", state, scanned, matched: 0, requires_complete:requiresComplete, completion_reason:completionReason, error: state === "failed" ? "Search timed out" : undefined }}
    starting={starting} queueTotal={5264} queueLabel="To triage" stopping={false}
    onStop={() => { stops++; }} onReturn={() => {}}
  />));
  return { container, stops: () => stops };
}

test("running zero matches has one checked count and an indeterminate activity indicator", async () => {
  const ui = await render("running");
  expect(ui.container.querySelector("summary")?.textContent).toBe("5 checked");
  expect(ui.container.querySelector('[role="status"]')?.textContent).toContain("0 matches");
  expect(ui.container.querySelector('[role="status"]')?.textContent).toContain("so far");
  const progress = ui.container.querySelector('[role="progressbar"]');
  expect(progress).not.toBeNull();
  expect(progress?.hasAttribute("aria-valuenow")).toBe(false);
  expect(progress?.hasAttribute("aria-valuemax")).toBe(false);
  expect(ui.container.querySelector("details p")?.textContent).toContain("5,264 tasks in To triage");
  const stop = [...ui.container.querySelectorAll("button")].find((button) => button.textContent === "Stop")!;
  await act(async () => stop.click());
  expect(ui.stops()).toBe(1);
});

test("starting a replacement search does not present previous counts as current results", async () => {
  const ui = await render("completed", true);
  expect(ui.container.querySelector('[role="status"]')?.textContent).toContain("Starting…");
  expect(ui.container.querySelector("details")).toBeNull();
  expect(ui.container.textContent).not.toContain("Complete");
});

test("completed zero matches is final, while stopped and limited results remain partial", async () => {
  const complete = await render("completed");
  expect(complete.container.textContent).toContain("Complete");
  expect(complete.container.textContent).not.toContain("so far");
  expect(complete.container.querySelector('[role="progressbar"]')).toBeNull();
  await act(async () => root?.unmount()); root = undefined;
  const stopped = await render("cancelled");
  expect(stopped.container.textContent).toContain("partial");
  expect(stopped.container.textContent).toContain("Results are incomplete");
  expect(stopped.container.textContent).not.toContain("Complete");
  await act(async () => root?.unmount()); root = undefined;
  const limited = await render("limited");
  expect(limited.container.textContent).toContain("Work limit reached");
  expect(limited.container.textContent).toContain("partial");
});

test("a search failure retains partial status and exposes the reason", async () => {
  const ui = await render("failed");
  expect(ui.container.textContent).toContain("partial");
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe("Search timed out");
});

test("a search that fails to start does not claim to have found zero matches", async () => {
  const ui = await render("failed", false, 0);
  expect(ui.container.querySelector(".task-search-matches")?.textContent).toBe("Results");
  expect(ui.container.textContent).toContain("Search failed");
  expect(ui.container.textContent).not.toContain("0 matches");
});


test("seller thresholds do not present provisional zero counts as results",async()=>{
  const running=await render("running",false,50,true);
  expect(running.container.querySelector(".task-search-matches")?.textContent).toBe("Counting seller matches…");
  expect(running.container.textContent).not.toContain("0 matches");
  await act(async()=>root?.unmount());root=undefined;
  const limited=await render("limited",false,50,true);
  expect(limited.container.querySelector(".task-search-matches")?.textContent).toBe("Seller counts unavailable");
  expect(limited.container.textContent).toContain("Work limit reached");
});

test("priority order waits for the full match set instead of showing a provisional zero result",async()=>{
  const running=await render("running",false,50,true,"priority_order");
  expect(running.container.querySelector(".task-search-matches")?.textContent).toBe("Ordering matching items…");
  expect(running.container.textContent).not.toContain("0 matches");
});
