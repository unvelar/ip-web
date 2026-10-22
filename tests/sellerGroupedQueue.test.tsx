import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SellerGroupedQueue } from "../src/components/monitoring/board/SellerGroupedQueue";
import type { TaskSellerGroupsQuery } from "../src/api/taskQueue";

let root: Root | undefined;
const originalFetch=globalThis.fetch;
afterEach(async()=>{ if(root) await act(async()=>root?.unmount()); root=undefined; globalThis.fetch=originalFetch; });

async function setup(fail=false, partial=false) {
  const window=new Window({url:"http://localhost:5173"});
  Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const container=document.createElement("div"); document.body.replaceChildren(container);
  const requests:URL[]=[];
  let respond: ((url:URL)=>Response | Promise<Response>) | undefined;
  globalThis.fetch=(async(input)=>{
    const url=new URL(String(input),"http://localhost:5173"); requests.push(url);
    if(respond) return respond(url);
    if(fail) return new Response(JSON.stringify({error:"Missing"}),{status:404});
    if(url.pathname.endsWith("/listings")) {
      const more=url.searchParams.get("offset")==="50";
      return Response.json({rows:[{result_id:more?"second":"first",task_id:more?"second":"first"}],next_offset:more?null:50});
    }
    return Response.json({groups:[{seller_key:"shop",seller_name:"Shop",article_count:72,priced_article_count:70,exposure_usd:5432.10}],total_groups:99,next_offset:50,partial,updating:false});
  }) as typeof fetch;
  let query:TaskSellerGroupsQuery={ip_id:"ip",status:"pending",sort:"priority",group_sort:"exposure",search_id:"saved-search"};
  let selected=new Set<string>(); let ungrouped=false; let revision=0;
  root=createRoot(container);
  const render=()=>root!.render(<SellerGroupedQueue key={JSON.stringify(query)} query={query} requireComplete={partial} topLimit={partial?10:null} revision={String(revision)} selection={selected}
    onSelect={(ids,checked)=>{ selected=new Set(selected); for(const id of ids){if(checked) selected.add(id);else selected.delete(id);} render(); }}
    renderRow={row=><tr key={row.result_id}><td>{row.result_id}</td></tr>}
    onUngroup={()=>{ungrouped=true;}} onOpenGroup={()=>{}} />);
  await act(async()=>render());
  return {container,requests,selected:()=>selected,ungrouped:()=>ungrouped,
    respondWith:(handler:typeof respond)=>{respond=handler;},
    refresh:async()=>{await act(async()=>{revision++;render();});},
    change:async()=>{await act(async()=>{query={...query,group_sort:"articles",status:"review"};render();});},
    click:async(selector:string)=>{await act(async()=>container.querySelector<HTMLButtonElement>(selector)!.click());}};
}

test("server totals stay visible while seller articles start collapsed and load only on expansion",async()=>{
  const ui=await setup();
  expect(ui.requests).toHaveLength(1);
  expect(ui.requests[0].searchParams.get("search_id")).toBe("saved-search");
  expect(ui.requests[0].searchParams.get("group_sort")).toBe("exposure");
  expect(ui.container.textContent).toContain("72 articles");
  expect(ui.container.textContent).toContain("$5,432.10+");
  expect(ui.container.querySelector('[aria-expanded]')?.getAttribute("aria-expanded")).toBe("false");
  expect(ui.container.querySelector<HTMLInputElement>('tbody input')?.disabled).toBe(true);
  await ui.click('[aria-label="Expand Shop"]');
  expect(ui.requests).toHaveLength(2);
  expect(ui.requests[1].searchParams.get("seller_key")).toBe("shop");
  expect(ui.container.querySelector('tbody:not([hidden])')?.textContent).toContain("72 articles");
  await ui.click('[aria-label="Select loaded articles in Shop"]');
  expect(ui.selected()).toEqual(new Set(["first"]));
  await ui.click('.monitoring-group-footer button');
  expect(ui.requests[2].searchParams.get("offset")).toBe("50");
  expect(ui.container.textContent).toContain("second");
  expect(ui.container.textContent).toContain("72 articles");
  await ui.change();
  expect(ui.requests.at(-1)?.searchParams.get("group_sort")).toBe("articles");
  expect(ui.requests.at(-1)?.searchParams.get("status")).toBe("review");
  expect(ui.container.querySelector('[aria-expanded]')?.getAttribute("aria-expanded")).toBe("false");
});

