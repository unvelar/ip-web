import {categoryRankingPolicy} from "../src/lib/categoryRanking";
import {queueViewParams,type QueueView} from "../src/lib/queueView";
import { afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import TaskSearch from "../src/components/TaskSearch";
import { emptyListingFilters, type ListingFilters } from "../src/lib/listingSearch";
import { queueSearchParams, taskAssistantFilters, taskSearchRequest, type AppliedTaskSearch } from "../src/lib/taskSearchAssistant";
import type { TaskQueueQuery } from "../src/api/taskQueue";
const ip="10000000-0000-4000-8000-000000000001";
const originalFetch=globalThis.fetch;
let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=originalFetch;});
async function setup(options:{extended?:boolean;clarify?:boolean;fail?:boolean;hold?:boolean;holdCreation?:boolean;title?:boolean;titleSupported?:boolean;agent?:boolean;agentWaiting?:boolean;agentReview?:boolean;categoryKey?:string;taxonomyUnavailable?:boolean;conversation?:boolean;queueView?:boolean;viewRanked?:boolean;categoryRanking?:boolean;categoryIncomplete?:boolean;emptySearch?:boolean;cleanScope?:boolean;translation?:(body:Record<string,unknown>,turn:number)=>Response}={}) {
  const window=new Window({url:"http://localhost:5174"});
  Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,Element:window.Element,localStorage:window.localStorage,sessionStorage:window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  const container=document.createElement("div");document.body.replaceChildren(container);
  const requests:Array<{path:string;body:Record<string,unknown>}> = [];
  const cancelled:string[]=[];
  const viewChanges:QueueView[]=[];
  const applied:AppliedTaskSearch[]=[];const errors:string[]=[];
  let release:((response:Response)=>void)|undefined;
  const agentId="40000000-0000-4000-8000-000000000001",searchId="50000000-0000-4000-8000-000000000001";
  let agentRevision=0;
  let translationTurn=0;
  const filters:ListingFilters=options.title?{...emptyListingFilters(ip),query:"old",title_contains:"L261"}:{...emptyListingFilters(ip),semantic:{categories:[options.categoryKey??"miniature"]},seller_listing_count:{gt:10},countries:["CN","FR"],price:{currency:"EUR",lt:"40"}};
  if(options.agentReview)filters.status="review";
  const translated=()=>Response.json({version:1,jobs_started:0,filters,query:options.clarify?{name:"request_clarification",arguments:{reason:"unsupported_capability",capability:"shipping"}}:{name:options.title?"search_listings":"rank_sellers",arguments:{ranking:{limit:10}}}});
  globalThis.fetch=(async(input,init)=>{
    const url=new URL(String(input),"http://localhost:5174");
    if(url.pathname.endsWith("translation-capability"))return Response.json({version:1,enabled:true,country_labels:{CN:"China",FR:"France"},...(options.agent?{search_agent_policy_version:"listing-search-agent-v1"}:{}),...(options.conversation?{conversation_policy_version:"listing-conversation-v1"}:{}),...(options.queueView?{queue_view_policy_version:"task-queue-view-v1"}:{}),...(options.categoryRanking?{category_ranking_policy_version:categoryRankingPolicy}:{})});
    if(url.pathname.endsWith("/tasks/capability"))return Response.json({active:true,ready:true,...(options.titleSupported===false?{}:{title_search_policy_version:"literal-title-substring-v1"}),...(options.extended===false?{}:{listing_search_policy_version:"task-listing-search-v1"})});
    if(url.pathname.endsWith("/semantic-taxonomy"))return options.taxonomyUnavailable?Response.json({error:"Unavailable"},{status:503}):Response.json({categories:[{key:"miniature",label:"Miniature"},{key:"ae_2_2_8",label:"Scale Models"}]});
    if(url.pathname.includes("/agent/runs")){
      const body=init?.body?JSON.parse(String(init.body)):{};requests.push({path:url.pathname,body});
      if(init?.method==="DELETE")cancelled.push(url.pathname);
      if(url.pathname.endsWith("/advance"))agentRevision++;
      const state=init?.method==="DELETE"?"cancelled":agentRevision>=2&&!options.agentWaiting?"completed":agentRevision?"waiting":"working";
      return Response.json({version:1,policy:"listing-search-agent-v1",id:agentId,revision:agentRevision,status:state,
        progress:"Searching the queue…",message:state==="completed"?"7 matches. 42 candidates checked.":"",filters,ranking:null,
        search:state==="working"?null:{id:searchId,state:state==="completed"?"completed":"running",scanned:42,matched:state==="completed"?7:0,rows:[]}});
    }
    if(options.categoryRanking&&(!init?.method||init.method==="GET")&&url.pathname.includes("/tasks/searches/")){
      requests.push({path:url.pathname,body:{}});
      if(url.pathname.endsWith("/categories"))return Response.json({policy_version:categoryRankingPolicy,search_id:url.pathname.split("/").at(-2),state:"completed",metric:url.searchParams.get("metric"),currency:"USD",price_basis:"stored_listing_price",consistency:"saved_membership_current_categories",as_of:"2026-10-22T09:00:00.000Z",groups:[{category_key:"action_figures",category_label:"Action Figures",article_count:2,priced_article_count:2,missing_price_count:0,total_price_usd:"100.30"},{category_key:"scale_models",category_label:"Scale Models",article_count:1,priced_article_count:0,missing_price_count:1,total_price_usd:null}],total_categories:2,matching_listings:3,priced_listings:2,missing_price_listings:1});
      return Response.json({id:url.pathname.split("/").at(-1),state:options.categoryIncomplete&&url.pathname.endsWith("existing-search")?"limited":"completed",scanned:60,matched:3,rows:[]});
    }
    if(init?.method==="DELETE"){cancelled.push(url.pathname);return new Response(null,{status:204});}
    const body=JSON.parse(String(init?.body));requests.push({path:url.pathname,body});
    if(url.pathname.endsWith("/translate")){translationTurn++;return options.hold?await new Promise<Response>(resolve=>{release=resolve;}):options.translation?options.translation(body,translationTurn):translated();}
    if(url.pathname.endsWith("/searches"))return options.emptySearch?Response.json({id:null,state:"completed",scanned:0,matched:0}):options.holdCreation?await new Promise<Response>(resolve=>{release=resolve;}):options.fail?Response.json({error:"Search temporarily unavailable"},{status:503}):Response.json({id:"saved-search",state:"pending",scanned:0,matched:0});
    return Response.json({options:[]});
  }) as typeof fetch;
  let params=new URLSearchParams("country=Spain&source=source-one&q=old&history=on"+(options.queueView||options.categoryRanking?"&task_search=existing-search&queue_sort=newest":""));
  if(options.cleanScope){params.delete("country");params.delete("source");params.set("q","");}
  if(options.viewRanked){params.set("group_by","seller");params.set("group_sort","articles");params.set("top_sellers","10");}
  root=createRoot(container);
  const render=()=>root!.render(<TaskSearch ranking={options.viewRanked&&params.has("top_sellers")?{limit:Number(params.get("top_sellers"))}:null} onViewChange={options.queueView?async view=>{viewChanges.push(view);params=queueViewParams(params,view);render();return true;}:undefined} conversationOwner={options.conversation?"test-account":undefined} ipId={ip} status={(params.get("status")??"pending") as TaskQueueQuery["status"]} params={params} members={[]} onStart={(result,next)=>{applied.push(next);params=queueSearchParams(params,next,result.id);render();}} onError={error=>{if(error)errors.push(error);}}/>);
  await act(async()=>render());
  const button=(name:string)=>[...container.querySelectorAll<HTMLButtonElement>("button")].find(el=>el.getAttribute("aria-label")===name||el.textContent?.trim()===name)!;
  const click=async(name:string)=>{await act(async()=>button(name).click());};
  const fill=async(label:string,value:string)=>{
    const input=container.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    await act(async()=>{Object.getOwnPropertyDescriptor(input.tagName==="TEXTAREA"?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype,"value")!.set!.call(input,value);input.dispatchEvent(new window.Event("input",{bubbles:true}));input.dispatchEvent(new window.Event("change",{bubbles:true}));});
  };
  return {container,requests,applied,viewChanges,errors,cancelled,params:()=>params,click,fill,
    send:()=>click(button("Send message")?"Send message":"Reply"),
    remount:async()=>{await act(async()=>root!.unmount());root=createRoot(container);await act(async()=>render());},
    release:async()=>{await act(async()=>release?.(options.holdCreation?Response.json({id:"cancelled-search",state:"pending",scanned:0,matched:0}):translated()));},settle:async(ms=500)=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms));});}};
}

