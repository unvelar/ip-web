import type { TenantMonitoringSummary } from "../../api/tenantMonitoring";

export function TenantMonitoringStats({ summary, loading }: {
  summary?: TenantMonitoringSummary;
  loading: boolean;
}) {
  const missing = loading ? "Loading…" : "Unavailable";
  return (
    <dl className="tenant-monitoring-stats" aria-label="Tenant monitoring">
      <div>
        <dt className="tenant-stat-label">Tasks</dt>
        <dd className={`tenant-stat-value tenant-stat-count${summary ? "" : " tenant-stat-muted"}`}
          title="Awaiting triage / total monitoring tasks, including preparing, handled, and dismissed tasks"
          aria-label={summary ? `${summary.pending_task_count.toLocaleString()} awaiting triage out of ${summary.task_count.toLocaleString()} total tasks` : undefined}>
          {summary ? <>{summary.pending_task_count.toLocaleString()}<span className="tenant-task-total">/{summary.task_count.toLocaleString()}</span></> : missing}
        </dd>
      </div>
      <div>
        <dt className="tenant-stat-label" title="Most recent successfully completed monitoring run">Last monitoring</dt>
        <dd className={`tenant-stat-value${!summary || !summary.last_monitored_at ? " tenant-stat-muted" : ""}`}>
          {!summary ? missing : summary.last_monitored_at ? (
            <time dateTime={summary.last_monitored_at} title="Most recent successfully completed monitoring run">
              {new Intl.DateTimeFormat("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "numeric", minute: "2-digit", timeZoneName: "short",
              }).format(new Date(summary.last_monitored_at))}
            </time>
          ) : "Never"}
        </dd>
      </div>
    </dl>
  );
}
