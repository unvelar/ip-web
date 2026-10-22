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

test("seller value order and explicit limits are view state, survive reload, and cannot change filters",()=>{
 const params=new URLSearchParams({task_search:"owned",queue_filters:JSON.stringify({semantic:JSON.stringify({categories:["action_figures"]}),listing_price:JSON.stringify({currency:"USD",lt:"40"})})});
 const change=parseQueueViewChange({group_by:"seller",group_sort:"total_price",top_sellers:10});
 const next=queueViewParams(params,mergeQueueView(queueViewFromParams(params),change));
 expect(next.get("task_search")).toBe("owned");expect(next.get("queue_filters")).toBe(params.get("queue_filters"));
 expect(queueViewFromParams(next)).toEqual({sort:"newest",group_by:"seller",group_sort:"total_price",top_sellers:10});
 const unlimited=mergeQueueView(queueViewFromParams(next),{group_by:"seller",top_sellers:null});expect(unlimited.top_sellers).toBeUndefined();
 for(const change of [{group_sort:"total_price"},{group_by:"seller",top_sellers:101},{group_by:"none",group_sort:"total_price"}])expect(()=>parseQueueViewChange(change)).toThrow();
});

test("seller item previews survive reload without becoming seller eligibility or affecting the ranking metric",()=>{
 const filters=JSON.stringify({seller_listing_count:'{"gt":10}',listing_countries:'["IT"]'});
 const before=new URLSearchParams({task_search:'complete',queue_filters:filters,group_by:'seller',group_sort:'exposure',top_sellers:'25'});
 const capped=queueViewParams(before,mergeQueueView(queueViewFromParams(before),parseQueueViewChange({group_by:'seller',items_per_seller:3})));
 expect(capped.get('queue_filters')).toBe(filters);expect(capped.get('task_search')).toBe('complete');expect(queueViewFromParams(capped)).toMatchObject({group_sort:'exposure',top_sellers:25,items_per_seller:3});
 const uncapped=mergeQueueView(queueViewFromParams(capped),{group_by:'seller',items_per_seller:null});expect(uncapped.items_per_seller).toBeUndefined();expect(uncapped.group_sort).toBe('exposure');
 expect(mergeQueueView(queueViewFromParams(capped),{group_by:'none'}).items_per_seller).toBeUndefined();
 for(const limit of [0,51,1.5,'3'])expect(()=>parseQueueViewChange({group_by:'seller',items_per_seller:limit})).toThrow();
});


test("rollback to an older API strips the unsupported preview field from conversation context",async()=>{
 const {translateListingSearch}=await import("../src/api/listingSearch");const {emptyListingFilters}=await import("../src/lib/listingSearch");let body:Record<string,unknown>={};
 globalThis.fetch=(async(_input,init)=>{body=JSON.parse(String(init?.body));return Response.json({version:1,jobs_started:0,query:{name:"set_queue_view",arguments:{group_by:"seller",group_sort:"exposure"}}});}) as typeof fetch;
 await translateListingSearch("Order by exposure",emptyListingFilters(null),new AbortController().signal,null,{mode:"continue",messages:[]},{sort:"priority",group_by:"seller",group_sort:"articles",items_per_seller:3},false,{});
 expect(body).not.toHaveProperty("query_view");expect(body.queue_view).not.toHaveProperty("items_per_seller");
});