test("Ask submits only explicitly and commits the same scoped filters, dates and seller view once",async()=>{
  const ui=await setup();await ui.click("Ask");await ui.fill("Ask about listings","Top 10 miniature sellers under 40 euros in China or France with more than 10 matches");
  expect(ui.requests).toHaveLength(0);
  await ui.send();
  expect(ui.requests.map(item=>item.path)).toEqual(["/api/monitoring/listings/translate","/api/monitoring/tasks/searches"]);
  expect(ui.requests[1].body).toMatchObject({ip_id:ip,status:"pending",country:"Spain",source:"source-one",semantic:{categories:["miniature"]},listing_constraints:{countries:["CN","FR"],price:{currency:"EUR",lt:"40"},seller_listing_count:{gt:10}}});
  expect(ui.requests[1].body.from).toBeDefined();expect(ui.requests[1].body.to).toBeDefined();
  expect(ui.params().get("group_by")).toBe("seller");expect(ui.params().get("group_sort")).toBe("articles");expect(ui.params().get("top_sellers")).toBe("10");
  expect(ui.container.textContent).toContain("< 40 EUR");expect(ui.container.textContent).toContain("> 10 matching listings / seller");
  await ui.settle();expect(ui.requests).toHaveLength(2);
  await ui.click("Search");expect(ui.container.querySelector('input[aria-label="Search listings or sellers"]')).not.toBeNull();
});
test("an older server keeps advanced translated filters out of the queue",async()=>{
  const ui=await setup({extended:false});await ui.click("Ask");await ui.fill("Ask about listings","Find sellers with more than 10 matches");await ui.send();
  expect(ui.requests).toHaveLength(1);expect(ui.applied).toHaveLength(0);expect(ui.params().get("q")).toBe("old");expect(ui.container.textContent).toContain("not available in this queue yet");
});
test("category labels replace internal keys without changing filters or starting another search",async()=>{
  const ui=await setup({categoryKey:"ae_2_2_8"});await ui.click("Ask");await ui.fill("Ask about listings","miniatures");await ui.send();
  expect(ui.container.textContent).toContain("Scale Models");expect(ui.container.textContent).not.toContain("ae 2 2 8");
  expect(ui.requests[1].body.semantic).toEqual({categories:["ae_2_2_8"]});
  await ui.settle();expect(ui.requests).toHaveLength(2);
});
test("unavailable category labels keep a removable filter without exposing its internal key",async()=>{
  const ui=await setup({categoryKey:"ae_2_2_8",taxonomyUnavailable:true});await ui.click("Ask");await ui.fill("Ask about listings","miniatures");await ui.send();
  expect(ui.container.textContent).toContain("Product type");expect(ui.container.textContent).not.toContain("ae 2 2 8");
  expect(ui.requests[1].body.semantic).toEqual({categories:["ae_2_2_8"]});
  expect(ui.container.querySelector('button[aria-label="Remove product details filter"]')).not.toBeNull();
});
test("Ask reveals the active literal text filter and carries it into an empty draft without submitting",async()=>{
  const ui=await setup();await ui.click("Ask");
  expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Ask about listings"]')?.value).toBe("old");
  expect(ui.container.textContent).toContain("Text contains: old");expect(ui.requests).toHaveLength(0);
  await ui.click("Remove listing or seller text filter");await ui.settle();
  expect(ui.requests.at(-1)?.body).not.toHaveProperty("q");
  expect(ui.params().get("queue_filters")).not.toContain('"q":"old"');
});
test("switching modes preserves an Ask draft and does not overwrite it with literal search",async()=>{
  const ui=await setup();await ui.click("Ask");await ui.fill("Ask about listings","Only miniatures below 50 dollars");
  await ui.click("Search");await ui.click("Ask");
  expect(ui.container.querySelector<HTMLInputElement>('[aria-label="Ask about listings"]')?.value).toBe("Only miniatures below 50 dollars");
  expect(ui.requests).toHaveLength(0);
});
test("unsupported requests clarify without changing filters or launching a search",async()=>{
  const ui=await setup({clarify:true});await ui.click("Ask");await ui.fill("Ask about listings","Ships to France");await ui.send();
  expect(ui.requests).toHaveLength(1);expect(ui.applied).toHaveLength(0);expect(ui.container.textContent).toContain("Shipping destinations");expect(ui.container.textContent).toContain("Your filters were kept");
});
test("a manual edit invalidates an in-flight assistant translation",async()=>{
  const ui=await setup({hold:true});await ui.click("Ask");await ui.fill("Ask about listings","top sellers");await ui.send();
  await ui.click("Search");await ui.fill("Search listings or sellers","new literal");await ui.release();
  expect(ui.applied).toHaveLength(0);await ui.settle();expect(ui.applied).toHaveLength(1);expect(ui.requests.at(-1)?.body.q).toBe("new literal");expect(ui.requests.at(-1)?.body).not.toHaveProperty("listing_constraints");
});
test("a rejected search leaves confirmed controls and URL unchanged",async()=>{
  const ui=await setup({fail:true});await ui.click("Ask");await ui.fill("Ask about listings","top sellers");await ui.send();
  expect(ui.applied).toHaveLength(0);expect(ui.params().get("q")).toBe("old");expect(ui.container.textContent).not.toContain("< 40 EUR");expect(ui.container.textContent).toContain("latest request was not applied");expect(ui.errors).toHaveLength(1);
});
test("manual and translated constraints have one canonical request meaning",()=>{
  const values={q:"figure",from:"2026-10-01",to:"2026-10-21",min_price_usd:"0",max_price_usd:"10",country:"Spain",seller_origin:"China",semantic:'{"colors":["red"]}',seller_listing_count:'{"gte":10,"lt":20}'};
  const filters=taskAssistantFilters(values,ip,"pending");expect(filters.price).toEqual({currency:"USD",gte:"0",lte:"10"});expect(filters.countries).toEqual([]);
  expect(taskSearchRequest(values,ip,"pending")).toMatchObject({country:"Spain",seller_origin:"China",listing_constraints:{seller_listing_count:{gte:10,lt:20}}});
});


