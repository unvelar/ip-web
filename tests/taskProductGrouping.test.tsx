import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTaskProductIdentities } from "../src/hooks/useTaskProductIdentities";
import { groupMonitoringFindings } from "../src/lib/monitoringGrouping";
import { TaskGroupRows } from "../src/components/monitoring/board/TaskGroupRows";
import type { TaskSummary } from "../src/api/taskQueue";

let root: Root | undefined;
const originalFetch = globalThis.fetch;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

test("retry replaces an older API response with real product groups without remounting the queue", async () => {
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
  const rows = ["one", "two", "three"].map((id) => ({
    result_id: id,
    task_id: id,
    case_id: `case-${id}`,
    ip_id: "ip-one",
  })) as TaskSummary[];
  let upgraded = false;
  let requests = 0;
  globalThis.fetch = (async () => {
    requests++;
    return new Response(
      JSON.stringify({
        findings: rows.map((row, index) => ({
          ...row,
          ...(upgraded
            ? {
                product_identity: {
                  canonical_product_id: index < 2 ? "product-a" : "product-b",
                  display_name: index < 2 ? "Product A" : "Product B",
                },
              }
            : {}),
        })),
        next_cursor: null,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  function Queue() {
    const result = useTaskProductIdentities(true, "ip-one", rows);
    const groups = groupMonitoringFindings(result.rows, "product");
    return (
      <>
        {result.unavailable && (
          <button onClick={result.retry}>Retry grouping</button>
        )}
        <table>
          <TaskGroupRows
            groups={groups}
            selection={new Set()}
            disabled={false}
            onSelect={() => {}}
            onOpen={() => {}}
            renderRow={(row) => (
              <tr key={row.task_id}>
                <td>{row.task_id}</td>
              </tr>
            )}
          />
        </table>
      </>
    );
  }
  root = createRoot(container);
  await act(async () => root!.render(<Queue />));
  expect(requests).toBe(1);
  expect(container.textContent).toContain("Retry grouping");
  expect(container.textContent).not.toContain("Unmatched listings");
  upgraded = true;
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(requests).toBe(2);
  expect(container.textContent).not.toContain("Retry grouping");
  expect(container.textContent).toContain("Product A");
  expect(container.textContent).toContain("Product B");
  expect(
    container.querySelectorAll('button[aria-label^="Open product details:"]'),
  ).toHaveLength(2);
});
