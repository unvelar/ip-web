import {marketplacePolicy} from '../lib/marketplaceSearch';
import {groupingPolicy} from '../lib/taskGrouping';
import {queryViewPolicy} from "../lib/queueView";
import { queueViewPolicy,sellerValuePolicy,conversationActionsPolicy,parseQueueViewChange,type QueueView,type QueueViewChange } from "../lib/queueView";
import {categoryRankingPolicy,parseCategoryRankingRequest,type CategoryRankingRequest} from "../lib/categoryRanking";
import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";
import { titleSearchPolicy, listingFilterKey, sellerCountPolicy, sellerRankingPolicy, parseSellerRanking, type SellerRanking, parseCatalogReference, parseListingFilters, type CatalogReference, type ListingFilters } from "../lib/listingSearch";

export interface CatalogMatch { reference: CatalogReference; display_name: string; scope_name: string; category_path: string | null }
export interface CatalogResolution { status: "resolved" | "ambiguous" | "not_found"; candidates: CatalogMatch[]; total: number; has_more: boolean }
export interface ListingRow { sellerMatchingCount: number | null; id: string; title: string | null; seller: string | null; country: string | null; priceUsd: string | null; image: string | null }
export interface RankedSeller { sellerKey:string; name:string|null; domain:string; count:number }
export interface ListingPage { sellers?: RankedSeller[]; rows: ListingRow[]; total: number; nextCursor: string | null; catalog: CatalogMatch | null; fx: { asOf: string; basis: string } | null }
export type Translation = {name:"answer_question";answer:string}|{name:"rank_categories";ranking:CategoryRankingRequest}|{name:"set_queue_view";view:QueueViewChange}
  | { name: "search_listings" | "rank_sellers"; filters: ListingFilters; ranking:SellerRanking|null; categoryLabels?:Record<string,string>; showListings?:boolean; queueView?:QueueViewChange; marketplaceQuery?:string|null; catalogQuery?: string | null }
  | { name: "next_listing_page" }
  | { name: "request_clarification"; reason: string; capability?: string; question?:string; options?:string[]; conflictField?:"price"|"seller_listing_count" };
