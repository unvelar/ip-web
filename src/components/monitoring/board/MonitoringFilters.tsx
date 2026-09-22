import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Banknote, Globe, Package, Search, SlidersHorizontal, X } from "lucide-react";
import type { MonitoringFacets, MonitoringSourceFacet, TenantMember } from "../../../api";
import { getPersistedProductGroups } from "../../../api/products";
import type { InboxFilters } from "../../../lib/monitoringFilters";
import { MONITORING_PLATFORM_OPTIONS } from "../../../lib/platforms";
import { CANDIDATE_OUTCOME_LABELS, CANDIDATE_OUTCOME_ORDER, DISMISSAL_REASON_LABELS } from "./constants";
import { ProductFilterPicker } from "./ProductFilterPicker";
import { PriceFilterPanel } from "./PriceFilterPanel";
import "./MonitoringFilters.css";

type Panel = "product" | "price" | "source" | "more" | "views";
const primaryViews = [
  { key: "pending", label: "To triage" }, { key: "review", label: "In review" },
  { key: "takedown_pending", label: "Legal queue" }, { key: "takedown_sent", label: "Sent" },
] as const;
const otherViews = [
  { key: null, label: "All except dismissed" }, { key: "preparing", label: "Preparing" },
  { key: "enforced", label: "Enforced" }, { key: "dismissed", label: "Dismissed" },
] as const;
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
function sourceLabel(source: MonitoringSourceFacet) {
  return source.kind === "domain"
    ? MONITORING_PLATFORM_OPTIONS.find((item) => item.value === source.label)?.label ?? source.label
    : source.label;
}

function FilterPanelHeading({ title, onClose }: { title: string; onClose: () => void }) {
  return <div className="monitoring-filter-menu-heading"><h3>{title}</h3><button type="button" aria-label="Close filter options" onClick={onClose}><X size={16} aria-hidden /></button></div>;
}

function SourcePicker({ facets, filters, onChange, onClose }: {
  facets: MonitoringFacets; filters: InboxFilters; onChange: (change: Partial<InboxFilters>) => void; onClose: () => void;
}) {
  const [engine, setEngine] = useState<string | null>(filters.source?.startsWith("search:") ? filters.source : null);
  const [query, setQuery] = useState("");
  const websiteSearch = useRef<HTMLInputElement>(null);
  useEffect(() => { websiteSearch.current?.focus(); }, [engine]);
  const sources = facets.sources;
  const selected = sources?.find((source) => source.key === engine);
  const label = selected ? sourceLabel(selected) : engine?.replace(/^search:/, "") ?? "";
  const websites = selected?.websites ?? [];
  const siteOptions = filters.source === engine && filters.platform && !websites.some((site) => site.domain === filters.platform)
    ? [{ domain: filters.platform, n: 0 }, ...websites] : websites;
  const matches = (value: string) => value.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim());
  const row = (title: string, count: number | undefined, active: boolean, onClick: () => void, drill = false) => (
    <button type="button" key={title} className="monitoring-filter-option" onClick={onClick} aria-pressed={drill ? undefined : active}>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {count != null && <span className="text-xs tabular-nums text-stone-400">{count}</span>}
      {drill ? <ChevronRight size={14} aria-hidden /> : active ? <Check size={14} aria-hidden /> : <span className="w-3.5" />}
    </button>
  );
  return <div className="monitoring-source-picker">
    <FilterPanelHeading title={engine ? `Found via ${label}` : "Source"} onClose={onClose} />
    {engine ? <button type="button" className="mb-2 flex items-center gap-2 px-2 py-1.5 text-xs text-stone-500 hover:text-stone-900" onClick={() => { setEngine(null); setQuery(""); }}><ArrowLeft size={14} />All sources</button> : null}
    <label className="relative mx-1 mb-2 block">
      <Search size={14} className="absolute left-2.5 top-2.5 text-stone-400" aria-hidden />
      <input ref={websiteSearch} className="monitoring-filter-input pl-8" aria-label={engine ? "Find a website" : "Find a source"} placeholder={engine ? "Find a website…" : "Find a source…"} value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    <div className="max-h-72 overflow-y-auto overscroll-contain">
      {engine ? <>
        {row(`All ${label} websites`, selected?.n, filters.source === engine && !filters.platform, () => onChange({ source: engine, platform: null }))}
        {siteOptions.filter((site) => matches(site.domain)).map((site) => row(site.domain, site.n, filters.source === engine && filters.platform === site.domain, () => onChange({ source: engine, platform: site.domain })))}
        {!siteOptions.some((site) => matches(site.domain)) && <p className="px-2 py-4 text-xs text-stone-500">No websites match.</p>}
      </> : <>
        {row("All sources", undefined, !filters.source && !filters.platform, () => onChange({ source: null, platform: null }))}
        {sources ? sources.filter((source) => matches(sourceLabel(source))).map((source) => row(sourceLabel(source), source.n, filters.source === source.key, () => {
          if (source.kind === "search" || source.websites.length > 1) { setEngine(source.key); setQuery(""); }
          else onChange({ source: source.key, platform: null });
        }, source.kind === "search" || source.websites.length > 1)) : facets.platforms.filter((site) => matches(site.domain)).map((site) => row(site.domain, site.n, filters.platform === site.domain, () => onChange({ source: null, platform: site.domain })))}
      </>}
    </div>
  </div>;
}

