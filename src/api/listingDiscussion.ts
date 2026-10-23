import {semanticFilterLabel} from "../lib/semanticFilters";
import {queueViewSummary} from "../lib/queueView";
import {request} from "./transport";
import {isRecord,requireResponse} from "./validation";
import {parseListingTranslation,type SearchConversation,type Translation} from "./listingSearch";
import {parseListingFilters,type ListingFilters,type SellerRanking} from "../lib/listingSearch";
import {taskSearchRequest,type TaskSearchValues} from "../lib/taskSearchAssistant";
import type {TaskQueueQuery} from "./taskQueue";
import type {QueueView} from "../lib/queueView";
export type SearchPlan={id:string;summary:string;contextKey:string;details:string;submitted?:boolean};
const uuid=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
export function parseSearchPlan(value:unknown):SearchPlan {
  requireResponse(isRecord(value)&&uuid(value.id)&&typeof value.summary==="string"&&value.summary.trim().length>0&&value.summary.length<=600&&typeof value.contextKey==="string"&&value.contextKey.length<=32768&&(typeof value.details==="string"&&value.details.length>0&&value.details.length<=16000)&&(value.submitted===undefined||typeof value.submitted==="boolean"),"search plan");
  return {id:value.id,summary:value.summary,contextKey:value.contextKey,...(value.submitted===true?{submitted:true}:{}),details:value.details};
}
export function describeSearchPlan(translation:Translation):string {
  if(translation.name==="rank_categories")return `Compare the top ${translation.ranking.limit} product categories by ${translation.ranking.metric==="articles"?"matching listing count":"total known listing price (USD)"}. Keep the active filters.`;
  if(translation.name==="set_queue_view")return "Keep the active filters. "+queueViewSummary(translation.view);
  if(translation.name!=="search_listings"&&translation.name!=="rank_sellers")return "";
  const filter=translation.filters,lines:string[]=[`Queue status: ${filter.status.replaceAll("_"," ")}.`];
  if(filter.query)lines.push(`Literal text: “${filter.query}”.`);
  if(filter.title_contains)lines.push(`Title contains: “${filter.title_contains}”.`);
  if(filter.countries.length){const names=new Intl.DisplayNames(["en"],{type:"region"});lines.push(`Listing locations: ${filter.countries.map(code=>names.of(code)??code).join(" or ")}.`);}
  if(filter.price){const ops:Record<string,string>={gt:">",gte:"≥",lt:"<",lte:"≤"};lines.push("Price: "+Object.entries(filter.price).filter(([key])=>key!=="currency").map(([key,value])=>`${ops[key]} ${value} ${filter.price!.currency}`).join(" and ")+".");}
  if(filter.semantic)lines.push("Product details: "+semanticFilterLabel(JSON.stringify(filter.semantic),translation.categoryLabels??{})+".");
  if(filter.seller_listing_count){const ops:Record<string,string>={gt:">",gte:"≥",lt:"<",lte:"≤"};lines.push("Matching listings per seller: "+Object.entries(filter.seller_listing_count).map(([key,value])=>`${ops[key]} ${value}`).join(" and ")+".");}
  if(translation.catalogQuery)lines.push(`Catalog selection: ${translation.catalogQuery} (resolved when run).`);
  else if(filter.catalog_selection||filter.catalog_product_id)lines.push("Keep the selected catalog product.");
  if(translation.ranking)lines.push(`Top ${translation.ranking.limit} sellers by matching listing count.`);
  if(translation.queueView)lines.push(queueViewSummary(translation.queueView));
  return lines.join("\n");
}
export async function discussListings(input:{message:string;filters:ListingFilters;values:TaskSearchValues;status:TaskQueueQuery["status"];ranking:SellerRanking|null;conversation:SearchConversation;view?:QueueView;searchId?:string|null;contextKey:string;features:{sellerValue:boolean;categorySelection:boolean;queryView:boolean};categoryRanking:boolean;draftId?:string},signal:AbortSignal) {
  const body=taskSearchRequest(input.values,input.filters.ip_id!,input.status,input.filters.catalog_product_id??undefined);
  const queue=Object.fromEntries(Object.entries(body).filter(([key])=>!["ip_id","catalog_product_id","status","q","semantic","listing_constraints","min_price_usd","max_price_usd"].includes(key)));
  const value=await request<unknown>("/api/monitoring/listings/assistant/discuss",{method:"POST",signal:AbortSignal.any([signal,AbortSignal.timeout(65000)]),body:JSON.stringify({
    ...(input.draftId?{draft_id:input.draftId}:{}),message:input.message,filters:input.filters,ranking:input.ranking,conversation:input.conversation,queue,search_id:input.searchId??null,context_key:input.contextKey,
    ...(input.view?{queue_view:input.view}:{}),query_view:input.features.queryView,seller_value:input.features.sellerValue,conversation_actions:input.features.categorySelection,conversation_answers:true,category_ranking:input.categoryRanking,
  })});
  requireResponse(isRecord(value)&&value.version===1&&value.policy==="listing-discussion-v1"&&uuid(value.id)&&typeof value.answer==="string"&&value.answer.trim().length>0&&value.answer.length<=2000&&(value.plan===null||isRecord(value.plan)&&value.plan.id===value.id&&value.plan.context_key===input.contextKey),"discussion reply");
  let details:string|undefined;
  if(isRecord(value.plan)&&value.plan.details!==undefined){
    const translated=parseListingTranslation(value.plan.details,input.filters,input.conversation,input.view,{answers:true,queryView:input.features.queryView});
    details=describeSearchPlan(translated);
  }
  const plan=value.plan===null?null:parseSearchPlan({...value.plan as object,contextKey:input.contextKey,details});
  return {id:value.id,answer:value.answer,plan};
}
export async function getSearchPlan(plan:SearchPlan,view:QueueView|undefined,features:{queryView:boolean},signal:AbortSignal):Promise<{translation:Translation;intent:"new"|"continue";runId:string}> {
  const value=await request<unknown>("/api/monitoring/listings/assistant/plans/"+encodeURIComponent(plan.id),{signal});
  requireResponse(isRecord(value)&&value.version===1&&value.policy==="listing-discussion-v1"&&value.id===plan.id&&value.context_key===plan.contextKey&&["new","continue"].includes(String(value.intent)),"saved search plan");
  const basis=parseListingFilters(value.basis),intent=value.intent as "new"|"continue";
  const translation=parseListingTranslation(value.proposal,basis,{mode:intent,messages:[]},view,{...features,answers:true});
  requireResponse(["search_listings","rank_sellers","rank_categories","set_queue_view"].includes(translation.name),"executable search plan");
  requireResponse(value.summary===plan.summary&&describeSearchPlan(translation)===plan.details,"reviewed search plan");
  return {translation,intent,runId:plan.id};
}
