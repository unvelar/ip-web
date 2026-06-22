import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getMonitoringFinding,
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
const MONITORING_PAGE_SIZE = 50;

function parseFilters(params: URLSearchParams): InboxFilters {
  const status = params.get("status");
  const sort = params.get("sort");
  const dismissalReason = params.get("dismissal_reason");
  const candidateOutcome = params.get("candidate_outcome");
  return {
    // Default to "To triage" (pending); an explicit `status=all` clears it.
    status:
      status === "all"
        ? null
        : status === "pending" || status === "review" || status === "takedown_sent" ||
            status === "enforced" || status === "dismissed"
          ? status
          : status === null
            ? "pending"
            : null,
    priority: null,
    ip_id: params.get("ip_id"),
    platform: params.get("platform"),
    seller: null,
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
  const { taskId } = useParams<{ taskId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const filters = parseFilters(params);

  const [findings, setFindings] = useState<IpReviewFinding[]>([]);
  const [linkedFinding, setLinkedFinding] = useState<IpReviewFinding | null>(null);
  const [facets, setFacets] = useState<MonitoringFacets | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [linkedErr, setLinkedErr] = useState("");

  // The request currently in flight for the first page (filter changes); we
  // ignore stale responses so a quick filter toggle can't flicker an older
  // payload back on screen.
  const reqSeq = useRef(0);
  const linkedReqSeq = useRef(0);
  const taskIdRef = useRef<string | undefined>(taskId);
  const completedLinkedIds = useRef<Set<string>>(new Set());
  taskIdRef.current = taskId;

  // Filter-aware first-page fetch. Triggered on any filter/sort change.
  // Action refreshes can ask for the currently loaded window so an expanded
  // row beyond page one does not disappear after a decision.
  const loadFirstPage = useCallback(
    async (q: MonitoringFindingsQuery, minRows = MONITORING_PAGE_SIZE) => {
      const seq = ++reqSeq.current;
      setErr("");
      try {
        const limit = q.limit ?? MONITORING_PAGE_SIZE;
        const page = await listMonitoringFindingsGlobal({ ...q, cursor: null, limit });
        if (reqSeq.current !== seq) return;
        const allFindings = [...page.findings];
        let cursor = page.next_cursor;
        while (cursor && allFindings.length < minRows) {
          const nextPage = await listMonitoringFindingsGlobal({ ...q, cursor, limit });
          if (reqSeq.current !== seq) return;
          allFindings.push(...nextPage.findings);
          cursor = nextPage.next_cursor;
          if (nextPage.findings.length === 0) break;
        }
        setFindings(allFindings);
        setFacets(page.facets);
        setNextCursor(cursor);
      } catch (e) {
        if (reqSeq.current !== seq) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (reqSeq.current === seq) setLoaded(true);
      }
    },
    [],
  );

  const loadLinkedFinding = useCallback(async (id: string) => {
    if (completedLinkedIds.current.has(id)) {
      linkedReqSeq.current++;
      setLinkedFinding(null);
      setLinkedErr("");
      return;
    }
    const seq = ++linkedReqSeq.current;
    setLinkedErr("");
    try {
      const { finding } = await getMonitoringFinding(id);
      if (linkedReqSeq.current !== seq) return;
      if (completedLinkedIds.current.has(id)) return;
      setLinkedFinding(finding);
    } catch (e) {
      if (linkedReqSeq.current !== seq) return;
      setLinkedFinding(null);
      setLinkedErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Refetch on any filter/sort change. URL params are the dependency — they
  // change synchronously via setParams, so this fires exactly when needed.
  // Stringify the filters as the dep to avoid re-running on object identity.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    void loadFirstPage(filters);
    // filterKey is enough; parseFilters is pure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, loadFirstPage]);

  useEffect(() => {
    if (!taskId) {
      linkedReqSeq.current++;
      setLinkedFinding(null);
      setLinkedErr("");
      return;
    }
    void loadLinkedFinding(taskId);
  }, [loadLinkedFinding, taskId]);

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
  // the currently loaded window. This keeps auto-advance targets present even
  // after the user has loaded past the first page.
  const refresh = useCallback((completedResultId?: string) => {
    if (completedResultId) {
      completedLinkedIds.current.add(completedResultId);
      linkedReqSeq.current++;
      setLinkedFinding((current) =>
        current?.result_id === completedResultId ? null : current,
      );
      setLinkedErr("");
    }
    void loadFirstPage(filters, Math.max(findings.length, MONITORING_PAGE_SIZE));
    const currentTaskId = taskIdRef.current;
    if (!currentTaskId) return;
    if (completedLinkedIds.current.has(currentTaskId)) {
      linkedReqSeq.current++;
      setLinkedFinding(null);
      setLinkedErr("");
      return;
    }
    void loadLinkedFinding(currentTaskId);
  }, [loadFirstPage, loadLinkedFinding, filters, findings.length]);

  const onFiltersChange = useCallback(
    (next: Partial<InboxFilters>) => {
      setParams((prev) => writeFilters(prev, { ...filters, ...next }), {
        replace: true,
      });
    },
    [filters, setParams],
  );

  const onActiveFindingChange = useCallback((resultId: string | null) => {
    if (resultId !== taskIdRef.current) {
      linkedReqSeq.current++;
      setLinkedFinding(null);
      setLinkedErr("");
    }
    navigate({
      pathname: resultId ? `/monitoring/tasks/${resultId}` : "/monitoring/tasks",
      search: location.search,
    });
  }, [location.search, navigate]);

  const boardFindings = useMemo(() => {
    if (!linkedFinding || findings.some((f) => f.result_id === linkedFinding.result_id)) {
      return findings;
    }
    return [linkedFinding, ...findings];
  }, [findings, linkedFinding]);

  const queueSummary = useMemo(() => {
    if (!facets) return "Loading…";
    const count = facets.total;
    const statusLabel =
      filters.status === "pending"
        ? "to triage"
        : filters.status === "review"
          ? "in review"
        : filters.status === "takedown_sent"
          ? "with takedowns sent"
          : filters.status === "enforced"
            ? "enforced"
            : filters.status === "dismissed"
              ? "dismissed"
              : "open";
    const ipName =
      filters.ip_id
        ? facets.ips.find((ip) => ip.ip_id === filters.ip_id)?.name ?? "selected IP"
        : "all monitored IPs";
    return `${count} finding${count === 1 ? "" : "s"} ${statusLabel} · ${ipName}.`;
  }, [facets, filters.ip_id, filters.status]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-stone-500">
          {queueSummary}
        </p>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}
      {linkedErr && (
        <div className="text-sm text-red-600">
          Unable to open linked task: {linkedErr}
        </div>
      )}

      {!loaded ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading…</div>
      ) : !facets || (facets.total === 0 && boardFindings.length === 0) ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-stone-600">No findings yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Add platforms under <span className="font-semibold">Monitoring</span>.
          </p>
        </div>
      ) : (
        <MonitoringBoard
          findings={boardFindings}
          facets={facets}
          filters={filters}
          onFiltersChange={onFiltersChange}
          nextCursor={nextCursor}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          runInProgress={false}
          onRefresh={refresh}
          showIpColumn
          activeFindingId={taskId ?? null}
          onActiveFindingChange={onActiveFindingChange}
        />
      )}
    </div>
  );
}

export type { InboxFilters };
