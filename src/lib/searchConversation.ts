import {parseSearchPlan,type SearchPlan} from "../api/listingDiscussion";
import {parseCategoryRanking,type CategoryRanking} from "./categoryRanking";
import {taskAssistantFilters,type AppliedTaskSearch,type TaskSearchValues} from "./taskSearchAssistant";
import { semanticFilterLabel } from "./semanticFilters";

export type SearchMessage = {role:"user"|"assistant";text:string;clarificationOptions?:string[];categoryReport?:CategoryRanking;plan?:SearchPlan};
export type SearchQuestion = {options:string[];literalMessage?:string;requestMessage?:string;conflictField?:"price"|"seller_listing_count"};
export type ConversationState = {messages:SearchMessage[];intent:"new"|"continue";question:SearchQuestion|null;assistantMode?:"discuss"|"search"};
export function clarificationRequestMessage(message:string,question:SearchQuestion|null):string {
  const normalized=(text:string)=>text.trim().toLowerCase().replace(/[.!?]+$/,"").trim();
  const reply=normalized(message);
  const inclusive=["all","all of them","all of those","all of these","all of the above","all types","all categories","all options","both","both of them","any","any of them","any type","any category","any option","either","either one","everything","no preference"].includes(reply);
  return question?.requestMessage&&(inclusive||question.options.some(option=>normalized(option)===reply))?question.requestMessage:message;
}
/** Choices are part of the question's meaning, including for free-text replies
 * such as "both". Keep them in model context without changing displayed text. */
export function searchConversationMessages(messages:SearchMessage[],question?:SearchQuestion|null):Array<{role:"user"|"assistant";content:string}> {
  const request=question?.requestMessage;
  const tail=messages.slice(-12);
  // A pending reply still needs its subject after a long side discussion.
  const recent=request&&!tail.some(message=>message.role==="user"&&message.text===request)
    ?[{role:"user" as const,text:request},...messages.slice(-11)]:tail;
  const pending=question?.options.length?question.options:undefined;
  // Older saved chats kept choices only on the pending question. They may also
  // contain side answers, so identify this fallback explicitly as still pending.
  const fallback=pending&&!recent.some(message=>JSON.stringify(message.clarificationOptions)===JSON.stringify(pending))
    ?recent.findLastIndex(message=>message.role==="assistant"):-1;
  return recent.map((message,index)=>{
    const options=message.clarificationOptions;
    const context=[options?.length?`Clarification options: ${JSON.stringify(options)}`:"",index===fallback?`Pending clarification options: ${JSON.stringify(pending)}`:""].filter(Boolean).join("\n");
    const suffix=context?`\n${context}`:"";
    return {role:message.role,content:message.text.slice(0,2000-suffix.length)+suffix};
  });
}
export function newSearchValues(values:TaskSearchValues):TaskSearchValues {
  return {q:"",from:values.from,to:values.to};
}
export function searchChangeSummary(before:AppliedTaskSearch,after:AppliedTaskSearch,labels:Record<string,string>,options:{includeRanking?:boolean;includeRetention?:boolean}={}):string {
  // Compare canonical predicates, not omitted fields versus empty UI strings
  // or legacy price controls versus the structured price representation.
  const previous=taskAssistantFilters(before.values,null,before.status,before.product);
  const next=taskAssistantFilters(after.values,null,after.status,after.product);
  const changed=(field:keyof typeof previous)=>JSON.stringify(previous[field])!==JSON.stringify(next[field]);
  const changes:string[]=[];
  if(changed("query"))changes.push(after.values.q?`Text contains “${after.values.q}”.`:"Removed the literal text filter.");
  if(changed("price")) {
    if(after.values.listing_price){const price=JSON.parse(after.values.listing_price);const operators:Record<string,string>={gt:">",gte:"≥",lt:"<",lte:"≤"};changes.push("Price: "+Object.entries(price).filter(([key])=>key!=="currency").map(([key,value])=>`${operators[key]} ${value} ${price.currency}`).join(" and ")+".");}
    else changes.push("Updated the price filter.");
  }
  if(changed("countries")) {
    const countries=JSON.parse(after.values.listing_countries||"[]") as string[];
    const names=new Intl.DisplayNames(["en"],{type:"region"});
    changes.push(countries.length?`Listing locations: ${countries.map(code=>names.of(code)??code).join(" or ")}.`:"Removed the listing-location filter.");
  }
  if(changed("semantic"))changes.push(after.values.semantic?`Product details: ${semanticFilterLabel(after.values.semantic,labels)}.`:"Removed the product-detail filters.");
  if(changed("seller_listing_count"))changes.push("Updated matching listings per seller.");
  if(changed("catalog_product_id")||changed("catalog_selection"))changes.push("Updated the catalog selection.");
  if(before.status!==after.status)changes.push("Updated the queue status.");
  if(options.includeRanking!==false&&JSON.stringify(before.ranking)!==JSON.stringify(after.ranking))changes.push(after.ranking?`Showing the top ${after.ranking.limit} sellers.`:"Showing listings.");
  const summary=changes.join(" ");
  return options.includeRetention===false?summary:`${summary||"Search conditions applied."} Other active filters were kept.`;
}

