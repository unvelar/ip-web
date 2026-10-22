import {request} from "./transport";
import {isRecord,requireResponse} from "./validation";
import {sellerValuePolicy} from "../lib/queueView";
import type {TaskSellerGroupsQuery,TaskSellerGroupsPage,TaskSellerGroupListingsPage} from "./taskQueue";

const count=(value:unknown):value is number=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
async function read(query:TaskSellerGroupsQuery,suffix:string,extra:Record<string,string>,signal?:AbortSignal){
  requireResponse(Boolean(query.search_id),"saved seller-value membership");
  const params=new URLSearchParams({offset:String(query.offset??0),...extra});
  const value=await request<unknown>(`/api/monitoring/tasks/searches/${encodeURIComponent(query.search_id!)}/sellers${suffix}?${params}`,{signal});
  requireResponse(isRecord(value)&&value.policy_version===sellerValuePolicy&&value.search_id===query.search_id&&["pending","running","completed","limited","failed","cancelled"].includes(String(value.state))&&value.offset===(query.offset??0)&&typeof value.partial==="boolean"&&value.partial===(value.state!=="completed")&&(value.next_offset===null||value.next_offset===(query.offset??0)+50),"seller value membership");
  return value;
}
export async function taskSellerValue(query:TaskSellerGroupsQuery,signal?:AbortSignal):Promise<TaskSellerGroupsPage>{
  const value=await read(query,"",query.ranking_limit?{ranking_limit:String(query.ranking_limit)}:{},signal);
  requireResponse(value.ranking_limit===(query.ranking_limit??null)&&count(value.total_groups)&&Array.isArray(value.groups)&&value.groups.length<=50&&typeof value.updating==="boolean"&&(value.as_of===null||typeof value.as_of==="string")&&(!value.partial||value.groups.length===0),"seller value totals");
  if(!value.partial){
    const through=Math.min(value.total_groups,query.ranking_limit??value.total_groups,10000),offset=query.offset??0;
    requireResponse(value.groups.length===Math.min(50,Math.max(0,through-offset))&&value.next_offset===(offset+50<through?offset+50:null),"seller value pagination");
  }
  let previous=Infinity;const seen=new Set<unknown>();
  const groups=value.groups.map((row:unknown)=>{
    requireResponse(isRecord(row)&&(row.seller_key===null||typeof row.seller_key==="string"&&row.seller_key.length>0)&&typeof row.seller_name==="string"&&count(row.article_count)&&row.article_count>0&&count(row.priced_article_count)&&row.priced_article_count<=row.article_count&&(row.total_price_usd===null||typeof row.total_price_usd==="string"&&/^\d+(?:\.\d{1,2})?$/.test(row.total_price_usd)&&Number.isFinite(Number(row.total_price_usd)))&&((row.priced_article_count===0)===(row.total_price_usd===null)),"seller value row");
    const total=row.total_price_usd===null?null:Number(row.total_price_usd);
    requireResponse((total??-1)<=previous&&!seen.has(row.seller_key),"seller value order");previous=total??-1;seen.add(row.seller_key);
    return {seller_key:row.seller_key as string|null,seller_name:row.seller_name,article_count:row.article_count,priced_article_count:row.priced_article_count,exposure_usd:null,total_price_usd:total};
  });
  return {groups,total_groups:value.total_groups,next_offset:value.next_offset as number|null,partial:value.partial as boolean,updating:value.updating,as_of:value.as_of as string|null};
}
export async function taskSellerValueListings(query:TaskSellerGroupsQuery&{seller_key:string},signal?:AbortSignal):Promise<TaskSellerGroupListingsPage>{
  const value=await read(query,"/listings",{seller_key:query.seller_key,sort:query.sort},signal);
  requireResponse(value.seller_key===query.seller_key&&value.sort===query.sort&&Array.isArray(value.rows)&&value.rows.length<=50&&(!value.partial||value.rows.length===0),"seller value listings");
  for(const row of value.rows as unknown[])requireResponse(isRecord(row)&&typeof row.task_id==="string"&&typeof row.result_id==="string"&&(row.seller_key??"")===query.seller_key,"seller value listing identity");
  return value as unknown as TaskSellerGroupListingsPage;
}
