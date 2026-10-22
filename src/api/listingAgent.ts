import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";
import { parseListingFilters, parseSellerRanking, type ListingFilters, type SellerRanking } from "../lib/listingSearch";
import { taskSearchRequest, type TaskSearchValues } from "../lib/taskSearchAssistant";
import type { TaskQueueQuery, TaskSearchResult } from "./taskQueue";

export const listingAgentPolicy="listing-search-agent-v1";
export type AgentReceipt={id:string;revision:number;status:"working"|"waiting"|"completed"|"clarification"|"failed"|"cancelled";
  progress:string;message:string;filters:ListingFilters;ranking:SellerRanking|null;search:TaskSearchResult|null};
const uuid=(value:unknown):value is string=>typeof value==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
export function parseAgentReceipt(value:unknown):AgentReceipt {
  requireResponse(isRecord(value)&&value.version===1&&value.policy===listingAgentPolicy&&uuid(value.id)
    &&typeof value.revision==="number"&&Number.isSafeInteger(value.revision)&&value.revision>=0
    &&["working","waiting","completed","clarification","failed","cancelled"].includes(String(value.status))
    &&typeof value.progress==="string"&&value.progress.length<=2000&&typeof value.message==="string"&&value.message.length<=4000,"search agent receipt");
  const filters=parseListingFilters(value.filters),ranking=value.ranking===null?null:parseSellerRanking(value.ranking);
  const raw=value.search;
  requireResponse(raw===null||isRecord(raw)&&(raw.id===null||uuid(raw.id))
    &&["pending","running","completed","limited","failed","cancelled"].includes(String(raw.state))
    &&typeof raw.matched==="number"&&Number.isSafeInteger(raw.matched)&&raw.matched>=0
    &&(typeof raw.scanned==="number"&&Number.isSafeInteger(raw.scanned)&&raw.scanned>=0||typeof raw.scanned==="string"&&/^\d+$/.test(raw.scanned))
    &&(raw.rows===undefined||Array.isArray(raw.rows)&&raw.rows.length<=50&&raw.rows.every(row=>isRecord(row)&&typeof row.task_id==="string"&&typeof row.result_id==="string")),"agent search result");
  if(value.status==="completed")requireResponse(isRecord(raw)&&["completed","limited","cancelled"].includes(String(raw.state))&&(!ranking||raw.state==="completed"),"completed agent search");
  return {id:value.id,revision:value.revision,status:value.status as AgentReceipt["status"],progress:value.progress,message:value.message,
    filters,ranking,search:raw as TaskSearchResult|null};
}
async function read(path:string,method:string,signal:AbortSignal,body?:unknown) {
  return parseAgentReceipt(await request<unknown>("/api/monitoring/listings/agent/runs"+path,{method,signal:AbortSignal.any([signal,AbortSignal.timeout(25000)]),
    ...(body===undefined?{}:{body:JSON.stringify(body)})}));
}
export function startListingAgent(message:string,filters:ListingFilters,values:TaskSearchValues,status:TaskQueueQuery["status"],ranking:SellerRanking|null,
  signal:AbortSignal,requestKey:string,previousRunId?:string) {
  const request=taskSearchRequest(values,filters.ip_id!,status,filters.catalog_product_id??undefined);
  const queue=Object.fromEntries(Object.entries(request).filter(([key])=>!["ip_id","catalog_product_id","status","q","semantic","listing_constraints","min_price_usd","max_price_usd"].includes(key)));
  return read("","POST",signal,{request_key:requestKey,message,filters,ranking,queue,...(previousRunId?{previous_run_id:previousRunId}:{})});
}
export const getListingAgent=(id:string,signal:AbortSignal)=>read("/"+encodeURIComponent(id),"GET",signal);
export const advanceListingAgent=(run:AgentReceipt,signal:AbortSignal)=>read("/"+encodeURIComponent(run.id)+"/advance","POST",signal,{revision:run.revision});
export const cancelListingAgent=(id:string)=>read("/"+encodeURIComponent(id),"DELETE",new AbortController().signal);
const pause=(milliseconds:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  const abort=()=>{clearTimeout(timer);reject(signal.reason??new DOMException("Aborted","AbortError"));};
  const timer=setTimeout(()=>{signal.removeEventListener("abort",abort);resolve();},milliseconds);
  signal.addEventListener("abort",abort,{once:true});if(signal.aborted)abort();
});
export async function followListingAgent(initial:AgentReceipt,signal:AbortSignal,onProgress:(run:AgentReceipt)=>void):Promise<AgentReceipt> {
  let run=initial;
  while(run.status==="working"||run.status==="waiting"){
    signal.throwIfAborted();onProgress(run);
    await pause(run.status==="waiting"?1500:100,signal);
    const next=await advanceListingAgent(run,signal);
    requireResponse(next.id===run.id&&next.revision>=run.revision&&next.filters.ip_id===initial.filters.ip_id,"search agent continuation");
    // A busy lease may return the same revision; wait without invoking the model.
    if(next.revision===run.revision)await pause(1500,signal);
    run=next;
  }
  onProgress(run);return run;
}
