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

async function setup(fail = false, grouped = true) {
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
  const requests: {url:URL; method:string; body?:unknown}[] = [];
  let completed = false;
  const resolved = new Set<string>();
  let detailsHandler: ((ids:string[])=>Response | Promise<Response>) | undefined;
  let finishRefresh: (()=>void) | undefined;
  const finding = (id:string) => ({result_id:id,task_id:id,case_id:`case-${id}`,ip_id:"ip",domain:"shop.test",
    seller_key:"shop",seller_name:"Shop",listing_title:id,page_url:`https://shop.test/${id}`,
    price_value_usd:10,state:"pending",review_status:"pending",ready_for_review:true,images:[],gallery_scores:[]});
  globalThis.fetch = (async (input, options) => {
    const url = new URL(String(input), window.location.origin);
    const method = options?.method ?? "GET";
    requests.push({url,method,body:options?.body ? JSON.parse(String(options.body)) : undefined});
    if (url.pathname.endsWith('/tasks/details')) {
      const { ids } = JSON.parse(String(options?.body)) as {ids:string[]};
      return detailsHandler ? detailsHandler(ids) : Response.json({findings:ids.map(finding)});
    }
    if (url.pathname.endsWith('/batch/preflight')) {
      const {case_ids} = JSON.parse(String(options?.body)) as {case_ids:string[]};
      return Response.json({automatic_case_ids:case_ids,legal_queue:[],skipped:[],route_groups:[]});
    }
    if (method === "POST") {
      if (fail) return Response.json({error:"Action failed"},{status:500});
      completed = true;
      const caseIds = (JSON.parse(String(options?.body)) as {case_ids?:string[]}).case_ids;
      if (caseIds) for (const id of caseIds) resolved.add(id.slice("case-".length));
      else if (url.pathname.endsWith('/dismiss')) resolved.add(url.pathname.split('/').at(-2)!);
      return Response.json({ok:true,queued_case_ids:caseIds??[],requests:[],email_count:caseIds?.length??0,failed:[],skipped:[]});
    }
    if (url.pathname.endsWith('/queue')) return Response.json({rows:grouped?[]:[finding("first"),finding("second")],next_cursor:null,counts:{pending:completed?1:2,review:0,takedown_pending:0,takedown_sent:0,enforced:0,dismissed:0,preparing:0},as_of:null,updating:false});
    if (url.pathname.endsWith('/sellers/shop')) return Response.json({seller:{key:"shop",name:"Shop",domain:"shop.test",contacts:[]},summary:{prior_enforcement_count:3,returned_listing_count:1}});
    if (url.pathname.endsWith('/seller-groups')) {
      const response = () => Response.json({groups:[{seller_key:"shop",seller_name:"Shop",article_count:2-resolved.size,priced_article_count:2-resolved.size,exposure_usd:(2-resolved.size)*10}],total_groups:99,next_offset:50,partial:false,updating:false});
      if (completed) return new Promise<Response>(resolve => { finishRefresh = () => resolve(response()); });
      return response();
    }
    if (url.pathname.endsWith('/listings')) return Response.json({rows:["first","second"].filter(id=>!resolved.has(id)).map(finding),next_offset:null,partial:false});
    if (url.pathname.endsWith('/findings/first')) return Response.json({finding:finding("first")});
    if (url.pathname.endsWith('/related')) return Response.json({related:{anchor:finding("first"),buckets:[],campaign_suggestions:[]}});
    if (url.pathname.endsWith('/shared-images')) return Response.json({shared_images:{matches:[],status:"not_analyzed",coverage:{source_images_checked:0,source_images:0,candidate_images_checked:0,candidate_images:0,source_copy_fingerprints:0,candidate_copy_fingerprints:0}}});
    return Response.json({comments:[],subscribed:false,members:[]});
  }) as typeof fetch;
  root = createRoot(container);
  await act(async () => root!.render(<MemoryRouter initialEntries={[grouped?"/monitoring/tasks?group_by=seller":"/monitoring/tasks"]}>
    <AuthProvider><ActiveIpProvider><Routes><Route path="/monitoring/tasks/:taskId?" element={<TaskQueue ipId="ip" />} /></Routes></ActiveIpProvider></AuthProvider>
  </MemoryRouter>));
  const click = async (selector:string) => { await act(async () => container.querySelector<HTMLElement>(selector)!.click()); };
  if (grouped) {
    await click('.monitoring-results-pagination button:last-child');
    await click('[aria-label="Expand Shop"]');
  }
  await click('[aria-label="Select second"]');
  await click('[data-task-id="first"]');
  return {container,requests,window,click,scrolls:()=>scrolls,
    detailsWith:(handler:typeof detailsHandler)=>{detailsHandler=handler;},
    finish:async()=>{await act(async()=>finishRefresh!());}};
}

