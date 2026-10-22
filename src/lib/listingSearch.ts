import { readSemanticFilters, semanticFingerprint, type SemanticFilters } from "./semanticFilters";
import { isRecord, requireResponse } from "../api/validation";

export const listingStatuses = ["pending", "preparing", "review", "takedown_pending", "takedown_sent", "enforced", "dismissed", "all"] as const;
export type CatalogReference = { kind: "brand" | "product" | "group" | "category"; id: string; ip_id: string };
export type ListingPrice = { currency: string; gt?: string; gte?: string; lt?: string; lte?: string };
export const sellerCountPolicy = "matching-distinct-listings-v1";
export const sellerRankingPolicy = "matching-distinct-seller-ranking-v1";
export type SellerRanking = { limit: number };
export function parseSellerRanking(value: unknown): SellerRanking {
  requireResponse(isRecord(value) && Object.keys(value).length === 1 && typeof value.limit === "number" && Number.isInteger(value.limit) && value.limit >= 1 && value.limit <= 100, "seller ranking");
  return {limit:value.limit};
}
export type SellerListingCount = { gt?: number; gte?: number; lt?: number; lte?: number };
export const titleSearchPolicy = "literal-title-substring-v1";
export interface ListingFilters {
  title_contains?: string | null;
  seller_listing_count?: SellerListingCount | null;
  ip_id: string | null;
  catalog_product_id: string | null;
  catalog_selection: CatalogReference | null;
  query: string | null;
  semantic: SemanticFilters | null;
  countries: string[];
  price: ListingPrice | null;
  status: typeof listingStatuses[number];
  sort: "found_desc" | "found_asc" | "score_desc";
}
const uuid = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const decimal = (value: unknown): value is string => typeof value === "string" && /^\d{1,13}(?:\.\d{1,6})?$/.test(value) && Number(value) <= 1e12;
const validText = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
export function emptyListingFilters(ipId: string | null): ListingFilters {
  return { ip_id: ipId, catalog_product_id: null, catalog_selection: null, query: null, semantic: null, countries: [], price: null, status: "pending", sort: "found_desc" };
}
export function parseCatalogReference(value: unknown): CatalogReference {
  requireResponse(isRecord(value) && uuid(value.ip_id) && validText(value.id, 200)
    && ["brand", "product", "group", "category"].includes(String(value.kind)), "catalog reference");
  requireResponse(value.kind === "category" ? /^gid:\/\/shopify\/TaxonomyCategory\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)
    : uuid(value.id) && (value.kind !== "brand" || value.id.toLowerCase() === value.ip_id.toLowerCase()), "catalog reference");
  return { kind: value.kind as CatalogReference["kind"], id: value.kind === "category" ? value.id : value.id.toLowerCase(), ip_id: value.ip_id.toLowerCase() };
}
export function parseListingFilters(value: unknown): ListingFilters {
  const context = "listing filters";
  requireResponse(isRecord(value), context);
  const fields = Object.keys(emptyListingFilters(null));
  requireResponse(Object.keys(value).every(key => [...fields, "seller_listing_count", "title_contains"].includes(key)) && fields.every(key => Object.hasOwn(value, key)), context);
  requireResponse((value.ip_id === null || uuid(value.ip_id)) && (value.catalog_product_id === null || uuid(value.catalog_product_id)), context);
  requireResponse(value.title_contains === undefined || value.title_contains === null || validText(value.title_contains,100) && value.title_contains.trim().length > 0 && [...value.title_contains].every(character=>character.charCodeAt(0)>31 && character.charCodeAt(0)!==127), context);
  requireResponse(value.query === null || validText(value.query, 100), context);
  requireResponse(Array.isArray(value.countries) && value.countries.length <= 250 && value.countries.every(item => typeof item === "string" && /^[A-Z]{2}$/.test(item)), context);
  requireResponse(listingStatuses.includes(value.status as ListingFilters["status"]) && ["found_desc", "found_asc", "score_desc"].includes(String(value.sort)), context);
  const semantic = value.semantic === null ? null : readSemanticFilters(JSON.stringify(value.semantic));
  requireResponse(value.semantic === null || semantic && Object.keys(semantic).every(key => ["categories", "colors", "materials", "form_factors", "identity_facts", "variant_attributes"].includes(key)), context);
  let price: ListingPrice | null = null;
  if (value.price !== null) {
    requireResponse(isRecord(value.price) && typeof value.price.currency === "string" && /^[A-Z]{3}$/.test(value.price.currency), context);
    const raw = value.price;
    requireResponse(Object.keys(raw).every(key => ["currency", "gt", "gte", "lt", "lte"].includes(key))
      && ["gt", "gte", "lt", "lte"].some(key => raw[key] !== undefined)
      && !(raw.gt !== undefined && raw.gte !== undefined) && !(raw.lt !== undefined && raw.lte !== undefined), context);
    price = { currency: raw.currency as string };
    for (const key of ["gt", "gte", "lt", "lte"] as const) if (raw[key] !== undefined) {
      requireResponse(decimal(raw[key]), context);
      // Canonical decimal strings without losing precision through Number.
      const [whole, fraction = ""] = raw[key].split(".");
      const digits = fraction.replace(/0+$/, "");
      price[key] = `${BigInt(whole)}${digits ? `.${digits}` : ""}`;
    }
    const lower = price.gt ?? price.gte, upper = price.lt ?? price.lte;
    const units = (amount: string) => { const [whole, part = ""] = amount.split("."); return BigInt(whole) * 1000000n + BigInt(part.padEnd(6, "0")); };
    requireResponse(lower === undefined || upper === undefined || units(lower) < units(upper)
      || units(lower) === units(upper) && price.gt === undefined && price.lt === undefined, context);
  }
  let sellerCount: SellerListingCount | null | undefined;
  if (Object.hasOwn(value, "seller_listing_count")) {
    const raw = value.seller_listing_count;
    if (raw === null) sellerCount = null;
    else {
      requireResponse(isRecord(raw) && Object.keys(raw).length > 0 && Object.keys(raw).every(key => ["gt","gte","lt","lte"].includes(key))
        && Object.values(raw).every(bound => typeof bound === "number" && Number.isSafeInteger(bound) && bound >= 0 && bound <= 1e9)
        && !(raw.gt !== undefined && raw.gte !== undefined) && !(raw.lt !== undefined && raw.lte !== undefined), context);
      sellerCount = raw as SellerListingCount;
      const lower = sellerCount.gt !== undefined ? sellerCount.gt + 1 : Math.max(1,sellerCount.gte ?? 1);
      const upper = sellerCount.lt !== undefined ? sellerCount.lt - 1 : sellerCount.lte ?? Infinity;
      requireResponse(lower <= upper, context);
    }
  }
  const catalog = value.catalog_selection === null ? null : parseCatalogReference(value.catalog_selection);
  requireResponse(!catalog || !value.catalog_product_id && (!value.ip_id || String(value.ip_id).toLowerCase() === catalog.ip_id), context);
  return { ...(value.title_contains !== undefined ? {title_contains:typeof value.title_contains === "string" ? value.title_contains.trim() : null} : {}), ...(sellerCount !== undefined ? { seller_listing_count: sellerCount } : {}), ip_id: value.ip_id === null ? null : String(value.ip_id).toLowerCase(), catalog_product_id: value.catalog_product_id === null ? null : String(value.catalog_product_id).toLowerCase(),
    catalog_selection: catalog, query: value.query as string | null, semantic, countries: [...new Set(value.countries as string[])].sort(), price,
    status: value.status as ListingFilters["status"], sort: value.sort as ListingFilters["sort"] };
}
export const listingFilterKey = (filters: ListingFilters) => semanticFingerprint(filters);
export function readListingSearch(params: URLSearchParams, ipId: string | null): { filters: ListingFilters; error: string | null; saved: boolean; ranking: SellerRanking | null } {
  const raw = params.get("filters");
  if (!raw && params.has("ranking")) return {ranking:null,filters:emptyListingFilters(ipId),error:"This ranking link contains invalid filters. Reset the search to continue.",saved:false};
  if (!raw) return { ranking:null, filters: emptyListingFilters(ipId), error: null, saved: false };
  try {
    if (raw.length > 16384) throw new Error("Too large");
    const filters = parseListingFilters(JSON.parse(raw));
    const ranking = params.has("ranking") ? parseSellerRanking(JSON.parse(params.get("ranking")!)) : null;
    if (filters.ip_id !== ipId) return { ranking:null, filters: emptyListingFilters(ipId), error: null, saved: false };
    return { ranking, filters, error: null, saved: true };
  } catch { return { ranking:null, filters: emptyListingFilters(ipId), error: "This search link contains invalid filters. Reset the search to continue.", saved: false }; }
}
export function listingSearchParams(filters: ListingFilters, ranking: SellerRanking | null = null): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.ip_id) params.set("ip_id", filters.ip_id);
  params.set("filters", JSON.stringify(parseListingFilters(filters)));
  if (ranking) params.set("ranking",JSON.stringify(parseSellerRanking(ranking)));
  return params;
}

export const listingSearchKey = (filters: ListingFilters, ranking: SellerRanking | null) => semanticFingerprint({filters,ranking});