test("action revalidation keeps the seller page and expanded table mounted, and replaces every loaded article page",async()=>{
  const ui=await setup();
  await ui.click('.monitoring-results-pagination button:last-child');
  let ids=Array.from({length:72},(_,i)=>`article-${i}`);
  const listings=(url:URL)=>{
    const offset=Number(url.searchParams.get("offset")??0);
    return Response.json({rows:ids.slice(offset,offset+50).map(id=>({result_id:id,task_id:id})),next_offset:offset+50<ids.length?offset+50:null});
  };
  ui.respondWith(url=>listings(url));
  await ui.click('[aria-label="Expand Shop"]');
  await ui.click('.monitoring-group-footer button');
  const table=ui.container.querySelector("table");
  const heading=ui.container.querySelector(".monitoring-group-heading");
  const body=ui.container.querySelector('tbody[id]');
  let finish!: (response:Response)=>void;
  ui.respondWith(url=>url.pathname.endsWith('/listings')?listings(url):new Promise(resolve=>{finish=resolve;}));
  const before=ui.requests.length;
  await ui.refresh();
  expect(ui.requests.at(-1)?.searchParams.get("offset")).toBe("50");
  expect(ui.container.querySelector("table")).toBe(table);
  expect(ui.container.querySelector('tbody[id]')).toBe(body);
  expect(body?.hasAttribute("hidden")).toBe(false);
  expect(ui.container.textContent).toContain("article-0");
  ids=ids.slice(1);
  await act(async()=>finish(Response.json({groups:[{seller_key:"shop",seller_name:"Shop",article_count:71,priced_article_count:71,exposure_usd:5300}],total_groups:99,next_offset:null,partial:false,updating:false})));
  expect(ui.container.querySelector(".monitoring-group-heading")).toBe(heading);
  expect(body?.hasAttribute("hidden")).toBe(false);
  expect(ui.container.textContent).toContain("Page 2");
  expect(ui.container.textContent).toContain("71 articles");
  expect(ui.container.textContent).toContain("$5,300.00");
  expect([...body!.querySelectorAll("td:not(.monitoring-group-footer)")].map(row=>row.textContent)).toEqual(ids);
  expect(ui.requests.slice(before).map(url=>url.searchParams.get("offset"))).toEqual(["50","0","50"]);
});

test("a failed background totals refresh keeps the open seller visible and can retry",async()=>{
  const ui=await setup();
  await ui.click('[aria-label="Expand Shop"]');
  const table=ui.container.querySelector("table");
  ui.respondWith(()=>Response.json({error:"Refresh failed"},{status:500}));
  await ui.refresh();
  expect(ui.container.querySelector("table")).toBe(table);
  expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("Refresh failed");
  expect(ui.container.textContent).toContain("first");
  ui.respondWith(undefined);
  await ui.click('[role="alert"] button');
  expect(ui.container.querySelector('[role="alert"]')).toBeNull();
  expect(ui.container.querySelector("table")).toBe(table);
  expect(ui.container.querySelector('[aria-label="Collapse Shop"]')).not.toBeNull();
});

test("seller pagination requests pages of groups instead of pages of articles",async()=>{
  const ui=await setup();
  await ui.click('.monitoring-results-pagination button:last-child');
  expect(ui.requests.at(-1)?.pathname).toBe("/api/monitoring/tasks/seller-groups");
  expect(ui.requests.at(-1)?.searchParams.get("offset")).toBe("50");
  expect(ui.container.textContent).toContain("Page 2");
});

test("an older API cannot masquerade page counts as global seller totals",async()=>{
  const ui=await setup(true);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("Seller totals are unavailable");
  expect(ui.container.querySelector('table')).toBeNull();
  await ui.click('[role="alert"] button:last-child');
  expect(ui.ungrouped()).toBe(true);
});


test("top seller rankings wait for the complete search instead of displaying provisional groups",async()=>{
  const ui=await setup(false,true);
  expect(ui.container.querySelector("table")).toBeNull();
  expect(ui.container.textContent).toContain("ranking will appear when the full search completes");
  expect(ui.requests).toHaveLength(1);
});

test("total listing price uses the owned membership API, displays the right basis, and expands canonical seller items",async()=>{
 const window=new Window({url:"http://localhost:5173"});
 Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 const container=document.createElement("div");document.body.replaceChildren(container);const requests:URL[]=[];
 globalThis.fetch=(async(input)=>{
   const url=new URL(String(input),"http://localhost:5173");requests.push(url);
   const base={policy_version:"task-seller-value-v1",search_id:"saved",offset:0,state:"completed",partial:false,next_offset:null};
   return Response.json(url.pathname.endsWith("/listings")?{...base,seller_key:"shop",sort:"priority",rows:[{task_id:"task",result_id:"result",seller_key:"shop"}]}:{...base,ranking_limit:null,as_of:new Date().toISOString(),updating:false,total_groups:1,groups:[{seller_key:"shop",seller_name:"Shop",article_count:3,priced_article_count:2,total_price_usd:"30.30"}]});
 }) as typeof fetch;
 root=createRoot(container);
 await act(async()=>root!.render(<SellerGroupedQueue query={{ip_id:"ip",status:"pending",sort:"priority",search_id:"saved",group_sort:"total_price"}} revision="0" selection={new Set()} onSelect={()=>{}} renderRow={row=><tr key={row.result_id}><td>{row.result_id}</td></tr>} onUngroup={()=>{}} onOpenGroup={()=>{}}/>));
 expect(requests[0].pathname).toBe("/api/monitoring/tasks/searches/saved/sellers");expect(container.textContent).toContain("Total listing price (USD)");expect(container.textContent).toContain("$30.30+");expect(container.textContent).not.toContain("Exposure (USD)");
 expect(container.querySelector('.monitoring-group-exposure')?.getAttribute('title')).toContain("quantities are not multiplied");
 await act(async()=>container.querySelector<HTMLButtonElement>('[aria-label="Expand Shop"]')!.click());
 expect(requests[1].pathname).toBe("/api/monitoring/tasks/searches/saved/sellers/listings");expect(requests[1].searchParams.get("seller_key")).toBe("shop");expect(container.textContent).toContain("result");
});