test("cancelling while a saved-search create is pending discards and cancels its acknowledgement",async()=>{
  const ui=await setup({holdCreation:true});await ui.click("Ask");await ui.fill("Ask about listings","top sellers");await ui.send();
  expect(ui.requests).toHaveLength(2);
  await ui.click("Cancel assistant request");await ui.release();
  expect(ui.applied).toHaveLength(0);expect(ui.cancelled).toEqual(["/api/monitoring/tasks/searches/cancelled-search"]);
  expect(ui.params().get("q")).toBe("old");
});


test("code requests become removable title-only filters without replacing other queue conditions",async()=>{
  const ui=await setup({title:true});await ui.click("Ask");await ui.fill("Ask about listings","L261 codes");await ui.send();
  expect(ui.requests.at(-1)?.body).toMatchObject({q:"old",country:"Spain",source:"source-one",listing_constraints:{title_contains:"L261"}});
  expect(ui.params().get("top_sellers")).toBeNull();
  expect(ui.container.textContent).toContain("Title contains: L261");
  await ui.click("Remove title contains filter");await ui.settle();
  expect(ui.requests.at(-1)?.body).not.toHaveProperty("listing_constraints");
  expect(ui.requests.at(-1)?.body).toMatchObject({q:"old",country:"Spain",source:"source-one"});
});
test("title-only filters cannot silently become a broad text search on older APIs",async()=>{
  const ui=await setup({title:true,titleSupported:false});await ui.click("Ask");await ui.fill("Ask about listings","L261 codes");await ui.send();
  expect(ui.requests).toHaveLength(1);expect(ui.applied).toHaveLength(0);expect(ui.params().get("q")).toBe("old");
  expect(ui.container.textContent).toContain("Title filtering is not available");
});
const conversationTranslation=(body:Record<string,unknown>,turn:number)=>{
  const filters=body.filters as ListingFilters;
  if(turn===2)return Response.json({version:1,jobs_started:0,filters,query:{name:"request_clarification",arguments:{reason:"ambiguous_request",question:"Below 40 and above 60 conflict. Replace the previous price range?",options:["Replace the previous price range","Keep the current search"],conflict_field:"price"}}});
  return Response.json({version:1,jobs_started:0,filters:{...filters,price:turn===1?{currency:"USD",lt:"40"}:{currency:"USD",gt:"60"}},query:{name:"search_listings",arguments:{changes:{}}}});
};
test("new AI search clears previous search predicates only on submit and Undo restores the exact previous scope",async()=>{
  const ui=await setup({conversation:true,translation:conversationTranslation});await ui.click("Ask");await ui.click("New chat");
  expect(ui.requests).toHaveLength(0);expect(ui.params().get("q")).toBe("old");
  await ui.fill("Ask about listings","Items below 40 dollars");await ui.send();
  expect(ui.requests[0].body.filters).toMatchObject({ip_id:ip,query:null,catalog_product_id:null,catalog_selection:null,countries:[],price:null,semantic:null,status:"pending"});
  expect(ui.requests[0].body.conversation).toEqual({mode:"new",messages:[]});
  expect(ui.requests[1].body).not.toHaveProperty("country");expect(ui.requests[1].body).not.toHaveProperty("source");expect(ui.requests[1].body).not.toHaveProperty("q");
  expect(ui.container.textContent).toContain("Started a new AI search");
  await ui.click("Undo last change");
  expect(ui.requests.at(-1)?.body).toMatchObject({q:"old",country:"Spain",source:"source-one"});
  expect(ui.requests.at(-1)?.body).not.toHaveProperty("listing_constraints");
  expect(ui.container.textContent).toContain("Restored the previous search conditions");
});
test("clarification keeps confirmed results and filters; an explicit range answer replays only the pending request and executes once",async()=>{
  const ui=await setup({conversation:true,translation:conversationTranslation});await ui.click("Ask");await ui.click("New chat");
  await ui.fill("Ask about listings","Below 40 dollars");await ui.send();
  const confirmed=ui.params().toString();
  await ui.fill("Ask about listings","Also above 60");await ui.send();
  expect(ui.applied).toHaveLength(1);expect(ui.params().toString()).toBe(confirmed);expect(ui.requests.filter(r=>r.path.endsWith("/searches"))).toHaveLength(1);
  expect(ui.container.textContent).toContain("Below 40 and above 60 conflict");
  await ui.remount();await ui.click("Ask");
  await ui.click("Replace the previous price range");
  expect(ui.applied).toHaveLength(2);expect(ui.requests.filter(r=>r.path.endsWith("/searches"))).toHaveLength(2);
  const request=ui.requests.filter(r=>r.path.endsWith("/translate")).at(-1)!;
  expect(request.body.message).toBe("Also above 60");
  expect(request.body.conversation).toMatchObject({mode:"continue",resolution:"price"});
  expect(request.body.conversation).toMatchObject({messages:[]});
  expect(ui.requests.at(-1)?.body.listing_constraints).toMatchObject({price:{currency:"USD",gt:"60"}});
});
test("a pending clarification survives reload and keeping the search starts no additional request",async()=>{
  const ui=await setup({conversation:true,translation:conversationTranslation});await ui.click("Ask");await ui.click("New chat");
  await ui.fill("Ask about listings","Below 40 dollars");await ui.send();await ui.fill("Ask about listings","Above 60 too");await ui.send();
  const requests=ui.requests.length;await ui.remount();await ui.click("Ask");
  expect(ui.container.textContent).toContain("Below 40 and above 60 conflict");
  await ui.click("Keep the current search");expect(ui.requests).toHaveLength(requests);expect(ui.applied).toHaveLength(1);
});
test("continuing a legacy literal query asks before retaining or removing its text",async()=>{
  const ui=await setup({conversation:true,translation:conversationTranslation});await ui.click("Ask");await ui.fill("Ask about listings","Items under 40 in Europe");await ui.send();
  expect(ui.requests).toHaveLength(0);expect(ui.container.textContent).toContain("literal text “old”");
  await ui.click("Remove text filter");expect((ui.requests[0].body.filters as ListingFilters).query).toBeNull();
  expect(ui.requests[1].body).not.toHaveProperty("q");expect(ui.requests[1].body).toMatchObject({country:"Spain",source:"source-one"});
});
test("switching to a new query invalidates an in-flight reply without launching a stale search",async()=>{
  const ui=await setup({conversation:true,hold:true});await ui.click("Ask");await ui.click("New chat");await ui.fill("Ask about listings","below 40");await ui.send();
  await ui.click("New chat");await ui.release();await ui.settle();
  expect(ui.applied).toHaveLength(0);expect(ui.requests).toHaveLength(1);
});

