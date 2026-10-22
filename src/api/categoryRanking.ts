import {request} from "./transport";
import {getTaskSearch,type TaskSearchResult} from "./taskQueue";
import {parseCategoryRanking,parseCategoryRankingRequest,type CategoryRankingRequest} from "../lib/categoryRanking";
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
