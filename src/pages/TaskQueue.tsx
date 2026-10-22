import {queueViewFromParams,queueViewParams,queueViewPolicy,type QueueView} from "../lib/queueView";
import { queueSearchParams } from "../lib/taskSearchAssistant";
import { useCallback, useEffect, useMemo, useRef, useState,type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ImageOff,ListFilter } from "lucide-react";
import MonitoringToolbar from "../components/MonitoringToolbar";
import TaskSearch from "../components/TaskSearch";
import TaskSearchStatus from "../components/TaskSearchStatus";
import {CategoryResultsWorkspace} from "../components/CategoryResultsWorkspace";
import type {CategoryRanking} from "../lib/categoryRanking";
import { TaskGroupRows } from "../components/monitoring/board/TaskGroupRows";
import { SellerGroupedQueue } from "../components/monitoring/board/SellerGroupedQueue";
import { MonitoringGroupDetails } from "../components/monitoring/board/MonitoringGroupDetails";
import {
  groupMonitoringFindings,
  hasProductGrouping,
  parseMonitoringGroupBy,
} from "../lib/monitoringGrouping";
import { useTaskProductIdentities } from "../hooks/useTaskProductIdentities";
import { MonitoringBoard } from "../components/monitoring/MonitoringBoard";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import type { FindingUpdateOptions } from "../components/monitoring/board/FindingActions";
import { useTenantMembers } from "../hooks/useTenantMembers";
import {
  getMonitoringFinding,
  dismissIpFinding,
  isApiError,
  type IpReviewFinding,
  type MonitoringFacets,
  type MonitoringReviewOutcome,
  type MonitoringDismissReasonCode,
} from "../api";
import { parseFilters } from "../lib/monitoringFilters";
import {
  assessmentPendingLabel,
  monitoringRecommendation,
} from "../lib/monitoringRecommendation";
import {
  taskPage,
  taskCatalogOptions,
  taskDetails,
  taskStates,
  taskStateLabels,
  getTaskSearch,
  cancelTaskSearch,
  type TaskPage,
  type TaskSummary,
  type TaskQueueQuery,
  type TaskSelector,
  type TaskSearchResult,
  type SellerGroupSort,
} from "../api/taskQueue";
import "../components/monitoring/board/MonitoringResults.css";
import "../components/monitoring/MonitoringWorkspace.css";
import "./TaskQueue.css";
import "./AiSearchWorkspace.css";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const date = (at: string) => new Date(at).toLocaleDateString();
function TaskImage({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="monitoring-listing-thumbnail">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
        />
      ) : (
        <ImageOff size={18} />
      )}
    </span>
  );
}

