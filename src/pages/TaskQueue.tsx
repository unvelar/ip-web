import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ImageOff } from "lucide-react";
import MonitoringToolbar from "../components/MonitoringToolbar";
import { MonitoringBoard } from "../components/monitoring/MonitoringBoard";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
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
  taskPage,
  taskOptions,
  taskCatalogOptions,
  taskDetails,
  taskStates,
  taskStateLabels,
  startTaskSearch,
  getTaskSearch,
  cancelTaskSearch,
  type TaskPage,
  type TaskQueueQuery,
  type TaskSelector,
  type TaskSearchResult,
} from "../api/taskQueue";
import "../components/monitoring/board/MonitoringResults.css";
import "../components/monitoring/MonitoringWorkspace.css";
import "./TaskQueue.css";

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
  onUnavailable,
}: {
  ipId: string;
  onUnavailable?: () => void;
}) {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate(),
    { taskId } = useParams<{ taskId?: string }>();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const scrollToQueue = () =>
    workspaceRef.current?.scrollIntoView({ block: "start" });
  const oldFilters = useMemo(() => parseFilters(params), [params]);
  const explicitSelector = params.get("selector") as TaskSelector | null;
  const legacySelectors = [
    oldFilters.platform
      ? { selector: "website", value: oldFilters.platform }
      : null,
    oldFilters.source ? { selector: "source", value: oldFilters.source } : null,
    oldFilters.assignee
      ? { selector: "assignee", value: oldFilters.assignee }
      : null,
    oldFilters.candidate_outcome
      ? { selector: "suggestion", value: oldFilters.candidate_outcome }
      : null,
  ].filter((value) => value !== null);
  const secondary = explicitSelector
    ? { selector: explicitSelector, value: params.get("value") ?? "" }
    : legacySelectors.length === 1
      ? legacySelectors[0]
      : null;
  const selector = (secondary?.selector ?? null) as TaskSelector | null;
  const broad = Boolean(
    oldFilters.query ||
    oldFilters.seller ||
    oldFilters.country ||
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
    sort: secondary
      ? "newest"
      : params.get("queue_sort") === "priority"
        ? "priority"
        : "newest",
    catalog_product_id: oldFilters.catalog_product_id ?? undefined,
    ...(secondary?.value
      ? { selector: secondary.selector as TaskSelector, value: secondary.value }
      : {}),
  };
  const key = JSON.stringify(query);
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
    [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set()),
    [review, setReview] = useState<IpReviewFinding[] | null>(null),
    [reviewLoading, setReviewLoading] = useState(false);
  const [detail, setDetail] = useState<{
      id: string;
      finding: IpReviewFinding;
    } | null>(null),
    [detailError, setDetailError] = useState(""),
    [dismissing, setDismissing] = useState(false);
  const [selectorSearch, setSelectorSearch] = useState(""),
    [options, setOptions] = useState<Array<{ value: string; label: string }>>(
      [],
    ),
    [optionError, setOptionError] = useState("");
  const [productSearch, setProductSearch] = useState(""),
    [products, setProducts] = useState<Array<{ value: string; label: string }>>(
      [],
    ),
    [productOpen, setProductOpen] = useState(false);
  const [advanced, setAdvanced] = useState(broad),
    [searchState, setSearch] = useState<TaskSearchResult | null>(null),
    [searchAfter, setSearchAfter] = useState(0),
    [searchStack, setSearchStack] = useState<number[]>([]);
  const { members } = useTenantMembers();
  const urlSearchId = params.get("task_search");
  const search =
    searchState && (!searchState.id || searchState.id === urlSearchId)
      ? searchState
      : null;
  const page = data?.key === key ? data.page : null;
  const waitingForPage =
    !search &&
    (loading || (Boolean(urlSearchId) && !error) || (!page && !error));
  const rows = urlSearchId
    ? (search?.rows ?? [])
    : (search?.rows ?? page?.rows ?? []);
  function change(values: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("task_search");
    for (const [name, value] of Object.entries(values)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    setSearch(null);
    setReview(null);
    setSelection(new Set());
    setParams(next);
  }
  function returnToQueue() {
    const next = new URLSearchParams(params);
    next.delete("task_search");
    setSearch(null);
    setSelection(new Set());
    setReview(null);
    setParams(next);
    scrollToQueue();
  }
  function refresh() {
    setPaging({ key, cursors: [undefined], index: 0 });
    setSelection(new Set());
    setRevision((value) => value + 1);
    scrollToQueue();
  }
  function selectValue(value: string) {
    change({
      selector,
      value: value || null,
      platform: null,
      source: null,
      seller: null,
      assignee: null,
      candidate_outcome: null,
    });
  }
  function open(id: string | null) {
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
    if (!urlSearchId || searchState?.id === urlSearchId) return;
    const controller = new AbortController();
    setError("");
    void getTaskSearch(urlSearchId, 0, controller.signal)
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
  }, [urlSearchId, searchState?.id, revision]);
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
    if (!selector || !["website", "source", "seller"].includes(selector))
      return;
    const controller = new AbortController(),
      timer = window.setTimeout(() => {
        setOptionError("");
        void taskOptions(
          {
            ip_id: ipId,
            catalog_product_id: query.catalog_product_id,
            kind: selector as "website" | "source" | "seller",
            q: selectorSearch,
          },
          controller.signal,
        )
          .then((result) => setOptions(result.options))
          .catch((error) => {
            if (!controller.signal.aborted) setOptionError(errorText(error));
          });
      }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [ipId, selector, selectorSearch, query.catalog_product_id]);
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
            if (!controller.signal.aborted) setOptionError(errorText(error));
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
    let timer: number | undefined;
    async function poll() {
      try {
        const result = await getTaskSearch(id!, searchAfter, controller.signal);
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
  }, [search?.id, searchAfter, revision]);
  async function reviewSelected() {
    setReviewLoading(true);
    setError("");
    try {
      const result = await taskDetails([...selection]);
      setReview(result.findings);
    } catch (error) {
      setError(errorText(error));
    } finally {
      setReviewLoading(false);
    }
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
      refresh();
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
  return (
    <>
      <MonitoringToolbar
        className="task-queue-toolbar"
        title="Tasks"
        onRefresh={refresh}
        refreshing={waitingForPage}
        meta={
          <span role="status">
            {page?.as_of
              ? `Updated ${new Date(page.as_of).toLocaleTimeString()}`
              : "Loading tasks…"}
          </span>
        }
      >
        <button
          className="task-queue-button"
          onClick={() => setAdvanced((value) => !value)}
          aria-expanded={advanced}
        >
          {search && !advanced ? "New advanced search" : "Advanced search"}
        </button>
      </MonitoringToolbar>
      <div
        ref={workspaceRef}
        className="monitoring-results-workspace monitoring-data-workspace task-queue-workspace"
      >
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
            This link uses advanced filters or an older sort. The queue below
            shows the selected workflow, product and one filter. Use Advanced
            search to apply the other filters within a date range.
          </p>
        )}
        {advanced && (
          <AdvancedTaskSearch
            ipId={ipId}
            product={query.catalog_product_id}
            params={params}
            onStart={(result) => {
              setSearch(result);
              const next = new URLSearchParams(params);
              if (result.id) next.set("task_search", result.id);
              else next.delete("task_search");
              setParams(next);
              setSearchAfter(0);
              setSearchStack([]);
              setSelection(new Set());
            }}
            onError={setError}
          />
        )}
        {urlSearchId && !search && (
          <div className="task-queue-notice" role="status">
            <span>
              {error ? "Saved search unavailable." : "Loading saved search…"}
            </span>
            <button onClick={returnToQueue}>Return to queue</button>
          </div>
        )}
        {search && (
          <div className="task-queue-notice" role="status">
            <span>
              Search {search.state}. {Number(search.scanned).toLocaleString()}{" "}
              candidates checked, {search.matched.toLocaleString()} matches so
              far. {search.error}
            </span>
            {(search.state === "pending" || search.state === "running") &&
              search.id && (
                <button
                  onClick={() =>
                    void cancelTaskSearch(search.id!)
                      .then(() => getTaskSearch(search.id!, searchAfter))
                      .then(setSearch)
                      .catch((error) => setError(errorText(error)))
                  }
                >
                  Cancel search
                </button>
              )}
            <button onClick={returnToQueue}>Return to queue</button>
          </div>
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
        ) : (
          <>
            {!search && !urlSearchId && (
              <>
                <nav
                  className="task-queue-workflows"
                  aria-label="Task workflow"
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
                <div className="task-queue-controls">
                  <button
                    onClick={() => setProductOpen((value) => !value)}
                    aria-expanded={productOpen}
                  >
                    {query.catalog_product_id
                      ? (products.find(
                          (product) =>
                            product.value === query.catalog_product_id,
                        )?.label ?? "Selected product")
                      : "All products"}
                  </button>
                  {query.catalog_product_id && (
                    <button
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
                  <label>
                    Filter{" "}
                    <select
                      aria-label="Queue filter"
                      value={secondary?.selector ?? ""}
                      onChange={(event) => {
                        setOptions([]);
                        setSelectorSearch("");
                        change({
                          selector: event.target.value || null,
                          value: null,
                          platform: null,
                          source: null,
                          seller: null,
                          assignee: null,
                          candidate_outcome: null,
                        });
                      }}
                    >
                      <option value="">No additional filter</option>
                      <option value="website">Website</option>
                      <option value="source">Source</option>
                      <option value="seller">Seller</option>
                      <option value="assignee">Assignee</option>
                      <option value="suggestion">Suggested action</option>
                    </select>
                  </label>
                  {selector === "assignee" ? (
                    <select
                      aria-label="Assignee"
                      value={secondary?.value ?? ""}
                      onChange={(event) => selectValue(event.target.value)}
                    >
                      <option value="">Choose an assignee</option>
                      <option value="unassigned">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.display_name ?? member.email}
                        </option>
                      ))}
                    </select>
                  ) : selector === "suggestion" ? (
                    <select
                      aria-label="Suggested action"
                      value={secondary?.value ?? ""}
                      onChange={(event) => selectValue(event.target.value)}
                    >
                      <option value="">Choose a suggestion</option>
                      {[
                        "none",
                        "takedown",
                        "false_positive",
                        "do_not_pursue",
                        "second_hand",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  ) : (
                    selector && (
                      <div className="task-queue-lookup">
                        <input
                          aria-label={`Find ${selector}`}
                          placeholder={
                            selector === "seller"
                              ? "Type at least two letters…"
                              : "Type to find…"
                          }
                          value={selectorSearch}
                          onChange={(event) =>
                            setSelectorSearch(event.target.value)
                          }
                        />
                        <select
                          aria-label={`Select ${selector}`}
                          value={secondary?.value ?? ""}
                          onChange={(event) => selectValue(event.target.value)}
                        >
                          <option value="">Choose {selector}</option>
                          {secondary?.value &&
                            !options.some(
                              (option) => option.value === secondary.value,
                            ) && (
                              <option value={secondary.value}>
                                Selected {selector}
                              </option>
                            )}
                          {options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )
                  )}
                  <label>
                    Sort{" "}
                    <select
                      aria-label="Sort tasks"
                      title={
                        secondary
                          ? "Additional filters use newest-first ordering."
                          : undefined
                      }
                      value={query.sort}
                      onChange={(event) =>
                        change({ queue_sort: event.target.value })
                      }
                    >
                      <option value="newest">Newest first detected</option>
                      {!secondary && (
                        <option value="priority">Highest priority</option>
                      )}
                    </select>
                  </label>
                </div>
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
                {optionError && (
                  <p role="alert" className="task-queue-notice">
                    {optionError}
                  </p>
                )}
              </>
            )}
            <div
              className="monitoring-results-queue"
              aria-busy={waitingForPage}
            >
              <div className="monitoring-results-summary">
                <span>
                  {waitingForPage
                    ? "Loading…"
                    : error && !page
                      ? "Tasks unavailable"
                      : `${rows.length} ${rows.length === 1 ? "task" : "tasks"} on this page`}
                  {secondary
                    ? " · Workflow counts ignore this additional filter"
                    : ""}
                </span>
                {selection.size > 0 && (
                  <button
                    className="task-queue-button"
                    disabled={reviewLoading}
                    onClick={() => void reviewSelected()}
                  >
                    {reviewLoading
                      ? "Loading evidence…"
                      : `Review ${selection.size} selected`}
                  </button>
                )}
              </div>
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
                <tbody>
                  {rows.map((row) => (
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
                              if (next.has(row.result_id))
                                next.delete(row.result_id);
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
                              {row.seller_name ?? "Unknown seller"} ·{" "}
                              {row.domain} ·{" "}
                              <time dateTime={row.found_at}>
                                {date(row.found_at)}
                              </time>
                              {query.status === "all" &&
                                ` · ${taskStateLabels[row.state]}`}
                            </div>
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
                        title={row.suggested_review_reason ?? ""}
                      >
                        {row.licensed_seller
                          ? "Authorized seller"
                          : {
                              none: "Needs review",
                              takedown: "Takedown recommended",
                              false_positive: "Different product",
                              do_not_pursue: "Do not pursue",
                              second_hand: "Second hand",
                            }[row.suggested_review_outcome ?? "none"]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!waitingForPage && !error && !rows.length && (
                <div className="monitoring-results-empty">
                  <p>
                    {search && ["pending", "running"].includes(search.state)
                      ? "Searching. Matches will appear here."
                      : search?.state === "limited"
                        ? "Search stopped at its work limit. Narrow the date range to continue."
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
        {taskId && !review && (
          <>
            {detailError ? (
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
                  refresh();
                }}
                onNeedsReview={refresh}
                onTakedownSent={refresh}
                onEnforced={refresh}
                onLicensed={refresh}
                onUpdated={refresh}
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
    </>
  );
}

function AdvancedTaskSearch({
  ipId,
  product,
  params,
  onStart,
  onError,
}: {
  ipId: string;
  product?: string;
  params: URLSearchParams;
  onStart: (result: TaskSearchResult) => void;
  onError: (error: string) => void;
}) {
  const [starting, setStarting] = useState(false);
  const { members } = useTenantMembers();
  const [dates] = useState(() => ({
    from: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
    to: new Date(Date.now() + 86400_000).toISOString().slice(0, 10),
  }));
  return (
    <form
      className="task-queue-advanced"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget),
          filters: Record<string, unknown> = {
            ip_id: ipId,
            catalog_product_id: product,
            status: data.get("status"),
            from: new Date(
              String(data.get("from")) + "T00:00:00Z",
            ).toISOString(),
            to: new Date(String(data.get("to")) + "T00:00:00Z").toISOString(),
            history: data.get("history") === "on",
          };
        for (const field of [
          "q",
          "website",
          "source",
          "seller",
          "seller_name",
          "assignee",
          "candidate_outcome",
          "evidence",
          "protected_term_id",
          "country",
          "dismissal_reason",
          "product_group_id",
        ])
          if (data.get(field)) filters[field] = data.get(field);
        for (const field of ["min_price_usd", "max_price_usd"])
          if (data.get(field)) filters[field] = Number(data.get(field));
        setStarting(true);
        onError("");
        void startTaskSearch(filters)
          .then(onStart)
          .catch((error) => onError(errorText(error)))
          .finally(() => setStarting(false));
      }}
    >
      <p>
        Search the current tasks first detected within these dates, using any
        combination of filters. Dates use UTC and the end date is excluded.
        Searches may stop early at a work limit and return up to 10,000 matches.
        A limited search is incomplete.
      </p>
      <div className="task-queue-advanced-grid">
        <label>
          First detected from
          <input type="date" name="from" required defaultValue={dates.from} />
        </label>
        <label>
          Until
          <input type="date" name="to" required defaultValue={dates.to} />
        </label>
        <label>
          Workflow
          <select name="status" defaultValue={params.get("status") ?? "all"}>
            <option value="all">All workflows</option>
            {taskStates.map((state) => (
              <option key={state} value={state}>
                {taskStateLabels[state]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Listing or seller text
          <input name="q" defaultValue={params.get("q") ?? ""} />
        </label>
        <AdvancedTaskLookup
          name="website"
          label="Website"
          kind="website"
          ipId={ipId}
          product={product}
          initial={params.get("platform") ?? undefined}
        />
        <AdvancedTaskLookup
          name="source"
          label="Source"
          kind="source"
          ipId={ipId}
          product={product}
          initial={params.get("source") ?? undefined}
        />
        <AdvancedTaskLookup
          name="seller"
          label="Seller"
          kind="seller"
          ipId={ipId}
          product={product}
        />
        {params.get("seller") && (
          <label>
            Seller name from linked view
            <input name="seller_name" defaultValue={params.get("seller")!} />
          </label>
        )}
        <label>
          Assignee
          <select name="assignee" defaultValue={params.get("assignee") ?? ""}>
            <option value="">Anyone</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.display_name ?? member.email}
              </option>
            ))}
          </select>
        </label>
        <AdvancedTaskLookup
          name="product_group_id"
          label="Visual group"
          kind="visual_group"
          ipId={ipId}
          initial={params.get("product_group_id") ?? undefined}
        />
        {params.get("protected_term_id") && (
          <label>
            Protected term
            <select
              name="protected_term_id"
              defaultValue={params.get("protected_term_id")!}
            >
              <option value="">Any protected term</option>
              <option value={params.get("protected_term_id")!}>
                Linked protected term
              </option>
            </select>
          </label>
        )}
        <label>
          Country
          <input name="country" defaultValue={params.get("country") ?? ""} />
        </label>
        <label>
          Dismissal reason
          <select
            name="dismissal_reason"
            defaultValue={params.get("dismissal_reason") ?? ""}
          >
            <option value="">Any reason</option>
            {[
              "false_positive",
              "do_not_pursue",
              "second_hand",
              "licensed",
              "allowed_product",
              "dead",
              "manual_cleared",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Minimum price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            name="min_price_usd"
            defaultValue={params.get("min_price_usd") ?? ""}
          />
        </label>
        <label>
          Maximum price (USD)
          <input
            type="number"
            min="0"
            step="0.01"
            name="max_price_usd"
            defaultValue={params.get("max_price_usd") ?? ""}
          />
        </label>
        <label>
          Evidence
          <select
            name="evidence"
            defaultValue={params.get("match_basis") ?? ""}
          >
            <option value="">Any evidence</option>
            <option value="text">Protected terms</option>
            <option value="visual">Images</option>
            <option value="text_only">Text only</option>
            <option value="both">Text and images</option>
          </select>
        </label>
        <label>
          Suggested action
          <select
            name="candidate_outcome"
            defaultValue={params.get("candidate_outcome") ?? ""}
          >
            <option value="">Any suggestion</option>
            {[
              "none",
              "takedown",
              "false_positive",
              "do_not_pursue",
              "second_hand",
            ].map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        <input type="checkbox" name="history" /> Also match text and evidence in
        past observations within these dates
      </label>
      <button className="task-queue-button" disabled={starting}>
        {starting ? "Starting search…" : "Start search"}
      </button>
    </form>
  );
}

function AdvancedTaskLookup({
  name,
  label,
  kind,
  ipId,
  product,
  initial,
}: {
  name: string;
  label: string;
  kind: "website" | "source" | "seller" | "visual_group";
  ipId: string;
  product?: string;
  initial?: string;
}) {
  const [query, setQuery] = useState(""),
    [value, setValue] = useState(initial ?? ""),
    [options, setOptions] = useState<Array<{ value: string; label: string }>>(
      [],
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(),
      timer = window.setTimeout(() => {
        setError("");
        const response =
          kind === "visual_group"
            ? taskCatalogOptions(
                { ip_id: ipId, kind: "visual_group", q: query },
                controller.signal,
              ).then((result) => result.options)
            : taskOptions(
                { ip_id: ipId, catalog_product_id: product, kind, q: query },
                controller.signal,
              ).then((result) => result.options);
        void response
          .then((options) => {
            if (!controller.signal.aborted) setOptions(options);
          })
          .catch((error) => {
            if (!controller.signal.aborted) setError(errorText(error));
          });
      }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [kind, ipId, product, query]);
  return (
    <label>
      {label}
      <input
        aria-label={`Find ${label.toLowerCase()}`}
        placeholder={
          kind === "seller" ? "Type at least two letters…" : "Type to find…"
        }
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <select
        name={name}
        aria-label={label}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        <option value="">Any {label.toLowerCase()}</option>
        {value && !options.some((option) => option.value === value) && (
          <option value={value}>
            {kind === "website" ? value : `Linked ${label.toLowerCase()}`}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span role="alert">{error}</span>}
    </label>
  );
}
