import {followTaskCategoryRanking} from "../api/categoryRanking";
import {emptyCategoryRanking,type CategoryRanking,type CategoryRankingRequest} from "../lib/categoryRanking";
import {queueViewFromParams,type QueueView} from "../lib/queueView";
import { QueueConstraintEditor } from "./QueueConstraintEditor";
import { QueueSearchBar } from "./QueueSearchBar";
import { savedTaskSearchValues, taskSearchRequest, type AppliedTaskSearch } from "../lib/taskSearchAssistant";
import {titleSearchPolicy,type SellerRanking} from "../lib/listingSearch";
import {taskListingSearchPolicy} from "../lib/taskSearchAssistant";
import { SemanticFilterPanel } from "./monitoring/board/SemanticFilterPanel";
import { readSemanticFilters, semanticFilterLabel } from "../lib/semanticFilters";
import { useProductSemanticTaxonomy } from "../hooks/useProductSemanticTaxonomy";
import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode, type SetStateAction } from "react";
import {
  Plus,
  X,
  ChevronDown,
  ArrowLeft,
  CalendarDays,
  Check,
  Search,
} from "lucide-react";
import type { TenantMember } from "../api";
import { suggestionFilterLabel } from "../lib/monitoringRecommendation";
import { useOutsideDismiss } from "../hooks/useOutsideDismiss";
import {
  taskOptions,
  taskCapability,
  taskStateLabels,
  taskCatalogOptions,
  startTaskSearch,
  cancelTaskSearch,
  type TaskSearchResult,
  type TaskQueueQuery,
} from "../api/taskQueue";

const evidenceOptions = [
  ["text", "Protected terms"],
  ["visual", "Images"],
  ["text_only", "Text only"],
  ["both", "Text and images"],
];
const actionOptions = [
  ...["investigate", "needs_triage", "needs_review"].map((value) => [
    value,
    suggestionFilterLabel(value),
  ]),
  ["takedown", "Takedown recommended"],
  ["false_positive", "Different product"],
  ["do_not_pursue", "Do not pursue"],
  ["second_hand", "Second hand"],
];
type Values = Record<string, string>;
type Filter = {
  id: string;
  label: string;
  fields: string[];
  kind: "select" | "lookup" | "text" | "price" | "history" | "semantic" | "locations" | "count";
  options?: string[][];
  lookup?: "website" | "source" | "seller" | "visual_group";
};
const filters: Filter[] = [
  {id:"q",label:"Listing or seller text",fields:["q"],kind:"text"},
  {id:"title_contains",label:"Title contains",fields:["title_contains"],kind:"text"},
  { id:"listing_countries", label:"Listing locations",fields:["listing_countries"],kind:"locations" },
  { id:"seller_listing_count",label:"Matching listings per seller",fields:["seller_listing_count"],kind:"count" },
  { id: "semantic", label: "Product details", fields: ["semantic"], kind: "semantic" },
  {
    id: "website",
    label: "Website",
    fields: ["website"],
    kind: "lookup",
    lookup: "website",
  },
  {
    id: "seller",
    label: "Seller",
    fields: ["seller", "seller_name"],
    kind: "lookup",
    lookup: "seller",
  },
  {
    id: "source",
    label: "Source",
    fields: ["source"],
    kind: "lookup",
    lookup: "source",
  },
  {
    id: "price",
    label: "Price",
    fields: ["min_price_usd", "max_price_usd", "listing_price"],
    kind: "price",
  },
  { id: "assignee", label: "Assignee", fields: ["assignee"], kind: "select" },
  { id: "country", label: "Country", fields: ["country"], kind: "text" },
  { id: "seller_origin", label: "Seller Origin", fields: ["seller_origin"], kind: "text" },
  {
    id: "evidence",
    label: "Evidence",
    fields: ["evidence"],
    kind: "select",
    options: evidenceOptions,
  },
  {
    id: "candidate_outcome",
    label: "Suggested action",
    fields: ["candidate_outcome"],
    kind: "select",
    options: actionOptions,
  },
  {
    id: "product_group_id",
    label: "Visual group",
    fields: ["product_group_id"],
    kind: "lookup",
    lookup: "visual_group",
  },
  {
    id: "dismissal_reason",
    label: "Dismissal reason",
    fields: ["dismissal_reason"],
    kind: "select",
    options: [
      "false_positive",
      "do_not_pursue",
      "second_hand",
      "licensed",
      "allowed_product",
      "dead",
      "manual_cleared",
    ].map((value) => [value, value.replaceAll("_", " ")]),
  },
  {
    id: "history",
    label: "Past observations",
    fields: ["history"],
    kind: "history",
  },
  {
    id: "protected_term_id",
    label: "Protected term",
    fields: ["protected_term_id"],
    kind: "select",
  },
];
const dateString = (offset: number) =>
  new Date(Date.now() + offset * 86400_000).toISOString().slice(0, 10);
