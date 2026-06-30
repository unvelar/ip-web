import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
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
import { KNOWN_PLATFORMS } from "../../lib/platforms";

const FREQUENCY_OPTIONS: { value: MonitoringFrequency; label: string }[] = [
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
  return value === "daily" || value === "weekly" || value === "monthly";
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

  const [platforms, setPlatforms] = useState<MonitoredDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [adding, setAdding] = useState(false);
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
      const web = platforms.find((p) => p.source_type === "web_search");
      const cfg = openWebConfig(web);
      setOpenWebScopes((cfg.search_scopes ?? []).join("\n"));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [ipId]);

  useEffect(() => {
    void loadPlatforms();
  }, [loadPlatforms]);

  async function add() {
    const d = newDomain.trim();
    if (!d || adding) return;
    setAdding(true);
    setErr("");
    try {
      await addIpMonitoringPlatform(ipId, d, newCountry || null);
      setNewDomain("");
      setNewCountry("");
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function changeCountry(p: MonitoredDomain, country: string) {
    try {
      await setIpMonitoringPlatformCountry(ipId, p.id, country || null);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggle(p: MonitoredDomain) {
    try {
      await setIpMonitoringPlatformEnabled(ipId, p.id, !p.enabled);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(p: MonitoredDomain) {
    if (!confirm(`Stop monitoring ${p.display_name || p.domain}?`)) return;
    try {
      await removeIpMonitoringPlatform(ipId, p.id);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function changeFrequency(frequency: MonitoringFrequency) {
    if (savingFrequency || frequency === currentFrequency) return;
    setSavingFrequency(frequency);
    setErr("");
    try {
      const { trademark } = await setIpMonitoringFrequency(ipId, frequency);
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
    try {
      await updateIpOpenWebSearch(ipId, source.id, { enabled: !source.enabled });
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const domainPlatforms = platforms.filter((p) => (p.source_type ?? "domain") === "domain");
  const openWebSource = platforms.find((p) => p.source_type === "web_search") ?? null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Monitoring</label>
          <p className="text-xs text-stone-500 mt-0.5">
            Specific platforms and open-web searches for this IP's keywords.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
            {FREQUENCY_OPTIONS.map((option) => {
              const active = currentFrequency === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => void changeFrequency(option.value)}
                  disabled={savingFrequency !== null}
                  className={`min-w-[4.75rem] whitespace-nowrap px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all disabled:opacity-50 ${
                    active
                      ? "bg-white text-stone-900 shadow-sm"
                      : "text-stone-500 hover:text-stone-900"
                  }`}
                >
                  {savingFrequency === option.value ? "Saving…" : option.label}
                </button>
              );
            })}
          </div>
          <Link
            to={`/ips/${ipId}/audit`}
            className="text-xs text-blue-700 hover:underline"
          >
            Audit log →
          </Link>
          <button
            onClick={refreshNow}
            disabled={refreshing || platforms.length === 0}
            className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
      </div>

      {!hasKeywords && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Add monitoring keywords first — the scrape needs search terms.
        </div>
      )}

      {err && <div className="text-xs text-red-600">{err}</div>}

      <div className="pt-1">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div>
            <h3 className="text-xs font-semibold text-stone-700">Specific platforms</h3>
            <p className="text-[11px] text-stone-400">Direct scans on known domains with per-domain scrape plans.</p>
          </div>
        </div>
      {domainPlatforms.length === 0 ? (
        <div className="text-xs text-stone-400 italic">No platforms yet — add one below.</div>
      ) : (
        <div className="divide-y divide-stone-100 border border-stone-100 rounded-lg">
          {domainPlatforms.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <button
                onClick={() => toggle(p)}
                title={p.enabled ? "Enabled — click to pause" : "Paused — click to enable"}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
                  p.enabled ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500"
                }`}
              >
                {p.enabled ? "On" : "Off"}
              </button>
              <span className="font-mono text-stone-700 flex-1 min-w-0 truncate">{p.domain}</span>
              <select
                value={p.country ?? ""}
                onChange={(e) => void changeCountry(p, e.target.value)}
                title="See the platform as a shopper in this country would"
                className="shrink-0 px-1.5 py-0.5 rounded-md border border-stone-200 bg-white text-[11px] text-stone-600 max-w-[9rem]"
              >
                <option value="">🌐 Anywhere</option>
                {COUNTRIES.map((cn) => (
                  <option key={cn.code} value={cn.code}>
                    {countryLabel(cn.code)}
                  </option>
                ))}
              </select>
              <span className="text-stone-400 shrink-0">
                {p.last_run_at ? `last run ${new Date(p.last_run_at).toLocaleDateString()}` : "never run"}
              </span>
              <button
                onClick={() => void refreshPlatform(p)}
                disabled={refreshing || refreshingPlatformId !== null || !p.enabled || !hasKeywords}
                className="grid size-7 place-items-center rounded-md border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 disabled:opacity-40 disabled:hover:text-stone-500 disabled:hover:border-stone-200 shrink-0"
                title={
                  !hasKeywords
                    ? "Add monitoring keywords before refreshing"
                    : p.enabled
                      ? "Refresh this platform"
                      : "Enable this platform before refreshing"
                }
              >
                <RefreshCw
                  className={`size-3.5 ${refreshingPlatformId === p.id ? "animate-spin" : ""}`}
                  aria-hidden="true"
                />
                <span className="sr-only">Refresh {p.domain}</span>
              </button>
              <button
                onClick={() => remove(p)}
                className="text-stone-400 hover:text-red-600 font-bold shrink-0"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col flex-1 min-w-[12rem]">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Platform URL or domain</span>
          <input
            list="known-platforms"
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
          <datalist id="known-platforms">
            {KNOWN_PLATFORMS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
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
          onClick={add}
          disabled={!newDomain.trim() || adding}
          className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add platform"}
        </button>
      </div>

      <div className="border-t border-stone-100 pt-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xs font-semibold text-stone-700">Open web search</h3>
            <p className="text-[11px] text-stone-400">
              Globally enabled search engines use this IP's keywords automatically, then findings are gated more strictly.
            </p>
          </div>
          {openWebSource && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => void toggleOpenWeb(openWebSource)}
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
            disabled={savingOpenWeb || !hasKeywords}
            className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
          >
            {savingOpenWeb ? "Saving…" : openWebSource ? "Save search" : "Add open web search"}
          </button>
        </div>
      </div>
    </div>
  );
}