test("a free-text answer after reload retains new-search intent and the original clarification context",async()=>{
  const ui=await setup({conversation:true,translation:(body,turn)=>turn===1?Response.json({version:1,jobs_started:0,filters:body.filters,query:{name:"request_clarification",arguments:{reason:"ambiguous_request",question:"Which product type did you mean?",options:["Scale Models","Action Figures"]}}}):Response.json({version:1,jobs_started:0,filters:{...body.filters as ListingFilters,semantic:{categories:["ae_2_2_8"]}},query:{name:"search_listings",arguments:{changes:{}}}})});
  await ui.click("Ask");await ui.click("New chat");await ui.fill("Ask about listings","Miniatures");await ui.send();
  expect(ui.applied).toHaveLength(0);await ui.remount();await ui.click("Ask");await ui.fill("Ask about listings","I mean scale models");await ui.send();
  expect(ui.applied).toHaveLength(1);expect(ui.requests[1].body.filters).toMatchObject({query:null,countries:[],price:null});
  expect(ui.requests[1].body.conversation).toMatchObject({mode:"new"});expect(JSON.stringify(ui.requests[1].body.conversation)).toContain("Which product type");
  expect(ui.requests[2].body).not.toHaveProperty("country");expect(ui.requests[2].body.semantic).toEqual({categories:["ae_2_2_8"]});
});

 test("chat keeps the composer below messages and sends multiline replies only on unmodified Enter",async()=>{
  const ui=await setup({conversation:true,translation:conversationTranslation});await ui.click("Ask");await ui.click("New chat");
  const log=ui.container.querySelector('[role="log"]')!;
  const composer=ui.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Ask about listings"]')!;
  expect(log.compareDocumentPosition(composer)&4).toBe(4);
  expect(ui.container.querySelector('button[aria-label="Send message"]')?.textContent).toBe("Send");
  await ui.fill("Ask about listings","Scale models\nbelow 40 dollars");
  for(const options of [{shiftKey:true},{isComposing:true}]){
   const event=new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true,...options});
   await act(async()=>{composer.dispatchEvent(event);});
   expect(event.defaultPrevented).toBe(false);expect(ui.requests).toHaveLength(0);
  }
  const enter=new window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true});
  await act(async()=>{composer.dispatchEvent(enter);});
  expect(enter.defaultPrevented).toBe(true);expect(ui.applied).toHaveLength(1);
  expect(ui.requests[0].body.message).toBe("Scale models\nbelow 40 dollars");
  expect(ui.container.querySelector('button[aria-label="Reply"]')?.textContent).toBe("Reply");
  expect(ui.container.textContent).not.toContain("Continue current search");
 });

