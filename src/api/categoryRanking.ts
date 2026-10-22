import {request} from "./transport";
import {getTaskSearch,type TaskSearchResult} from "./taskQueue";
import {parseCategoryRanking,parseCategoryRankingRequest,type CategoryRankingRequest} from "../lib/categoryRanking";
import {categoryListingsPolicy} from "../lib/categoryRanking";
import {isRecord,requireResponse} from "./validation";
import type {TaskSummary} from "./taskQueue";
export type CategoryListingsPage={policy_version:typeof categoryListingsPolicy;search_id:string;state:string;category_key:string|null;sort:"priority"|"newest";offset:number;total_listings:number|null;rows:TaskSummary[];next_offset:number|null};
export async function taskCategoryListings(id:string,category:string|null,offset:number,sort:"priority"|"newest",signal:AbortSignal):Promise<CategoryListingsPage>{
  const params=new URLSearchParams({offset:String(offset),sort,...(category===null?{uncategorized:"true"}:{category_key:category})});
  const value=await request<unknown>(`/api/monitoring/tasks/searches/${encodeURIComponent(id)}/categories/listings?${params}`,{signal});
  requireResponse(isRecord(value)&&value.policy_version===categoryListingsPolicy&&value.search_id===id&&value.category_key===category&&value.sort===sort&&value.offset===offset&&value.state==="completed"&&Number.isSafeInteger(value.total_listings)&&Number(value.total_listings)>=0&&Array.isArray(value.rows)&&value.rows.length<=50&&(value.next_offset===null||value.next_offset===offset+50),"category listings");
  for(const row of value.rows as unknown[])requireResponse(isRecord(row)&&typeof row.task_id==="string"&&typeof row.result_id==="string"&&typeof row.found_at==="string"&&(row.price_value_usd==null||typeof row.price_value_usd==="number"&&Number.isFinite(row.price_value_usd)),"category listing row");
  return value as CategoryListingsPage;
}
export async function taskCategoryRanking(id:string,input:CategoryRankingRequest,signal:AbortSignal){
  const query=parseCategoryRankingRequest(input);
  const result=parseCategoryRanking(await request<unknown>(`/api/monitoring/tasks/searches/${encodeURIComponent(id)}/categories?${new URLSearchParams({metric:query.metric,limit:String(query.limit)})}`,{signal}));
  if(result.search_id!==id||result.metric!==query.metric||result.groups.length>query.limit)throw Error("Category ranking does not match this search.");
  return result;
}
function pause(signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  const finish=()=>{signal.removeEventListener("abort",abort);resolve();},timer=setTimeout(finish,1500);
  const abort=()=>{clearTimeout(timer);signal.removeEventListener("abort",abort);reject(signal.reason);};
  if(signal.aborted)abort();else signal.addEventListener("abort",abort,{once:true});
});}
export async function followTaskCategoryRanking(id:string,input:CategoryRankingRequest,signal:AbortSignal,initial?:TaskSearchResult){
  const deadline=AbortSignal.any([signal,AbortSignal.timeout(120000)]);
  let search=initial??await getTaskSearch(id,0,deadline);
  while(search.state==="pending"||search.state==="running"){
    await pause(deadline);search=await getTaskSearch(id,0,deadline);
  }
  deadline.throwIfAborted();
  if(search.state!=="completed")throw Error("The search is incomplete, so categories cannot be ranked accurately. Narrow the search and try again.");
  const report=await taskCategoryRanking(id,input,deadline);
  if(report.state!=="completed")throw Error("Category totals are not ready. Your filters were kept.");
  return {search,report};
}
