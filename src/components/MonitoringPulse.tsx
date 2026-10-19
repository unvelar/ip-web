import { monitoringNextLabel, type MonitoringPulse as Pulse } from "../lib/monitoringPulse";

export default function MonitoringPulse({ pulse, error }: { pulse: Pulse | null; error: boolean }) {
  const live = pulse?.state === "live";
  const label = error ? "Status unavailable" : !pulse ? "Checking monitoring…" : monitoringNextLabel(pulse);
  const latest = pulse?.latestRun;
  const title = [
    label,
    pulse?.nextAt ? `Next eligible scan: ${new Date(pulse.nextAt).toLocaleString()}. Execution depends on worker availability.` : null,
    latest ? `${latest.newListings.toLocaleString()} new listings added by the last completed job (${new Date(latest.completedAt).toLocaleString()}).` : "No completed monitoring job yet.",
  ].filter(Boolean).join("\n");

  return <div className="shell-monitoring-pulse" data-live={live} title={title} aria-label={title} role="status">
    <span className="shell-monitoring-live"><span className="shell-monitoring-dot" aria-hidden />{live ? "Live" : pulse?.state === "paused" ? "Paused" : error ? "Unavailable" : "Monitoring"}</span>
    <span className="shell-monitoring-separator" aria-hidden>·</span>
    <span className="shell-monitoring-next">{label}</span>
    {pulse && <><span className="shell-monitoring-separator" aria-hidden>·</span>
      <span className="shell-monitoring-last">{latest ? <><strong>{latest.newListings.toLocaleString()}</strong> new last scan</> : "Awaiting first scan"}</span></>}
  </div>;
}