test("takedown-first is a view change: keeps search identity and predicates, creates no scan, and Undo restores order",async()=>{
 const ui=await setup({conversation:true,queueView:true,translation:body=>Response.json({version:1,jobs_started:0,filters:body.filters,query:{name:"set_queue_view",arguments:{sort:"priority",group_by:"none"}}})});
 await ui.click("Ask");await ui.fill("Ask about listings","Just sort by takedown recommendation without infringement filtering");await ui.send();
 expect(ui.requests).toHaveLength(1);expect(ui.requests[0].path).toEndWith("/translate");
 expect(ui.requests[0].body.queue_view).toEqual({sort:"newest",group_by:"none"});
 expect(ui.viewChanges).toEqual([{sort:"priority",group_by:"none"}]);
 expect(ui.params().get("task_search")).toBe("existing-search");expect(ui.params().get("q")).toBe("old");expect(ui.params().get("country")).toBe("Spain");expect(ui.params().get("source")).toBe("source-one");expect(ui.params().get("queue_sort")).toBe("priority");
 expect(ui.container.textContent).toContain("other matching items remain included");expect(ui.container.textContent).not.toContain("literal text “old”");
 await ui.click("Undo last change");expect(ui.params().get("queue_sort")).toBe("newest");expect(ui.params().get("task_search")).toBe("existing-search");expect(ui.requests).toHaveLength(1);
});
test("unavailable category grouping is explained without demanding a product type or changing the matching set",async()=>{
 const ui=await setup({conversation:true,queueView:true,translation:body=>Response.json({version:1,jobs_started:0,filters:body.filters,query:{name:"set_queue_view",arguments:{unavailable:"seller_ranking_per_category"}}})});
 await ui.click("Ask");await ui.fill("Ask about listings","Top 10 sellers per product category");await ui.send();
 expect(ui.container.textContent).toContain("Top sellers within each product category is not available yet");expect(ui.applied).toHaveLength(0);expect(ui.viewChanges).toHaveLength(0);expect(ui.requests).toHaveLength(1);expect(ui.params().get("task_search")).toBe("existing-search");
});

