import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
  listIpMonitoringPlatforms,
  addIpMonitoringPlatform,
  setIpMonitoringPlatformEnabled,
  setIpMonitoringPlatformCountry,
  removeIpMonitoringPlatform,
  triggerIpMonitoringRun,
  triggerIpMonitoringPlatformRun,
  type MonitoredDomain,
} from "../../api";
import { COUNTRIES, countryLabel } from "../../lib/countries";
import { KNOWN_PLATFORMS } from "../../lib/platforms";

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
  onRunTriggered,
  onPlatformsChanged,
}: {
  ipId: string;
  /** The IP's monitoring keywords — used only to gate the "add terms" hint. */
  keywords: string[] | null;
  /** Fired after "Refresh now" enqueues a run (host can poll findings). */
  onRunTriggered?: () => void;
  /** Fired after platforms are added/removed/toggled. */
  onPlatformsChanged?: () => void;
}) {
  const hasKeywords = (keywords ?? []).length > 0;

  const [platforms, setPlatforms] = useState<MonitoredDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newCountry, setNewCountry] = useState("");
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingPlatformId, setRefreshingPlatformId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const loadPlatforms = useCallback(async () => {
    try {
      const { platforms } = await listIpMonitoringPlatforms(ipId);
      setPlatforms(platforms);
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
    if (!confirm(`Stop monitoring ${p.domain}?`)) return;
    try {
      await removeIpMonitoringPlatform(ipId, p.id);
      await loadPlatforms();
      onPlatformsChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
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

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Monitoring</label>
          <p className="text-xs text-stone-500 mt-0.5">
            Watched platforms scraped for this IP's keywords. Findings appear below.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
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

      {platforms.length === 0 ? (
        <div className="text-xs text-stone-400 italic">No platforms yet — add one below.</div>
      ) : (
        <div className="divide-y divide-stone-100 border border-stone-100 rounded-lg">
          {platforms.map((p) => (
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
    </div>
  );
}
