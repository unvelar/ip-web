import {isRecord,requireResponse} from "../api/validation";
export const categoryRankingPolicy="task-category-ranking-v1";
export type CategoryRankingRequest={metric:"total_price"|"articles";limit:number};
export type CategoryRankingGroup={category_key:string|null;category_label:string;article_count:number;priced_article_count:number;missing_price_count:number;total_price_usd:string|null};
export type CategoryRanking={policy_version:typeof categoryRankingPolicy;search_id:string|null;state:"pending"|"running"|"completed"|"limited"|"failed"|"cancelled";metric:CategoryRankingRequest["metric"];currency:"USD";price_basis:"stored_listing_price";consistency:"saved_membership_current_categories"|"empty_matching_set";as_of:string;groups:CategoryRankingGroup[];total_categories:number;matching_listings:number|null;priced_listings:number|null;missing_price_listings:number|null};
export function emptyCategoryRanking(input:CategoryRankingRequest):CategoryRanking {
  return {policy_version:categoryRankingPolicy,search_id:null,state:"completed",metric:input.metric,currency:"USD",price_basis:"stored_listing_price",consistency:"empty_matching_set",as_of:new Date().toISOString(),groups:[],total_categories:0,matching_listings:0,priced_listings:0,missing_price_listings:0};
}
const count=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;
export function parseCategoryRankingRequest(value:unknown):CategoryRankingRequest {
  requireResponse(isRecord(value)&&Object.keys(value).every(key=>["metric","limit"].includes(key))&&["total_price","articles"].includes(String(value.metric))&&count(value.limit)&&Number(value.limit)>=1&&Number(value.limit)<=100,"category ranking request");return value as CategoryRankingRequest;
}
export function parseCategoryRanking(value:unknown):CategoryRanking {
  requireResponse(isRecord(value)&&value.policy_version===categoryRankingPolicy&&(value.search_id===null||typeof value.search_id==="string"&&value.search_id.length>0&&value.search_id.length<=100)&&["pending","running","completed","limited","failed","cancelled"].includes(String(value.state))&&["total_price","articles"].includes(String(value.metric))&&value.currency==="USD"&&value.price_basis==="stored_listing_price"&&["saved_membership_current_categories","empty_matching_set"].includes(String(value.consistency))&&typeof value.as_of==="string"&&Number.isFinite(Date.parse(value.as_of))&&count(value.total_categories)&&Array.isArray(value.groups)&&value.groups.length<=100,"category ranking");
  requireResponse(value.consistency==="empty_matching_set"?value.search_id===null&&value.state==="completed"&&value.matching_listings===0&&value.total_categories===0&&value.groups.length===0:value.search_id!==null,"category membership");
  for(const field of ["matching_listings","priced_listings","missing_price_listings"])requireResponse(value.state==="completed"?count(value[field]):value[field]===null,"category ranking totals");
  requireResponse(value.state==="completed"||value.groups.length===0,"incomplete category ranking");
  for(const group of value.groups){
    requireResponse(isRecord(group)&&(group.category_key===null||typeof group.category_key==="string"&&group.category_key.length<=80)&&typeof group.category_label==="string"&&group.category_label.trim().length>0&&group.category_label.length<=160&&count(group.article_count)&&count(group.priced_article_count)&&count(group.missing_price_count)&&group.article_count===Number(group.priced_article_count)+Number(group.missing_price_count)&&(group.total_price_usd===null||typeof group.total_price_usd==="string"&&/^\d+(\.\d{1,2})?$/.test(group.total_price_usd)&&Number.isFinite(Number(group.total_price_usd)))&&((group.priced_article_count===0)===(group.total_price_usd===null)),"category ranking row");
  }
  requireResponse(value.state!=="completed"||value.matching_listings===Number(value.priced_listings)+Number(value.missing_price_listings),"category price coverage");
  return value as CategoryRanking;
}
