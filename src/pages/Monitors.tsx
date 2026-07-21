import { useCallback, useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  listMonitoredIps,
  removeIpMonitoring,
  type MonitoredIpSummary,
} from "../api";
import { PlatformsPanel } from "../components/monitoring/PlatformsPanel";

/**
 * Per-IP monitoring management page. Add new monitored IPs, see each IP's
 * watched platforms, link to Audit log.
 */
export default function Monitors() {
  const [ips, setIps] = useState<MonitoredIpSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const { ips } = await listMonitoredIps();
      setIps(ips);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Monitoring</h1>
          <p className="mt-1 text-sm text-stone-500">
            Which intellectual properties are being watched, and on which platforms.
          </p>
        </div>
        <Link
          to="/monitoring/new"
          className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 shrink-0"
        >
          + Monitor a new IP
        </Link>
      </div>

      {err && <div className="text-sm text-red-600">{err}</div>}

      {!loaded ? (
        <div className="text-sm text-stone-400 py-8 text-center">Loading…</div>
      ) : ips.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-stone-600">No IPs are being monitored yet</p>
          <p className="text-xs text-stone-400 mt-1">
            Use{" "}
            <Link to="/monitoring/new" className="text-blue-700 hover:underline">
              “+ Monitor a new IP”
            </Link>{" "}
            to start watching one.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {ips.map((ip) => (
            <MonitoredIpCard key={ip.ip_id} ip={ip} onChanged={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function MonitoredIpCard({
  ip,
  onChanged,
}: {
  ip: MonitoredIpSummary;
  onChanged: () => void;
}) {
  const hasKeywords = (ip.keywords ?? []).length > 0;
  const [removing, setRemoving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [err, setErr] = useState("");
  const detailsId = `monitored-ip-${ip.ip_id}-details`;

  async function stopMonitoring() {
    if (removing) return;
    if (!confirm(`Stop monitoring ${ip.ip_name}? This removes all its watched platforms.`)) return;
    setRemoving(true);
    setErr("");
    try {
      await removeIpMonitoring(ip.ip_id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-2">
          <Link
            to={`/ips/${ip.ip_id}`}
            className="truncate text-sm font-bold text-stone-900 hover:underline"
          >
            {ip.ip_name}
          </Link>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={`${expanded ? "Collapse" : "Manage"} ${ip.ip_name}`}
            title={expanded ? "Collapse" : "Manage"}
            className="shrink-0 rounded-md p-1 text-stone-600 hover:bg-stone-100 hover:text-stone-900"
          >
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div id={detailsId} className="mt-3 space-y-3 border-t border-stone-100 pt-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
            {hasKeywords ? (
              (ip.keywords ?? []).map((k, i) => (
                <span
                  key={`${i}-${k}`}
                  className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px]"
                >
                  {k}
                </span>
              ))
            ) : (
              <span className="text-[11px] text-amber-700">
                No keywords —{" "}
                <Link to={`/ips/${ip.ip_id}`} className="underline">
                  set them on the IP page
                </Link>{" "}
                so the scrape has search terms.
              </span>
            )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                to={`/ips/${ip.ip_id}/audit`}
                className="text-xs text-blue-700 hover:underline"
              >
                Audit log →
              </Link>
              <button
                type="button"
                onClick={stopMonitoring}
                disabled={removing}
                className="text-xs font-semibold text-stone-400 hover:text-red-600 disabled:opacity-50"
                title="Stop monitoring this IP"
              >
                {removing ? "Removing…" : "Stop monitoring"}
              </button>
            </div>
          </div>

          {err && <div className="text-xs text-red-600">{err}</div>}

          <PlatformsPanel
            ipId={ip.ip_id}
            keywords={ip.keywords}
            monitoringFrequency={ip.monitoring_frequency}
            onMonitoringFrequencyChanged={onChanged}
            onPlatformsChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}