test("showing individual items can undo back to the previous top-seller view without rerunning its search",async()=>{
  const ui=await setup({conversation:true,queueView:true,viewRanked:true,translation:()=>Response.json({version:1,jobs_started:0,query:{name:"set_queue_view",arguments:{sort:"priority",group_by:"none"}}})});
  await ui.click("Ask");await ui.fill("Ask about listings","Just sort by takedown recommendation without infringement filtering");await ui.send();
  expect(ui.params().has("top_sellers")).toBe(false);expect(ui.params().get("task_search")).toBe("existing-search");
  await ui.click("Undo last change");
  expect(ui.params().get("top_sellers")).toBe("10");expect(ui.params().get("group_by")).toBe("seller");expect(ui.params().get("group_sort")).toBe("articles");
  expect(ui.requests.map(item=>item.path)).toEqual(["/api/monitoring/listings/translate"]);
});

test("category total-price answer uses the full saved search, retains predicates, displays honest price coverage and survives reload",async()=>{
  const ui=await setup({conversation:true,categoryRanking:true,translation:body=>{
    expect(body.category_ranking).toBe(true);
    return Response.json({version:1,jobs_started:0,query:{name:'rank_categories',arguments:{metric:'total_price',limit:10}}});
  }});
  await ui.click('Ask');await ui.fill('Ask about listings','Highest total price across listings');await ui.send();
  expect(ui.requests.map(item=>item.path)).toEqual(['/api/monitoring/listings/translate','/api/monitoring/tasks/searches/existing-search','/api/monitoring/tasks/searches/existing-search/categories']);
  expect(ui.params().get('q')).toBe('old');expect(ui.params().get('country')).toBe('Spain');expect(ui.params().get('task_search')).toBe('existing-search');
  expect(ui.applied).toHaveLength(0);expect(ui.container.querySelector('table[aria-label="Product category ranking"]')?.textContent).toContain('Action Figures');
  expect(ui.container.textContent).toContain('$100.30');expect(ui.container.textContent).toContain('Unavailable');expect(ui.container.textContent).toContain('1 missing prices');
  const count=ui.requests.length;await ui.remount();await ui.click('Ask');
  expect(ui.container.querySelector('table[aria-label="Product category ranking"]')).not.toBeNull();expect(ui.requests).toHaveLength(count);
});

