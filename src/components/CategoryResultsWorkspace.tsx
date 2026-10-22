import {useEffect,useState,type ReactNode} from "react";
import {taskCategoryListings,taskCategoryRanking,type CategoryListingsPage} from "../api/categoryRanking";
import {categoryListingsPolicy,type CategoryRanking,type CategoryRankingGroup} from "../lib/categoryRanking";
import type {TaskSummary} from "../api/taskQueue";
import {CategoryRankingResult} from "./CategoryRankingResult";
import {isApiError} from "../api/transport";

type View={kind:"categories"}|{kind:"listings";group:CategoryRankingGroup;offset:number;previous:number[]};
export function CategoryResultsWorkspace({initialReport,onClose,onSelectionReset,renderRow,revision=0}:{initialReport:CategoryRanking;onClose:()=>void;onSelectionReset:()=>void;renderRow:(row:TaskSummary)=>ReactNode;revision?:number}){
  const [report,setReport]=useState(initialReport);
  const [view,setView]=useState<View>({kind:"categories"});
  const [sort,setSort]=useState<"priority"|"newest">("priority");
  const [retry,setRetry]=useState(0);
  const id=initialReport.search_id;
  const drilling=view.kind==="listings";
  const requestKey=JSON.stringify({id,drilling,category:view.kind==="listings"?view.group.category_key:null,offset:view.kind==="listings"?view.offset:0,sort,retry,revision,metric:initialReport.metric,limit:Math.max(1,initialReport.groups.length)});
  const [resource,setResource]=useState<{key:string;page?:CategoryListingsPage;error?:string}|null>(()=>{
    const age=Date.now()-Date.parse(initialReport.as_of);
    return initialReport.state==="completed"&&age>=-10000&&age<60000?{key:requestKey}:null;
  });
  const resolved=resource?.key===requestKey?resource:null;
  const page=resolved?.page;
  const error=resolved?.error??"";
  const loading=Boolean(id)&&!resolved;
  useEffect(()=>{
    const q=JSON.parse(requestKey);
    if(!q.id||resource?.key===requestKey)return;
    const controller=new AbortController();
    const load=async()=>{
      if(q.drilling){
        const page=await taskCategoryListings(q.id,q.category,q.offset,q.sort,controller.signal);
        if(!controller.signal.aborted)setResource({key:requestKey,page});
      }else{
        const result=await taskCategoryRanking(q.id,{metric:q.metric,limit:q.limit},controller.signal);
        if(result.state!=="completed")throw Error("This search is incomplete. Category totals are unavailable.");
        if(!controller.signal.aborted){setReport(result);setResource({key:requestKey});}
      }
    };
    void load().catch(error=>{if(!controller.signal.aborted)setResource({key:requestKey,error:isApiError(error)&&error.status>=500?(q.drilling?"Category listings could not be loaded. Try again.":"Category totals could not be refreshed. Showing the previous result."):error instanceof Error?error.message:"Could not load category results."});});
    return()=>controller.abort();
  },[requestKey,resource?.key]);
  const available=report.listing_policy_version===categoryListingsPolicy&&Boolean(id);
  const back=()=>{onSelectionReset();setView({kind:"categories"});};
  return <section className="task-category-workspace" aria-label="Category results" aria-busy={loading}>
    <header className="task-category-workspace-header">
      <div>{drilling&&<button type="button" className="task-queue-button" onClick={back}>← Back to categories</button>}<h2>{view.kind==="listings"?view.group.category_label:"Category breakdown"}</h2></div>
      <div>{view.kind==="listings"?<label>Sort <select aria-label="Sort category listings" value={sort} onChange={event=>{onSelectionReset();setSort(event.target.value as typeof sort);setView({...view,offset:0,previous:[]});}}><option value="priority">Takedown recommendations first</option><option value="newest">Newest first detected</option></select></label>:<button type="button" className="task-queue-button" disabled={loading} onClick={()=>setRetry(value=>value+1)}>Refresh totals</button>}<button type="button" className="task-queue-button" onClick={()=>{onSelectionReset();onClose();}}>Show all listings</button></div>
    </header>
    {error&&<p className="task-queue-notice" role="alert">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
    {view.kind==="categories"?<>
      {loading&&<p className="task-queue-notice" role="status">Refreshing category totals…</p>}
      <CategoryRankingResult report={report} listingsAvailable={available&&!loading&&!error} onViewListings={group=>{onSelectionReset();setView({kind:"listings",group,offset:0,previous:[]});}}/>
      {!available&&report.groups.length>0&&!loading&&<p className="task-queue-notice">Viewing listings by category is not available yet.</p>}
    </>:<>
      <p className="task-category-page-status" role="status">{loading?"Loading category listings…":page?`${page.total_listings?.toLocaleString()} matching listings in this category`:error?"Category listings unavailable":""}</p>
      <table className="monitoring-result-list" aria-label="Category listings"><thead><tr><th><span className="sr-only">Selection</span></th><th>Listing / seller / first detected</th><th>Price (USD)</th><th>Suggested action</th></tr></thead><tbody>{!loading&&!error&&page?.rows.map(renderRow)}</tbody></table>
      {!loading&&!error&&page?.rows.length===0&&<p className="monitoring-results-empty">No listings currently belong to this category.</p>}
      <div className="monitoring-results-pagination"><button type="button" disabled={loading||!view.previous.length} onClick={()=>{onSelectionReset();setView({...view,offset:view.previous.at(-1)!,previous:view.previous.slice(0,-1)});}}>Previous</button><button type="button" disabled={loading||error!==""||page?.next_offset==null} onClick={()=>{if(page?.next_offset==null)return;onSelectionReset();setView({...view,offset:page.next_offset,previous:[...view.previous,view.offset]});}}>Next</button></div>
    </>}
  </section>;
}
