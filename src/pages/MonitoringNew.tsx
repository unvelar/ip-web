import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addIpMonitoringPlatform,
  listMonitoredIps,
  listTrademarks,
  type Trademark,
} from "../api";
import { PlatformSelector } from "../components/monitoring/PlatformSelector";
import { COUNTRIES, countryLabel } from "../lib/countries";

/**
 * Start monitoring a registered IP. Picks an IP not already watched and seeds
 * it with one or more selected platforms. Adding the first platform creates
 * the monitored-domain link. On success, lands on Monitoring settings.
 */
export default function MonitoringNew() {
  const navigate = useNavigate();
  const [all, setAll] = useState<Trademark[] | null>(null);
  const [monitoredIds, setMonitoredIds] = useState<string[]>([]);
  const [picked, setPicked] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [pickedCountry, setPickedCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([listTrademarks(), listMonitoredIps()])
      .then(([{ trademarks }, { ips }]) => {
        if (!alive) return;
        setAll(trademarks);
        setMonitoredIds(ips.map((i) => i.ip_id));
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, []);

  const available = useMemo(
    () => (all ?? []).filter((t) => !monitoredIds.includes(t.id)),
    [all, monitoredIds],
  );

  async function add() {
    if (!picked || platforms.length === 0 || busy) return;
    setBusy(true);
    setCompleted(0);
    setErr("");

    const failures: { source: string; error: string }[] = [];
    let nextIndex = 0;
    const workers = Array.from(
      { length: Math.min(4, platforms.length) },
      async () => {
        while (nextIndex < platforms.length) {
          const source = platforms[nextIndex++];
          try {
            await addIpMonitoringPlatform(picked, source, pickedCountry || null);
          } catch (e) {
            failures.push({ source, error: e instanceof Error ? e.message : String(e) });
          } finally {
            setCompleted((current) => current + 1);
          }
        }
      },
    );
    await Promise.all(workers);

    if (failures.length === 0) {
      navigate("/monitoring/settings");
      return;
    }

    const failedSources = failures.map((failure) => failure.source);
    const addedCount = platforms.length - failedSources.length;
    setPlatforms(failedSources);
    setErr(
      `${addedCount > 0 ? `Added ${addedCount} source${addedCount === 1 ? "" : "s"}. ` : ""}` +
      `Could not add ${failures.map((failure) => `${failure.source}: ${failure.error}`).join("; ")}`,
    );
    setBusy(false);
    setCompleted(0);
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Monitor a new IP</h1>
        <p className="mt-1 text-sm text-stone-500">
          Pick a registered IP and choose the sources you want to watch.
        </p>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      <div className="rounded-2xl border border-stone-200 bg-white px-5 py-5 space-y-4">
        {all === null ? (
          <div className="text-sm text-stone-400 italic">Loading IPs…</div>
        ) : available.length === 0 ? (
          <div className="text-sm text-stone-400 italic">
            All your IPs are already monitored.{" "}
            <Link to="/ips" className="text-blue-700 hover:underline">
              Register a new IP →
            </Link>
          </div>
        ) : (
          <>
            <Field label="IP">
              <select
                aria-label="IP"
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-sm bg-white text-stone-700 w-full"
              >
                <option value="">Select an IP…</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sources">
              <PlatformSelector value={platforms} onChange={setPlatforms} disabled={busy} />
            </Field>

            <Field label="Target country for selected sources (optional)">
              <select
                aria-label="Target country for selected sources"
                value={pickedCountry}
                onChange={(e) => setPickedCountry(e.target.value)}
                title="See the platform as a shopper in this country would — optional"
                className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-sm bg-white text-stone-700 w-full"
              >
                <option value="">🌐 Anywhere</option>
                {COUNTRIES.map((cn) => (
                  <option key={cn.code} value={cn.code}>
                    {countryLabel(cn.code)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={add}
                disabled={!picked || platforms.length === 0 || busy}
                className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-50"
              >
                {busy
                  ? `Adding ${completed} of ${platforms.length}…`
                  : `Start monitoring${platforms.length > 0 ? ` ${platforms.length} source${platforms.length === 1 ? "" : "s"}` : ""}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] text-stone-400 uppercase tracking-wide">{label}</span>
      {children}
    </div>
  );
}
