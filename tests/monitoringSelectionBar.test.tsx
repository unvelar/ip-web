import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MonitoringSelectionBar } from "../src/components/monitoring/board/MonitoringSelectionBar";
import type { BatchAction } from "../src/components/monitoring/board/batchUtils";

let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

async function setup(progress: { done: number; total: number } | null = null) {
  const window = new Window({ url: "http://localhost:5173" });
  Object.assign(globalThis, {
    window, document: window.document, navigator: window.navigator,
    HTMLElement: window.HTMLElement, Element: window.Element, Node: window.Node,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const decisions: BatchAction[] = [], assignments: Array<string | null> = [];
  let reviews = 0, clears = 0, shortcuts = 0;
  window.addEventListener("keydown", () => { shortcuts++; });
  await act(async () => root!.render(<MonitoringSelectionBar selectedCount={2}
    actions={["do_not_pursue", "false_positive", "second_hand", "review", "send"]}
    progress={progress} onAction={(action) => decisions.push(action)}
    onReview={() => { reviews++; }} onClear={() => { clears++; }}
    assignees={[{ id: "member-1", label: "Reviewer" }]}
    onAssign={(member) => assignments.push(member)} />));
  const button = (label: string) => Array.from(container.querySelectorAll("button")).find((b) => b.textContent === label)!;
  const click = async (label: string) => { await act(async () => button(label).click()); };
  const key = async (element: Element, key: string) => {
    await act(async () => element.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
  };
  return { window, container, decisions, assignments, button, click, key, reviews: () => reviews, clears: () => clears, shortcuts: () => shortcuts };
}

test("opening and cancelling More decisions never applies a decision or fires board shortcuts", async () => {
  const ui = await setup();
  await ui.click("More decisions");
  const options = ui.container.querySelector('[data-action-options]') as HTMLElement;
  expect(options.hidden).toBe(false);
  expect(document.activeElement).toBe(ui.button("Different product"));
  await ui.key(document.activeElement!, "ArrowDown");
  expect(document.activeElement).toBe(ui.button("Second hand"));
  await ui.key(document.activeElement!, "Escape");
  expect(options.hidden).toBe(true);
  expect(document.activeElement).toBe(ui.button("More decisions"));
  expect(ui.decisions).toEqual([]);
  expect(ui.shortcuts()).toBe(0);
});

test("individual review is distinct from moving the batch to in review", async () => {
  const ui = await setup();
  await ui.click("Review individually");
  expect(ui.reviews()).toBe(1);
  expect(ui.decisions).toEqual([]);
  await ui.click("More decisions");
  await ui.click("Move to in review");
  expect(ui.decisions).toEqual(["review"]);
  expect((ui.container.querySelector('[data-action-options]') as HTMLElement).hidden).toBe(true);
  await ui.click("Do not pursue");
  expect(ui.decisions).toEqual(["review", "do_not_pursue"]);
});

test("assignment keeps native select keys and supports unassigning", async () => {
  const ui = await setup();
  await ui.click("More decisions");
  const select = ui.container.querySelector("select")!;
  select.focus();
  await ui.key(select, "ArrowDown");
  expect(document.activeElement).toBe(select);
  expect(ui.shortcuts()).toBe(0);
  for (const value of ["member-1", "unassigned"]) {
    await act(async () => { select.value = value; select.dispatchEvent(new ui.window.Event("change", { bubbles: true })); });
    expect(select.value).toBe("");
  }
  expect(ui.assignments).toEqual(["member-1", null]);
  expect(ui.decisions).toEqual([]);
});

test("processing disables review, decisions, assignment, and deselection", async () => {
  const ui = await setup({ done: 1, total: 2 });
  expect(ui.container.querySelector('[role="status"]')?.textContent).toContain("Processing 1/2");
  expect(Array.from(ui.container.querySelectorAll("button, select")).every((control) => (control as HTMLButtonElement).disabled)).toBe(true);
  await ui.click("Do not pursue");
  await ui.click("Review individually");
  await ui.click("Deselect");
  expect(ui.decisions).toEqual([]);
  expect(ui.reviews()).toBe(0);
  expect(ui.clears()).toBe(0);
});
