import {afterEach,expect,test} from 'bun:test';
import {Window} from 'happy-dom';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueueSearchBar} from '../src/components/QueueSearchBar';
import {marketplaceGrouping} from '../src/lib/taskGrouping';
import type {TaskSearchResult} from '../src/api/taskQueue';
const original=globalThis.fetch;let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=original;});
const ip='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001';
async function setup({supported=true,hold=false,mutation=false}={}){
 const window=new Window({url:'http://localhost:5173'});Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,Element:window.Element,localStorage:window.localStorage,sessionStorage:window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
 const requests:Record<string,unknown>[]=[],applied:unknown[]=[];let resolve:((response:Response)=>void)|undefined;
 globalThis.fetch=(async(input,init)=>{
  const url=new URL(String(input),'http://localhost:5173');
  if(url.pathname.endsWith('/translation-capability'))return Response.json({version:1,enabled:true,country_labels:{},conversation_policy_version:'listing-conversation-v1',conversation_answers_policy_version:'listing-conversation-answers-v1',queue_view_policy_version:'task-queue-view-v1',query_view_policy_version:'listing-query-view-v1',grouping_policy_version:'task-grouping-v1',...(supported?{result_analysis_policy_version:'listing-result-analysis-v1'}:{})});
  if(url.pathname.endsWith('/tasks/capability'))return Response.json({active:true,ready:true,listing_search_policy_version:'task-listing-search-v1'});
  if(url.pathname.endsWith('/translate')){
   const body=JSON.parse(String(init?.body));requests.push(body);
   if(hold)return new Promise<Response>(r=>{resolve=r;});
   return Response.json({version:1,jobs_started:0,filters:body.filters,query:mutation?{name:'search_listings',arguments:{changes:{}}}:{name:'answer_question',arguments:{answer:'Market A accounts for 60% of the matching listings. Compare its sellers next.'}}});
  }
  return Response.json({categories:[]});
 }) as typeof fetch;
 const container=document.createElement('div');document.body.replaceChildren(container);root=createRoot(container);
 const render=async(state:TaskSearchResult['state'],searchId=id)=>{await act(async()=>root!.render(<QueueSearchBar standalone initialAsk searchId={searchId} searchState={state} ipId={ip} values={{q:'',from:'2026-10-01',to:'2026-10-23',website:'market.test'}} status="pending" ranking={null} view={{sort:'priority',group_by:'none',grouping:marketplaceGrouping()}} onViewChange={async view=>{applied.push(view);return true;}} onApply={async next=>{applied.push(next);return true;}} onExtended={()=>{}} onTitleSearch={()=>{}} onChange={()=>{}} onAgentResult={()=>{}} onAgentSearching={()=>{}}/>));};
 return {container,requests,applied,render,release:(filters:unknown)=>resolve?.(Response.json({version:1,jobs_started:0,filters,query:{name:'answer_question',arguments:{answer:'Stale analysis'}}}))};
}
test('completed grouped searches feed actual membership to read-only AI summaries and do not duplicate them',async()=>{
 const ui=await setup();await ui.render('running');expect(ui.requests).toHaveLength(0);
 await ui.render('completed');expect(ui.requests).toHaveLength(1);expect(ui.requests[0]).toMatchObject({analysis_search_id:id,analysis_only:true,conversation_answers:true});
 expect(ui.container.textContent).toContain('Market A accounts for 60%');expect(ui.applied).toHaveLength(0);
 await ui.render('completed');expect(ui.requests).toHaveLength(1);
 const input=ui.container.querySelector('textarea')!;
 await act(async()=>{const win=window as unknown as Window;Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Why should I focus on this marketplace?');input.dispatchEvent(new win.Event('input',{bubbles:true}));});
 await act(async()=>{(ui.container.querySelector('[aria-label="Reply"]') as HTMLButtonElement).click();});
 expect(ui.requests).toHaveLength(2);expect(ui.requests[1]).toMatchObject({analysis_search_id:id});expect(ui.requests[1]).not.toHaveProperty('analysis_only');expect(ui.applied).toHaveLength(0);
});
test('unsupported APIs skip analysis and a returned action cannot mutate results from the summary path',async()=>{
 const ui=await setup({mutation:true});await ui.render('completed');expect(ui.applied).toHaveLength(0);expect(ui.container.textContent).toContain('Retry analysis');
 await act(async()=>root?.unmount());root=undefined;
 const old=await setup({supported:false});await old.render('completed');expect(old.requests).toHaveLength(0);
});
test('changing search scope discards a late analysis response',async()=>{
 const ui=await setup({hold:true});await ui.render('completed');expect(ui.requests).toHaveLength(1);
 const filters=ui.requests[0].filters;await ui.render('running','30000000-0000-4000-8000-000000000001');
 await act(async()=>{ui.release(filters);await Promise.resolve();});expect(ui.container.textContent).not.toContain('Stale analysis');expect(ui.applied).toHaveLength(0);
});