for (const grouped of [false, true]) {
  test(`seller links open side details without opening a task or resetting ${grouped ? "grouped" : "ungrouped"} queue selection`, async () => {
    const ui = await setup(false, grouped);
    await ui.click('[aria-label="Close finding details"]');
    const before = ui.requests.length;
    const seller = ui.container.querySelector<HTMLButtonElement>('[data-task-id="first"] .task-queue-seller-link')!;
    await act(async () => { seller.focus(); seller.click(); });
    const panel = ui.container.querySelector('[aria-label="Seller details"]');
    expect(panel?.textContent).toContain("Shop");
    expect(panel?.textContent).toContain("Seller overview");
    expect(panel?.querySelector('a[href="/monitoring/sellers/shop?ip_id=ip"]')).not.toBeNull();
    expect(ui.container.querySelector('[aria-label="Finding details"]')).toBeNull();
    expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Select second"]')?.checked).toBe(true);
    expect(ui.requests.slice(before).filter(request => request.url.pathname.endsWith('/sellers/shop'))).toHaveLength(1);
    expect(ui.requests.slice(before).every(request => request.method === "GET")).toBe(true);
    await ui.click('[aria-label="Close group details"]');
    expect(ui.container.querySelector('[aria-label="Seller details"]')).toBeNull();
    expect(document.activeElement).toBe(seller);
  });
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

test("selected queue rows expose decisions immediately and preserve selection in individual review", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  const bar = ui.container.querySelector('[aria-label="Selected listings"]')!;
  expect(bar.textContent).toContain("1 listing selected");
  expect(bar.textContent).toContain("Do not pursue");
  expect(bar.textContent).toContain("More decisions");
  const button = (text:string) => [...ui.container.querySelectorAll('button')].find(button=>button.textContent===text)!;
  const mutations = () => ui.requests.filter(request=>request.method==='POST'&&!request.url.pathname.endsWith('/details'));
  await act(async()=>button("More decisions").click());
  expect(bar.textContent).toContain("Takedown");
  await act(async()=>button("Different product").click());
  expect(ui.container.querySelector('[aria-modal="true"]')?.textContent).toContain("1 finding");
  expect(mutations()).toHaveLength(0);
  await act(async()=>button("Cancel").click());
  await act(async()=>button("Review individually").click());
  expect(ui.container.textContent).toContain("Reviewing 1 selected task");
  expect(ui.container.querySelector('[aria-label="Selected listings"]')?.textContent).toContain("1 listing selected");
  expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Select second"]')?.checked).toBe(true);
  expect(mutations()).toHaveLength(0);
});

test("bulk dismissal targets only selected rows and keeps the current seller page expanded", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  const heading = ui.container.querySelector('.monitoring-group-heading');
  const button = (text:string) => [...ui.container.querySelectorAll('button')].find(button=>button.textContent===text)!;
  await act(async()=>button("Do not pursue").click());
  const modal = ui.container.querySelector('[aria-modal="true"]')!;
  const confirm = [...modal.querySelectorAll('button')].find(button=>button.textContent==="Do not pursue")!;
  await act(async()=>confirm.click());
  const dismissals = ui.requests.filter(request=>request.url.pathname.endsWith('/dismiss'));
  expect(dismissals.map(request=>request.url.pathname)).toEqual(['/api/ip/ip/monitoring/findings/second/dismiss']);
  expect(dismissals[0].body).toMatchObject({reason:"do_not_pursue"});
  await ui.finish();
  expect(ui.container.querySelector('.monitoring-group-heading')).toBe(heading);
  expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
  expect(ui.container.textContent).toContain("Page 2");
  expect(ui.container.querySelector('[data-task-id="second"]')).toBeNull();
  expect(ui.container.querySelector('[data-task-id="first"]')).not.toBeNull();
});

