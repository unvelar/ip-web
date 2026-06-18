import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  listMonitoringFindingsGlobal,
  type IpReviewFinding,
  type MonitoringCandidateOutcome,
  type MonitoringFacets,
  type MonitoringFindingsQuery,
  type MonitoringDismissalReasonFilter,
  type MonitoringPriorityBand,
  type MonitoringSortMode,
  type MonitoringStatusFilter,
} from "../api";
import { MonitoringBoard } from "../components/monitoring/MonitoringBoard";

/** Legacy route — redirects to the canonical Monitoring Tasks page. */
export default function Findings() {
  return <Navigate to="/monitoring/tasks" replace />;
}

/** Single source of truth for the inbox filter set, read from / written to
 *  the URL so refresh + share + KPI deep-links survive. */
interface InboxFilters {
  status: MonitoringStatusFilter | null;
  priority: MonitoringPriorityBand | null;
  ip_id: string | null;
  platform: string | null;
  seller: string | null;
  dismissal_reason: MonitoringDismissalReasonFilter | null;
  candidate_outcome: MonitoringCandidateOutcome | null;
  show_dismissed: boolean;
  sort: MonitoringSortMode;
}

const DEFAULT_SORT: MonitoringSortMode = "score_desc";

function parseFilters(params: URLSearchParams): InboxFilters {
  const status = params.get("status");
  const priority = params.get("priority");
  const sort = params.get("sort");
  const dismissalReason = params.get("dismissal_reason");
  const candidateOutcome = params.get("candidate_outcome");
  return {
    // Default to "To triage" (pending); an explicit `status=all` clears it.
    status:
      status === "all"
        ? null
        : status === "pending" || status === "takedown_sent" ||
            status === "enforced" || status === "dismissed"
          ? status
          : status === null
            ? "pending"
            : null,
    priority: priority === "high" || priority === "med" || priority === "low" ? priority : null,
    ip_id: params.get("ip_id"),
    platform: params.get("platform"),
    seller: params.get("seller"),
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
function writeFilters(base: URLSearchParams, f: InboxFilters): URLSearchParams {
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
  setOrDel("platform", f.platform);
  setOrDel("seller", f.seller);
  setOrDel("dismissal_reason", f.dismissal_reason);
  setOrDel("candidate_outcome", f.candidate_outcome);
  setOrDel("show_dismissed", f.show_dismissed ? "true" : null);
  setOrDel("sort", f.sort === DEFAULT_SORT ? null : f.sort);
  return next;
}

/**
 * Tenant-wide infringement findings board. Filters/sort live in the URL;
 * the server returns a single page + full-tenant facets and the user
 * "Load more"s their way through the rest via keyset cursor.
 */
export function MonitoringInboxView() {
  const [params, setParams] = useSearchParams();
  const filters = parseFilters(params);

  const [findings, setFindings] = useState<IpReviewFinding[]>([]);
  const [facets, setFacets] = useState<MonitoringFacets | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");

  // The request currently in flight for the first page (filter changes); we
  // ignore stale responses so a quick filter toggle can't flicker an older
  // payload back on screen.
  const reqSeq = useRef(0);

  // Filter-aware first-page fetch. Triggered on any filter/sort change.
  const loadFirstPage = useCallback(
    async (q: MonitoringFindingsQuery) => {
      const seq = ++reqSeq.current;
      setErr("");
      try {
        const page = await listMonitoringFindingsGlobal({ ...q, cursor: null });
        if (reqSeq.current !== seq) return;
        setFindings(page.findings);
        setFacets(page.facets);
        setNextCursor(page.next_cursor);
      } catch (e) {
        if (reqSeq.current !== seq) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (reqSeq.current === seq) setLoaded(true);
      }
    },
    [],
  );

  // Refetch on any filter/sort change. URL params are the dependency — they
  // change synchronously via setParams, so this fires exactly when needed.
  // Stringify the filters as the dep to avoid re-running on object identity.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    void loadFirstPage(filters);
    // filterKey is enough; parseFilters is pure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMonitoringFindingsGlobal({
        ...filters,
        cursor: nextCursor,
      });
      setFindings((prev) => [...prev, ...page.findings]);
      setNextCursor(page.next_cursor);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, filters]);

  // Refresh in place after an action (dismiss, confirm, …) without losing
  // the current scroll position: re-fetch the first page only.
  const refresh = useCallback(() => {
    void loadFirstPage(filters);
  }, [loadFirstPage, filters]);

  const onFiltersChange = useCallback(
    (next: Partial<InboxFilters>) => {
      setParams((prev) => writeFilters(prev, { ...filters, ...next }), {
        replace: true,
      });
    },
    [filters, setParams],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-stone-500">
          {facets
            ? `${facets.total} open finding${facets.total === 1 ? "" : "s"} across all monitored IPs.`
            : "Loading…"}
        </p>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {!loaded ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading…</div>
      ) : !facets || (facets.total === 0 && findings.length === 0) ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-stone-600">No findings yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Add platforms under <span className="font-semibold">Monitoring</span>.
          </p>
        </div>
      ) : (
        <MonitoringBoard
          findings={findings}
          facets={facets}
          filters={filters}
          onFiltersChange={onFiltersChange}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          runInProgress={false}
          onRefresh={refresh}
          showIpColumn
        />
      )}
    </div>
  );
}

export type { InboxFilters };
