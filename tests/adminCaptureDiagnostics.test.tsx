import { afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AdminMonitoringJob } from "../src/api";

const response = { attempts: [
  { id: "102", attempt_number: 1, status: "retry", worker_instance_id: "api-scrapfly-task-0", scrapfly_overflow: true,
    worker_image_sha: "1234567890abcdef", started_at: "2026-09-13T20:00:00Z", completed_at: "2026-09-13T20:01:00Z",
    error: null, scrape: { source: "worker", steps: [{ method: "scrapfly", role: "primary", outcome: "failed",
      diagnostics: { version: 1, code: "page_metadata_mismatch", message: "The page identifies a different listing.",
        requested_url: "https://shop.example/item?token=[redacted]", final_url: "https://shop.example/item",
        source_url: null, http_status: 200, provider_status: null, title: "Example listing", html_length: 1000,
        document_sha256: null, content_contract_passed: false, contract_code: "page_metadata_mismatch",
        page_kind: "unknown", signals: [], parser_errors: [], exception_type: null, challenge: null,
        page_url_hints: ["https://shop.example/"],
      } }] } },
  { id: "101", attempt_number: 1, status: "deferred", worker_instance_id: "browser", scrapfly_overflow: false,
    worker_image_sha: null, started_at: "2026-09-13T19:00:00Z", completed_at: "2026-09-13T19:01:00Z",
    error: "Legacy failure", scrape: { source: "not_recorded", steps: [] } },
], next_cursor: null };
const happyWindow = new Window({ url: "http://localhost:5173" });
Object.assign(globalThis, { window: happyWindow, document: happyWindow.document, navigator: happyWindow.navigator,
  HTMLElement: happyWindow.HTMLElement, Event: happyWindow.Event, MouseEvent: happyWindow.MouseEvent, Node: happyWindow.Node,
  IS_REACT_ACT_ENVIRONMENT: true });
const originalFetch = globalThis.fetch;
const requests: Array<{input: RequestInfo | URL; init?: RequestInit}> = [];
const fetchHistory = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
  requests.push({input, init});
  return new Response(JSON.stringify(response), {headers:{"Content-Type":"application/json"}});
});
const { CaptureAttemptDetails } = await import("../src/features/adminMonitoring/CaptureAttemptDetails");
let root: Root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.replaceChildren(); globalThis.fetch = originalFetch; fetchHistory.mockClear(); requests.length = 0; });

test("expansion fetches distinct execution records even when attempt numbers repeat", async () => {
  globalThis.fetch = fetchHistory as unknown as typeof fetch;
  const container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root.render(<CaptureAttemptDetails job={{ id: "job", scrape: null } as AdminMonitoringJob} />));
  expect(fetchHistory).not.toHaveBeenCalled();
  await act(async () => { container.querySelector("button")!.click(); });
  expect(fetchHistory).toHaveBeenCalledTimes(1);
  expect(String(requests[0]?.input)).toEndWith("/api/admin/monitoring/jobs/job/attempts");
  expect(container.textContent).toContain("Scrapfly task · attempt 1");
  expect(container.textContent).toContain("Browser worker · attempt 1");
  expect(container.textContent).toContain("Returned to the queue for retry");
  expect(container.textContent).toContain("Deferred for access recovery");
  expect(container.textContent).toContain("Execution 102");
  expect(container.textContent).toContain("Execution 101");
  expect(container.textContent).toContain("page_metadata_mismatch");
  expect(container.textContent).toContain("Detailed diagnostics were not recorded for this execution.");
  expect(container.textContent).toContain("Example listing");
});