const isActive = (filter: Filter, values: Values) =>
  filter.fields.some((field) => Boolean(values[field]));

export default function TaskSearch({
  ipId,
  conversationOwner,
  product,
  params,
  members,
  status,
  controls,
  ranking = null,
  onStart,
  onError,
  onSearching,
  onViewChange,
  onShowCategoryReport,
  mode="combined",
}: {
  ipId: string;
  conversationOwner?:string;
  product?: string;
  params: URLSearchParams;
  members: TenantMember[];
  status: TaskQueueQuery["status"];
  controls?: ReactNode;
  ranking?: SellerRanking | null;
  onStart: (result: TaskSearchResult, applied: AppliedTaskSearch) => void;
  onError: (error: string) => void;
  onSearching?: (searching: boolean) => void;
  onViewChange?:(view:QueueView,signal:AbortSignal)=>Promise<boolean>;
  onShowCategoryReport?:(report:CategoryRanking)=>void;
  mode?:"listings"|"ai"|"combined";
}) {
  const [values, setValues] = useState<Values>(() => {
    const saved = savedTaskSearchValues(params);
    if (saved) return saved;
    const initial: Values = {
      q: params.get("q") ?? "",
      from: dateString(-29),
      to: dateString(1),
    };
    const aliases: Values = {
      website: "platform",
      seller_name: "seller",
      evidence: "match_basis",
    };
    for (const filter of filters)
      for (const field of filter.fields) {
        if (field === "seller" || field === "history") continue;
        const value = params.get(aliases[field] ?? field);
        if (value) initial[field] = value;
      }
    const selector = params.get("selector");
    const selectorField =
      selector === "suggestion" ? "candidate_outcome" : selector;
    if (
      selectorField &&
      ["website", "source", "seller", "assignee", "candidate_outcome"].includes(
        selectorField,
      ) &&
      params.get("value")
    ) {
      initial[selectorField] = params.get("value")!;
      if (selectorField === "seller") delete initial.seller_name;
    }
    return initial;
  });
  const [titleSearch, setTitleSearch] = useState(false);
  const { labels: categoryLabels } = useProductSemanticTaxonomy(ipId, readSemanticFilters(values.semantic)?.categories);
  const [extended, setExtended] = useState(false);
  useEffect(()=>{
    if(mode!=="listings")return;
    const controller=new AbortController();
    void taskCapability(ipId,controller.signal).then(value=>{if(!controller.signal.aborted){setTitleSearch(value.title_search_policy_version===titleSearchPolicy);setExtended(value.listing_search_policy_version===taskListingSearchPolicy);}}).catch(()=>{});
    return()=>controller.abort();
  },[mode,ipId]);
  const [labels, setLabels] = useState<Values>({});
  const [panel, setPanel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Values>({});
  const [draftLabel, setDraftLabel] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const rankingLimit = ranking?.limit;
  const stableRanking = useMemo(() => rankingLimit ? {limit:rankingLimit} : null,[rankingLimit]);
  const rankingRef = useRef(stableRanking);
  useEffect(() => { rankingRef.current = stableRanking; },[stableRanking]);
  const skipAutomatic = useRef<string | null>(null);
  const scope = JSON.stringify([ipId, product, status]);
  const callbacks = useRef({ onStart, onError, onSearching });
  useEffect(() => { callbacks.current = { onStart, onError, onSearching }; });
  const autoSearch = useRef(mode!=="ai"&&Boolean(params.get("queue_filters")) && !params.has("task_search"));
  const generation = useRef(0);
  const invalidateRequests = useCallback(() => { generation.current++; }, []);
  const activeSearch = useRef<string | null>(params.get("task_search"));
  const requestQueue = useRef<Promise<void>>(Promise.resolve());
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latestScope = useRef<string | null>(scope);
  useEffect(() => {
    latestScope.current = scope;
    return () => {
      latestScope.current = null;
      invalidateRequests();
      clearTimeout(debounce.current);
    };
  }, [scope, invalidateRequests]);
  const savedDraft = params.get("queue_filters");
  useEffect(() => {
    if (!savedDraft) return;
    const saved = savedTaskSearchValues(new URLSearchParams({queue_filters:savedDraft}));
    if (!saved) return;
    setValues(current => {
      if (JSON.stringify(current) === JSON.stringify(saved)) return current;
      autoSearch.current = false;
      invalidateRequests();
      return saved;
    });
  },[savedDraft,invalidateRequests]);
  const previousScope = useRef(scope);
  useEffect(() => {
    if (mode!=="ai"&&previousScope.current !== scope && savedDraft) autoSearch.current = true;
    previousScope.current = scope;
  },[scope,savedDraft,mode]);
  const updateValues = (next: SetStateAction<Values>) => {
    autoSearch.current = true;
    generation.current++;
    callbacks.current.onSearching?.(true);
    setValues(next);
  };
  const runSearch = useCallback((applied?: AppliedTaskSearch, signal?: AbortSignal, afterCreate?:(result:TaskSearchResult)=>Promise<TaskSearchResult>): Promise<boolean> => {
    const next = applied ?? { values, status, product, ranking:rankingRef.current };
    const candidate = next.values;
    clearTimeout(debounce.current);
    autoSearch.current = true;
    const requestGeneration = ++generation.current;
    let request: Record<string, unknown>;
    try { request = taskSearchRequest(candidate, ipId, next.status, next.product); }
    catch (error) {
      callbacks.current.onError(error instanceof Error ? error.message : String(error));
      callbacks.current.onSearching?.(false);
      return Promise.resolve(false);
    }
    callbacks.current.onSearching?.(true);
    callbacks.current.onError("");
    const relevant = () => latestScope.current === scope && generation.current === requestGeneration;
    const current = () => relevant() && !signal?.aborted;
    const execute = async () => {
      if (!current()) return;
      // The API allows two active searches per account. Replace this form's
      // previous search before starting another; never accumulate typing jobs.
      const previous = activeSearch.current;
      if (previous) {
        await cancelTaskSearch(previous);
        if (activeSearch.current === previous) activeSearch.current = null;
      }
      if (!current()) return;
      const started = await startTaskSearch(request);
      let result=started;
      activeSearch.current = result.id;
      if(afterCreate){
        try{result=await afterCreate(started);}
        catch(error){if(started.id&&["pending","running"].includes(started.state)){await cancelTaskSearch(started.id);if(activeSearch.current===started.id)activeSearch.current=null;}throw error;}
      }
      if (!current()) {
        if (result.id && ["pending", "running"].includes(result.state)) {
          await cancelTaskSearch(result.id);
          if (activeSearch.current === result.id) activeSearch.current = null;
        }
        return;
      }
      if (applied) {
        skipAutomatic.current = JSON.stringify([JSON.stringify([ipId,next.product,next.status]),candidate]);
        setValues(candidate);
      }
      callbacks.current.onStart(result, next);
      return true;
    };
    // Serialize creates as well as cancellation, including slow POST responses.
    const executing = requestQueue.current.then(execute);
    requestQueue.current = executing.then(() => {}, () => {});
    return executing
      .catch((error) => {
        if (current()) callbacks.current.onError(error instanceof Error ? error.message : String(error));
        return false;
      })
      .then(result => result === true)
      .finally(() => { if (relevant()) callbacks.current.onSearching?.(false); });
  }, [ipId, product, status, scope, values]);
  async function rankCategories(input:CategoryRankingRequest,target:AppliedTaskSearch,signal:AbortSignal,fresh:boolean){
    const same=JSON.stringify([values,status,product,stableRanking])===JSON.stringify([target.values,target.status,target.product,target.ranking]);
    const id=activeSearch.current;
    if(!fresh&&same&&id){
      const token=generation.current;
      const {report}=await followTaskCategoryRanking(id,input,signal);
      if(signal.aborted||token!==generation.current||latestScope.current!==scope)return null;
      return {report,applied:target,searchChanged:false};
    }
    let report:CategoryRanking|null=null;
    const applied=await runSearch(target,signal,async initial=>{
      if(!initial.id){
        if(initial.state==="completed"&&initial.matched===0){report=emptyCategoryRanking(input);return initial;}
        throw Error("No saved search is available to rank.");
      }
      const result=await followTaskCategoryRanking(initial.id,input,signal,initial);report=result.report;return result.search;
    });
    return applied&&report?{report:report as CategoryRanking,applied:target,searchChanged:true}:null;
  }
  useEffect(() => {
    if (!autoSearch.current) return;
    const automaticKey = JSON.stringify([scope,values]);
    if (skipAutomatic.current === automaticKey) { skipAutomatic.current = null; return; }
    callbacks.current.onSearching?.(true);
    debounce.current = setTimeout(() => void runSearch(), 450);
    return () => clearTimeout(debounce.current);
  }, [runSearch, scope, values]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const close = (restoreFocus = false) => {
    setPanel(null);
    if (restoreFocus) triggerRef.current?.focus();
  };
  useOutsideDismiss(panelRef, () => close(), ".task-search-filter-trigger");
  const open = (id: string, trigger?: HTMLButtonElement) => {
    if (trigger) triggerRef.current = trigger;
    setDraft({ ...values });
    setDraftLabel(labels[id] ?? "");
    setFilterQuery("");
    setPanel(id);
  };
  const activeFilter = filters.find((filter) => filter.id === panel);
  const optionsFor = (filter: Filter) =>
    filter.id === "assignee"
      ? [
          ["unassigned", "Unassigned"],
          ...members.map((member) => [
            member.id,
            member.display_name ?? member.email ?? "Team member",
          ]),
        ]
      : filter.id === "protected_term_id"
        ? [[params.get("protected_term_id") ?? "", "Linked protected term"]]
        : (filter.options ?? []);
  const description = (filter: Filter) => {
    if (filter.id === "q") return `Text contains: ${values.q}`;
    if (filter.id === "title_contains") return `Title contains: ${values.title_contains}`;
    if (filter.id === "semantic") return semanticFilterLabel(values.semantic, categoryLabels);
    if (filter.id === "listing_countries") { try { return (JSON.parse(values.listing_countries) as string[]).map(code=>new Intl.DisplayNames(["en"],{type:"region"}).of(code)??code).join(" or "); } catch { return "Listing locations"; } }
    if (filter.id === "seller_listing_count" || filter.id === "price" && values.listing_price) {
      try { const range=JSON.parse(values[filter.id === "price"?"listing_price":filter.id]); const ops:Record<string,string>={gt:">",gte:"≥",lt:"<",lte:"≤"};
        return Object.entries(range).filter(([key])=>key!=="currency").map(([key,value])=>`${ops[key]} ${value}`).join(" · ")+(range.currency?` ${range.currency}`:" matching listings / seller");
      } catch { return filter.label; }
    }
    if (filter.id === "price") {
      const min = values.min_price_usd,
        max = values.max_price_usd;
      return min && max
        ? `$${min} – $${max}`
        : min
          ? `$${min}+`
          : `Up to $${max}`;
    }
    if (filter.id === "history") return "Included";
    if (filter.id === "seller" && values.seller_name) return values.seller_name;
    return (
      labels[filter.id] ||
      optionsFor(filter).find(([value]) => value === values[filter.id])?.[1] ||
      (filter.kind === "lookup" && filter.id !== "website"
        ? "Selected"
        : values[filter.id])
    );
  };
  const dateLabel =
    values.from === dateString(-29) && values.to === dateString(1)
      ? "Last 30 days"
      : values.from === dateString(-6) && values.to === dateString(1)
        ? "Last 7 days"
        : values.from === dateString(-89) && values.to === dateString(1)
          ? "Last 90 days"
          : `${new Date(values.from + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} – before ${new Date(values.to + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`;
  const available = filters.filter(
    (filter) =>
      filter.id !== "q" &&
      !isActive(filter, values) &&
      (titleSearch || filter.id !== "title_contains") &&
      (extended || !["listing_countries","seller_listing_count"].includes(filter.id)) &&
      (filter.id !== "protected_term_id" || params.get("protected_term_id")),
  );
  const invalidDates = !draft.from || !draft.to || draft.from >= draft.to;
  const invalidPrice =
    [draft.min_price_usd, draft.max_price_usd].some(
      (value) =>
        value && (Number(value) < 0 || !Number.isFinite(Number(value))),
    ) ||
    Boolean(
      draft.min_price_usd &&
      draft.max_price_usd &&
      Number(draft.min_price_usd) > Number(draft.max_price_usd),
    );
  const canApply =
    panel === "dates"
      ? !invalidDates
      : activeFilter?.kind === "price"
        ? !invalidPrice && Boolean(draft.min_price_usd || draft.max_price_usd)
        : activeFilter?.kind === "select" || activeFilter?.kind === "text"
          ? Boolean(draft[activeFilter.id]?.trim())
          : activeFilter?.kind === "history"
            ? true
            : activeFilter
              ? isActive(activeFilter, draft)
              : false;
  const apply = () => {
    const fields =
      panel === "dates" ? ["from", "to"] : (activeFilter?.fields ?? []);
    updateValues((current) => ({
      ...current,
      ...Object.fromEntries(fields.map((field) => {
        const value = draft[field] ?? "";
        return [field, activeFilter?.kind === "text" ? value.trim() : value];
      })),
    }));
    if (activeFilter)
      setLabels((current) => ({ ...current, [activeFilter.id]: draftLabel }));
    close(true);
  };
  return (
    <form
      className="task-search"
      aria-label="Task search"
      aria-description="Keywords and filters apply automatically."
      onSubmit={(event) => {
        event.preventDefault();
        if (panel) {
          if (panel !== "add" && canApply) apply();
          return;
        }
        runSearch();
      }}
    >
      {mode==="listings"?<div className="task-search-bar"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search listings or sellers" placeholder="Search listings or sellers…" value={values.q??""} maxLength={100} onChange={event=>updateValues({...values,q:event.target.value})}/></div>:<QueueSearchBar key={`${conversationOwner??"temporary"}:${ipId}`} standalone={mode==="ai"} scopeLabel={(status==="all"?"All open":taskStateLabels[status])+" · "+dateLabel} conversationOwner={conversationOwner} onRankCategories={rankCategories} onShowCategoryReport={onShowCategoryReport} searchId={params.get("task_search")} view={queueViewFromParams(params)} onViewChange={onViewChange} onTitleSearch={setTitleSearch} onExtended={setExtended} initialAsk={mode==="ai"||params.get("ask")==="1"} ipId={ipId} product={product} status={status} values={values} ranking={ranking}
        onAgentSearching={searching=>callbacks.current.onSearching?.(searching)}
        onAgentResult={(result,applied)=>{
          clearTimeout(debounce.current);generation.current++;
          autoSearch.current=false;activeSearch.current=result.id;
          skipAutomatic.current=JSON.stringify([JSON.stringify([ipId,applied.product,applied.status]),applied.values]);
          setValues(applied.values);callbacks.current.onSearching?.(false);callbacks.current.onStart(result,applied);
        }}
        onChange={q => updateValues({ ...values, q })} onApply={runSearch} />}
      <div
        className="task-search-filter-row"
        hidden={mode==="ai"}
        onKeyDown={(event) => {
          if (event.key === "Escape" && panel) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
          }
        }}
      >
        <button
          type="button"
          className="task-search-filter-trigger task-search-date"
          aria-expanded={panel === "dates"}
          aria-label={`First detected: ${dateLabel}`}
          aria-haspopup="dialog"
          onClick={(event) =>
            panel === "dates" ? close() : open("dates", event.currentTarget)
          }
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span>
            <strong>{dateLabel}</strong>
          </span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {filters
          .filter((filter) => isActive(filter, values))
          .map((filter) => (
            <span className="task-search-chip" key={filter.id}>
              <button
                type="button"
                className="task-search-filter-trigger"
                aria-haspopup="dialog"
                aria-expanded={panel === filter.id}
                aria-label={`${filter.label}: ${description(filter)}`}
                onClick={(event) =>
                  panel === filter.id
                    ? close()
                    : open(filter.id, event.currentTarget)
                }
              >
                <span>
                  <strong>{description(filter)}</strong>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${filter.label.toLowerCase()} filter`}
                onClick={() => {
                  updateValues((current) => ({
                    ...current,
                    ...Object.fromEntries(
                      filter.fields.map((field) => [field, ""]),
                    ),
                  }));
                  setLabels((current) => ({ ...current, [filter.id]: "" }));
                  close();
                }}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        {values.catalog_selection && <span className="task-search-chip"><span>Catalog selection</span><button type="button" aria-label="Remove catalog selection" onClick={()=>updateValues(current=>({...current,catalog_selection:""}))}><X size={12}/></button></span>}
        <button
          type="button"
          className="task-search-filter-trigger task-search-add"
          aria-haspopup="dialog"
          aria-expanded={panel === "add"}
          onClick={(event) =>
            panel === "add" ? close() : open("add", event.currentTarget)
          }
        >
          <Plus size={14} aria-hidden="true" />
          Add filter
        </button>
        {filters.some((filter) => isActive(filter, values)) && (
          <button
            type="button"
            className="task-search-clear"
            onClick={() => {
              updateValues((current) => ({
                from: current.from,
                to: current.to,
              }));
              setLabels({});
              close();
            }}
          >
            Clear filters
          </button>
        )}
        {controls}
        {panel && (
          <div
            ref={panelRef}
            className="task-search-popover"
            role="dialog"
            aria-label={
              panel === "add"
                ? "Add filter"
                : panel === "dates"
                  ? "First detected date range"
                  : `${activeFilter?.label} filter`
            }
            onBlur={(event) => {
              const target = event.relatedTarget;
              if (
                target instanceof Element &&
                !event.currentTarget.contains(target) &&
                !target.closest(".task-search-filter-trigger")
              )
                close();
            }}
          >
            <div className="task-search-popover-heading">
              {panel !== "add" && panel !== "dates" && (
                <button
                  type="button"
                  aria-label="Back to filters"
                  onClick={() => open("add")}
                >
                  <ArrowLeft size={15} />
                </button>
              )}
              <strong>
                {panel === "add"
                  ? "Add filter"
                  : panel === "dates"
                    ? "First detected"
                    : activeFilter?.label}
              </strong>
              <button
                type="button"
                aria-label="Close filter"
                onClick={() => close(true)}
              >
                <X size={15} />
              </button>
            </div>
            {panel === "add" ? (
              <>
                <input
                  autoFocus
                  className="task-search-picker-search"
                  aria-label="Find a filter"
                  placeholder="Find a filter…"
                  value={filterQuery}
                  onChange={(event) => setFilterQuery(event.target.value)}
                />
                <div className="task-search-filter-list">
                  {available
                    .filter((filter) =>
                      filter.label
                        .toLowerCase()
                        .includes(filterQuery.toLowerCase()),
                    )
                    .map((filter) => (
                      <button
                        type="button"
                        key={filter.id}
                        onClick={() => {
                          open(filter.id);
                          if (filter.kind === "history")
                            setDraft((current) => ({
                              ...current,
                              history: "on",
                            }));
                        }}
                      >
                        {filter.label}
                        <Plus size={13} aria-hidden="true" />
                      </button>
                    ))}
                  {!available.some((filter) =>
                    filter.label
                      .toLowerCase()
                      .includes(filterQuery.toLowerCase()),
                  ) && <p>No more matching filters.</p>}
                </div>
              </>
            ) : activeFilter?.kind === "locations" || activeFilter?.kind === "count" || activeFilter?.id === "price" && values.listing_price ? (
              <QueueConstraintEditor key={activeFilter.id} kind={activeFilter.kind === "locations" ? "locations" : activeFilter.kind === "count" ? "count" : "price"}
                value={values[activeFilter.id === "price" ? "listing_price" : activeFilter.id] ?? ""}
                onCancel={() => close(true)} onApply={value => { updateValues(current => ({...current,[activeFilter.id === "price" ? "listing_price" : activeFilter.id]:value})); close(true); }}/>
            ) : activeFilter?.kind === "semantic" ? (
              <SemanticFilterPanel value={values.semantic} ipId={ipId} onApply={semantic => { updateValues(current => ({ ...current, semantic: semantic ?? "" })); close(true); }} />
            ) : (
              <>
                <div className="task-search-editor" key={panel}>
                  {panel === "dates" ? (
                    <>
                      <div className="task-search-date-presets">
                        {[7, 30, 90].map((days) => (
                          <button
                            type="button"
                            key={days}
                            aria-pressed={
                              draft.from === dateString(1 - days) &&
                              draft.to === dateString(1)
                            }
                            onClick={() =>
                              setDraft({
                                ...draft,
                                from: dateString(1 - days),
                                to: dateString(1),
                              })
                            }
                          >
                            Last {days} days
                          </button>
                        ))}
                      </div>
                      <div className="task-search-range">
                        <label>
                          From
                          <input
                            autoFocus
                            type="date"
                            value={draft.from}
                            onChange={(event) =>
                              setDraft({ ...draft, from: event.target.value })
                            }
                          />
                        </label>
                        <label>
                          Before
                          <input
                            type="date"
                            value={draft.to}
                            onChange={(event) =>
                              setDraft({ ...draft, to: event.target.value })
                            }
                          />
                        </label>
                      </div>
                      <p>Dates use UTC. The “Before” date is not included.</p>
                      {invalidDates && (
                        <p role="alert">
                          Choose an end date after the start date.
                        </p>
                      )}
                    </>
                  ) : activeFilter?.kind === "lookup" ? (
                    <TaskSearchLookup
                      key={activeFilter.id}
                      filter={activeFilter}
                      ipId={ipId}
                      product={product}
                      value={draft[activeFilter.id] ?? ""}
                      selectedLabel={
                        draftLabel ||
                        (activeFilter.id === "seller" ? draft.seller_name : "")
                      }
                      onChange={(value, label) => {
                        setDraft({
                          ...draft,
                          [activeFilter.id]: value,
                          ...(activeFilter.id === "seller"
                            ? { seller_name: "" }
                            : {}),
                        });
                        setDraftLabel(label);
                      }}
                    />
                  ) : activeFilter?.kind === "select" ? (
                    <label>
                      {activeFilter.label}
                      <select
                        autoFocus
                        value={draft[activeFilter.id] ?? ""}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            [activeFilter.id]: event.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Choose {activeFilter.label.toLowerCase()}…
                        </option>
                        {optionsFor(activeFilter).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : activeFilter?.kind === "text" ? (
                    <>
                      <label>
                        {activeFilter.label}
                        <input
                          autoFocus
                          maxLength={100}
                          value={draft[activeFilter.id] ?? ""}
                          placeholder={activeFilter.id === "title_contains" ? "Text or code anywhere in the title" : "Country name or two-letter code"}
                          aria-describedby={`task-search-${activeFilter.id}-help`}
                          onChange={(event) =>
                            setDraft({ ...draft, [activeFilter.id]: event.target.value })
                          }
                        />
                      </label>
                      <p id={`task-search-${activeFilter.id}-help`}>
                        {activeFilter.id === "title_contains" ? "Matches this text anywhere in listing titles, including longer codes. Case-insensitive; seller names and URLs are excluded." : activeFilter.id === "country"
                          ? "Filter by the country assigned to the marketplace or storefront."
                          : 'Filter by the seller\'s recorded country. Enter "Unknown" for sellers without a known origin.'}
                      </p>
                    </>
                  ) : activeFilter?.kind === "price" ? (
                    <>
                      <div className="task-search-range">
                        <label>
                          Min (USD)
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="No minimum"
                            value={draft.min_price_usd ?? ""}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                min_price_usd: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Max (USD)
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="No maximum"
                            value={draft.max_price_usd ?? ""}
                            onChange={(event) =>
                              setDraft({
                                ...draft,
                                max_price_usd: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      {invalidPrice && (
                        <p role="alert">
                          Enter a valid range with a maximum at or above the
                          minimum.
                        </p>
                      )}
                    </>
                  ) : (
                    <label className="task-search-history">
                      <input
                        autoFocus
                        type="checkbox"
                        checked={draft.history === "on"}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            history: event.target.checked ? "on" : "",
                          })
                        }
                      />
                      Include text and evidence from past observations in this
                      date range.
                    </label>
                  )}
                </div>
                <div className="task-search-popover-actions">
                  <button type="button" onClick={() => close(true)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="task-search-submit"
                    disabled={!canApply}
                    onClick={apply}
                  >
                    Apply filter
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </form>
  );
}

function TaskSearchLookup({
  filter,
  ipId,
  product,
  value,
  selectedLabel,
  onChange,
}: {
  filter: Filter;
  ipId: string;
  product?: string;
  value: string;
  selectedLabel?: string;
  onChange: (value: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{
    query: string;
    options: Array<{ value: string; label: string }>;
    error?: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    if (filter.lookup === "seller" && query.trim().length < 2) return;
    const timer = window.setTimeout(() => {
      const response =
        filter.lookup === "visual_group"
          ? taskCatalogOptions(
              { ip_id: ipId, kind: "visual_group", q: query },
              controller.signal,
            )
          : taskOptions(
              {
                ip_id: ipId,
                catalog_product_id: product,
                kind: filter.lookup as "website" | "seller" | "source",
                q: query,
              },
              controller.signal,
            );
      void response
        .then((response) => {
          if (!controller.signal.aborted)
            setResult({ query, options: response.options });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setResult({
              query,
              options: [],
              error: error instanceof Error ? error.message : String(error),
            });
        });
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, filter.lookup, ipId, product]);
  const current = result?.query === query ? result : null;
  return (
    <>
      <input
        autoFocus
        type="search"
        aria-label={`Find ${filter.label.toLowerCase()}`}
        placeholder={
          filter.lookup === "seller"
            ? "Search sellers (at least 2 letters)…"
            : `Search ${filter.label.toLowerCase()}…`
        }
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {selectedLabel && <p>Selected: {selectedLabel}</p>}
      <div className="task-search-lookup-options">
        {filter.lookup === "seller" && query.trim().length < 2 ? (
          <p>Type a seller name to find a match.</p>
        ) : current?.error ? (
          <p role="alert">{current.error}</p>
        ) : !current ? (
          <p role="status">Loading…</p>
        ) : current.options.length === 0 ? (
          <p>No matches found. Try another search.</p>
        ) : (
          current.options.map((option) => (
            <button
              type="button"
              key={option.value}
              aria-pressed={value === option.value}
              onClick={() => onChange(option.value, option.label)}
            >
              <span>{option.label}</span>
              {value === option.value && <Check size={14} aria-hidden="true" />}
            </button>
          ))
        )}
      </div>
    </>
  );
}