export function conversationSearchSummary(before:AppliedTaskSearch,after:AppliedTaskSearch,labels:Record<string,string>,fresh:boolean):string {
  const details=searchChangeSummary(before,after,labels,{includeRanking:false,includeRetention:false});
  const sellerView=after.queueView?.group_by==="seller"?after.queueView:undefined;
  const metric=sellerView?.group_sort==="exposure"?"estimated stock exposure":sellerView?.group_sort==="total_price"?"total known listing price (USD)":sellerView?.group_sort==="priority"?"recommendation priority":sellerView?.group_sort==="newest"?"newest matching listing":"matching listing count";
  const opening=sellerView?`I’m finding ${sellerView.top_sellers?`up to ${sellerView.top_sellers}`:"the matching"} sellers, ordered by ${metric}, highest first.`:after.ranking?`I’m finding the ${after.ranking.limit} sellers with the most listings matching your search.`:fresh?"I’ve started a fresh search.":"I’ve updated your search.";
  return [opening,details,sellerView?.items_per_seller?`I’ll show up to ${sellerView.items_per_seller} items per seller; ranking totals include all matches.`:"",after.ranking||sellerView?"The ranking will appear when the search finishes.":""].filter(Boolean).join(" ");
}

/** Conversation text is tab-local, account/tenant/brand scoped, and only
 * restored for the exact confirmed query. Stored text is never authority. */
export function readSearchConversation(key:string|null,scope:string):ConversationState {
  const empty:ConversationState={messages:[],intent:"continue",question:null};
  if(!key)return empty;
  try {return parseSearchConversation(JSON.parse(sessionStorage.getItem(key)??"null"),scope);}catch{return empty;}
}
export function parseSearchConversation(rawValue:unknown,scope:string):ConversationState {
  const empty:ConversationState={messages:[],intent:"continue",question:null};
  try {
    if(!rawValue||typeof rawValue!=="object")return empty;
    const input=rawValue as Record<string,unknown>;
    if(input.scope!==scope)return empty;
    const value=input as {scope:string;messages:SearchMessage[];intent:"new"|"continue";question?:SearchQuestion;assistantMode?:"discuss"|"search"};
    if(!value||value.scope!==scope||!Array.isArray(value.messages)||value.messages.length>40||!["new","continue"].includes(value.intent))return empty;
    if(value.messages.some((m:SearchMessage)=>!m||!["user","assistant"].includes(m.role)||typeof m.text!=="string"||m.text.length>2000))return empty;
    for(const message of value.messages){if(message.clarificationOptions!==undefined&&(message.role!=="assistant"||!Array.isArray(message.clarificationOptions)||message.clarificationOptions.length<2||message.clarificationOptions.length>3||message.clarificationOptions.some(option=>typeof option!=="string"||!option.trim()||option.length>160)))return empty;if(message.plan!==undefined){if(message.role!=="assistant")return empty;message.plan=parseSearchPlan(message.plan);}if(message.categoryReport!==undefined){message.categoryReport=parseCategoryRanking(message.categoryReport);if(message.role!=="assistant"||message.categoryReport.state!=="completed")return empty;}}
    const q=value.question;
    if(q&&(!Array.isArray(q.options)||q.options.length>3||q.options.some((option:unknown)=>typeof option!=="string"||option.length>160)
      ||q.literalMessage!==undefined&&(typeof q.literalMessage!=="string"||q.literalMessage.length>2000)
      ||q.requestMessage!==undefined&&(typeof q.requestMessage!=="string"||!q.requestMessage.trim()||q.requestMessage.length>2000)
      ||q.conflictField!==undefined&&!["price","seller_listing_count"].includes(q.conflictField)))return empty;
    if(value.assistantMode!==undefined&&!["discuss","search"].includes(value.assistantMode))return empty;
    return {messages:value.messages,intent:value.intent,question:q??null,...(value.assistantMode?{assistantMode:value.assistantMode}:{})};
  }catch{return empty;}
}
