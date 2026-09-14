import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act, createElement, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useJobPoller } from "../src/hooks/useJobPoller";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});
function setup() {
  const window = new Window();
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator,
    IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  return root;
}
function job(id: string, status: string) {
  return Response.json({ id, status, type: "index", payload: {}, result: null, error: null });
}

test("a completed upload cannot clear the next upload's indexing job", async () => {
  let finishSecond: (response: Response) => void = () => { throw new Error("Second job not requested"); };
  globalThis.fetch = (async (url) => String(url).endsWith("/first") ? job("first", "completed")
    : new Promise<Response>((resolve) => { finishSecond = resolve; })) as typeof fetch;
  let setId: (id: string) => void = () => { throw new Error("Not mounted"); };
  let currentId: string | null = null;
  function Probe() {
    const [id, update] = useState<string | null>("first");
    useEffect(() => { setId = update; currentId = id; }, [id]);
    const { job } = useJobPoller(id);
    // Reproduce the upload consumer clearing a completed job before its next upload.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { if (job?.status === "completed") update(null); }, [job?.status]);
    return null;
  }
  const root = setup();
  await act(async () => root.render(createElement(Probe)));
  expect(currentId).toBeNull();
  await act(async () => setId("second"));
  expect(currentId).toBe("second");
  await act(async () => finishSecond(job("second", "completed")));
  expect(currentId).toBeNull();
});

test("slow polling does not overlap and unmount cancels the request", async () => {
  let requests = 0;
  let signal: AbortSignal | undefined;
  globalThis.fetch = ((_url, init) => {
    requests += 1;
    signal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }) as typeof fetch;
  function Probe() { useJobPoller("first", 5); return null; }
  const root = setup();
  await act(async () => root.render(createElement(Probe)));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
  expect(requests).toBe(1);
  await act(async () => root.unmount());
  expect(signal?.aborted).toBe(true);
});

test("poll errors are visible and clear when the next request succeeds", async () => {
  let attempts = 0;
  let observed = "";
  globalThis.fetch = (async () => ++attempts === 1
    ? new Response("Unavailable", { status: 503, statusText: "Unavailable" })
    : job("first", "completed")) as typeof fetch;
  function Probe() { const { error } = useJobPoller("first", 10); useEffect(() => { observed = error; }, [error]); return null; }
  const root = setup();
  await act(async () => root.render(createElement(Probe)));
  expect(observed).toBe("Unavailable");
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
  expect(observed).toBe("");
  expect(attempts).toBe(2);
});
