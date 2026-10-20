import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  taskSellerGroups, taskSellerGroupListings,
  type TaskSellerGroupsQuery, type TaskSellerGroupsPage, type TaskSellerGroupListingsPage, type TaskSummary,
} from "../../../api/taskQueue";
import { isApiError } from "../../../api";
import type { MonitoringListingGroup } from "../../../lib/monitoringGrouping";
import { TaskGroupRows } from "./TaskGroupRows";
import { MonitoringGroupDetails } from "./MonitoringGroupDetails";

const message = (error: unknown) => isApiError(error, 404)
  ? "Seller totals are unavailable. Try again or view ungrouped tasks."
  : error instanceof Error ? error.message : "Could not load seller totals.";

export function SellerGroupedQueue({ query, revision, selection, onSelect, renderRow, onUngroup, onOpenGroup, activeFindingId }: {
  query: TaskSellerGroupsQuery;
  revision: string;
  selection: Set<string>;
  onSelect: (ids: string[], selected: boolean) => void;
  renderRow: (row: TaskSummary) => ReactNode;
  onUngroup: () => void;
  onOpenGroup: () => void;
  activeFindingId?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<TaskSellerGroupsPage | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [members, setMembers] = useState<Record<string, TaskSellerGroupListingsPage>>({});
  const [memberErrors, setMemberErrors] = useState<Record<string, string>>({});
  const [loadingMembers, setLoadingMembers] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const key = JSON.stringify(query);
  const close = useCallback(() => setActiveKey(null), []);
  const scope = `${key}:${offset}`;
  const previousScope = useRef("");
  const loadedMembers = useRef(members);
  const memberController = useRef<AbortController | null>(null);
  useEffect(() => { loadedMembers.current = members; }, [members]);
  useEffect(() => {
    const controller = new AbortController();
    memberController.current = controller;
    const scopeChanged = previousScope.current !== scope;
    previousScope.current = scope;
    const cached = scopeChanged ? {} : loadedMembers.current;
    if (scopeChanged) {
      setPage(null); setMembers({}); setActiveKey(null);
    }
    setError(""); setMemberErrors({}); setLoadingMembers(new Set());
    void taskSellerGroups({ ...JSON.parse(key), offset }, controller.signal)
      .then(async result => {
        if (controller.signal.aborted) return;
        setPage(result);
        // Keep the table mounted during action/search updates. Re-fetch every
        // previously loaded page so removed rows cannot leave gaps or duplicates
        // when the reviewer subsequently loads more articles.
        await Promise.all(result.groups.map(async group => {
          const groupKey = group.seller_key ? `seller:${group.seller_key}` : "seller:unidentified";
          const loaded = cached[groupKey];
          if (!loaded) return;
          setLoadingMembers(previous => new Set(previous).add(groupKey));
          try {
            const through = loaded.next_offset ?? loaded.rows.length;
            let refreshed: TaskSellerGroupListingsPage = { ...loaded, rows:[] };
            let next = 0;
            do {
              const batch = await taskSellerGroupListings({ ...JSON.parse(key), seller_key:group.seller_key ?? "", offset:next }, controller.signal);
              if (controller.signal.aborted) return;
              refreshed = { ...batch, rows:[...refreshed.rows, ...batch.rows] };
              next = batch.next_offset ?? through;
            } while (refreshed.next_offset !== null && next < through);
            setMembers(previous => ({ ...previous, [groupKey]:refreshed }));
          } catch (reason) {
            if (!controller.signal.aborted) setMemberErrors(previous => ({ ...previous, [groupKey]:message(reason) }));
          } finally {
            if (!controller.signal.aborted) setLoadingMembers(previous => { const next = new Set(previous); next.delete(groupKey); return next; });
          }
        }));
      })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)); });
    return () => controller.abort();
  }, [key, scope, offset, revision, retry]);
  const groups: MonitoringListingGroup<TaskSummary>[] = (page?.groups ?? []).map(group => {
    const key = group.seller_key ? `seller:${group.seller_key}` : "seller:unidentified";
    return { key, kind:"seller", label:group.seller_key ? group.seller_name : "Seller identity unavailable",
      findings:members[key]?.rows ?? [], sellerKey:group.seller_key, ipId:query.ip_id, productId:null,
      totals:{ articles:group.article_count, pricedArticles:group.priced_article_count, exposureUsd:group.exposure_usd, partial:page?.partial } };
  });
  const active = groups.find(group => group.key === activeKey);
  async function load(group: MonitoringListingGroup<TaskSummary>, more = false) {
    const controller = memberController.current;
    if (!controller) return;
    if (loadingMembers.has(group.key) || (!more && members[group.key] && !memberErrors[group.key])) return;
    setLoadingMembers(previous => new Set(previous).add(group.key));
    setMemberErrors(previous => ({ ...previous, [group.key]:"" }));
    try {
      const result = await taskSellerGroupListings({ ...query, seller_key:group.sellerKey ?? "", offset:more ? members[group.key]?.next_offset ?? 0 : 0 }, controller.signal);
      if (!controller.signal.aborted) setMembers(previous => ({ ...previous, [group.key]:{...result, rows:more ? [...(previous[group.key]?.rows ?? []),...result.rows] : result.rows} }));
    } catch (reason) {
      if (!controller.signal.aborted) setMemberErrors(previous => ({...previous, [group.key]:message(reason)}));
    } finally {
      if (!controller.signal.aborted) setLoadingMembers(previous => { const next = new Set(previous); next.delete(group.key); return next; });
    }
  }
  return <div className="monitoring-results-queue" aria-busy={!page && !error}>
    <div className="monitoring-results-summary"><span>{page ? `${page.total_groups.toLocaleString()} seller groups · ${page.partial ? "Totals cover matches found so far" : "Totals cover all matching tasks across pages"}` : error ? "Seller totals unavailable" : "Loading seller totals…"}</span></div>
    {error && <p className="task-queue-notice" role="alert">{error} <button onClick={() => setRetry(value => value + 1)}>Retry</button> · <button onClick={onUngroup}>Ungroup tasks</button></p>}
    {page?.partial && <p className="task-queue-notice" role="status">Search results are incomplete. Seller totals and ranking cover matches found so far.</p>}
    {page?.updating && <p className="task-queue-notice" role="status">Tasks are updating. Seller totals may lag recent changes.</p>}
    {page && <>
      <table className="monitoring-result-list" aria-label="Monitoring tasks grouped by seller">
        <colgroup><col className="monitoring-checkbox-column" /><col /><col className="monitoring-price-column" /><col className="monitoring-assessment-column" /></colgroup>
        <thead><tr><th colSpan={4} scope="colgroup"><div className="monitoring-seller-columns"><span>Seller / articles</span><span>Exposure (USD)</span></div></th></tr></thead>
        <TaskGroupRows key={`${key}:${offset}`} groups={groups} selection={selection} disabled={false} onSelect={onSelect}
          onOpen={group => { onOpenGroup(); setActiveKey(group.key); }} renderRow={renderRow}
          groupColumns={<tr className="monitoring-group-listing-columns"><th scope="col" /><th scope="col" className="monitoring-listing-heading">Listing / seller / first detected</th><th scope="col" className="monitoring-price-heading">Price (USD)</th><th scope="col" className="monitoring-assessment-heading">Suggested action</th></tr>}
          onToggle={(group, expanded) => { if (expanded) void load(group); }}
          renderFooter={group => <tr><td colSpan={4} className="monitoring-group-footer">
            {loadingMembers.has(group.key) ? <span role="status">Loading articles…</span> : memberErrors[group.key] ? <span role="alert">{memberErrors[group.key]} <button onClick={() => void load(group)}>Retry articles</button></span>
              : members[group.key]?.next_offset != null ? <button onClick={() => void load(group,true)}>Load more articles ({group.findings.length} of {group.totals?.articles})</button>
              : members[group.key]?.rows.length === 0 ? <span>No matching articles remain. Refresh seller totals.</span> : null}
          </td></tr>} />
      </table>
      {groups.length === 0 && <div className="monitoring-results-empty"><p>No sellers match this view.</p></div>}
      <div className="monitoring-results-pagination"><button disabled={offset === 0} onClick={() => { setOffset(Math.max(0,offset - 50)); onSelect([...selection],false); }}>Previous sellers</button><span>Page {Math.floor(offset / 50) + 1}</span><button disabled={page.next_offset === null} onClick={() => { setOffset(page.next_offset!); onSelect([...selection],false); }}>Next sellers</button></div>
    </>}
    {active && !activeFindingId && <MonitoringGroupDetails group={active} scope="matching" onClose={close} />}
  </div>;
}