export const listingConversationPolicy = "listing-conversation-v1";
export const resultAnalysisPolicy="listing-result-analysis-v1";
export const conversationAnswersPolicy = "listing-conversation-answers-v1";
export type SearchConversation = {mode:"new"|"continue";messages:Array<{role:"user"|"assistant";content:string}>;resolution?:"price"|"seller_listing_count";category_context?:{metric:"total_price"|"articles";groups:Array<{category_key:string|null;category_label:string}>}};
const text = (value: unknown): value is string => typeof value === "string" && value.length <= 4000;
const nullableText = (value: unknown): value is string | null => value === null || text(value);
const count = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
function catalog(value: unknown): CatalogMatch {
  requireResponse(isRecord(value) && text(value.display_name) && text(value.scope_name) && nullableText(value.category_path), "catalog result");
  return { reference: parseCatalogReference(value.reference), display_name: value.display_name, scope_name: value.scope_name, category_path: value.category_path };
}
// These POST endpoints perform reads/translation only. Every request has a
// deadline and cancellation; credentials use the normal tenant-aware transport.
async function read(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  return request<unknown>(`/api/monitoring/listings/${path}`, { method: "POST", body: JSON.stringify(body), redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]) });
}
export async function listingCapability(signal: AbortSignal) {
  const value: unknown = await request("/api/monitoring/listings/translation-capability", { signal });
  requireResponse(isRecord(value) && value.version === 1 && typeof value.enabled === "boolean" && isRecord(value.country_labels)
    && Object.entries(value.country_labels).every(([key, label]) => /^[A-Z]{2}$/.test(key) && text(label)), "search capability");
  requireResponse(value.seller_count_policy_version === undefined || value.seller_count_policy_version === sellerCountPolicy, "seller-count policy");
  requireResponse(value.seller_ranking_policy_version === undefined || value.seller_ranking_policy_version === sellerRankingPolicy, "seller-ranking policy");
  return { resultAnalysis:value.result_analysis_policy_version===resultAnalysisPolicy, marketplace:value.marketplace_search_policy_version===marketplacePolicy, grouping:value.grouping_policy_version===groupingPolicy, queryView:value.query_view_policy_version===queryViewPolicy, conversationAnswers:value.conversation_answers_policy_version===conversationAnswersPolicy, sellerValue:value.seller_value_policy_version===sellerValuePolicy,conversationActions:value.conversation_actions_policy_version===conversationActionsPolicy, categoryRanking:value.category_ranking_policy_version===categoryRankingPolicy, queueView:value.queue_view_policy_version===queueViewPolicy, conversation:value.conversation_policy_version === listingConversationPolicy, searchAgent:value.search_agent_policy_version === "listing-search-agent-v1", titleSearch:value.title_search_policy_version === titleSearchPolicy, enabled: value.enabled, sellerRanking: value.seller_ranking_policy_version === sellerRankingPolicy, sellerCounts: value.seller_count_policy_version === sellerCountPolicy, countries: value.country_labels as Record<string, string> };
}
export async function translateListingSearch(message: string, filters: ListingFilters, signal: AbortSignal, ranking: SellerRanking | null = null, conversation?:SearchConversation,queueView?:QueueView,categoryRanking=false,features:{analysis?:boolean;analysisOnly?:boolean;searchId?:string|null;marketplace?:boolean;grouping?:boolean;sellerValue?:boolean;categorySelection?:boolean;answers?:boolean;queryView?:boolean}={}): Promise<Translation> {
  const contextView=queueView?{...queueView}:undefined;
  if(contextView&&!features.grouping)delete contextView.grouping;
  if(contextView&&!features.queryView)delete contextView.items_per_seller;
  const value = await read("translate", { message, filters,...(features.analysis&&features.searchId&&features.answers&&conversation&&queueView?{analysis_search_id:features.searchId,...(features.analysisOnly?{analysis_only:true}:{})}:{}),...(features.marketplace?{marketplace_search:true}:{}),...(features.grouping&&queueView?{grouping:true}:{}),...(features.queryView&&queueView?{query_view:true}:{}),...(features.answers&&conversation?{conversation_answers:true}:{}),...(features.sellerValue?{seller_value:true}:{}),...(features.categorySelection?{conversation_actions:true}:{}), ...(ranking ? {ranking} : {}),...(conversation?{conversation}:{}),...(contextView?{queue_view:contextView}:{}),...(categoryRanking?{category_ranking:true}:{}) }, signal);
  requireResponse(isRecord(value) && value.version === 1 && value.jobs_started === 0 && isRecord(value.query) && isRecord(value.query.arguments), "search translation");
  const query = value.query;
  const args = query.arguments;
  requireResponse(isRecord(args), "search translation");
  if(query.name==="answer_question"){
    requireResponse(features.answers&&conversation&&Object.keys(args).length===1&&typeof args.answer==="string"&&args.answer.trim().length>0&&args.answer.length<=2000,"conversation answer");
    requireResponse(listingFilterKey(parseListingFilters(value.filters))===listingFilterKey(filters),"read-only answer filters");
    return {name:query.name,answer:args.answer.trim()};
  }
  requireResponse(!features.analysisOnly||query.name==="request_clarification","read-only result summary");
  if(query.name==="rank_categories")return {name:query.name,ranking:parseCategoryRankingRequest(args)};
  if(query.name==="set_queue_view"){
    requireResponse(args.items_per_seller===undefined||features.queryView,"seller item preview capability");
    requireResponse(args.grouping===undefined||features.grouping,"grouping capability");
    return {name:query.name,view:parseQueueViewChange(args)};
  }
  if (query.name === "request_clarification") {
    requireResponse(args.question===undefined||typeof args.question==="string"&&args.question.trim().length>0&&args.question.length<=1000,"clarification question");
    requireResponse(args.options===undefined||Array.isArray(args.options)&&args.options.length>=2&&args.options.length<=3&&args.options.every(option=>typeof option==="string"&&option.trim().length>0&&option.length<=160),"clarification options");
    requireResponse(args.conflict_field===undefined||["price","seller_listing_count"].includes(String(args.conflict_field)),"clarification conflict");
    return { name: query.name, reason: String(args.reason ?? ""), capability: typeof args.capability === "string" ? args.capability : undefined,
      question:args.question as string|undefined,options:args.options as string[]|undefined,conflictField:args.conflict_field as "price"|"seller_listing_count"|undefined };
  }
  if (query.name === "next_listing_page") return { name: query.name };
  requireResponse((query.name === "search_listings" || query.name === "rank_sellers") && (args.catalog_query === undefined || nullableText(args.catalog_query)), "search translation");
  requireResponse(args.view===undefined||features.queryView&&queueView,"compound query view capability");
  requireResponse(!isRecord(args.view)||args.view.grouping===undefined||features.grouping,"compound grouping capability");
  const proposedView=args.view===undefined?undefined:parseQueueViewChange(args.view);
  requireResponse(args.marketplace_query===undefined||features.marketplace&&(args.marketplace_query===null||typeof args.marketplace_query==="string"&&args.marketplace_query.trim().length>0&&args.marketplace_query.length<=100),"marketplace selection");
  const next = parseListingFilters(value.filters);
  requireResponse(next.ip_id === filters.ip_id, "search scope");
  requireResponse(value.category_labels===undefined||isRecord(value.category_labels)&&Object.entries(value.category_labels).every(([key,label])=>next.semantic?.categories?.includes(key)&&typeof label==="string"&&label.trim().length>0&&label.length<=120),"translation category labels");
  return { name: query.name, ...(Object.hasOwn(args,"marketplace_query")?{marketplaceQuery:args.marketplace_query as string|null}:{}), ...(proposedView?{queueView:proposedView}:{}), categoryLabels:value.category_labels as Record<string,string>|undefined, ...(args.show_listings===true?{showListings:true}:{}), ranking: query.name === "rank_sellers" ? parseSellerRanking(args.ranking) : null, filters: next, ...(Object.hasOwn(args, "catalog_query") ? { catalogQuery: args.catalog_query as string | null } : {}) };
}
export async function resolveListingCatalog(query: string, ipId: string | null, signal: AbortSignal): Promise<CatalogResolution> {
  const value = await read("resolve-catalog", { query, ip_id: ipId, limit: 20 }, signal);
  requireResponse(isRecord(value) && value.version === 1 && value.jobs_started === 0 && ["resolved", "ambiguous", "not_found"].includes(String(value.status))
    && Array.isArray(value.candidates) && value.candidates.length <= 20 && count(value.total) && typeof value.has_more === "boolean", "catalog lookup");
  const candidates = value.candidates.map(catalog);
  requireResponse(candidates.every(item => !ipId || item.reference.ip_id === ipId), "catalog scope");
  requireResponse(value.status !== "resolved" || candidates.length === 1 && value.total === 1 && !value.has_more, "catalog lookup");
  return { status: value.status as CatalogResolution["status"], candidates, total: value.total, has_more: value.has_more };
}
export async function searchListings(filters: ListingFilters, cursor: string | null, signal: AbortSignal): Promise<ListingPage> {
  const value = await read("search", { filters, cursor, limit: 20 }, signal);
  requireResponse(isRecord(value) && value.version === 1 && value.jobs_started === 0 && value.consistency === "live_keyset"
    && Array.isArray(value.findings) && value.findings.length <= 20 && count(value.total)
    && (value.next_cursor === null || typeof value.next_cursor === "string" && value.next_cursor.length > 0 && value.next_cursor.length <= 16384), "listing search");
  requireResponse(value.next_cursor === null || value.next_cursor !== cursor, "listing pagination");
  requireResponse(listingFilterKey(parseListingFilters(value.filters)) === listingFilterKey(filters), "search filter confirmation");
  const match = value.catalog_match === null ? null : catalog(value.catalog_match);
  requireResponse(JSON.stringify(match?.reference ?? null) === JSON.stringify(filters.catalog_selection), "catalog confirmation");
  if (filters.seller_listing_count) requireResponse(value.seller_count_policy_version === sellerCountPolicy, "seller-count policy confirmation");
  const rows = value.findings.map((raw: unknown): ListingRow => {
    requireResponse(isRecord(raw) && text(raw.result_id) && nullableText(raw.listing_title) && nullableText(raw.seller_name) && nullableText(raw.country), "listing row");
    const price = raw.price_value_usd;
    requireResponse(price == null || typeof price === "string" && /^\d+(?:\.\d+)?$/.test(price) || typeof price === "number" && Number.isFinite(price) && price >= 0, "listing price");
    const image = typeof raw.image_url === "string" && /^https:\/\//.test(raw.image_url) ? raw.image_url : null;
    const matchingCount = raw.seller_matching_listing_count;
    if (filters.seller_listing_count) requireResponse(count(matchingCount) && matchingCount > 0 && Object.entries(filters.seller_listing_count).every(([operator,bound]) => ({ gt: matchingCount > bound, gte: matchingCount >= bound, lt: matchingCount < bound, lte: matchingCount <= bound })[operator]), "seller matching count");
    return { sellerMatchingCount: count(matchingCount) ? matchingCount : null, id: raw.result_id, title: raw.listing_title, seller: raw.seller_name, country: raw.country, priceUsd: price == null ? null : String(price), image };
  });
  let fx: ListingPage["fx"] = null;
  if (filters.price) {
    requireResponse(isRecord(value.fx_snapshot) && text(value.fx_snapshot.as_of) && text(value.fx_snapshot.basis), "price conversion disclosure");
    fx = { asOf: value.fx_snapshot.as_of, basis: value.fx_snapshot.basis };
  }
  return { rows, total: value.total, nextCursor: value.next_cursor as string | null, catalog: match, fx };
}

