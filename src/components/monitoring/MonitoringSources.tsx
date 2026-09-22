import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDownUp, Check, ChevronDown, Globe2, LoaderCircle, Pause, Plus, RefreshCw, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { MonitoredDomain } from "../../api";
import { getWebsiteCatalog, type WebsiteCatalog as Catalog } from "../../api/websiteCatalog";
import { COUNTRIES, countryLabel } from "../../lib/countries";
import { websiteHost, websiteOptions, type WebsiteOption } from "../../lib/websiteCatalog";
import { sourceSetupPresentation } from "./platformSetupStatus";
import "./MonitoringSources.css";

interface Props {
  platforms: MonitoredDomain[];
  patterns: string[];
  monitoringOn: boolean;
  hasKeywords: boolean;
  busy: string | null;
  loading: boolean;
  onAdd: (source: WebsiteOption) => void;
  onToggle: (platform: MonitoredDomain) => void;
  onRemove: (platform: MonitoredDomain) => void;
  onRefresh: (platform: MonitoredDomain) => void;
  onCountryChange: (platform: MonitoredDomain, country: string) => void;
  onPreparePattern: (pattern: string) => void;
  renderOpenWeb: () => ReactNode;
  renderCustomSource: () => ReactNode;
}

export function MonitoringSources({ platforms, patterns, monitoringOn, hasKeywords, busy, loading,
  onAdd, onToggle, onRemove, onRefresh, onCountryChange, onPreparePattern, renderOpenWeb, renderCustomSource }: Props) {
  const id = useId();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const sourceButtons = useRef(new Map<string, HTMLButtonElement>());
  const customButton = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getWebsiteCatalog(controller.signal).then(data => {
      if (!controller.signal.aborted) setCatalog(data);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, [attempt]);

  const options = useMemo(() => {
    const options = websiteOptions(catalog?.websites ?? null, patterns);
    // Keep every configured monitor manageable even when the catalog is loading
    // or unavailable. Saved configuration must never disappear behind discovery.
    for (const platform of platforms.filter(p => p.source_type !== "web_search")) {
      const domain = websiteHost(platform.domain);
      if (!options.some(option => option.kind === "domain" && option.domain === domain)) {
        options.push({ key: `domain:${domain}`, kind: "domain", domain, value: domain,
          name: platform.display_name || domain, search_url_template: null, activity: null });
      }
    }
    return options;
  }, [catalog, platforms, patterns]);
  const allBrands = catalog?.scope === "all_brands";
  const openWeb = platforms.find(p => p.source_type === "web_search");
  function configured(option: WebsiteOption) {
    if (option.kind === "domain") return platforms.find(p => p.source_type !== "web_search" && websiteHost(p.domain) === option.domain);
    if (option.kind === "search") return openWeb;
    return patterns.some(pattern => pattern.replace(/^\*\./, "") === option.value.replace(/^\*\./, "")) ? openWeb : undefined;
  }
  const addedCount = options.filter(option => configured(option)).length;
  const needle = query.trim().toLowerCase();
  const visible = options.filter(option => {
    if (needle && !`${option.name} ${option.value}`.toLowerCase().includes(needle)) return false;
    const added = !!configured(option);
    return filter === "added" ? added : filter === "available" ? !added : true;
  }).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "recommended") {
      const added = Number(!!configured(b)) - Number(!!configured(a));
      if (added) return added;
    }
    const count = (option: WebsiteOption) => sort === "monitored"
      ? (allBrands ? option.activity?.other_brands : option.activity?.monitored_ips) ?? 0
      : option.activity?.findings ?? 0;
    return count(b) - count(a) || a.name.localeCompare(b.name);
  });

  useEffect(() => {
    const key = pendingFocus.current;
    if (!key || busy) return;
    const source = options.find(option => option.key === key);
    if (source && platforms.some(platform => platform.source_type !== "web_search" && websiteHost(platform.domain) === source.domain)) {
      sourceButtons.current.get(key)?.focus();
    }
    pendingFocus.current = null;
  }, [platforms, options, busy]);

  function showDetails(option: WebsiteOption, prepare = false) {
    if (prepare && option.kind === "pattern") onPreparePattern(option.value);
    setExpanded(current => current === option.key && !prepare ? null : option.key);
  }

  return (
    <div className="ms-browser" onKeyDown={event => {
      if (event.key !== "Escape") return;
      if (expanded) {
        event.stopPropagation();
        setExpanded(null);
        sourceButtons.current.get(expanded)?.focus();
      } else if (customOpen) {
        event.stopPropagation();
        setCustomOpen(false);
        customButton.current?.focus();
      }
    }}>
      <div className="ms-toolbar">
        <div className="ms-segments" role="group" aria-label="Filter monitoring sources">
          {[
            ["all", "All sources", options.length], ["added", "Added", addedCount], ["available", "Available", options.length - addedCount],
          ].map(([value, label, count]) => <button type="button" key={value} aria-pressed={filter === value}
            onClick={() => setFilter(String(value))}>{label}<span>{count}</span></button>)}
        </div>
        <label className="ms-sort"><ArrowDownUp size={13} aria-hidden="true" />
          <select aria-label="Sort monitoring sources" value={sort} onChange={e => setSort(e.target.value)}>
            <option value="recommended">Recommended</option><option value="findings">Most findings</option>
            <option value="monitored">Most monitored</option><option value="name">Name A–Z</option>
          </select>
        </label>
      </div>
      <div className="ms-search">
        <Search size={16} aria-hidden="true" />
        <input aria-label="Search monitoring sources" type="search" placeholder="Find a marketplace, search engine, or pattern…"
          value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button type="button" aria-label="Clear source search" onClick={() => setQuery("")}><X size={14} /></button>}
      </div>
      {error && <div className="ms-message" role="status">Source activity is unavailable. Your added sources are still here.
        <button type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>Retry</button></div>}
      {loading && <div className="ms-message" role="status"><LoaderCircle size={14} className="ms-spin" />Loading your monitoring settings…</div>}
      <ul className="ms-list" aria-label="Monitoring sources" aria-busy={loading}>
        {visible.map((option, index) => {
          const platform = configured(option);
          const added = !!platform;
          const running = added && platform.enabled && monitoringOn;
          const setup = platform && option.kind === "domain" && running
            ? sourceSetupPresentation(platform.setup_status ?? (platform.recipe ? "ready" : "processing")) : null;
          const status = !added ? "Available" : !running ? "Paused" : option.kind === "search" ? "Via web search"
            : setup?.tone === "attention" ? "Retry needed" : setup?.tone === "processing" ? "Preparing" : "Active";
          const tone = !running ? "quiet" : setup?.tone === "attention" ? "attention" : setup?.tone === "processing" ? "preparing" : "active";
          const isExpanded = expanded === option.key;
          const rowBusy = busy === option.key || (platform && busy === platform.id);
          const activity = option.activity;
          const previousAdded = index > 0 && !!configured(visible[index - 1]);
          const divider = sort === "recommended" && filter === "all" && !needle && !added && previousAdded;
          const detailId = `${id}-source-${index}`;
          return <li key={option.key} className="ms-source" data-expanded={isExpanded} data-divider={divider || undefined}
            id={platform && option.kind === "domain" ? `monitoring-source-${platform.id}` : undefined}>
            {divider && <div className="ms-divider-label">Add more coverage</div>}
            <div className="ms-source-row">
              <button type="button" className="ms-source-info" aria-label={`Settings for ${option.name}`}
                aria-expanded={isExpanded} aria-controls={detailId}
                ref={button => { if (button) sourceButtons.current.set(option.key, button); else sourceButtons.current.delete(option.key); }}
                onClick={() => showDetails(option)}>
                <span className="ms-source-avatar" data-kind={option.kind} aria-hidden="true">
                  {option.kind === "search" ? <Search size={17} /> : option.kind === "pattern" ? <Globe2 size={18} /> : option.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="ms-source-copy"><span className="ms-source-name">{option.name}</span>
                  <span className="ms-source-caption">{option.kind === "search" ? "Search engine" : option.name === option.value ? option.kind === "pattern" ? "Domain pattern" : "Website" : option.value}</span></span>
              </button>
              <div className="ms-source-activity" title={allBrands ? "Findings across all brands" : "Findings in this workspace"}>
                {activity?.findings != null && activity.findings > 0 && <span><strong>{activity.findings.toLocaleString()}</strong> {activity.findings === 1 ? "finding" : "findings"}</span>}
              </div>
              <div className="ms-source-actions">
                {rowBusy ? <span className="ms-state" role="status"><LoaderCircle size={13} className="ms-spin" />Updating…</span>
                  : added ? <span className="ms-state" data-tone={tone}><i aria-hidden="true" />{status}</span>
                    : <button className="ms-add" type="button" disabled={!!busy || loading || !hasKeywords}
                        aria-label={`Add ${option.name}`} onClick={() => {
                          if (option.kind === "domain") { pendingFocus.current = option.key; onAdd(option); }
                          else showDetails(option, true);
                        }}><Plus size={13} aria-hidden="true" />Add</button>}
                <button type="button" className="ms-expand" aria-label={`${isExpanded ? "Close" : "Open"} settings for ${option.name}`}
                  aria-expanded={isExpanded} aria-controls={detailId} onClick={() => showDetails(option)}>
                  <ChevronDown size={15} aria-hidden="true" /></button>
              </div>
            </div>
            {isExpanded && <div id={detailId} className="ms-source-details">
              <div className="ms-detail-context">
                <span>{option.kind === "domain" ? "Marketplace monitoring" : option.kind === "search" ? "Included in web search" : "Search across matching websites"}</span>
                {activity && <span>{activity.findings == null ? "Activity not available" : `${activity.findings.toLocaleString()} ${activity.findings === 1 ? "finding" : "findings"}`}
                  {(allBrands ? activity.other_brands : activity.monitored_ips) != null && ` · ${allBrands ? `${activity.other_brands} other ${activity.other_brands === 1 ? "brand" : "brands"}` : `${activity.monitored_ips} monitored ${activity.monitored_ips === 1 ? "IP" : "IPs"}`}`}</span>}
              </div>
              {option.kind === "domain" ? <>
                {setup?.tone !== "ready" && setup && <p className="ms-detail-note" data-tone={setup.tone}>{setup.detail}</p>}
                {platform ? <>
                  {!monitoringOn && platform.enabled && <p className="ms-detail-note">Automatic monitoring is off. Turn it on above to resume scheduled scans.</p>}
                  <div className="ms-detail-controls">
                    <label>Search from<select aria-label={`Target country for ${option.name}`} value={platform.country ?? ""}
                      disabled={!!busy} onChange={e => onCountryChange(platform, e.target.value)}>
                      <option value="">Anywhere</option>{COUNTRIES.map(country => <option key={country.code} value={country.code}>{countryLabel(country.code)}</option>)}
                    </select></label>
                    <span className="ms-last-run">{platform.last_run_at ? `Last run ${new Date(platform.last_run_at).toLocaleDateString()}` : "Not scanned yet"}</span>
                    <div className="ms-detail-buttons">
                      <button type="button" disabled={!!busy} onClick={() => onToggle(platform)}>
                        {platform.enabled ? <Pause size={13} /> : <Check size={13} />}{platform.enabled ? "Pause" : "Resume"}</button>
                      <button type="button" disabled={!!busy || !platform.enabled || !hasKeywords} onClick={() => onRefresh(platform)}><RefreshCw size={13} />Run now</button>
                      <button type="button" className="ms-remove" disabled={!!busy} aria-label={`Remove ${option.name}`} onClick={() => onRemove(platform)}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </> : <p className="ms-detail-note">Add this source to start monitoring with your IP’s keywords. You can choose a target country after adding it.</p>}
              </> : <>
                <p className="ms-detail-note">{option.kind === "search" ? "Search engines share your web search settings. Available engines run together." : "This pattern is searched through your enabled search engines."}</p>
                {renderOpenWeb()}
              </>}
            </div>}
          </li>;
        })}
      </ul>
      {visible.length === 0 && <div className="ms-empty"><Search size={22} aria-hidden="true" />
        <strong>{query ? "No matching sources" : filter === "added" ? "Your coverage starts here" : "No sources in this view"}</strong>
        <p>{query ? "Try another name, or add a custom source below." : "Choose All sources to find a source to monitor."}</p>
        {query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}</div>}
      <div className="ms-footer">
        <button type="button" ref={customButton} className="ms-custom-trigger" aria-expanded={customOpen} aria-controls={`${id}-custom`} onClick={() => setCustomOpen(!customOpen)}>
          <Plus size={14} aria-hidden="true" />Add a custom source<ChevronDown size={13} aria-hidden="true" /></button>
        <span title="Findings are potential matches, not confirmed infringements. Search-engine and domain-pattern counts may overlap.">
          {catalog ? (allBrands ? "Activity across brands" : "Workspace activity") : error ? "Activity unavailable" : "Loading activity…"}
        </span>
      </div>
      {customOpen && <div id={`${id}-custom`} className="ms-custom-panel"><div className="ms-detail-context"><SlidersHorizontal size={13} />Custom website or search URL</div>{renderCustomSource()}</div>}
    </div>
  );
}
