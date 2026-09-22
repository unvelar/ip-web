import type { MonitoringCandidateOutcome, MonitoringDismissalReasonFilter, MonitoringPriorityBand, MonitoringSortMode, MonitoringStatusFilter } from "../api/monitoring";
import { formatPriceBound, parsePriceBound } from "./priceRange";

/** Single source of truth for the inbox filter set, read from / written to
 *  the URL so refresh + share + KPI deep-links survive. */
export interface InboxFilters {
  country?: string | null;
  status: MonitoringStatusFilter | null;
  priority: MonitoringPriorityBand | null;
  ip_id: string | null;
  product_group_id: string | null;
  catalog_product_id: string | null;
  source: string | null;
  min_price_usd: number | null;
  max_price_usd: number | null;
  platform: string | null;
  match_basis?: "text" | "text_only" | "visual" | "both" | null;
  protected_term_id?: string | null;
  seller: string | null;
  query: string | null;
  assignee: string | null;
  dismissal_reason: MonitoringDismissalReasonFilter | null;
  candidate_outcome: MonitoringCandidateOutcome | null;
  show_dismissed: boolean;
  sort: MonitoringSortMode;
}

const DEFAULT_SORT: MonitoringSortMode = "score_desc";

export function parseFilters(params: URLSearchParams): InboxFilters {
  const status = params.get("status");
  const sort = params.get("sort");
  const dismissalReason = params.get("dismissal_reason");
  const candidateOutcome = params.get("candidate_outcome");
  const seller = params.get("seller");
  const query = params.get("q");
  const assignee = params.get("assignee");
  const minPrice = parsePriceBound(params.get("min_price_usd") ?? "");
  const maxPrice = parsePriceBound(params.get("max_price_usd") ?? "");
  const validRange = minPrice == null || maxPrice == null || minPrice <= maxPrice;
  return {
    min_price_usd: validRange ? minPrice : null,
    max_price_usd: validRange ? maxPrice : null,
    // Default to "To triage" (pending); an explicit `status=all` clears it.
    status:
      status === "all"
        ? null
        : status === "preparing" || status === "pending" || status === "review" ||
            status === "takedown_pending" || status === "takedown_sent" ||
            status === "enforced" || status === "dismissed"
          ? status
          : status === null
            ? "pending"
            : null,
    priority: null,
    ip_id: params.get("ip_id"),
    product_group_id: params.get("product_group_id"),
    catalog_product_id: params.get("catalog_product_id"),
    source: params.get("source"),
    platform: params.get("platform"),
    country: params.get("country")?.trim() || null,
    match_basis: ["text", "text_only", "visual", "both"].includes(params.get("match_basis") ?? "") ? params.get("match_basis") as InboxFilters["match_basis"] : null,
    protected_term_id: params.get("protected_term_id"),
    seller: seller && seller.trim() ? seller.trim() : null,
    query: query && query.trim() ? query.trim() : null,
    assignee: assignee && assignee.trim() ? assignee.trim() : null,
    dismissal_reason:
      dismissalReason === "false_positive" ||
      dismissalReason === "do_not_pursue" ||
      dismissalReason === "second_hand" ||
      dismissalReason === "licensed" ||
      dismissalReason === "allowed_product" ||
      dismissalReason === "dead" ||
      dismissalReason === "manual_cleared"
        ? dismissalReason
        : null,
    candidate_outcome:
      candidateOutcome === "false_positive" ||
      candidateOutcome === "do_not_pursue" ||
      candidateOutcome === "takedown" ||
      candidateOutcome === "second_hand" ||
      candidateOutcome === "none"
        ? candidateOutcome
        : null,
    show_dismissed: params.get("show_dismissed") === "true",
    sort:
      sort === "score_desc" || sort === "score_asc" ||
      sort === "found_desc" || sort === "found_asc" ||
      sort === "updated_desc" || sort === "updated_asc" ||
      sort === "price_desc" || sort === "price_asc" ||
      sort === "seller_desc" || sort === "seller_asc" ||
      sort === "platform_desc" || sort === "platform_asc"
        ? sort
        : DEFAULT_SORT,
  };
}

/** Mutates a URLSearchParams clone with the new filter set, dropping keys
 *  that are at the default so the URL stays tidy. */
export function writeFilters(base: URLSearchParams, f: InboxFilters): URLSearchParams {
  const next = new URLSearchParams(base);
  const setOrDel = (k: string, v: string | null) => {
    if (v) next.set(k, v);
    else next.delete(k);
  };
  // "pending" is the default → drop it; null means All → persist as `all`
  // so the choice survives a refresh instead of snapping back to pending.
  setOrDel("status", f.status === "pending" ? null : f.status ?? "all");
  setOrDel("priority", f.priority);
  setOrDel("ip_id", f.ip_id);
  setOrDel("product_group_id", f.product_group_id);
  setOrDel("catalog_product_id", f.catalog_product_id);
  setOrDel("source", f.source);
  setOrDel("min_price_usd", f.min_price_usd == null ? null : formatPriceBound(f.min_price_usd));
  setOrDel("max_price_usd", f.max_price_usd == null ? null : formatPriceBound(f.max_price_usd));
  setOrDel("platform", f.platform);
  setOrDel("country", f.country ?? null);
  setOrDel("match_basis", f.match_basis ?? null);
  setOrDel("protected_term_id", f.protected_term_id ?? null);
  setOrDel("seller", f.seller);
  setOrDel("q", f.query);
  setOrDel("assignee", f.assignee);
  setOrDel("dismissal_reason", f.dismissal_reason);
  setOrDel("candidate_outcome", f.candidate_outcome);
  setOrDel("show_dismissed", f.show_dismissed ? "true" : null);
  setOrDel("sort", f.sort === DEFAULT_SORT ? null : f.sort);
  return next;
}