export async function rankSellers(filters:ListingFilters,ranking:SellerRanking,signal:AbortSignal):Promise<ListingPage> {
 const value=await read("rank-sellers",{filters,ranking},signal);
 requireResponse(isRecord(value) && value.version===1 && value.jobs_started===0 && value.policy_version===sellerRankingPolicy && value.consistency==="live_aggregate"
   && Array.isArray(value.sellers) && count(value.total_sellers) && value.sellers.length===Math.min(value.total_sellers,ranking.limit),"seller ranking result");
 requireResponse(listingFilterKey(parseListingFilters(value.filters))===listingFilterKey(filters) && parseSellerRanking(value.ranking).limit===ranking.limit,"seller ranking confirmation");
 const match=value.catalog_match===null?null:catalog(value.catalog_match);
 requireResponse(JSON.stringify(match?.reference??null)===JSON.stringify(filters.catalog_selection),"catalog confirmation");
 const seen=new Set<string>();let previous=Infinity;
 const sellers=value.sellers.map((row:unknown):RankedSeller=>{
   requireResponse(isRecord(row) && text(row.seller_key) && row.seller_key.length>0 && nullableText(row.seller_name) && text(row.domain) && count(row.matching_listing_count) && row.matching_listing_count>0,"ranked seller");
   const n=row.matching_listing_count;
   requireResponse(!seen.has(row.seller_key) && n<=previous && (!filters.seller_listing_count || Object.entries(filters.seller_listing_count).every(([op,bound])=>({gt:n>bound,gte:n>=bound,lt:n<bound,lte:n<=bound})[op])),"seller ranking order/count");
   seen.add(row.seller_key);previous=n;
   return {sellerKey:row.seller_key,name:row.seller_name,domain:row.domain,count:n};
 });
 let fx:ListingPage["fx"]=null;
 if(filters.price){requireResponse(isRecord(value.fx_snapshot) && text(value.fx_snapshot.as_of) && text(value.fx_snapshot.basis),"price conversion disclosure");fx={asOf:value.fx_snapshot.as_of,basis:value.fx_snapshot.basis};}
 return {rows:[],sellers,total:value.total_sellers,nextCursor:null,catalog:match,fx};
}
