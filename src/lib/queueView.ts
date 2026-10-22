import { isRecord, requireResponse } from "../api/validation";
import { parseMonitoringGroupBy } from "./monitoringGrouping";

export const queueViewPolicy="task-queue-view-v1";
export type QueueView={sort:"priority"|"newest";group_by:"none"|"seller"|"product";group_sort?:"priority"|"newest"|"articles"|"exposure";top_sellers?:number};
export type QueueViewChange=Partial<Pick<QueueView,"sort"|"group_by">>&{unavailable?:"category_grouping"|"seller_ranking_per_category"};
export function parseQueueViewChange(raw:unknown):QueueViewChange {
  requireResponse(isRecord(raw)&&Object.keys(raw).length>0&&Object.keys(raw).every(key=>["sort","group_by","unavailable"].includes(key)),"queue view");
  requireResponse(raw.sort===undefined||["priority","newest"].includes(String(raw.sort)),"queue order");
  requireResponse(raw.group_by===undefined||["none","seller","product"].includes(String(raw.group_by)),"queue grouping");
  requireResponse(raw.unavailable===undefined||["category_grouping","seller_ranking_per_category"].includes(String(raw.unavailable)),"queue capability");
  return raw as QueueViewChange;
}
export function queueViewFromParams(params:URLSearchParams):QueueView {
  const group_by=parseMonitoringGroupBy(params.get("group_by"));
  const top=params.get("top_sellers")??"";
  return {sort:params.get("queue_sort")==="priority"?"priority":params.get("queue_sort")==="newest"||params.has("task_search")||params.get("sort")==="found_desc"?"newest":"priority",group_by,
    ...(group_by==="seller"&&/^([1-9]\d?|100)$/.test(top)?{top_sellers:Number(top)}:{}),
    ...(group_by==="seller"?{group_sort:(["priority","newest","articles","exposure"].includes(params.get("group_sort")??"")?params.get("group_sort"):"exposure") as QueueView["group_sort"]}:{})};
}
export function mergeQueueView(current:QueueView,change:QueueViewChange):QueueView {
  const next={...current,...(change.sort?{sort:change.sort}:{}),...(change.group_by?{group_by:change.group_by}:{})};
  if(next.group_by==="seller"&&change.sort)next.group_sort=change.sort;
  if(next.group_by!=="seller"){delete next.group_sort;delete next.top_sellers;}
  return next;
}
export function queueViewParams(params:URLSearchParams,view:QueueView):URLSearchParams {
  const next=new URLSearchParams(params);
  next.set("queue_sort",view.sort);
  if(view.group_by==="none")next.delete("group_by");else next.set("group_by",view.group_by);
  if(view.group_by==="seller"){if(view.group_sort)next.set("group_sort",view.group_sort);if(view.top_sellers)next.set("top_sellers",String(view.top_sellers));else next.delete("top_sellers");}
  else {next.delete("group_sort");next.delete("top_sellers");}
  return next;
}
export function queueViewSummary(change:QueueViewChange):string {
  const parts:string[]=[];
  if(change.sort)parts.push(change.sort==="priority"?"Takedown recommendations first; other matching items remain included.":"Showing newest items first.");
  if(change.group_by)parts.push({none:"Showing individual items.",seller:"Grouped by seller.",product:"Grouped by canonical product."}[change.group_by]);
  if(change.unavailable)parts.push(change.unavailable==="category_grouping"?"Grouping by product category is not available yet. Product grouping refers to individual canonical products.":"Top sellers within each product category is not available yet. Seller ranking currently covers the matching set overall.");
  return parts.join(" ");
}
