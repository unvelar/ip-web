import { useRef, useState, useEffect, type ReactNode } from "react";
import {
  Search,
  Plus,
  X,
  ChevronDown,
  ArrowLeft,
  CalendarDays,
  Check,
} from "lucide-react";
import type { TenantMember } from "../api";
import { useOutsideDismiss } from "../hooks/useOutsideDismiss";
import {
  taskOptions,
  taskCatalogOptions,
  startTaskSearch,
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
  ["none", "No suggestion"],
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
  kind: "select" | "lookup" | "text" | "price" | "history";
  options?: string[][];
  lookup?: "website" | "source" | "seller" | "visual_group";
};
const filters: Filter[] = [
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
    fields: ["min_price_usd", "max_price_usd"],
    kind: "price",
  },
  { id: "assignee", label: "Assignee", fields: ["assignee"], kind: "select" },
  { id: "country", label: "Country", fields: ["country"], kind: "text" },
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
  product,
  params,
  members,
  status,
  controls,
  onStart,
  onError,
}: {
  ipId: string;
  product?: string;
  params: URLSearchParams;
  members: TenantMember[];
  status: TaskQueueQuery["status"];
  controls?: ReactNode;
  onStart: (result: TaskSearchResult) => void;
  onError: (error: string) => void;
}) {
  const [values, setValues] = useState<Values>(() => {
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
  const [labels, setLabels] = useState<Values>({});
  const [panel, setPanel] = useState<string | null>(null);
  const [draft, setDraft] = useState<Values>({});
  const [draftLabel, setDraftLabel] = useState("");
  const [filterQuery, setFilterQuery] = useState("");
  const [starting, setStarting] = useState(false);
  const scope = JSON.stringify([ipId, product, status]);
  const latestScope = useRef<string | null>(scope);
  useEffect(() => {
    latestScope.current = scope;
    return () => {
      latestScope.current = null;
    };
  }, [scope]);
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
      !isActive(filter, values) &&
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
        : activeFilter?.kind === "select"
          ? Boolean(draft[activeFilter.id])
          : activeFilter?.kind === "history"
            ? true
            : activeFilter
              ? isActive(activeFilter, draft)
              : false;
  const apply = () => {
    const fields =
      panel === "dates" ? ["from", "to"] : (activeFilter?.fields ?? []);
    setValues((current) => ({
      ...current,
      ...Object.fromEntries(fields.map((field) => [field, draft[field] ?? ""])),
    }));
    if (activeFilter)
      setLabels((current) => ({ ...current, [activeFilter.id]: draftLabel }));
    close(true);
  };
  return (
    <form
      className="task-search"
      aria-label="Task search"
      onSubmit={(event) => {
        event.preventDefault();
        if (panel) {
          if (panel !== "add" && canApply) apply();
          return;
        }
        const request: Record<string, unknown> = {
          ip_id: ipId,
          catalog_product_id: product,
          status,
          from: `${values.from}T00:00:00.000Z`,
          to: `${values.to}T00:00:00.000Z`,
          history: values.history === "on",
        };
        for (const [field, value] of Object.entries(values)) {
          if (!value || ["status", "from", "to", "history"].includes(field))
            continue;
          request[field] = ["min_price_usd", "max_price_usd"].includes(field)
            ? Number(value)
            : value;
        }
        setStarting(true);
        onError("");
        void startTaskSearch(request)
          .then((result) => {
            if (latestScope.current === scope) onStart(result);
          })
          .catch((error) => {
            if (latestScope.current === scope)
              onError(error instanceof Error ? error.message : String(error));
          })
          .finally(() => setStarting(false));
      }}
    >
      <div className="task-search-bar">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="Search listings or sellers"
          placeholder="Search listings or sellers…"
          value={values.q}
          onChange={(event) => setValues({ ...values, q: event.target.value })}
        />
        <button
          className="task-search-submit"
          type="submit"
          disabled={starting}
        >
          {starting ? "Searching…" : "Search"}
        </button>
      </div>
      <div
        className="task-search-filter-row"
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
          aria-haspopup="dialog"
          onClick={(event) =>
            panel === "dates" ? close() : open("dates", event.currentTarget)
          }
        >
          <CalendarDays size={14} aria-hidden="true" />
          <span>
            First detected: <strong>{dateLabel}</strong>
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
                onClick={(event) =>
                  panel === filter.id
                    ? close()
                    : open(filter.id, event.currentTarget)
                }
              >
                <span>
                  {filter.label}: <strong>{description(filter)}</strong>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${filter.label.toLowerCase()} filter`}
                onClick={() => {
                  setValues((current) => ({
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
              setValues((current) => ({
                q: current.q,
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
                    <label>
                      Country
                      <input
                        autoFocus
                        value={draft.country ?? ""}
                        placeholder="Enter a country"
                        onChange={(event) =>
                          setDraft({ ...draft, country: event.target.value })
                        }
                      />
                    </label>
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