test("new-chat category metric clarification starts one fresh query and waits before committing the ranking",async()=>{
  const ui=await setup({conversation:true,categoryRanking:true,translation:(_body,turn)=>Response.json({version:1,jobs_started:0,query:turn===1?{name:'request_clarification',arguments:{reason:'ambiguous_request',question:'Total listing price or listing count?',options:['Highest total price across listings','Most listings']}}:{name:'rank_categories',arguments:{metric:'total_price',limit:10}}})});
  await ui.click('Ask');await ui.click('New chat');await ui.fill('Ask about listings','most important product category by amount (price)');await ui.send();
  expect(ui.requests).toHaveLength(1);expect(ui.params().get('q')).toBe('old');
  await ui.click('Highest total price across listings');
  expect(ui.params().get('q')).toBe('old');expect(ui.container.textContent).toContain('Calculating category totals');
  await ui.settle(1600);
  expect(ui.requests.filter(item=>item.path==='/api/monitoring/tasks/searches')).toHaveLength(1);
  expect(ui.applied).toHaveLength(1);expect(ui.params().get('task_search')).toBe('saved-search');
  const create=ui.requests.find(item=>item.path==='/api/monitoring/tasks/searches')!;
  expect(create.body).not.toHaveProperty('listing_constraints');expect(create.body).not.toHaveProperty('q');expect(create.body).not.toHaveProperty('country');
  expect(ui.container.querySelector('table[aria-label="Product category ranking"]')).not.toBeNull();
  expect(ui.container.textContent).not.toContain('could not finish');expect(ui.container.textContent).not.toContain('price range');
});

