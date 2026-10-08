import { useEffect, useState } from "react";
import { getMonitoringSettings, getTrademark, listIpMonitoringPlatforms, listMonitoringRuns } from "../api";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import { summarizeMonitoringPulse, type MonitoringPulse } from "../lib/monitoringPulse";

const POLL_MS = 60_000;

export function useMonitoringPulse() {
  const { actingTenantId } = useAuth();
  const { activeIpId, loading } = useActiveIp();
  const scope = !loading && actingTenantId && activeIpId ? `${actingTenantId}:${activeIpId}` : null;
  const [snapshot, setSnapshot] = useState<{ scope: string; pulse: MonitoringPulse | null; error: boolean } | null>(null);

  useEffect(() => {
    if (!scope || !activeIpId) return;
    let stopped = false;
    let inFlight = false;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (stopped || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      controller = new AbortController();
      const { signal } = controller;
      try {
        const [{ trademark }, { platforms }, { settings }] = await Promise.all([
          getTrademark(activeIpId, signal),
          listIpMonitoringPlatforms(activeIpId, signal),
          getMonitoringSettings(signal),
        ]);
        // Read each source separately so another brand's busy feed cannot
        // crowd this scope's last completed job out of a tenant-wide page.
        const pages = await Promise.all(platforms.map(source => listMonitoringRuns({ domain_id: source.id, limit: 100 }, signal)));
        if (stopped || signal.aborted) return;
        const pulse = summarizeMonitoringPulse(settings?.monitoring_enabled ?? false, trademark.monitoring_frequency, platforms, pages.flatMap(page => page.runs));
        setSnapshot({ scope, pulse, error: false });
      } catch {
        if (!stopped && !signal.aborted) setSnapshot({ scope, pulse: null, error: true });
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scope, activeIpId]);

  return { visible: Boolean(scope), pulse: snapshot?.scope === scope ? snapshot.pulse : null, error: snapshot?.scope === scope && snapshot.error };
}