export default function TaskQueue({
  ipId,
  conversationOwner,
  onUnavailable,
  mode="listings",
  workspaceTabs,
  historyPanel,
}: {
  ipId: string;
  conversationOwner?:string;
  onUnavailable?: () => void;
  mode?:"listings"|"ai";
  workspaceTabs?:ReactNode;
  historyPanel?:ReactNode;
}) {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    { taskId } = useParams<{ taskId?: string }>();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const searchPoll = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLElement>(null);
  const scrollToQueue = () =>
    workspaceRef.current?.scrollIntoView({ block: "start" });
  const oldFilters = useMemo(() => parseFilters(params), [params]);
  const unresolvedSuggestion = [
    "investigate",
    "needs_triage",
    "needs_review",
  ].includes(params.get("candidate_outcome") ?? "")
    ? params.get("candidate_outcome")
    : null;
  const explicitSelector = params.get("selector") as TaskSelector | null;
  const legacySelectors = [
    oldFilters.platform
      ? { selector: "website", value: oldFilters.platform }
      : null,
    oldFilters.source ? { selector: "source", value: oldFilters.source } : null,
    oldFilters.assignee
      ? { selector: "assignee", value: oldFilters.assignee }
      : null,
    oldFilters.candidate_outcome || unresolvedSuggestion
      ? {
          selector: "suggestion",
          value: oldFilters.candidate_outcome ?? unresolvedSuggestion,
        }
      : null,
  ].filter((value) => value !== null);
  const secondary = explicitSelector
    ? { selector: explicitSelector, value: params.get("value") ?? "" }
    : legacySelectors.length === 1
      ? legacySelectors[0]
      : null;
  const broad = Boolean(
    oldFilters.query ||
    oldFilters.seller ||
    oldFilters.country ||
    params.get("seller_origin")?.trim() ||
    oldFilters.match_basis ||
    oldFilters.protected_term_id ||
    oldFilters.product_group_id ||
    oldFilters.min_price_usd != null ||
    oldFilters.max_price_usd != null ||
    oldFilters.priority ||
    oldFilters.dismissal_reason ||
    legacySelectors.length > 1 ||
    params.get("include_group_history") === "true" ||
    params.get("include_catalog_history") === "true",
  );
  const query: TaskQueueQuery = {
    ip_id: ipId,
    status:
      params.get("status") === "all" ? "all" : (oldFilters.status ?? "pending"),
    sort: params.get("queue_sort") === "newest" ||
          (!params.has("queue_sort") && params.get("sort") === "found_desc")
        ? "newest"
        : "priority",
    catalog_product_id: oldFilters.catalog_product_id ?? undefined,
    ...(secondary?.value
      ? { selector: secondary.selector as TaskSelector, value: secondary.value }
      : {}),
  };
  const key = JSON.stringify(query);
  useEffect(() => {
    const nav = statusRef.current;
    if (!nav) return;
    const revealStatus = () => {
      const active = nav.querySelector<HTMLButtonElement>(
        '[aria-current="page"]',
      );
      if (!active) return;
      const bounds = nav.getBoundingClientRect();
      const button = active.getBoundingClientRect();
      if (button.left < bounds.left || button.right > bounds.right)
        nav.scrollLeft += button.left - bounds.left - 8;
    };
    const observer = new ResizeObserver(revealStatus);
    observer.observe(nav);
    revealStatus();
    return () => observer.disconnect();
  }, [query.status]);
  const [paging, setPaging] = useState<{
    key: string;
    cursors: Array<string | undefined>;
    index: number;
  }>({ key: "", cursors: [undefined], index: 0 });
  const cursors = paging.key === key ? paging.cursors : [undefined],
    pageIndex = paging.key === key ? paging.index : 0,
    cursor = cursors[pageIndex];
  const [data, setData] = useState<{ key: string; page: TaskPage } | null>(
      null,
    ),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [queueReset, setQueueReset] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set()),
    [review, setReview] = useState<IpReviewFinding[] | null>(null);
  const [selectionData, setSelectionData] = useState<{
    key: string; findings: IpReviewFinding[]; loading: boolean; error: string;
  } | null>(null);
  const [selectionRetry, setSelectionRetry] = useState(0);
  const selectionKey = JSON.stringify([...selection].sort());
  const selectedData = selectionData?.key === selectionKey ? selectionData : null;
  const selectionError = selection.size > 50 ? "Select at most 50 articles to act on at once." : selectedData?.error;
  const selectionLoading = selection.size > 0 && selection.size <= 50 && (!selectedData || selectedData.loading);
  const reviewing = review !== null;
  useEffect(() => {
    const ids = JSON.parse(selectionKey) as string[];
    if (reviewing || ids.length === 0 || ids.length > 50) return;
    const controller = new AbortController();
    setSelectionData({ key:selectionKey, findings:[], loading:true, error:"" });
    void taskDetails(ids, controller.signal)
      .then(({ findings }) => {
        if (controller.signal.aborted) return;
        const found = new Set(findings.map(finding => finding.result_id));
        if (ids.some(id => !found.has(id))) throw new Error("Some selected articles could not be loaded. Retry or deselect them.");
        setSelectionData({ key:selectionKey, findings, loading:false, error:"" });
      })
      .catch(error => {
        if (!controller.signal.aborted) setSelectionData({ key:selectionKey, findings:[], loading:false, error:errorText(error) });
      });
    return () => controller.abort();
  }, [selectionKey, selectionRetry, reviewing, revision]);
  const [detail, setDetail] = useState<{
      id: string;
      finding: IpReviewFinding;
    } | null>(null),
    [detailError, setDetailError] = useState(""),
    [dismissing, setDismissing] = useState(false);
  const [productError, setProductError] = useState("");
  const [productSearch, setProductSearch] = useState(""),
    [products, setProducts] = useState<Array<{ value: string; label: string }>>(
      [],
    ),
    [productOpen, setProductOpen] = useState(false);
  const [searchState, setSearch] = useState<TaskSearchResult | null>(null),
    [searchStarting, setSearchStarting] = useState(false),
    [searchStopping, setSearchStopping] = useState(false),
    [searchReset, setSearchReset] = useState(0),
    [searchAfter, setSearchAfter] = useState(0),
    [searchStack, setSearchStack] = useState<number[]>([]);
  const { members } = useTenantMembers();
  const urlSearchId = params.get("task_search");
  const categoryScope=JSON.stringify([ipId,query.status,query.catalog_product_id,params.get("queue_filters"),urlSearchId,params.get("top_sellers")]);
  const [categoryView,setCategoryView]=useState<{scope:string;report:CategoryRanking}|null>(null);
  const categoryReport=categoryView?.scope===categoryScope&&!searchStarting?categoryView.report:null;
  const categoryWorkspace=useRef<HTMLDivElement>(null);
  const categoryReturnFocus=useRef<HTMLElement|null>(null);
  const savedSearchSort=params.get("queue_sort")==="priority"?"priority":"newest";
  const viewGeneration=useRef(0);
  const viewMembership=JSON.stringify([ipId,params.toString()]);
  const latestViewMembership=useRef(viewMembership);latestViewMembership.current=viewMembership;
  const search =
    searchState && (!searchState.id || searchState.id === urlSearchId) && (!searchState.id||(searchState.sort??"newest")===savedSearchSort)
      ? searchState
      : null;
  const page = data?.key === key ? data.page : null;
  const waitingForPage =
    !search &&
    (loading || (Boolean(urlSearchId) && !error) || (!page && !error));
  const rows = searchStarting ? [] : urlSearchId
    ? (search?.rows ?? [])
    : (search?.rows ?? page?.rows ?? []);
  const groupBy = parseMonitoringGroupBy(params.get("group_by"));
  const sellerSort = (["exposure", "articles", "priority", "newest", "total_price"].includes(params.get("group_sort") ?? "")
    ? params.get("group_sort") : "exposure") as SellerGroupSort;
  const topSellers = /^([1-9]\d?|100)$/.test(params.get("top_sellers") ?? "") ? Number(params.get("top_sellers")) : null;
  const sellerQuery = { ...query, group_sort: sellerSort, ...(topSellers ? { ranking_limit:topSellers } : {}), ...(urlSearchId ? { search_id:urlSearchId } : {}) };
  const productGroups = useTaskProductIdentities(
    groupBy === "product",
    ipId,
    rows,
  );
  const groups = groupMonitoringFindings(productGroups.rows, groupBy);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);
  const activeGroup = !waitingForPage
    ? groups.find((group) => group.key === activeGroupKey)
    : undefined;
  const closeGroup = useCallback(() => setActiveGroupKey(null), []);
  async function applyQueueView(view:QueueView,signal:AbortSignal):Promise<boolean> {
    const snapshot=viewMembership,generation=++viewGeneration.current;
    const current=()=>!signal.aborted&&generation===viewGeneration.current&&snapshot===latestViewMembership.current;
    try{
      const result=urlSearchId?await getTaskSearch(urlSearchId,0,signal,view.sort):null;
      if(!current())return false;
      setError("");setSearch(result);setSearchAfter(0);setSearchStack([]);setSelection(new Set());closeGroup();
      setCategoryView(null);
      setParams(queueViewParams(params,view));return true;
    }catch(error){if(current())setError(errorText(error));return false;}
  }
  function change(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("task_search");
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setSearch(null);
    setSearchStarting(false);
    setReview(null);
    setSelection(new Set());
    setParams(next);
  }
  function returnToQueue() {
    const next = new URLSearchParams(params);
    next.delete("task_search");
    next.delete("queue_filters");
    next.delete("top_sellers");
    setSearch(null);
    setSearchStarting(false);
    setSearchReset((value) => value + 1);
    setSelection(new Set());
    setReview(null);
    setParams(next);
    scrollToQueue();
  }
  function refresh() {
    setPaging({ key, cursors: [undefined], index: 0 });
    setSelection(new Set());
    setRevision((value) => value + 1);
    setQueueReset((value) => value + 1);
    scrollToQueue();
  }
  function refreshAfterAction(options?: FindingUpdateOptions) {
    if (options?.completed && taskId) setSelection((previous) => {
      const next = new Set(previous);
      next.delete(taskId);
      return next;
    });
    setRevision((value) => value + 1);
  }
  async function stopSearch() {
    if (!search?.id || searchStopping) return;
    const id = search.id;
    searchPoll.current?.abort();
    setSearchStopping(true);
    try {
      await cancelTaskSearch(id);
      const result = await getTaskSearch(id, searchAfter,undefined,savedSearchSort);
      setSearch((current) => current?.id === id ? result : current);
    } catch (error) {
      setError(errorText(error));
      setRevision((value) => value + 1);
    } finally {
      setSearchStopping(false);
    }
  }
  function open(id: string | null) {
    if (id) closeGroup();
    navigate({
      pathname: id
        ? "/monitoring/tasks/" + encodeURIComponent(id)
        : "/monitoring/tasks",
      search: "?" + params.toString(),
    });
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void taskPage({ ...JSON.parse(key), cursor }, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setData({ key, page });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(errorText(error));
          if (isApiError(error, 503)) onUnavailable?.();
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [key, cursor, revision, onUnavailable]);
  useEffect(() => {
    if (!urlSearchId || searchState?.id === urlSearchId&&(searchState.sort??"newest")===savedSearchSort) return;
    const controller = new AbortController();
    setError("");
    void getTaskSearch(urlSearchId, 0, controller.signal,savedSearchSort)
      .then((result) => {
        if (!controller.signal.aborted) {
          setSearch(result);
          setSearchAfter(0);
          setSearchStack([]);
          setSelection(new Set());
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error));
      });
    return () => controller.abort();
  }, [urlSearchId, searchState?.id,searchState?.sort,savedSearchSort, revision]);
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setDetailError("");
    void getMonitoringFinding(taskId)
      .then(({ finding }) => {
        if (!cancelled) setDetail({ id: taskId, finding });
      })
      .catch((error) => {
        if (!cancelled) setDetailError(errorText(error));
      });
    return () => {
      cancelled = true;
    };
  }, [taskId, revision]);
  useEffect(() => {
    if (!productOpen) return;
    const controller = new AbortController(),
      timer = window.setTimeout(() => {
        void taskCatalogOptions(
          { ip_id: ipId, kind: "product", q: productSearch },
          controller.signal,
        )
          .then((result) => {
            if (!controller.signal.aborted) setProducts(result.options);
          })
          .catch((error) => {
            if (!controller.signal.aborted) setProductError(errorText(error));
          });
      }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ipId, productOpen, productSearch]);
  useEffect(() => {
    if (!search?.id) return;
    const id = search.id,
      controller = new AbortController();
    searchPoll.current = controller;
    let timer: number | undefined;
    async function poll() {
      try {
        const result = await getTaskSearch(id!, searchAfter, controller.signal,savedSearchSort);
        if (controller.signal.aborted) return;
        setSearch(result);
        if (result.state === "pending" || result.state === "running")
          timer = window.setTimeout(poll, 1500);
      } catch (error) {
        if (!controller.signal.aborted) setError(errorText(error));
      }
    }
    void poll();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search?.id, searchAfter,savedSearchSort, revision]);
  function reviewSelected() {
    if (!selectedData || selectionLoading || selectionError) return;
    setReview(selectedData.findings);
  }
  async function dismiss(
    reason: MonitoringReviewOutcome,
    reasonCode?: MonitoringDismissReasonCode,
  ) {
    if (!detail) return;
    setDismissing(true);
    try {
      await dismissIpFinding(detail.finding.ip_id ?? ipId, detail.id, {
        reason,
        reason_code: reasonCode,
      });
      open(null);
      refreshAfterAction({ completed:true });
    } catch (error) {
      setDetailError(errorText(error));
    } finally {
      setDismissing(false);
    }
  }
  const active = detail && detail.id === taskId ? detail.finding : null;
  const reviewFacets = {
    total: review?.length ?? 0,
    statuses: Object.fromEntries(
      taskStates.map((state) => [
        state,
        review?.filter(
          (finding) => (finding.review_status ?? "pending") === state,
        ).length ?? 0,
      ]),
    ),
    ips: [],
    platforms: [],
    sources: [],
    countries: [],
    product_groups: [],
    sellers: [],
    priorities: { high: 0, med: 0, low: 0 },
    candidate_outcomes: {
      none: 0,
      takedown: 0,
      false_positive: 0,
      do_not_pursue: 0,
      second_hand: 0,
    },
    dismissal_reasons: {},
  } as MonitoringFacets;
  const reviewFilters = {
    ...oldFilters,
    ip_id: ipId,
    status: "all" as const,
    query: null,
    catalog_product_id: null,
    product_group_id: null,
  };
  const outdatedSort =
    oldFilters.sort !== "score_desc" &&
    oldFilters.sort !== "found_desc" &&
    !params.has("queue_sort");
  const renderTaskRow = (row: TaskSummary) => {
    const recommendation = monitoringRecommendation(row);
    return (
      <tr
        key={row.task_id}
        data-task-id={row.task_id}
        tabIndex={waitingForPage ? -1 : 0}
        className={`monitoring-listing-row${taskId === row.result_id ? " is-active" : ""}${selection.has(row.result_id) ? " is-selected" : ""}${row.state === "dismissed" ? " is-dismissed" : ""}`}
        aria-label={`Open task: ${row.listing_title ?? row.domain}`}
        onClick={() => {
          if (!waitingForPage) open(row.result_id);
        }}
        onKeyDown={(event) => {
          if (
            !waitingForPage &&
            event.target === event.currentTarget &&
            ["Enter", " "].includes(event.key)
          ) {
            event.preventDefault();
            open(row.result_id);
          }
        }}
      >
        <td
          className="monitoring-listing-checkbox"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            disabled={waitingForPage}
            aria-label={`Select ${row.listing_title ?? row.domain}`}
            checked={selection.has(row.result_id)}
            onChange={() =>
              setSelection((current) => {
                const next = new Set(current);
                if (next.has(row.result_id)) next.delete(row.result_id);
                else next.add(row.result_id);
                return next;
              })
            }
          />
        </td>
        <td className="monitoring-listing-cell">
          <div className="monitoring-listing-main">
            <TaskImage key={row.image_url} url={row.image_url} />
            <div className="monitoring-listing-copy">
              <span className="monitoring-listing-title">
                {row.listing_title ?? row.page_url}
              </span>
              <div className="monitoring-listing-meta">
                {row.seller_name ?? "Unknown seller"} · {row.domain} ·{" "}
                <time dateTime={row.found_at}>{date(row.found_at)}</time>
                {query.status === "all" && ` · ${taskStateLabels[row.state]}`}
              </div>
              {!recommendation.label && (
                <div
                  className="monitoring-assessment-pending"
                  title={recommendation.reason}
                >
                  {assessmentPendingLabel}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="monitoring-listing-price">
          {row.price_value_usd == null
            ? "Unavailable"
            : usd.format(row.price_value_usd)}
        </td>
        <td
          className="monitoring-listing-assessment"
          title={recommendation.label ? recommendation.reason : undefined}
          aria-label={
            recommendation.label ? undefined : "No suggested action yet"
          }
        >
          {recommendation.label}
        </td>
      </tr>
    );
  };
  return (
    <>
      <MonitoringToolbar
        className="task-queue-toolbar"
        title={mode==="ai"?"AI search":"Tasks"}
        children={workspaceTabs??null}
        showStatus={mode!=="ai"}
        onRefresh={refresh}
        refreshing={waitingForPage}
        meta={mode==="ai"?undefined:
          <span role="status">
            {page?.as_of
              ? `Updated ${new Date(page.as_of).toLocaleTimeString()}`
              : "Loading tasks…"}
          </span>
        }
      />
      <div className={mode==="ai"?"task-ai-layout":"task-listings-layout"}>
      {historyPanel}
      <div
        ref={workspaceRef}
        className={`monitoring-results-workspace monitoring-data-workspace task-queue-workspace${mode==="ai"?" is-ai":""}${mode==="ai"&&!search&&!urlSearchId&&!searchStarting?" is-empty":""}`}
      >
        {mode==="listings"&&<>
        {error && (
          <p role="alert" className="task-queue-notice text-red-700">
            {error} <button onClick={refresh}>Retry</button>
          </p>
        )}
        {page?.updating && (
          <p className="task-queue-notice" role="status">
            Tasks are updating. Counts and rows may lag recent changes.
          </p>
        )}
        {(broad || outdatedSort) && !search && (
          <p className="task-queue-notice">
            Search to apply all filters from this link within the selected date
            range.
          </p>
        )}
        <div className="task-queue-status-bar">
          <span className="task-queue-status-label">Status</span>
          <nav
            ref={statusRef}
            className="task-queue-statuses"
            aria-label="Task status"
          >
            {(
              [
                "pending",
                "review",
                "takedown_pending",
                "takedown_sent",
                "enforced",
                "preparing",
                "dismissed",
                "all",
              ] as const
            ).map((state) => (
              <button
                key={state}
                type="button"
                aria-current={query.status === state ? "page" : undefined}
                onClick={() => change({ status: state })}
              >
                {state === "all" ? "All open" : taskStateLabels[state]}{" "}
                <span>
                  {page
                    ? (state === "all"
                        ? taskStates
                            .filter((s) => s !== "dismissed")
                            .reduce((sum, s) => sum + page.counts[s], 0)
                        : page.counts[state]
                      ).toLocaleString()
                    : ""}
                </span>
              </button>
            ))}
          </nav>
        </div>
        </>}
        <div className={mode==="ai"?"task-ai-conversation":undefined}>
        <TaskSearch
          key={searchReset}
          mode={mode}
          conversationOwner={conversationOwner}
          ipId={ipId}
          product={query.catalog_product_id}
          params={params}
          members={members}
          status={query.status}
          ranking={topSellers&&sellerSort!=="total_price" ? {limit:topSellers} : null}
          onShowCategoryReport={report=>{
            if(report.state!=="completed"||report.search_id!==urlSearchId)return;
            categoryReturnFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
            setCategoryView({scope:categoryScope,report});setSelection(new Set());setReview(null);closeGroup();
            if(mode!=="ai")requestAnimationFrame(()=>{categoryWorkspace.current?.focus();categoryWorkspace.current?.scrollIntoView({block:"start"});});
          }}
          controls={
            <div className="task-search-scope">
              <button
                type="button"
                onClick={() => setProductOpen((value) => !value)}
                aria-expanded={productOpen}
              >
                {query.catalog_product_id
                  ? (products.find(
                      (product) => product.value === query.catalog_product_id,
                    )?.label ?? "Selected product")
                  : "All products"}
              </button>
              {query.catalog_product_id && (
                <button
                  type="button"
                  onClick={() =>
                    change({
                      catalog_product_id: null,
                      product_group_id: null,
                    })
                  }
                >
                  Clear product
                </button>
              )}
              {topSellers && <span className="task-search-chip"><span>Top {topSellers} sellers</span><button type="button" aria-label="Remove top seller limit" onClick={()=>{const next=new URLSearchParams(params);next.delete("top_sellers");setParams(next);}}>×</button></span>}
              {!categoryReport&&<label>
                Group by
                <select
                  aria-label="Group by"
                  value={groupBy}
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    next.delete("top_sellers");
                    if (event.target.value === "none") next.delete("group_by");
                    else next.set("group_by", event.target.value);
                    closeGroup();
                    setParams(next);
                  }}
                >
                  <option value="none">None</option>
                  <option value="seller">Seller</option>
                  <option value="product">Product</option>
                </select>
              </label>}
              {!categoryReport&&(groupBy === "seller" || (!search && !urlSearchId) || search?.queue_view_policy_version===queueViewPolicy) && (
                <label>
                  Sort{" "}
                  <select
                    aria-label="Sort tasks"
                    title={groupBy === "seller" ? "Rank sellers across all matching tasks before pagination. Exposure uses USD price × quantity." : "Takedown recommendations first, then seller takedown history and inventory. Newer listings break ties."}
                    value={groupBy === "seller" ? sellerSort : urlSearchId?savedSearchSort:query.sort}
                    onChange={(event) => {
                      if (groupBy !== "seller") { void applyQueueView({...queueViewFromParams(params),sort:event.target.value as QueueView["sort"]},new AbortController().signal); return; }
                      const next = new URLSearchParams(params);
                      next.delete("top_sellers");
                      next.set("group_sort",event.target.value);
                      if (["priority","newest"].includes(event.target.value)) next.set("queue_sort",event.target.value);
                      setSelection(new Set());
                      setParams(next);
                    }}
                  >
                    {groupBy === "seller" && <><option value="exposure">Seller exposure: highest first</option><option value="articles">Seller articles: most first</option>{sellerSort==="total_price"&&<option value="total_price">Seller total listing price: highest first</option>}</>}
                    <option value="priority">Highest priority</option>
                    <option value="newest">Newest first detected</option>
                  </select>
                </label>
              )}
            </div>
          }
          onViewChange={applyQueueView}
          onStart={(result, applied) => {
            viewGeneration.current++;
            setSearch(result);
            setSearchStarting(false);
            setParams(queueSearchParams(params, applied, result.id));
            setSearchAfter(0);
            setSearchStack([]);
            setSelection(new Set());
          }}
          onError={setError}
          onSearching={(starting) => {
            setSearchStarting(starting);
            if (starting) {
              setSelection(new Set());
              setReview(null);
            }
          }}
        />
        </div>
        <div className={mode==="ai"?"task-ai-results":undefined} hidden={mode==="ai"&&!search&&!urlSearchId&&!searchStarting}>
        {mode==="ai"&&<header className="task-ai-results-header"><h2>Results</h2>{(search||urlSearchId)&&<span className="task-ai-result-count">{categoryReport?`${categoryReport.total_categories} categories`:search?.state==="completed"?`${search.matched.toLocaleString()} matches`:"Search in progress"}</span>}</header>}
        {mode==="ai"&&error&&<p className="task-queue-notice" role="alert">{error} <button type="button" onClick={refresh}>Retry</button></p>}
        {productOpen && (
          <div className="task-queue-product-picker">
            <input
              aria-label="Find a product"
              placeholder="Find a product…"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
            />
            {products.map((product) => (
              <button
                key={product.value}
                onClick={() => {
                  change({
                    catalog_product_id: product.value,
                    product_group_id: null,
                  });
                  setProductOpen(false);
                }}
              >
                {product.label}
              </button>
            ))}
          </div>
        )}
        {productError && (
          <p role="alert" className="task-queue-notice">
            {productError}
          </p>
        )}
        {urlSearchId && !search && (
          <div className="task-queue-notice" role="status">
            <span>
              {error ? "Saved search unavailable." : "Loading saved search…"}
            </span>
            <button onClick={returnToQueue}>Return to queue</button>
          </div>
        )}
        {!review && !categoryReport && (search || searchStarting) && (
          <TaskSearchStatus
            search={search}
            starting={searchStarting}
            queueTotal={page ? query.status === "all"
              ? taskStates.filter((state) => state !== "dismissed").reduce((sum, state) => sum + page.counts[state], 0)
              : page.counts[query.status] : undefined}
            queueLabel={query.status === "all" ? "All open" : taskStateLabels[query.status]}
            stopping={searchStopping}
            onStop={() => void stopSearch()}
            returnLabel={mode==="ai"?"Open in Listings":undefined}
            onReturn={mode==="ai"?()=>{const next=new URLSearchParams(params);next.delete("workspace");next.delete("chat");navigate({pathname:"/monitoring/tasks",search:"?"+next});}:returnToQueue}
          />
        )}
        {review ? (
          <>
            <div className="task-queue-controls">
              <span>
                Reviewing {review.length} selected{" "}
                {review.length === 1 ? "task" : "tasks"} with current evidence
              </span>
              <button
                onClick={() => {
                  setReview(null);
                  refresh();
                }}
              >
                Return to queue
              </button>
            </div>
            <MonitoringBoard
              reviewOnly
              selectionControls={{ ids:selection, onChange:setSelection }}
              findings={review}
              facets={reviewFacets}
              filters={reviewFilters}
              onFiltersChange={() => {}}
              nextCursor={null}
              loadingMore={false}
              onLoadMore={() => {}}
              onRefresh={() =>
                void taskDetails(review.map((finding) => finding.result_id))
                  .then((result) => setReview(result.findings))
                  .catch((error) => setError(errorText(error)))
              }
              showIpColumn
              showIpFilter={false}
              showSearch={false}
              activeFindingId={taskId}
              onActiveFindingChange={open}
            />
          </>
        ) : mode==="ai"&&!search&&!urlSearchId&&!categoryReport ? (
          <div className="task-ai-results-empty"><div><ListFilter size={22} aria-hidden="true"/></div><h3>A place for your findings</h3><p>Listings, seller comparisons, and category breakdowns appear here as you explore.</p><span>Your listing filters stay in the Listings tab.</span></div>
        ) : categoryReport ? (
          <div ref={categoryWorkspace} tabIndex={-1} className="task-category-workspace-anchor">
            <CategoryResultsWorkspace key={`${categoryScope}:${categoryReport.as_of}`} initialReport={categoryReport} revision={revision} onClose={()=>{setCategoryView(null);requestAnimationFrame(()=>{
              const trigger=categoryReturnFocus.current;
              if(trigger?.isConnected){const target=trigger.closest("[hidden]")?trigger.closest(".task-search-chat")?.querySelector<HTMLButtonElement>(".task-search-chat-toggle"):trigger;target?.focus();}
            });}} onSelectionReset={()=>setSelection(new Set())} renderRow={renderTaskRow}/>
          </div>
        ) : groupBy === "seller" && !searchStarting && (!search || Boolean(search.id)) ? (
          <>
            <SellerGroupedQueue topLimit={topSellers} requireComplete={Boolean(topSellers)} key={`${JSON.stringify(sellerQuery)}:${queueReset}`}
              query={sellerQuery} revision={`${revision}:${search?.matched}:${search?.state}`} selection={selection} renderRow={renderTaskRow} activeFindingId={taskId}
              onUngroup={() => { const next = new URLSearchParams(params); next.delete("group_by"); next.delete("top_sellers"); setParams(next); }}
              onOpenGroup={() => { closeGroup(); if (taskId) open(null); }}
              onSelect={(ids, selected) => setSelection(previous => { const next = new Set(previous); for (const id of ids) { if (selected) next.add(id); else next.delete(id); } return next; })} />
          </>
        ) : (
          <>
            <div
              className="monitoring-results-queue"
              aria-busy={waitingForPage || searchStarting}
            >
              {(!search && !searchStarting || selection.size > 0) && (
              <div className="monitoring-results-summary">
                {!search && !searchStarting && <span>
                  {!search && !urlSearchId ? "Current queue · " : ""}
                  {waitingForPage
                    ? "Loading…"
                    : error && !page
                      ? "Tasks unavailable"
                      : `${rows.length} ${rows.length === 1 ? "task" : "tasks"} on this page`}
                  {secondary
                    ? " · Status counts ignore this additional filter"
                    : ""}
                </span>}
              </div>
              )}
              {groupBy !== "none" && rows.length > 0 && (
                <div className="monitoring-grouping-notice" role="status">
                  {productGroups.loading ? (
                    "Loading product groups…"
                  ) : productGroups.error ? (
                    <>
                      {productGroups.error}{" "}
                      <button
                        className="task-queue-button"
                        onClick={productGroups.retry}
                      >
                        Retry grouping
                      </button>
                    </>
                  ) : groupBy === "product" &&
                    !hasProductGrouping(productGroups.rows) ? (
                    <>
                      The API hasn’t returned product identities for this page.{" "}
                      <button
                        className="task-queue-button"
                        onClick={productGroups.retry}
                      >
                        Retry grouping
                      </button>{" "}
                    </>
                  ) : (
                    `${groups.length} product ${groups.length === 1 ? "group" : "groups"} on this page. Counts cover these ${rows.length} tasks.`
                  )}
                </div>
              )}
              <table
                className="monitoring-result-list"
                aria-label="Monitoring tasks"
              >
                <colgroup>
                  <col className="monitoring-checkbox-column" />
                  <col />
                  <col className="monitoring-price-column" />
                  <col className="monitoring-assessment-column" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className="monitoring-listing-checkbox">
                      <input
                        aria-label="Select this page"
                        type="checkbox"
                        disabled={waitingForPage || rows.length === 0}
                        checked={
                          rows.length > 0 &&
                          rows.every((row) => selection.has(row.result_id))
                        }
                        ref={(element) => {
                          if (element)
                            element.indeterminate =
                              rows.some((row) =>
                                selection.has(row.result_id),
                              ) &&
                              !rows.every((row) =>
                                selection.has(row.result_id),
                              );
                        }}
                        onChange={(event) =>
                          setSelection(
                            event.target.checked
                              ? new Set(rows.map((row) => row.result_id))
                              : new Set(),
                          )
                        }
                      />
                    </th>
                    <th scope="col" className="monitoring-listing-heading">
                      Listing / seller / first detected
                    </th>
                    <th scope="col" className="monitoring-price-heading">
                      Price (USD)
                    </th>
                    <th scope="col" className="monitoring-assessment-heading">
                      Suggested action
                    </th>
                  </tr>
                </thead>
                {groups.length > 0 ? (
                  <TaskGroupRows
                    groups={groups}
                    selection={selection}
                    disabled={waitingForPage}
                    onSelect={(ids, selected) =>
                      setSelection((previous) => {
                        const next = new Set(previous);
                        for (const id of ids) {
                          if (selected) next.add(id);
                          else next.delete(id);
                        }
                        return next;
                      })
                    }
                    onOpen={(group) => {
                      if (taskId) open(null);
                      setActiveGroupKey(group.key);
                    }}
                    renderRow={renderTaskRow}
                  />
                ) : (
                  <tbody>{rows.map(renderTaskRow)}</tbody>
                )}
              </table>
              {!waitingForPage && !error && !rows.length && (
                <div className="monitoring-results-empty">
                  <p>
                    {searchStarting || search && ["pending", "running"].includes(search.state)
                      ? "Matching tasks will appear here as the search continues."
                      : search?.state === "limited"
                        ? "Search stopped at its work limit. Narrow the date range to continue."
                        : search?.state === "cancelled" || search?.state === "failed"
                          ? "Search incomplete. Search again to check the remaining tasks."
                          : search?.state === "completed"
                            ? "No matches found. Try expanding the date range or changing a filter."
                        : "No tasks in this view."}
                  </p>
                </div>
              )}
              <div className="monitoring-results-pagination">
                {search ? (
                  <>
                    <button
                      disabled={!searchStack.length}
                      onClick={() => {
                        setSearchAfter(searchStack.at(-1)!);
                        setSearchStack((values) => values.slice(0, -1));
                        setSelection(new Set());
                        scrollToQueue();
                      }}
                    >
                      Previous
                    </button>
                    <button
                      disabled={!search.next}
                      onClick={() => {
                        setSearchStack((values) => [...values, searchAfter]);
                        setSearchAfter(search.next!);
                        setSelection(new Set());
                        scrollToQueue();
                      }}
                    >
                      Next
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={waitingForPage || pageIndex === 0}
                      onClick={() => {
                        setPaging({ key, cursors, index: pageIndex - 1 });
                        setSelection(new Set());
                        scrollToQueue();
                      }}
                    >
                      Previous
                    </button>
                    <span>Page {pageIndex + 1}</span>
                    <button
                      disabled={waitingForPage || !page?.next_cursor}
                      onClick={() => {
                        setPaging({
                          key,
                          cursors: [
                            ...cursors.slice(0, pageIndex + 1),
                            page!.next_cursor!,
                          ],
                          index: pageIndex + 1,
                        });
                        setSelection(new Set());
                        scrollToQueue();
                      }}
                    >
                      Next
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {!review && <>
          {selection.size > 0 && selectionError && <p className="task-queue-notice" role="alert">
            {selectionError} {selection.size <= 50 && <button onClick={() => setSelectionRetry(value => value + 1)}>Retry selected articles</button>}
          </p>}
          <MonitoringBoard
            selectionOnly
            findings={selectedData?.findings ?? []}
            selectionControls={{ ids:selection, onChange:setSelection, loading:selectionLoading, disabled:Boolean(selectionError), onReview:reviewSelected }}
            facets={reviewFacets}
            filters={reviewFilters}
            onFiltersChange={() => {}}
            nextCursor={null}
            loadingMore={false}
            onLoadMore={() => {}}
            onRefresh={() => setRevision(value => value + 1)}
            ipId={ipId}
            showIpColumn
          />
        </>}
        {activeGroup && !review && !categoryReport && groupBy !== "seller" && (
          <MonitoringGroupDetails
            group={activeGroup}
            scope="page"
            onClose={closeGroup}
          />
        )}
        {taskId && !review && (
          <>
            {!active && detailError ? (
              <p role="alert" className="task-queue-notice">
                {detailError}{" "}
                <button onClick={() => open(null)}>Close task</button>
              </p>
            ) : !active ? (
              <p role="status" className="task-queue-notice">
                Loading task evidence…
              </p>
            ) : (
              <FindingInspector
                f={active}
                ipId={active.ip_id ?? ipId}
                showIp
                isDismissed={Boolean(active.dismissed_at)}
                isDismissing={dismissing}
                onClose={() => open(null)}
                onDismiss={(reason, code) => void dismiss(reason, code)}
                onActionComplete={() => {
                  open(null);
                }}
                // FindingActions also calls onUpdated after these notifications.
                // Revalidate once, without resetting the reviewer's position.
                onNeedsReview={() => undefined}
                onTakedownSent={() => undefined}
                onEnforced={() => undefined}
                onLicensed={() => undefined}
                onUpdated={refreshAfterAction}
                onAddRelatedToBatch={(findings) => {
                  if (findings.length > 50) {
                    setError(
                      "Select at most 50 related tasks to review at once.",
                    );
                    return;
                  }
                  setReview(findings);
                  open(null);
                }}
                error={detailError}
              />
            )}
          </>
        )}
      </div>
      </div>
      </div>
    </>
  );
}
