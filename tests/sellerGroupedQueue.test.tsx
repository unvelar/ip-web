import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SellerGroupedQueue } from "../src/components/monitoring/board/SellerGroupedQueue";
import type { TaskSellerGroupsQuery } from "../src/api/taskQueue";

let root: Root | undefined;
const originalFetch=globalThis.fetch;
afterEach(async()=>{ if(root) await act(async()=>root?.unmount()); root=undefined; globalThis.fetch=originalFetch; });

async function setup(fail=false) {
  const window=new Window({url:"http://localhost:5173"});
  Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
  const container=document.createElement("div"); document.body.replaceChildren(container);
  const requests:URL[]=[];
  globalThis.fetch=(async(input)=>{
    const url=new URL(String(input),"http://localhost:5173"); requests.push(url);
    if(fail) return new Response(JSON.stringify({error:"Missing"}),{status:404});
    if(url.pathname.endsWith("/listings")) {
      const more=url.searchParams.get("offset")==="50";
      return Response.json({rows:[{result_id:more?"second":"first",task_id:more?"second":"first"}],next_offset:more?null:50});
    }
    return Response.json({groups:[{seller_key:"shop",seller_name:"Shop",article_count:72,priced_article_count:70,exposure_usd:5432.10}],total_groups:99,next_offset:50,partial:false,updating:false});
  }) as typeof fetch;
  let query:TaskSellerGroupsQuery={ip_id:"ip",status:"pending",sort:"priority",group_sort:"exposure",search_id:"saved-search"};
  let selected=new Set<string>(); let ungrouped=false;
  root=createRoot(container);
  const render=()=>root!.render(<SellerGroupedQueue key={JSON.stringify(query)} query={query} revision="0" selection={selected}
    onSelect={(ids,checked)=>{ selected=new Set(selected); for(const id of ids){if(checked) selected.add(id);else selected.delete(id);} render(); }}
    renderRow={row=><tr key={row.result_id}><td>{row.result_id}</td></tr>}
    onUngroup={()=>{ungrouped=true;}} onOpenGroup={()=>{}} />);
  await act(async()=>render());
  return {container,requests,selected:()=>selected,ungrouped:()=>ungrouped,
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