test("selected evidence failures block decisions and can retry without losing the selection", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  ui.detailsWith(()=>Response.json({error:"Selected evidence unavailable"},{status:500}));
  await ui.click('[aria-label="Select first"]');
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("Selected evidence unavailable");
  const button = (text:string) => [...ui.container.querySelectorAll('button')].find(button=>button.textContent===text)!;
  expect(button("Do not pursue").disabled).toBe(true);
  expect(button("Deselect").disabled).toBe(false);
  expect(ui.container.querySelector('[aria-label="Selected listings"]')?.textContent).toContain("2 listings selected");
  ui.detailsWith(undefined);
  await act(async()=>button("Retry selected articles").click());
  expect(button("Do not pursue").disabled).toBe(false);
  expect(ui.container.querySelector('[role="alert"]')).toBeNull();
});

test("bulk takedown confirms and submits exactly the selected cases", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  await ui.click('[aria-label="Select first"]');
  const button = (text:string) => [...ui.container.querySelectorAll('button')].find(button=>button.textContent===text)!;
  await act(async()=>button("More decisions").click());
  await act(async()=>button("Takedown").click());
  const modal = ui.container.querySelector('[aria-modal="true"]')!;
  expect(modal.textContent).toContain("2 findings");
  expect(ui.requests.filter(request=>request.url.pathname.endsWith('/batch/send'))).toHaveLength(0);
  const reason = modal.querySelector('textarea')!;
  await act(async()=>{
    Object.getOwnPropertyDescriptor(ui.window.HTMLTextAreaElement.prototype,"value")!.set!.call(reason,"Selected listings show copied protected products");
    reason.dispatchEvent(new ui.window.Event("input",{bubbles:true}));
  });
  const send = [...modal.querySelectorAll('button')].find(button=>button.textContent==="Takedown")!;
  expect(send.disabled).toBe(false);
  await act(async()=>send.click());
  const submissions = ui.requests.filter(request=>request.url.pathname.endsWith('/batch/send'));
  expect(submissions).toHaveLength(1);
  expect(submissions[0].body).toMatchObject({case_ids:["case-first","case-second"],decision_reason:"Selected listings show copied protected products"});
  await ui.finish();
  expect(ui.container.querySelector('[aria-label="Selected listings"]')).toBeNull();
  expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
  expect(ui.container.textContent).toContain("Page 2");
});

test("a stale selected-evidence response cannot replace the latest selection", async () => {
  const ui = await setup();
  await ui.click('[aria-label="Close finding details"]');
  let finish!: (response:Response)=>void;
  ui.detailsWith(()=>new Promise(resolve=>{finish=resolve;}));
  await ui.click('[aria-label="Select first"]');
  const bar = ui.container.querySelector('[aria-label="Selected listings"]')!;
  expect(bar.textContent).toContain("Loading selected listings");
  expect(bar.querySelector<HTMLButtonElement>('.monitoring-selection-primary')?.disabled).toBe(true);
  ui.detailsWith(()=>Response.json({findings:[{result_id:"first",case_id:"case-first",ip_id:"ip",review_status:"pending"}]}));
  await ui.click('[aria-label="Select second"]');
  await act(async()=>finish(Response.json({findings:[]})));
  expect(bar.textContent).toContain("1 listing selected");
  expect(bar.querySelector<HTMLButtonElement>('.monitoring-selection-primary')?.disabled).toBe(false);
  expect(ui.container.querySelector('[role="alert"]')).toBeNull();
});
