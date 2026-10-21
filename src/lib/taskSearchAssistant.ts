import { emptyListingFilters, parseListingFilters, type ListingFilters, type SellerRanking } from "./listingSearch";
import { readSemanticFilters } from "./semanticFilters";
import type { TaskQueueQuery } from "../api/taskQueue";

export type TaskSearchValues = Record<string, string>;
export const taskListingSearchPolicy = "task-listing-search-v1";
export interface AppliedTaskSearch {
  values: TaskSearchValues;
  status: TaskQueueQuery["status"];
  product?: string;
  ranking: SellerRanking | null;
}
export const assistantValueFields = ["title_contains", "listing_countries", "listing_price", "seller_listing_count", "catalog_selection"];

/** One draft for manual controls and language refinements. Only the supported
 * editable subset crosses the model boundary; queue-specific predicates stay. */
export function taskAssistantFilters(values: TaskSearchValues, ipId: string, status: TaskQueueQuery["status"], product?: string): ListingFilters {
  return parseListingFilters({ ...emptyListingFilters(ipId), ...(values.title_contains ? {title_contains:values.title_contains} : {}), status, catalog_product_id: product ?? null,
    query: values.q?.trim() || null,
    semantic: values.semantic ? readSemanticFilters(values.semantic) : null,
    countries: values.listing_countries ? JSON.parse(values.listing_countries) : [],
    price: values.listing_price ? JSON.parse(values.listing_price) : values.min_price_usd || values.max_price_usd
      ? { currency: "USD", ...(values.min_price_usd ? {gte:values.min_price_usd} : {}), ...(values.max_price_usd ? {lte:values.max_price_usd} : {}) } : null,
    seller_listing_count: values.seller_listing_count ? JSON.parse(values.seller_listing_count) : null,
    catalog_selection: values.catalog_selection ? JSON.parse(values.catalog_selection) : null,
  });
}
export function applyTaskAssistantFilters(values: TaskSearchValues, filters: ListingFilters): TaskSearchValues {
  if (filters.sort !== "found_desc") throw new Error("Choose the queue sort using its Sort control. Your filters were kept.");
  return { ...values, title_contains:filters.title_contains??"", q: filters.query ?? "", semantic: filters.semantic ? JSON.stringify(filters.semantic) : "",
    min_price_usd:"",max_price_usd:"",
    listing_countries: filters.countries.length ? JSON.stringify(filters.countries) : "",
    listing_price: filters.price ? JSON.stringify(filters.price) : "",
    seller_listing_count: filters.seller_listing_count ? JSON.stringify(filters.seller_listing_count) : "",
    catalog_selection: filters.catalog_selection ? JSON.stringify(filters.catalog_selection) : "",
  };
}
export function taskSearchRequest(values: TaskSearchValues, ipId: string, status: TaskQueueQuery["status"], product?: string): Record<string, unknown> {
  if (values.semantic && !readSemanticFilters(values.semantic)) throw new Error("Choose valid product detail filters before searching.");
  const request: Record<string, unknown> = {ip_id:ipId,catalog_product_id:product,status,from:`${values.from}T00:00:00.000Z`,to:`${values.to}T00:00:00.000Z`,history:values.history === "on"};
  for (const [field,value] of Object.entries(values)) {
    if (!value || ["from","to","history",...assistantValueFields].includes(field)) continue;
    request[field] = field === "semantic" ? JSON.parse(value) : ["min_price_usd","max_price_usd"].includes(field) ? Number(value) : value;
  }
  if (assistantValueFields.some(field => values[field])) {
    const canonical = taskAssistantFilters(values,ipId,status,product);
    request.listing_constraints = {...(canonical.title_contains ? {title_contains:canonical.title_contains} : {}), countries:canonical.countries,price:canonical.price,catalog_selection:canonical.catalog_selection,seller_listing_count:canonical.seller_listing_count};
  }
  return request;
}
export function savedTaskSearchValues(params: URLSearchParams): TaskSearchValues | null {
  const raw = params.get("queue_filters");
  if (!raw) return null;
  try {
    if (raw.length > 16384) return null;
    const value: unknown = JSON.parse(raw);
    const allowed = ["q","from","to","history","semantic","website","source","seller","seller_name","assignee","candidate_outcome","evidence","protected_term_id","country","seller_origin","dismissal_reason","min_price_usd","max_price_usd","product_group_id",...assistantValueFields];
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.entries(value).some(([key,item])=>!allowed.includes(key) || typeof item !== "string" || item.length > 8000)) return null;
    return value as TaskSearchValues;
  } catch { return null; }
}
export function queueSearchParams(params: URLSearchParams, applied: AppliedTaskSearch, searchId: string | null): URLSearchParams {
  const next = new URLSearchParams(params);
  // Old queue links remain readable, but successful searches own one saved draft.
  for (const key of ["title_contains","q","semantic","selector","value","platform","source","seller","assignee","country","seller_origin","match_basis","protected_term_id","product_group_id","min_price_usd","max_price_usd","candidate_outcome","dismissal_reason"]) next.delete(key);
  next.set("queue_filters",JSON.stringify(applied.values));
  next.set("status",applied.status);
  if (applied.product) next.set("catalog_product_id",applied.product); else next.delete("catalog_product_id");
  if (searchId) next.set("task_search",searchId); else next.delete("task_search");
  if (applied.ranking) { next.set("group_by","seller"); next.set("group_sort","articles"); next.set("top_sellers",String(applied.ranking.limit)); }
  else next.delete("top_sellers");
  return next;
}
