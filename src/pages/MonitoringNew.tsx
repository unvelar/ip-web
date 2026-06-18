import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  addIpMonitoringPlatform,
  listMonitoredIps,
  listTrademarks,
  type Trademark,
} from "../api";
import { COUNTRIES, countryLabel } from "../lib/countries";
import { KNOWN_PLATFORMS } from "../lib/platforms";

/**
 * Start monitoring a registered IP. Picks an IP not already watched and seeds
 * it with a first platform — that POST creates the monitored-domain link. On
 * success, lands on the Monitoring settings page where the new IP appears.
 */
export default function MonitoringNew() {
  const navigate = useNavigate();
  const [all, setAll] = useState<Trademark[] | null>(null);
  const [monitoredIds, setMonitoredIds] = useState<string[]>([]);
  const [picked, setPicked] = useState("");
  const [platform, setPlatform] = useState("");
  const [pickedCountry, setPickedCountry] = useState("");
  const [busy, setBusy] = useState(false);
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
    const domain = platform.trim();
    if (!picked || !domain || busy) return;
    setBusy(true);
    setErr("");
    try {
      await addIpMonitoringPlatform(picked, domain, pickedCountry || null);
      navigate("/monitoring/settings");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Monitor a new IP</h1>
        <p className="mt-1 text-sm text-stone-500">
          Pick a registered IP and seed it with a first platform to watch.
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

            <Field label="First platform">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {KNOWN_PLATFORMS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlatform(p)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        platform === p
                          ? "bg-stone-900 text-white border-stone-900"
                          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <input
                  list="known-platforms"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void add();
                    }
                  }}
                  placeholder="etsy.com or https://www.etsy.com/search?q=…"
                  className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-sm w-full"
                />
                <datalist id="known-platforms">
                  {KNOWN_PLATFORMS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
            </Field>

            <Field label="Target country (optional)">
              <select
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
                disabled={!picked || !platform.trim() || busy}
                className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 disabled:opacity-50"
              >
                {busy ? "Adding…" : "Start monitoring"}
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
    <label className="block space-y-1">
      <span className="text-[10px] text-stone-400 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
