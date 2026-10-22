import {afterEach,expect,test} from "bun:test";
import {getTaskSearch} from "../src/api/taskQueue";
import {mergeQueueView,parseQueueViewChange,queueViewFromParams,queueViewParams,queueViewPolicy} from "../src/lib/queueView";

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});

test("changing a saved search view retains its membership and all confirmed predicates",()=>{
  const params=new URLSearchParams({ip_id:"brand",task_search:"saved-membership",queue_filters:JSON.stringify({q:"goblin",listing_countries:["ES"],semantic:{categories:["scale_models"]}}),status:"pending",group_by:"seller",group_sort:"articles",top_sellers:"10"});
  const current=queueViewFromParams(params);
  expect(current).toEqual({sort:"newest",group_by:"seller",group_sort:"articles",top_sellers:10});
  const next=queueViewParams(params,mergeQueueView(current,{sort:"priority",group_by:"none"}));
  for(const key of ["ip_id","task_search","queue_filters","status"])expect(next.get(key)).toBe(params.get(key));
  expect(next.get("queue_sort")).toBe("priority");expect(next.has("top_sellers")).toBe(false);expect(next.has("group_sort")).toBe(false);
  const restored=queueViewParams(next,current);
  expect(restored.get("top_sellers")).toBe("10");expect(restored.get("group_sort")).toBe("articles");
  expect(parseQueueViewChange({sort:"priority"})).toEqual({sort:"priority"});
  expect(()=>parseQueueViewChange({sort:"priority",semantic:{}})).toThrow();
  expect(()=>parseQueueViewChange({group_by:"category"})).toThrow();
});

test("saved-search sorting cannot label an older API's natural-order page as recommendation-first",async()=>{
  let url="";
  globalThis.fetch=(async input=>{url=String(input);return Response.json({id:"saved",state:"completed",rows:[]});}) as typeof fetch;
  await expect(getTaskSearch("saved",0,undefined,"priority")).rejects.toThrow("cannot order saved search results");
  expect(url).toContain("sort=priority");
  globalThis.fetch=(async()=>Response.json({id:"saved",state:"completed",rows:[],sort:"priority",queue_view_policy_version:queueViewPolicy})) as typeof fetch;
  expect((await getTaskSearch("saved",50,undefined,"priority")).sort).toBe("priority");
});
