import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import { ActiveIpProvider } from "../src/context/ActiveIpContext";
import TaskQueue from "../src/pages/TaskQueue";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

async function setup(fail = false) {
  const window = new Window({ url:"http://localhost:5173" });
  Object.assign(globalThis, {
    window, document:window.document, navigator:window.navigator,
    HTMLElement:window.HTMLElement, HTMLButtonElement:window.HTMLButtonElement,
    Element:window.Element, Node:window.Node, ResizeObserver:window.ResizeObserver,
    IS_REACT_ACT_ENVIRONMENT:true,
  });
  let scrolls = 0;
  window.HTMLElement.prototype.scrollIntoView = () => { scrolls++; };
  const container = document.createElement("div");
  document.body.replaceChildren(container);
  const requests: {url:URL; method:string}[] = [];
  let completed = false;
  let finishRefresh: (()=>void) | undefined;
  const finding = (id:string) => ({result_id:id,task_id:id,case_id:`case-${id}`,ip_id:"ip",domain:"shop.test",
    seller_key:"shop",seller_name:"Shop",listing_title:id,page_url:`https://shop.test/${id}`,
    price_value_usd:10,state:"pending",review_status:"pending",ready_for_review:true,images:[],gallery_scores:[]});
  globalThis.fetch = (async (input, options) => {
    const url = new URL(String(input), window.location.origin);
    const method = options?.method ?? "GET";
    requests.push({url,method});
    if (method === "POST") {
      if (fail) return Response.json({error:"Action failed"},{status:500});
      completed = true;
      return Response.json({ok:true,queued_case_ids:["case-first"],requests:[],failed:[],skipped:[]});
    }
    if (url.pathname.endsWith('/queue')) return Response.json({rows:[],next_cursor:null,counts:{pending:completed?1:2,review:0,takedown_pending:0,takedown_sent:0,enforced:0,dismissed:0,preparing:0},as_of:null,updating:false});
    if (url.pathname.endsWith('/seller-groups')) {
      const response = () => Response.json({groups:[{seller_key:"shop",seller_name:"Shop",article_count:completed?1:2,priced_article_count:completed?1:2,exposure_usd:completed?10:20}],total_groups:99,next_offset:50,partial:false,updating:false});
      if (completed) return new Promise<Response>(resolve => { finishRefresh = () => resolve(response()); });
      return response();
    }
    if (url.pathname.endsWith('/listings')) return Response.json({rows:(completed?["second"]:["first","second"]).map(finding),next_offset:null,partial:false});
    if (url.pathname.endsWith('/findings/first')) return Response.json({finding:finding("first")});
    if (url.pathname.endsWith('/related')) return Response.json({related:{anchor:finding("first"),buckets:[],campaign_suggestions:[]}});
    if (url.pathname.endsWith('/shared-images')) return Response.json({shared_images:{matches:[],status:"not_analyzed",coverage:{source_images_checked:0,source_images:0,candidate_images_checked:0,candidate_images:0,source_copy_fingerprints:0,candidate_copy_fingerprints:0}}});
    return Response.json({comments:[],subscribed:false,members:[]});
  }) as typeof fetch;
  root = createRoot(container);
  await act(async () => root!.render(<MemoryRouter initialEntries={["/monitoring/tasks?group_by=seller"]}>
    <AuthProvider><ActiveIpProvider><Routes><Route path="/monitoring/tasks/:taskId?" element={<TaskQueue ipId="ip" />} /></Routes></ActiveIpProvider></AuthProvider>
  </MemoryRouter>));
  const click = async (selector:string) => { await act(async () => container.querySelector<HTMLElement>(selector)!.click()); };
  await click('.monitoring-results-pagination button:last-child');
  await click('[aria-label="Expand Shop"]');
  await click('[aria-label="Select second"]');
  await click('[data-task-id="first"]');
  return {container,requests,window,click,scrolls:()=>scrolls,
    finish:async()=>{await act(async()=>finishRefresh!());}};
}

for (const action of ["dismiss","takedown"] as const) {
  test(`${action} refreshes once in place, preserving seller page, expansion, selection and scroll`, async () => {
    const ui = await setup();
    const table = ui.container.querySelector('table');
    const heading = ui.container.querySelector('.monitoring-group-heading');
    const scrolls = ui.scrolls();
    const before = ui.requests.length;
    if (action === "dismiss") {
      const button = [...ui.container.querySelectorAll<HTMLButtonElement>('[aria-label="Finding details"] button')].find(button=>button.textContent?.includes("Different product"))!;
      await act(async()=>button.click());
    } else {
      const button = [...ui.container.querySelectorAll<HTMLButtonElement>('[aria-label="Finding details"] button')].find(button=>button.textContent?.includes("Takedown"))!;
      await act(async()=>button.click());
      const modal = ui.container.querySelector('[aria-modal="true"]')!;
      const reason = modal.querySelector('textarea')!;
      await act(async()=>{
        Object.getOwnPropertyDescriptor(ui.window.HTMLTextAreaElement.prototype,"value")!.set!.call(reason,"Test evidence for this article");
        reason.dispatchEvent(new ui.window.Event("input",{bubbles:true}));
      });
      const send = [...modal.querySelectorAll('button')].find(button=>button.textContent==="Takedown")!;
      expect(send.disabled).toBe(false);
      await act(async()=>send.click());
    }
    expect(ui.container.querySelector('[aria-label="Finding details"]')).toBeNull();
    expect(ui.container.querySelector('table')).toBe(table);
    expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
    expect(ui.scrolls()).toBe(scrolls);
    await ui.finish();
    expect(ui.container.querySelector('.monitoring-group-heading')).toBe(heading);
    expect(ui.container.textContent).toContain("Page 2");
    expect(ui.container.textContent).toContain("1 article");
    expect(ui.container.querySelector('[data-task-id="first"]')).toBeNull();
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Select second"]')?.checked).toBe(true);
    expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
    expect(ui.scrolls()).toBe(scrolls);
    const refreshed = ui.requests.slice(before).filter(request=>request.url.pathname.endsWith('/seller-groups'));
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0].url.searchParams.get("offset")).toBe("50");
  });
}

test("a failed dismiss keeps the inspector and expanded queue without revalidating", async () => {
  const ui = await setup(true);
  const before = ui.requests.length;
  const scrolls = ui.scrolls();
  const button = [...ui.container.querySelectorAll<HTMLButtonElement>('[aria-label="Finding details"] button')].find(button=>button.textContent?.includes("Different product"))!;
  await act(async()=>button.click());
  expect(ui.container.textContent).toContain("Action failed");
  expect(ui.container.querySelector('[aria-label="Finding details"]')).not.toBeNull();
  expect(ui.requests.slice(before).filter(request=>request.method==="GET")).toHaveLength(0);
  expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
  expect(ui.container.querySelector('[data-task-id="first"]')).not.toBeNull();
  expect(ui.scrolls()).toBe(scrolls);
});

test("the explicit toolbar Refresh still starts a fresh queue", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  const scrolls = ui.scrolls();
  await ui.click('[aria-label="Refresh tasks"]');
  expect(ui.container.textContent).toContain("Page 1");
  expect(ui.container.querySelector('[aria-label="Expand Shop"]')).not.toBeNull();
  expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Select loaded articles in Shop"]')?.checked).toBe(false);
  expect(ui.scrolls()).toBe(scrolls+1);
  expect(ui.requests.findLast(request=>request.url.pathname.endsWith('/seller-groups'))?.url.searchParams.get("offset")).toBe("0");
});
