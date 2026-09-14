import { request } from "./transport";

// --- Giantbomb catalog browse (standalone Pop-Culture catalog page) ---
//
// The catalog-browse + categories endpoints live on /api/giantbomb-match
// because they're pop-culture-specific.

/** Indexed entity types + counts. UI uses this to drive chip availability. */
export interface GiantbombCategory {
  entity_type: string;
  count: number;
}
export function getGiantbombCategories() {
  return request<{ categories: GiantbombCategory[] }>("/api/giantbomb-match/categories");
}

export interface GiantbombCatalogItem {
  id: string;
  giantbomb_id: string;
  source_id: string;
  entity_type: string;
  name: string;
  aliases: string[];
  summary: string | null;
  source_url: string | null;
  image_count: number;
  image_url: string | null;
}
export function browseGiantbombCatalog(opts: {
  q?: string;
  entityType?: string;
  limit: number;
  offset: number;
}) {
  const qs = new URLSearchParams();
  if (opts.q) qs.set("q", opts.q);
  if (opts.entityType) qs.set("entity_type", opts.entityType);
  qs.set("limit", String(opts.limit));
  qs.set("offset", String(opts.offset));
  return request<{
    items: GiantbombCatalogItem[];
    total: number;
    limit: number;
    offset: number;
    entity_type: string | null;
    q: string;
  }>(`/api/giantbomb-match/catalog/browse?${qs.toString()}`);
}
