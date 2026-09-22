import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import {
  listIpMonitoringPlatforms,
  addIpMonitoringPlatform,
  setIpMonitoringPlatformEnabled,
  setIpMonitoringPlatformCountry,
  removeIpMonitoringPlatform,
  setIpMonitoringFrequency,
  triggerIpMonitoringRun,
  triggerIpMonitoringPlatformRun,
  upsertIpOpenWebSearch,
  updateIpOpenWebSearch,
  type MonitoringFrequency,
  type MonitoredDomain,
  type OpenWebSearchConfig,
} from "../../api";
import { COUNTRIES, countryLabel } from "../../lib/countries";
import { monitoringPlatformOption } from "../../lib/platforms";
import { MonitoringSources } from "./MonitoringSources";
import type { WebsiteOption } from "../../lib/websiteCatalog";

type ActiveMonitoringFrequency = Exclude<MonitoringFrequency, "off">;

const FREQUENCY_OPTIONS: { value: ActiveMonitoringFrequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const DEFAULT_OPEN_WEB_SCOPES = [
  "*.shop",
  "*.store",
  "*.com",
  "myshopify.com",
];
const DEFAULT_OPEN_WEB_SCOPE_TEXT = DEFAULT_OPEN_WEB_SCOPES.join("\n");

function sameScopes(a: string[], b: string[]) {
  return a.length === b.length && a.every((scope, i) => scope === b[i]);
}

function scopeFromTemplate(template: string) {
  return normalizeScope(
    template.replace(/\s+["']?\{(?:query|keyword)\}["']?/gi, ""),
  );
}

function normalizeScope(scope: string) {
  return scope
    .trim()
    .replace(/^site:/i, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split(/[/?#\s]/, 1)[0]
    .replace(/\/+$/g, "")
    .toLowerCase();
}

function uniqueScopes(scopes: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of scopes) {
    const scope = normalizeScope(raw);
    if (!scope || seen.has(scope)) continue;
    seen.add(scope);
    out.push(scope);
  }
  return out;
}

function openWebConfig(source?: MonitoredDomain | null): OpenWebSearchConfig {
  const raw = source?.source_config ?? {};
  const storedScopes = Array.isArray(raw.search_scopes)
    ? raw.search_scopes
        .filter((s): s is string => typeof s === "string")
        .map(normalizeScope)
        .filter(Boolean)
    : [];
  const legacyTemplateScopes = storedScopes.length === 0 && Array.isArray(raw.query_templates)
    ? raw.query_templates
        .filter((t): t is string => typeof t === "string")
        .map(scopeFromTemplate)
        .filter(Boolean)
    : [];
  const scopes = uniqueScopes(storedScopes.length > 0 ? storedScopes : legacyTemplateScopes);
  const customScopes = scopes.length > 0 && !sameScopes(scopes, DEFAULT_OPEN_WEB_SCOPES)
    ? scopes
    : [];
  return {
    search_scopes: customScopes,
    max_candidates: typeof raw.max_candidates === "number" ? raw.max_candidates : 200,
    per_query_limit: typeof raw.per_query_limit === "number" ? raw.per_query_limit : 30,
    strict_gate: true,
  };
}

function isMonitoringFrequency(value: unknown): value is MonitoringFrequency {
  return value === "off" || FREQUENCY_OPTIONS.some((option) => option.value === value);
}

function platformLabel(platform: MonitoredDomain) {
  const displayUrl = platform.source_config?.display_url;
  if (typeof displayUrl === "string" && displayUrl.trim()) return displayUrl.trim();
  return platform.display_name || platform.domain;
}

/**
 * The watched-platforms panel for a single IP: list domains (with
 * enable/disable + remove), an add-platform input, and "Refresh now".
 * Keywords come from the IP itself — with none, the scrape has nothing to
 * search for, so we surface a hint.
 *
 * Extracted from RegistryDetail's MonitoringSection so the per-IP page and
 * the tenant-wide /monitors hub render the exact same UI (DRY). Optional
 * callbacks let the host re-fetch its findings after a run / change.
 */
export function PlatformsPanel({
  ipId,
  keywords,
  monitoringFrequency,
  onRunTriggered,
  onPlatformsChanged,
  onMonitoringFrequencyChanged,
}: {
  ipId: string;
  /** The IP's monitoring keywords — used only to gate the "add terms" hint. */
  keywords: string[] | null;
  /** The IP's scheduled scan cadence. */
  monitoringFrequency?: MonitoringFrequency | string | null;
  /** Fired after "Refresh now" enqueues a run (host can poll findings). */
  onRunTriggered?: () => void;
  /** Fired after platforms are added/removed/toggled. */
  onPlatformsChanged?: () => void;
  /** Fired after the scheduled scan cadence changes. */
  onMonitoringFrequencyChanged?: (frequency: MonitoringFrequency) => void;
}) {
  const hasKeywords = (keywords ?? []).length > 0;
  const currentFrequency = isMonitoringFrequency(monitoringFrequency) ? monitoringFrequency : "weekly";

  const monitoringOn = currentFrequency !== "off";
  const [lastActiveFrequency, setLastActiveFrequency] = useState<{
    ipId: string;
    frequency: ActiveMonitoringFrequency;
  }>({ ipId, frequency: monitoringOn ? currentFrequency : "weekly" });
  const resumeFrequency = lastActiveFrequency.ipId === ipId ? lastActiveFrequency.frequency : "weekly";

  const [platforms, setPlatforms] = useState<MonitoredDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [adding, setAdding] = useState(false);
  const [sourceBusy, setSourceBusy] = useState<string | null>(null);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [platformsReady, setPlatformsReady] = useState(false);
  const [openWebScopes, setOpenWebScopes] = useState("");
  const [savingOpenWeb, setSavingOpenWeb] = useState(false);
  const [savingFrequency, setSavingFrequency] = useState<MonitoringFrequency | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingPlatformId, setRefreshingPlatformId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const loadPlatforms = useCallback(async () => {
    try {
      const { platforms } = await listIpMonitoringPlatforms(ipId);
      setPlatforms(platforms);
      setPlatformsReady(true);
      const web = platforms.find((p) => p.source_type === "web_search");
      const cfg = openWebConfig(web);
      setOpenWebScopes((cfg.search_scopes ?? []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPlatforms(false);
    }
  }, [ipId]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  useEffect(() => {
    if (platforms.length === 0) return;
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith("monitoring-source-")) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [platforms]);

  async function add(source?: WebsiteOption) {
    const d = source?.value ?? newDomain.trim();
    if (!d || adding || sourceBusy || !platformsReady) return;
    setSourceBusy(source?.key ?? "custom");
    setAdding(true);
    setErr("");
    try {
      await addIpMonitoringPlatform(
        ipId,
        d,
        source ? null : newCountry || null,
        source?.search_url_template ?? monitoringPlatformOption(d)?.searchUrlTemplate,
      );
      setNewDomain("");
      setNewCountry("");
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
      setSourceBusy(null);
    }
  }

  async function changeCountry(p: MonitoredDomain, country: string) {
    if (sourceBusy) return;
    setSourceBusy(p.id);
    setErr("");
    try {
      await setIpMonitoringPlatformCountry(ipId, p.id, country || null);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceBusy(null);
    }
  }

  async function toggle(p: MonitoredDomain) {
    if (sourceBusy) return;
    setSourceBusy(p.id);
    setErr("");
    try {
      await setIpMonitoringPlatformEnabled(ipId, p.id, !p.enabled);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceBusy(null);
    }
  }

  async function remove(p: MonitoredDomain) {
    if (!confirm(`Stop monitoring ${platformLabel(p)}?`)) return;
    if (sourceBusy) return;
    setSourceBusy(p.id);
    setErr("");
    try {
      await removeIpMonitoringPlatform(ipId, p.id);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSourceBusy(null);
    }
  }

  async function changeFrequency(frequency: MonitoringFrequency) {
    if (savingFrequency || frequency === currentFrequency) return;
    setSavingFrequency(frequency);
    setErr("");
    try {
      const { trademark } = await setIpMonitoringFrequency(ipId, frequency);
      if (trademark.monitoring_frequency !== frequency) {
        throw new Error("The server did not save the monitoring frequency. Please try again.");
      }
      if (frequency !== "off") {
        setLastActiveFrequency({ ipId, frequency });
      } else if (currentFrequency !== "off") {
        setLastActiveFrequency({ ipId, frequency: currentFrequency });
      }
      onMonitoringFrequencyChanged?.(trademark.monitoring_frequency);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingFrequency(null);
    }
  }

  async function refreshNow() {
    if (refreshing) return;
    setRefreshing(true);
    setErr("");
    try {
      await triggerIpMonitoringRun(ipId);
      await loadPlatforms();
      onRunTriggered?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshPlatform(p: MonitoredDomain) {
    if (refreshingPlatformId || refreshing || !p.enabled || !hasKeywords) return;
    setRefreshingPlatformId(p.id);
    setErr("");
    try {
      await triggerIpMonitoringPlatformRun(ipId, p.id);
      await loadPlatforms();
      onRunTriggered?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingPlatformId(null);
    }
  }

  async function saveOpenWeb() {
    if (savingOpenWeb) return;
    const scopes = uniqueScopes(openWebScopes.split(/\r?\n/));
    setSavingOpenWeb(true);
    setErr("");
    try {
      const config = {
        search_scopes: scopes,
        max_candidates: 200,
        per_query_limit: 30,
        strict_gate: true,
      };
      const existing = platforms.find((p) => p.source_type === "web_search");
      if (existing) {
        await updateIpOpenWebSearch(ipId, existing.id, { enabled: true, config });
      } else {
        await upsertIpOpenWebSearch(ipId, config);
      }
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOpenWeb(false);
    }
  }

  async function toggleOpenWeb(source: MonitoredDomain) {
    if (savingOpenWeb) return;
    setSavingOpenWeb(true);
    try {
      await updateIpOpenWebSearch(ipId, source.id, { enabled: !source.enabled });
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingOpenWeb(false);
    }
  }

  const openWebSource = platforms.find(p => p.source_type === "web_search") ?? null;
  const savedScopes = openWebConfig(openWebSource).search_scopes ?? [];
  const effectiveScopes = openWebSource ? (savedScopes.length ? savedScopes : DEFAULT_OPEN_WEB_SCOPES) : [];
  const busy = sourceBusy ?? refreshingPlatformId ?? (refreshing ? "all" : savingOpenWeb ? openWebSource?.id ?? "open-web" : null);

  return (
    <section className="monitoring-sources-panel" aria-label="Monitoring source settings">
      <div className="ms-header">
        <div className="ms-heading"><h3>Monitoring sources</h3><p>Choose where we look for your IP.</p></div>
        <div className="ms-header-actions">
          <Link to={`/ips/${ipId}/audit`} className="ms-audit">History<ArrowUpRight size={12} aria-hidden="true" /></Link>
          <button type="button" className="ms-run-all" onClick={() => void refreshNow()} disabled={!!busy || platforms.length === 0 || !hasKeywords}>
            <RefreshCw size={13} className={refreshing ? "ms-spin" : ""} aria-hidden="true" />{refreshing ? "Starting…" : "Run now"}
          </button>
        </div>
      </div>
      <div className="ms-schedule" role="group" aria-label="Automatic monitoring">
        <div className="ms-schedule-label"><span className="ms-live-dot" data-on={monitoringOn} /><span>Automatic monitoring</span></div>
        <div className="ms-schedule-controls">
          {monitoringOn && <select aria-label="Monitoring frequency" value={currentFrequency} disabled={savingFrequency !== null}
            onChange={event => {
              const frequency = event.target.value;
              if (isMonitoringFrequency(frequency) && frequency !== "off") void changeFrequency(frequency);
            }}>{FREQUENCY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>}
          <span className="ms-schedule-status">{savingFrequency !== null ? "Saving…" : monitoringOn ? "On" : "Off"}</span>
          <button type="button" role="switch" aria-label="Automatic monitoring" aria-checked={monitoringOn}
            disabled={savingFrequency !== null} className="ms-toggle" onClick={() => void changeFrequency(monitoringOn ? "off" : resumeFrequency)}><span /></button>
        </div>
      </div>
      {!hasKeywords && <div className="ms-message">Add monitoring keywords above to start searching.</div>}
      {err && <div role="alert" className="ms-message ms-error">{err}
        {!platformsReady && <button type="button" onClick={() => void loadPlatforms()}>Retry</button>}</div>}
      <MonitoringSources key={ipId} platforms={platforms} patterns={effectiveScopes} monitoringOn={monitoringOn}
        hasKeywords={hasKeywords && platformsReady} busy={busy} loading={loadingPlatforms}
        onAdd={source => void add(source)} onToggle={platform => void toggle(platform)}
        onRemove={platform => void remove(platform)} onRefresh={platform => void refreshPlatform(platform)}
        onCountryChange={(platform, country) => void changeCountry(platform, country)}
        onPreparePattern={pattern => setOpenWebScopes(current => uniqueScopes([
          ...(current.trim() ? current.split(/\r?\n/) : DEFAULT_OPEN_WEB_SCOPES), pattern,
        ]).join("\n"))}
        renderCustomSource={() => (
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col flex-1 min-w-[12rem]">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Platform URL or domain</span>
          <input
            aria-label="Platform URL or domain"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            placeholder="etsy.com or https://www.etsy.com/search?q=…"
            className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-full"
          />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Target country (optional)</span>
          <select
            value={newCountry}
            onChange={(e) => setNewCountry(e.target.value)}
            title="See the platform as a shopper in this country would"
            className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs bg-white text-stone-700 min-w-[10rem]"
          >
            <option value="">🌐 Anywhere</option>
            {COUNTRIES.map((cn) => (
              <option key={cn.code} value={cn.code}>
                {countryLabel(cn.code)}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => void add()}
          disabled={!newDomain.trim() || adding || !platformsReady}
          className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add platform"}
        </button>
      </div>

        )}
        renderOpenWeb={() => (
      <div className="ms-web-editor space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xs font-semibold text-stone-700">Open web search</h3>
            <p className="text-[11px] text-stone-400">
              Use your IP’s keywords to search across the web.
            </p>
          </div>
          {openWebSource && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void toggleOpenWeb(openWebSource)}
                disabled={savingOpenWeb}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  openWebSource.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}
              >
                {openWebSource.enabled ? "On" : "Off"}
              </button>
              <button
                onClick={() => void refreshPlatform(openWebSource)}
                disabled={refreshing || refreshingPlatformId !== null || !openWebSource.enabled || !hasKeywords}
                className="grid size-7 place-items-center rounded-md border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 disabled:opacity-40"
                title={openWebSource.enabled ? "Refresh open web search" : "Enable open web search before refreshing"}
              >
                <RefreshCw
                  className={`size-3.5 ${refreshingPlatformId === openWebSource.id ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span className="sr-only">Refresh open web search</span>
              </button>
            </div>
          )}
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Domain patterns (optional)</span>
          <textarea
            id={`open-web-patterns-${ipId}`}
            value={openWebScopes}
            onChange={(e) => setOpenWebScopes(e.target.value)}
            rows={4}
            placeholder={DEFAULT_OPEN_WEB_SCOPE_TEXT}
            className="px-2.5 py-2 rounded-lg border border-stone-200 text-xs w-full font-mono placeholder:text-stone-300"
          />
        </label>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-[11px] text-stone-400 flex items-center gap-1.5">
            <Search className="size-3.5" aria-hidden="true" />
            <span>{openWebScopes.trim() ? "Custom domain patterns are combined with this IP's keywords." : "Blank uses default shopping domain patterns with this IP's keywords."}</span>
          </div>
          <button
            onClick={() => void saveOpenWeb()}
            disabled={savingOpenWeb || !hasKeywords || !platformsReady}
            className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
          >
            {savingOpenWeb ? "Saving…" : openWebSource ? "Save search" : "Add open web search"}
          </button>
        </div>
      </div>
        )}
      />
    </section>
  );
}