test("incomplete searches cannot produce a category ranking or replace the confirmed filters",async()=>{
  const ui=await setup({conversation:true,categoryRanking:true,categoryIncomplete:true,translation:()=>Response.json({version:1,jobs_started:0,query:{name:'rank_categories',arguments:{metric:'total_price',limit:10}}})});
  await ui.click('Ask');await ui.fill('Ask about listings','Highest total price across listings');await ui.send();
  expect(ui.container.textContent).toContain('cannot be ranked accurately');expect(ui.container.querySelector('table')).toBeNull();
  expect(ui.params().get('q')).toBe('old');expect(ui.params().get('task_search')).toBe('existing-search');expect(ui.applied).toHaveLength(0);
  expect(ui.requests.some(item=>item.path.endsWith('/categories'))).toBe(false);
});
test("a verified empty new search shows no categories and commits its empty query without looping",async()=>{
  const ui=await setup({conversation:true,categoryRanking:true,emptySearch:true,translation:()=>Response.json({version:1,jobs_started:0,query:{name:'rank_categories',arguments:{metric:'total_price',limit:10}}})});
  await ui.click('Ask');await ui.click('New chat');await ui.fill('Ask about listings','Rank categories by total listing price');await ui.send();
  expect(ui.applied).toHaveLength(1);expect(ui.params().has('task_search')).toBe(false);expect(ui.params().get('queue_filters')).not.toContain('"q":"old"');
  expect(ui.container.textContent).toContain('No categories in this matching set');expect(ui.container.textContent).toContain('0 matching listings');
  expect(ui.requests.map(item=>item.path)).toEqual(['/api/monitoring/listings/translate','/api/monitoring/tasks/searches']);
  await ui.settle();expect(ui.requests).toHaveLength(2);
});

test("New chat restarts a stopped search even when the fresh filter scope is identical",async()=>{
  const ui=await setup({conversation:true,categoryRanking:true,categoryIncomplete:true,cleanScope:true,translation:()=>Response.json({version:1,jobs_started:0,query:{name:'rank_categories',arguments:{metric:'total_price',limit:10}}})});
  await ui.click('Ask');await ui.click('New chat');await ui.fill('Ask about listings','Highest total price across listings');await ui.send();await ui.settle(1600);
  expect(ui.requests.filter(item=>item.path==='/api/monitoring/tasks/searches')).toHaveLength(1);expect(ui.params().get('task_search')).toBe('saved-search');
  expect(ui.container.querySelector('table[aria-label="Product category ranking"]')).not.toBeNull();
  expect(ui.requests.some(item=>item.path==='/api/monitoring/tasks/searches/existing-search')).toBe(false);
});
