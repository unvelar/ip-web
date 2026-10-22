import {queueViewPolicy} from "../lib/queueView";
import { request } from "./transport";
import type { IpReviewFinding } from "./reviews";
export const taskStates = [
  "preparing",
  "pending",
  "review",
  "takedown_pending",
  "takedown_sent",
  "enforced",
  "dismissed",
] as const;
export type TaskState = (typeof taskStates)[number];
export const taskStateLabels: Record<TaskState, string> = {
  preparing: "Preparing",
  pending: "To triage",
  review: "Legal review",
  takedown_pending: "Legal queue",
  takedown_sent: "Takedown sent",
  enforced: "Enforced",
  dismissed: "Dismissed",
};
export type TaskSummary = Pick<
  IpReviewFinding,
  | "product_identity"
  | "result_id"
  | "case_id"
  | "domain"
  | "page_url"
  | "image_url"
  | "listing_title"
  | "seller_key"
  | "seller_name"
  | "seller_url"
  | "price"
  | "price_value_usd"
  | "price_value"
  | "price_currency"
  | "ip_id"
  | "ip_name"
  | "ready_for_review"
  | "review_status"
  | "dismissed_at"
  | "dismissal_reason"
  | "licensed_seller"
  | "assigned_to_account_id"
  | "assignee_display_name"
  | "assignee_email"
  | "found_at"
  | "updated_at"
  | "enforcement_priority"
  | "manual_candidate_outcome"
  | "suggested_review_outcome"
  | "suggested_review_reason"
  | "actionability"
  | "takedown_sent_at"
  | "enforced_at"
> & { task_id: string; state: TaskState };
export type TaskSelector =
  "website" | "source" | "assignee" | "suggestion" | "seller";
export interface TaskQueueQuery {
  ip_id: string;
  catalog_product_id?: string;
  status: TaskState | "all";
  sort: "newest" | "priority";
  selector?: TaskSelector;
  value?: string;
  cursor?: string;
  limit?: number;
}
export interface TaskCapability {
  version: number;
  active: boolean;
  ready: boolean;
  as_of: string | null;
  updating: boolean;
  reason: string | null;
  listing_search_policy_version?: string;
  title_search_policy_version?: string;
}
export interface TaskPage {
  rows: TaskSummary[];
  next_cursor: string | null;
  counts: Record<TaskState, number>;
  as_of: string | null;
  updating: boolean;
}
export interface TaskSearchResult {
  id: string | null;
  state:
    "pending" | "running" | "completed" | "limited" | "failed" | "cancelled";
  scanned: string | number;
  matched: number;
  error?: string | null;
  requires_complete?: boolean;
  queue_view_policy_version?:string;
  sort?:"priority"|"newest";
  completion_reason?:"seller_counts"|"priority_order";
  rows?: TaskSummary[];
  next?: number | null;
}
export type SellerGroupSort = "exposure" | "articles" | "priority" | "newest";
export interface TaskSellerGroup {
  seller_key: string | null;
  seller_name: string;
  article_count: number;
  priced_article_count: number;
  exposure_usd: number | null;
}
export interface TaskSellerGroupsPage {
  groups: TaskSellerGroup[];
  total_groups: number;
  next_offset: number | null;
  as_of: string | null;
  updating: boolean;
  partial: boolean;
}
export interface TaskSellerGroupListingsPage {
  rows: TaskSummary[];
  next_offset: number | null;
  partial: boolean;
}
export type TaskSellerGroupsQuery = Omit<TaskQueueQuery, "cursor"> & {
  search_id?: string;
  ranking_limit?: number;
  group_sort: SellerGroupSort;
  offset?: number;
};
const queryString = (query: object) =>
  new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  ).toString();
export const taskSellerGroups = (query: TaskSellerGroupsQuery, signal?: AbortSignal) =>
  request<TaskSellerGroupsPage>("/api/monitoring/tasks/seller-groups?" + queryString(query), { signal });
export const taskSellerGroupListings = (query: TaskSellerGroupsQuery & { seller_key: string }, signal?: AbortSignal) =>
  request<TaskSellerGroupListingsPage>("/api/monitoring/tasks/seller-groups/listings?" + queryString(query), { signal });
export const taskCapability = (ip_id: string, signal?: AbortSignal) =>
  request<TaskCapability>(
    "/api/monitoring/tasks/capability?" + queryString({ ip_id }),
    { signal },
  );
export const taskPage = (query: TaskQueueQuery, signal?: AbortSignal) =>
  request<TaskPage>("/api/monitoring/tasks/queue?" + queryString(query), {
    signal,
  });
export const taskOptions = (
  query: {
    ip_id: string;
    catalog_product_id?: string;
    kind: "website" | "source" | "seller";
    q: string;
  },
  signal?: AbortSignal,
) =>
  request<{ options: Array<{ value: string; label: string }> }>(
    "/api/monitoring/tasks/options?" + queryString(query),
    { signal },
  );
export const taskCatalogOptions = (
  query: { ip_id: string; kind: "product" | "visual_group"; q: string },
  signal?: AbortSignal,
) =>
  request<{ options: Array<{ value: string; label: string }> }>(
    "/api/monitoring/tasks/catalog-options?" + queryString(query),
    { signal },
  );
export const startTaskSearch = (filters: object) =>
  request<TaskSearchResult>("/api/monitoring/tasks/searches", {
    method: "POST",
    body: JSON.stringify(filters),
  });
export const getTaskSearch = async(id:string,after=0,signal?:AbortSignal,sort?:"priority"|"newest")=>{
  const result=await request<TaskSearchResult>("/api/monitoring/tasks/searches/"+encodeURIComponent(id)+"?"+new URLSearchParams({after:String(after),...(sort?{sort}:{})}),{signal});
  if(sort==="priority"&&(result.queue_view_policy_version!==queueViewPolicy||result.sort!==sort))throw new Error("This API cannot order saved search results by takedown recommendation yet. Your search was kept.");
  return result;
};
export const cancelTaskSearch = (id: string) =>
  request<void>("/api/monitoring/tasks/searches/" + encodeURIComponent(id), {
    method: "DELETE",
  });
export const taskDetails = (ids: string[], signal?: AbortSignal) =>
  request<{ findings: IpReviewFinding[] }>("/api/monitoring/tasks/details", {
    method: "POST",
    body: JSON.stringify({ ids }),
    signal,
  });
