import { useEffect, useState } from "react";
import { getMonitoringSettings, updateMonitoringSettings, type MonitoringSettings } from "../api";

// Tenant-global monitoring scheduler gate. Per-IP cadence lives with each
// IP's monitoring settings.
export default function TenantMonitoringSettings() {
  const [settings, setSettings] = useState<MonitoringSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getMonitoringSettings()
      .then(({ settings }) => alive && setSettings(settings))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => { alive = false; };
  }, []);

  async function setEnabled(enabled: boolean) {
    try {
      const r = await updateMonitoringSettings({ enabled });
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-black text-stone-900 tracking-tight">Monitoring schedule</h2>
        <p className="mt-1 text-sm text-stone-500">
          Pause or resume scheduled monitoring for this tenant.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-stone-900">Scheduled runs</div>
            <div className="text-xs text-stone-500">
              {settings?.monitoring_enabled
                ? "Enabled — runs fire on schedule."
                : "Disabled — runs only fire when triggered manually from an IP."}
            </div>
          </div>
          <button
            disabled={!settings}
            onClick={() => setEnabled(!settings?.monitoring_enabled)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 ${
              settings?.monitoring_enabled
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {settings?.monitoring_enabled ? "On" : "Off"}
          </button>
        </div>
      </div>
    </section>
  );
}

