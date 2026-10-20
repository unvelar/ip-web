import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TaskGroupRows } from "../src/components/monitoring/board/TaskGroupRows";
import { groupMonitoringFindings } from "../src/lib/monitoringGrouping";
import type { TaskSummary } from "../src/api/taskQueue";

let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
});

test("group collapse preserves row selection and group selection touches only that canonical seller", async () => {
  const window = new Window();
  Object.assign(globalThis, {
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const row = (id: string, seller: string) =>
    ({
      result_id: id,
      task_id: id,
      ip_id: "ip-one",
      domain: "shop.test",
      seller_key: seller,
      seller_name: "Same name",
    }) as TaskSummary;
  const groups = groupMonitoringFindings(
    [row("one", "seller-a"), row("two", "seller-b"), row("three", "seller-a")],
    "seller",
  );
  let selection = new Set(["one"]);
  const opened: string[] = [];
  root = createRoot(container);
  const render = () =>
    root!.render(
      <table>
        <TaskGroupRows
          groups={groups}
          selection={selection}
          disabled={false}
          onSelect={(ids, selected) => {
            selection = new Set(selection);
            for (const id of ids) {
              if (selected) selection.add(id);
              else selection.delete(id);
            }
            render();
          }}
          onOpen={(group) => opened.push(group.key)}
          renderRow={(row) => (
            <tr key={row.task_id}>
              <td>{row.task_id}</td>
            </tr>
          )}
        />
      </table>,
    );
  await act(async () => render());
  const groupCheckboxes = [
    ...container.querySelectorAll<HTMLInputElement>('[type="checkbox"]'),
  ];
  expect(groupCheckboxes[0].indeterminate).toBe(true);
  expect(container.querySelectorAll("tbody[hidden]")).toHaveLength(2);
  const toggle = container.querySelector<HTMLButtonElement>(
    '[aria-label="Expand Same name"]',
  )!;
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await act(async () => toggle.click());
  expect(container.querySelector("tbody[hidden]")?.textContent).toBe(
    "onethree",
  );
  expect(selection).toEqual(new Set(["one"]));
  await act(async () => groupCheckboxes[0].click());
  expect(selection).toEqual(new Set(["one", "three"]));
  expect(groupCheckboxes[1].checked).toBe(false);
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Open seller details: Same name"]',
      )!
      .click(),
  );
  expect(opened).toEqual(["seller:seller-a"]);
});
