import {parseCategoryRanking,type CategoryRanking} from "./categoryRanking";
import type { AppliedTaskSearch, TaskSearchValues } from "./taskSearchAssistant";
import { semanticFilterLabel } from "./semanticFilters";

export type SearchMessage = {role:"user"|"assistant";text:string;categoryReport?:CategoryRanking};
export type SearchQuestion = {options:string[];literalMessage?:string;requestMessage?:string;conflictField?:"price"|"seller_listing_count"};
export type ConversationState = {messages:SearchMessage[];intent:"new"|"continue";question:SearchQuestion|null};
export function newSearchValues(values:TaskSearchValues):TaskSearchValues {
  return {q:"",from:values.from,to:values.to};
}
export function searchChangeSummary(before:AppliedTaskSearch,after:AppliedTaskSearch,labels:Record<string,string>):string {
  const changes:string[]=[];
  if(before.values.q!==after.values.q)changes.push(after.values.q?`Text contains “${after.values.q}”.`:"Removed the literal text filter.");
  if(before.values.listing_price!==after.values.listing_price||before.values.min_price_usd!==after.values.min_price_usd||before.values.max_price_usd!==after.values.max_price_usd) {
    if(after.values.listing_price){const price=JSON.parse(after.values.listing_price);const operators:Record<string,string>={gt:">",gte:"≥",lt:"<",lte:"≤"};changes.push("Price: "+Object.entries(price).filter(([key])=>key!=="currency").map(([key,value])=>`${operators[key]} ${value} ${price.currency}`).join(" and ")+".");}
    else changes.push("Updated the price filter.");
  }
  if(before.values.listing_countries!==after.values.listing_countries) {
    const countries=JSON.parse(after.values.listing_countries||"[]") as string[];
    const names=new Intl.DisplayNames(["en"],{type:"region"});
    changes.push(countries.length?`Listing locations: ${countries.map(code=>names.of(code)??code).join(" or ")}.`:"Removed the listing-location filter.");
  }
  if(before.values.semantic!==after.values.semantic)changes.push(after.values.semantic?`Product details: ${semanticFilterLabel(after.values.semantic,labels)}.`:"Removed the product-detail filters.");
  if(before.values.seller_listing_count!==after.values.seller_listing_count)changes.push("Updated matching listings per seller.");
  if(before.product!==after.product||before.values.catalog_selection!==after.values.catalog_selection)changes.push("Updated the catalog selection.");
  if(before.status!==after.status)changes.push("Updated the queue status.");
  if(JSON.stringify(before.ranking)!==JSON.stringify(after.ranking))changes.push(after.ranking?`Showing the top ${after.ranking.limit} sellers.`:"Showing listings.");
  return `${changes.join(" ")||"Search conditions applied."} Other active filters were kept.`;
}

/** Conversation text is tab-local, account/tenant/brand scoped, and only
 * restored for the exact confirmed query. Stored text is never authority. */
export function readSearchConversation(key:string|null,scope:string):ConversationState {
  const empty:ConversationState={messages:[],intent:"continue",question:null};
  if(!key)return empty;
  try {const value=JSON.parse(sessionStorage.getItem(key)??"null");
    if(!value||value.scope!==scope||!Array.isArray(value.messages)||value.messages.length>40||!["new","continue"].includes(value.intent))return empty;
    if(value.messages.some((m:SearchMessage)=>!m||!["user","assistant"].includes(m.role)||typeof m.text!=="string"||m.text.length>2000))return empty;
    for(const message of value.messages){if(message.categoryReport!==undefined){message.categoryReport=parseCategoryRanking(message.categoryReport);if(message.role!=="assistant"||message.categoryReport.state!=="completed")return empty;}}
    const q=value.question;
    if(q&&(!Array.isArray(q.options)||q.options.length>3||q.options.some((option:unknown)=>typeof option!=="string"||option.length>160)
      ||q.literalMessage!==undefined&&(typeof q.literalMessage!=="string"||q.literalMessage.length>2000)
      ||q.requestMessage!==undefined&&(typeof q.requestMessage!=="string"||!q.requestMessage.trim()||q.requestMessage.length>2000)
      ||q.conflictField!==undefined&&!["price","seller_listing_count"].includes(q.conflictField)))return empty;
    return {messages:value.messages,intent:value.intent,question:q??null};
  }catch{return empty;}
}