export function MonitoringFilters({ filters, facets, onChange, ipId, showIpFilter, members, membersLoading, membersError, currentMemberId }: {
  filters: InboxFilters; facets: MonitoringFacets; onChange: (change: Partial<InboxFilters>) => void;
  ipId: string | null; showIpFilter: boolean; members: TenantMember[]; membersLoading: boolean; membersError: string; currentMemberId: string | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const [search, setSearch] = useState(filters.query ?? "");
  const [productLabel, setProductLabel] = useState<{ ipId: string; id: string; label: string } | null>(null);
  useEffect(() => {
    const productId = filters.catalog_product_id;
    if (!ipId || !productId || (productLabel?.ipId === ipId && productLabel.id === productId)) return;
    const controller = new AbortController();
    void getPersistedProductGroups(ipId, "same", "all", {
      limit: 1, productId, catalogScope: "catalog", includeUngrouped: false, signal: controller.signal,
    }).then((overview) => {
      if (controller.signal.aborted) return;
      const group = overview.groups.find((item) => item.canonical_product_id === productId || item.id === productId);
      if (group) setProductLabel({ ipId, id: productId, label: group.catalog_display_name });
    }).catch(() => {
      // The active filter remains visible and removable if its optional label cannot load.
    });
    return () => controller.abort();
  }, [ipId, filters.catalog_product_id, productLabel]);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRefs = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const latestChange = useRef(onChange);
  useEffect(() => { latestChange.current = onChange; }, [onChange]);
  const [previousQuery, setPreviousQuery] = useState(filters.query);
  if (previousQuery !== filters.query) {
    setPreviousQuery(filters.query);
    setSearch(filters.query ?? "");
  }
  useEffect(() => {
    const value = search.trim() || null;
    if (value === filters.query) return;
    const timer = window.setTimeout(() => latestChange.current({ query: value }), 250);
    return () => window.clearTimeout(timer);
  }, [search, filters.query]);
  function close(restore = false) {
    if (restore && panel) triggerRefs.current[panel]?.focus();
    setPanel(null);
  }
  useEffect(() => {
    if (!panel) return;
    const node = panelRef.current;
    (node?.querySelector<HTMLElement>('input:not([disabled]):not([type="range"]), select') ?? node?.querySelector<HTMLElement>('button:not([aria-label="Close filter options"])') ?? node?.querySelector<HTMLElement>("button"))?.focus();
    const dismiss = (event: PointerEvent) => {
      if (node?.contains(event.target as Node) || Object.values(triggerRefs.current).some((button) => button?.contains(event.target as Node))) return;
      setPanel(null);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); triggerRefs.current[panel]?.focus(); setPanel(null); }
    };
    document.addEventListener("pointerdown", dismiss);
    node?.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("pointerdown", dismiss); node?.removeEventListener("keydown", keydown); };
  }, [panel]);
  useLayoutEffect(() => {
    if (!panel) return;
    const node = panelRef.current;
    const trigger = triggerRefs.current[panel];
    if (!node || !trigger) return;
    const position = () => {
      const anchor = trigger.getBoundingClientRect();
      const width = node.offsetWidth;
      node.style.left = `${Math.max(12, Math.min(anchor.left, document.documentElement.clientWidth - width - 12))}px`;
      const below = window.innerHeight - anchor.bottom - 20;
      const above = anchor.top - 20;
      const openAbove = below < Math.min(node.scrollHeight, 300) && above > below;
      node.style.maxHeight = `${Math.max(100, openAbove ? above : below)}px`;
      node.style.top = openAbove ? "auto" : `${anchor.bottom + 8}px`;
      node.style.bottom = openAbove ? `${window.innerHeight - anchor.top + 8}px` : "auto";
    };
    position();
    const observer = new window.ResizeObserver(position);
    observer.observe(node);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); };
  }, [panel]);
  const changeAndClose = (next: Partial<InboxFilters>) => { onChange(next); close(true); };
  const selectView = (status: InboxFilters["status"]) => changeAndClose({
    status, show_dismissed: status === "dismissed", dismissal_reason: status === "dismissed" ? filters.dismissal_reason : null,
    candidate_outcome: status === "pending" ? filters.candidate_outcome : null,
  });
  const countAll = Object.entries(facets.statuses).reduce((count, [key, n]) => count + (key === "dismissed" ? 0 : n), 0);
  const otherActive = otherViews.find((view) => view.key === filters.status);
  const hasProduct = Boolean(filters.catalog_product_id || filters.product_group_id);
  const hasPrice = filters.min_price_usd != null || filters.max_price_usd != null;
  const moreCount = [filters.assignee, filters.candidate_outcome, filters.seller, filters.dismissal_reason, filters.priority, filters.match_basis, filters.protected_term_id].filter(Boolean).length;
  const groupName = facets.product_groups.find((group) => group.product_group_id === filters.product_group_id)?.name;
  const selectedProductId = filters.catalog_product_id ?? filters.product_group_id;
  const selectedProductLabel = productLabel?.ipId === ipId && productLabel?.id === selectedProductId ? productLabel.label : groupName ?? (filters.catalog_product_id ? "Selected product" : "Selected visual group");
  const priceLabel = filters.min_price_usd != null && filters.max_price_usd != null
    ? `${money.format(filters.min_price_usd)} – ${money.format(filters.max_price_usd)}`
    : filters.min_price_usd != null ? `${money.format(filters.min_price_usd)} and up` : `Up to ${money.format(filters.max_price_usd ?? 0)}`;
  const activeSource = facets.sources?.find((source) => source.key === filters.source);
  const activeSourceLabel = activeSource ? sourceLabel(activeSource) : filters.source?.replace(/^(search|domain):/, "") ?? "Source";
  const clear = () => {
    setSearch("");
    onChange({ country: null, query: null, product_group_id: null, catalog_product_id: null, source: null, platform: null, min_price_usd: null, max_price_usd: null, assignee: null, seller: null, priority: null, candidate_outcome: null, dismissal_reason: null, match_basis: null, protected_term_id: null });
    setPanel(null);
  };
  const chips: Array<{ key: string; label: string; edit?: () => void; remove: () => void }> = filters.query
    ? [{ key: "search", label: `Search: ${filters.query}`, edit: () => setPanel(null), remove: () => { setSearch(""); onChange({ query: null }); } }] : [];
  if (hasProduct) chips.push({ key: "product", label: `${filters.catalog_product_id ? "Product" : "Visual group"}: ${selectedProductLabel}`, edit: () => setPanel("product"), remove: () => onChange({ catalog_product_id: null, product_group_id: null }) });
  if (hasPrice) chips.push({ key: "price", label: `Price: ${priceLabel} USD`, edit: () => setPanel("price"), remove: () => onChange({ min_price_usd: null, max_price_usd: null }) });
  if (filters.source) chips.push({ key: "source", label: `Found via: ${activeSourceLabel}`, edit: () => setPanel("source"), remove: () => onChange({ source: null, platform: null }) });
  if (filters.country) chips.push({ key: "country", label: `Country: ${filters.country === "Unknown" ? "Unknown location" : filters.country}`, remove: () => onChange({ country: null }) });
  if (filters.platform) chips.push({ key: "website", label: `Website: ${filters.platform}`, edit: () => setPanel("source"), remove: () => onChange({ platform: null }) });
  if (filters.assignee) chips.push({ key: "assignee", label: `Assignee: ${filters.assignee === "unassigned" ? "Unassigned" : members.find((member) => member.id === filters.assignee)?.display_name ?? members.find((member) => member.id === filters.assignee)?.email ?? "Selected member"}`, edit: () => setPanel("more"), remove: () => onChange({ assignee: null }) });
  if (filters.candidate_outcome) chips.push({ key: "outcome", label: `Suggested: ${CANDIDATE_OUTCOME_LABELS[filters.candidate_outcome]}`, edit: () => setPanel("more"), remove: () => onChange({ candidate_outcome: null }) });
  if (filters.seller) chips.push({ key: "seller", label: `Seller: ${filters.seller}`, edit: () => setPanel("more"), remove: () => onChange({ seller: null }) });
  if (filters.dismissal_reason) chips.push({ key: "reason", label: DISMISSAL_REASON_LABELS[filters.dismissal_reason], edit: () => setPanel("more"), remove: () => onChange({ dismissal_reason: null }) });
  if (filters.priority) chips.push({ key: "priority", label: `Priority: ${filters.priority}`, edit: () => setPanel("more"), remove: () => onChange({ priority: null }) });
  const evidenceLabels = { text: "Protected terms", text_only: "Text only", visual: "Images", both: "Text and images" };
  if (filters.match_basis) chips.push({ key: "evidence", label: `Evidence: ${evidenceLabels[filters.match_basis]}`, edit: () => setPanel("more"), remove: () => onChange({ match_basis: null }) });
  if (filters.protected_term_id) chips.push({ key: "term", label: "Protected term: Selected term", edit: () => setPanel("more"), remove: () => onChange({ protected_term_id: null }) });
  const trigger = (key: Panel, label: string, icon: ReactNode, active: boolean) => <button type="button" ref={(node) => { triggerRefs.current[key] = node; }}
    className={`monitoring-filter-trigger ${active ? "is-active" : ""}`} aria-expanded={panel === key} aria-controls={`monitoring-filter-${key}`} aria-haspopup="dialog"
    onClick={() => setPanel(panel === key ? null : key)}>{icon}<span>{label}</span>{key !== "more" && <ChevronDown size={13} aria-hidden />}</button>;
  const popover = (key: Panel, content: ReactNode) => panel === key ? <div id={`monitoring-filter-${key}`} ref={panelRef} role="dialog" aria-label={`${key === "more" ? "More filters" : key === "views" ? "More views" : key[0].toUpperCase() + key.slice(1)} options`}
    className={`monitoring-filter-popover ${key === "product" ? "is-product" : ""}`} onBlur={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && !Object.values(triggerRefs.current).some((button) => button?.contains(event.relatedTarget as Node))) setPanel(null);
    }}>{key !== "source" && key !== "price" && <FilterPanelHeading title={key === "product" ? "Product or group" : key === "views" ? "More views" : "More filters"} onClose={() => close(true)} />}{content}</div> : null;
  return <section className="monitoring-filters" aria-label="Filter listings">
    <nav className="monitoring-workflow" aria-label="Review workflow">
      <div className="monitoring-workflow-tabs">
        {primaryViews.map((view) => <button type="button" key={view.key} className={`monitoring-workflow-tab ${filters.status === view.key ? "is-active" : ""}`} aria-pressed={filters.status === view.key} onClick={() => selectView(view.key)}>{view.label}<span>{facets.statuses[view.key] ?? 0}</span></button>)}
        <div className="monitoring-filter-anchor">
          {trigger("views", filters.status === null && filters.show_dismissed ? "All listings" : otherActive?.label ?? "More views", null, Boolean(otherActive))}
          {popover("views", <div>{otherViews.map((view) => <button type="button" key={view.key ?? "all"} className="monitoring-filter-option" aria-pressed={filters.status === view.key && (view.key !== null || !filters.show_dismissed)} onClick={() => selectView(view.key)}><span className="flex-1">{view.label}</span><span className="text-xs tabular-nums text-stone-400">{view.key === null ? countAll : facets.statuses[view.key] ?? 0}</span>{filters.status === view.key && (view.key !== null || !filters.show_dismissed) && <Check size={14} />}</button>)}</div>)}
        </div>
      </div>
    </nav>
    <div className="monitoring-filter-toolbar">
      <label className="monitoring-listing-search">
        <Search size={15} className="shrink-0 text-stone-400" aria-hidden />
        <input type="search" ref={searchRef} aria-label="Search listings or sellers" placeholder="Search listings or sellers…" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); onChange({ query: null }); }}><X size={14} /></button>}
      </label>
      <div className="monitoring-filter-tools">
      <div className="monitoring-filter-anchor">
        {trigger("product", "Product or group", <Package size={14} aria-hidden />, hasProduct)}
        {popover("product", <ProductFilterPicker ipId={ipId} productId={filters.catalog_product_id} groupId={filters.product_group_id} onChange={({ label, ...selection }) => {
          const id = selection.catalog_product_id ?? selection.product_group_id;
          setProductLabel(ipId && id && label ? { ipId, id, label } : null); changeAndClose(selection);
        }} />)}
      </div>
      <div className="monitoring-filter-anchor">
        {trigger("price", "Price", <Banknote size={14} aria-hidden />, hasPrice)}
        {popover("price", <PriceFilterPanel key={facets.price_usd ? "available" : "unavailable"} min={filters.min_price_usd} max={filters.max_price_usd} bounds={facets.price_usd} onClose={() => close(true)} onApply={(min, max) => changeAndClose({ min_price_usd: min, max_price_usd: max })} />)}
      </div>
      <div className="monitoring-filter-anchor">
        {trigger("source", "Source", <Globe size={14} aria-hidden />, Boolean(filters.source || filters.platform))}
        {popover("source", <SourcePicker facets={facets} filters={filters} onChange={changeAndClose} onClose={() => close(true)} />)}
      </div>
      <div className="monitoring-filter-anchor is-more">
        {trigger("more", `More filters${moreCount ? ` · ${moreCount}` : ""}`, <SlidersHorizontal size={14} aria-hidden />, moreCount > 0)}
        {popover("more", <div className="monitoring-more-fields">
          {showIpFilter && facets.ips.length > 1 && <label className="monitoring-filter-field">IP<select className="monitoring-filter-input" value={filters.ip_id ?? ""} onChange={(event) => onChange({ ip_id: event.target.value || null, catalog_product_id: null, product_group_id: null })}><option value="">All IPs</option>{facets.ips.map((ip) => <option key={ip.ip_id} value={ip.ip_id}>{ip.name ?? "Unnamed IP"}</option>)}</select></label>}
          <label className="monitoring-filter-field">Suggested action<select className="monitoring-filter-input" value={filters.candidate_outcome ?? ""} onChange={(event) => onChange({ candidate_outcome: event.target.value as InboxFilters["candidate_outcome"] || null, ...(event.target.value ? { status: "pending", dismissal_reason: null, show_dismissed: false } : {}) })}><option value="">All suggestions</option>{CANDIDATE_OUTCOME_ORDER.map((outcome) => <option key={outcome} value={outcome}>{outcome === "takedown" ? "Takedown recommended" : CANDIDATE_OUTCOME_LABELS[outcome]} ({facets.candidate_outcomes[outcome] ?? 0})</option>)}</select><span className="text-[11px] font-normal text-stone-400">Suggestions apply to listings awaiting triage.</span></label>
          <label className="monitoring-filter-field">Evidence<select aria-label="Filter by evidence" className="monitoring-filter-input" value={filters.match_basis ?? ""} onChange={(event) => onChange({ match_basis: event.target.value as InboxFilters["match_basis"] || null })}><option value="">Any evidence</option>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {filters.protected_term_id && <button type="button" className="monitoring-filter-option" onClick={() => onChange({ protected_term_id: null })}>Clear term filter</button>}
          <label className="monitoring-filter-field">Assignee<select className="monitoring-filter-input" value={filters.assignee ?? ""} disabled={membersLoading} onChange={(event) => onChange({ assignee: event.target.value || null })}><option value="">Anyone</option><option value="unassigned">Unassigned</option>{filters.assignee && filters.assignee !== "unassigned" && !members.some((member) => member.id === filters.assignee) && <option value={filters.assignee}>Selected member</option>}{members.map((member) => <option key={member.id} value={member.id}>{member.id === currentMemberId ? "Me — " : ""}{member.display_name || member.email || "Unnamed member"}</option>)}</select>{membersError && <span className="text-xs font-normal text-red-600">{membersError}</span>}</label>
          <label className="monitoring-filter-field">Seller<select className="monitoring-filter-input" value={filters.seller ?? ""} onChange={(event) => onChange({ seller: event.target.value || null })}><option value="">All sellers</option>{filters.seller && !facets.sellers.some((seller) => seller.seller_name === filters.seller) && <option value={filters.seller}>{filters.seller}</option>}{facets.sellers.map((seller) => <option key={seller.seller_name} value={seller.seller_name}>{seller.seller_name} ({seller.n})</option>)}</select><span className="text-[11px] font-normal text-stone-400">Top sellers shown. Use search to find others.</span></label>
          {filters.status === "dismissed" && <label className="monitoring-filter-field">Dismissal reason<select className="monitoring-filter-input" value={filters.dismissal_reason ?? ""} onChange={(event) => onChange({ dismissal_reason: event.target.value as InboxFilters["dismissal_reason"] || null })}><option value="">Any reason</option>{Object.entries(DISMISSAL_REASON_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
          <button type="button" className="h-8 w-full rounded-md bg-stone-900 text-xs font-semibold text-white hover:bg-stone-800" onClick={() => close(true)}>Done</button>
        </div>)}
      </div>
      </div>
    </div>
    {chips.length > 0 && <div className="monitoring-active-filters" aria-label="Active filters">
      {chips.map((chip) => <span className="monitoring-filter-chip" key={chip.key}>{chip.edit ? <button type="button" className="truncate" aria-label={`Edit ${chip.label} filter`} onClick={() => { chip.edit?.(); if (chip.key === "search") searchRef.current?.focus(); }} title={chip.label}>{chip.label}</button> : <span className="truncate">{chip.label}</span>}<button type="button" aria-label={`Remove ${chip.label} filter`} onClick={chip.remove}><X size={12} aria-hidden /></button></span>)}
      <button type="button" className="monitoring-clear-filters" onClick={clear}>Clear filters</button>
    </div>}
  </section>;
}
