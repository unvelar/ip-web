import { useMemo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Clock3,
  LoaderCircle,
  RefreshCw,
  Server,
  ShieldAlert,
} from "lucide-react";
import type { AdminMonitoringQueueStage, AdminMonitoringStatus, AdminMonitoringWorkerDemand } from "../api";
import { AdminPage } from "../components/admin/AdminPage";
import { ADMIN_JOB_COPY } from "../features/adminMonitoring/monitoringJobs";
import { WorkerTypeBadge } from "../features/adminMonitoring/WorkerTypeBadge";
import { useAdminMonitoringStatus, type AdminMonitoringWindow } from "../features/adminMonitoring/useAdminMonitoringStatus";
import { WebsitePerformance } from "../features/adminMonitoring/WebsitePerformance";

const number = (value: number) => value.toLocaleString();
const percentage = (value: number | null | undefined) => value == null ? "No data" : `${value.toFixed(1)}%`;

const METHOD_LABELS: Record<string, string> = {
  nodriver: "Nodriver",
  scrapling: "Scrapling stealth",
  scrapedo: "Scrape.do",
  scrapfly: "Scrapfly",
  marketplace_specific: "Marketplace API",
  web_search: "Web search API",
};

const METHOD_ORDER = ["nodriver", "scrapling", "scrapedo", "scrapfly", "marketplace_specific", "web_search"];

export default function AdminMonitoring() {
  const monitor = useAdminMonitoringStatus();
  const oldestReady = useMemo(() => oldestQueuedAt(monitor.status?.queue ?? []), [monitor.status?.queue]);
  const failedChecks = monitor.status?.scrape_requests?.pipeline;
  const workerCounts = monitor.status?.summary.workers;
  const totalOnline = workerCounts ? workerCounts.busy + workerCounts.idle + workerCounts.starting : 0;
  const unservedReadyJobs = monitor.status?.queue.reduce(
    (total, stage) => total + stage.worker_capacity.unserved_ready_jobs,
    0,
  ) ?? 0;
  const workerHealth = workerHealthLabel(
    totalOnline,
    workerCounts?.busy ?? 0,
    workerCounts?.idle ?? 0,
    workerCounts?.starting ?? 0,
    unservedReadyJobs,
  );
  const windowUpdating = Boolean(monitor.status && monitor.status.window_hours !== monitor.windowHours);

  return (
    <AdminPage
      section="monitoring"
      title="Monitoring"
      description="System health across queues, workers, and scrape outcomes."
      wide
      actions={
        <>
          <select
            value={monitor.windowHours}
            onChange={(event) => monitor.setWindowHours(Number(event.target.value) as AdminMonitoringWindow)}
            aria-label="Activity window"
            className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-600 outline-none focus:border-stone-400"
          >
            <option value={1}>Last hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
          {monitor.status && (
            <span className="admin-live" aria-live="polite">
              <span className="admin-live-dot" />Updated {formatClock(monitor.status.generated_at)}
              {monitor.refreshing && <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />}
            </span>
          )}
          <button
            type="button"
            onClick={() => void monitor.refresh()}
            aria-label="Refresh monitoring status"
            className="admin-icon-button"
            disabled={monitor.refreshing}
          >
            <RefreshCw size={15} className={monitor.refreshing ? "animate-spin" : ""} />
          </button>
        </>
      }
    >
      {monitor.error && monitor.status && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The latest refresh failed. Showing the last known status: {monitor.error}
        </div>
      )}

      {monitor.loading && !monitor.status ? (
        <MonitoringSkeleton />
      ) : !monitor.status ? (
        <div className="admin-card admin-empty" role="alert">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertCircle className="h-5 w-5" />
          </div>
          <h2 className="text-sm font-semibold text-stone-900">Monitoring status is unavailable</h2>
          <p className="mt-1 text-sm text-stone-500">{monitor.error || "Try loading this page again."}</p>
          <button type="button" onClick={() => void monitor.refresh()} className="admin-button admin-button-primary mt-3">
            Try again
          </button>
        </div>
      ) : (
        <div className="admin-monitoring">
          <section className="admin-monitoring-summary-grid" aria-label="System overview">
            <StatusMetric
              label="Running jobs"
              value={monitor.status.summary.running_jobs}
              detail="Across all queues"
              icon={<Activity className="h-4 w-4" />}
              tone="blue"
            />
            <StatusMetric
              label="Ready to start"
              value={monitor.status.summary.queued_jobs}
              detail={oldestReady ? `Oldest job queued ${formatRelative(oldestReady)}` : "No jobs waiting for a worker"}
              icon={<Clock3 className="h-4 w-4" />}
              tone={monitor.status.summary.queued_jobs > 0 ? "amber" : "stone"}
            />
            <StatusMetric
              label="Workers online"
              value={totalOnline}
              detail={`${workerCounts?.busy ?? 0} busy · ${workerCounts?.idle ?? 0} idle${(workerCounts?.starting ?? 0) > 0 ? ` · ${workerCounts!.starting} starting` : ""}`}
              icon={<Server className="h-4 w-4" />}
              tone={workerHealth.tone}
            />
            <StatusMetric
              label="Checks with no success"
              value={failedChecks?.failed ?? 0}
              detail={failedChecks
                ? `${percentage(failedChecks.failure_rate)} of ${number(failedChecks.completed)} completed checks`
                : "Loading scrape outcomes"}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone={(failedChecks?.failed ?? 0) > 0 ? "red" : "green"}
              busy={!failedChecks}
            />
          </section>

          <div className="admin-monitoring-content">
            <QueueHealth queues={monitor.status.queue} />
            <div className="flex min-w-0 flex-col gap-[18px]">
              <WorkerHealth
                counts={workerCounts}
                demand={monitor.status.worker_demand}
                label={workerHealth.label}
                tone={workerHealth.tone}
              />
              <ScrapeOutcomes
                stats={monitor.status.scrape_requests}
                windowHours={monitor.windowHours}
                updating={windowUpdating}
              />
            </div>
          </div>
          <WebsitePerformance key={monitor.windowHours} windowHours={monitor.windowHours} asOf={monitor.status.generated_at} />
        </div>
      )}
    </AdminPage>
  );
}

function StatusMetric({ label, value, detail, icon, tone, busy = false }: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  tone: "stone" | "blue" | "green" | "amber" | "red";
  busy?: boolean;
}) {
  const toneClass = tone === "blue" ? "text-blue-700"
    : tone === "green" ? "text-emerald-700"
      : tone === "amber" ? "text-amber-700"
        : tone === "red" ? "text-red-700"
          : "text-stone-500";
  return (
    <article className="admin-card admin-monitoring-metric">
      <div className={`flex items-center gap-2 text-[11px] font-semibold ${toneClass}`}>
        {icon}{label}
        {busy && <LoaderCircle className="ml-auto h-3.5 w-3.5 animate-spin" aria-label="Loading" />}
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-800" : "text-stone-950"}`}>{number(value)}</p>
      <p className="mt-1 text-[11px] leading-4 text-stone-500">{detail}</p>
    </article>
  );
}

function QueueHealth({ queues }: { queues: AdminMonitoringQueueStage[] }) {
  const rows = [...queues].sort((left, right) => (
    right.pending_jobs - left.pending_jobs
    || right.in_progress_jobs - left.in_progress_jobs
    || left.type.localeCompare(right.type)
  ));
  return (
    <section className="admin-card overflow-hidden" aria-label="Queue health">
      <div className="admin-card-header">
        <h2 className="text-sm font-bold text-stone-900">Queue health</h2>
        <p className="mt-1 text-xs text-stone-500">Current work by stage, including the oldest ready job.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="admin-monitoring-queue-table min-w-[610px] text-xs tabular-nums">
          <thead>
            <tr>
              <th scope="col">Queue</th>
              <th scope="col">Ready</th>
              <th scope="col">Running</th>
              <th scope="col">Deferred</th>
              <th scope="col">Oldest ready</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((stage) => <QueueRow key={stage.type} stage={stage} />)}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="px-4 py-6 text-xs text-stone-500">No queues are reporting work.</p>}
    </section>
  );
}

function QueueRow({ stage }: { stage: AdminMonitoringQueueStage }) {
  const unserved = stage.worker_capacity.unserved_ready_jobs;
  const copy = ADMIN_JOB_COPY[stage.type];
  const detail = copy?.detail ?? humanize(stage.type);
  return (
    <tr className={unserved > 0 ? "is-unserved" : undefined}>
      <th scope="row">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold text-stone-800">
          {copy?.label ?? humanize(stage.type)}
          <WorkerTypeBadge kind={stage.worker_kind} compact />
          {unserved > 0 && <span className="admin-monitoring-warning">No worker available</span>}
        </span>
        <span className="mt-0.5 block max-w-[330px] truncate text-[10px] font-normal text-stone-400" title={detail}>{detail}</span>
        {(stage.paused_jobs > 0 || stage.scheduled_jobs > 0 || stage.pending_units > stage.pending_jobs) && (
          <span className="mt-0.5 block text-[10px] font-normal text-stone-500">
            {stage.paused_jobs > 0 && `${number(stage.paused_jobs)} paused`}
            {stage.paused_jobs > 0 && stage.scheduled_jobs > 0 && " · "}
            {stage.scheduled_jobs > 0 && `${number(stage.scheduled_jobs)} scheduled`}
            {stage.pending_units > stage.pending_jobs && ` · ${number(stage.pending_units)} pending units`}
          </span>
        )}
      </th>
      <td className={stage.pending_jobs > 0 ? "font-semibold text-amber-800" : "text-stone-500"}>{number(stage.pending_jobs)}</td>
      <td className={stage.in_progress_jobs > 0 ? "font-semibold text-blue-700" : "text-stone-500"}>{number(stage.in_progress_jobs)}</td>
      <td className="text-stone-500">{number(stage.deferred_jobs)}</td>
      <td className="whitespace-nowrap text-stone-500">{stage.oldest_queued_at ? formatRelative(stage.oldest_queued_at) : "None"}</td>
    </tr>
  );
}

function WorkerHealth({ counts, demand, label, tone }: {
  counts: { busy: number; idle: number; starting: number } | undefined;
  demand: AdminMonitoringWorkerDemand[];
  label: string;
  tone: "stone" | "green" | "amber" | "red";
}) {
  const statusClass = tone === "red" ? "bg-red-50 text-red-700"
    : tone === "amber" ? "bg-amber-50 text-amber-800"
      : tone === "green" ? "bg-emerald-50 text-emerald-700"
        : "bg-stone-100 text-stone-600";
  return (
    <section className="admin-card overflow-hidden" aria-label="Worker health">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Worker health</h2>
          <p className="mt-1 text-xs text-stone-500">Fleet status and queue demand.</p>
        </div>
        <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${statusClass}`} role="status">{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4">
        <WorkerCount label="Busy" value={counts?.busy ?? 0} />
        <WorkerCount label="Idle" value={counts?.idle ?? 0} />
        <WorkerCount label="Starting" value={counts?.starting ?? 0} />
      </div>
      <div className="divide-y divide-stone-100 border-t border-stone-100">
        {demand.map((row) => <WorkerDemandRow key={row.kind} row={row} />)}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-stone-200 bg-stone-50/60 px-4 py-3">
        <Link to="/admin/browser-activity" className="admin-button">Browser activity <ArrowUpRight size={13} /></Link>
        <Link to="/admin/compute" className="admin-button">Compute <ArrowUpRight size={13} /></Link>
      </div>
    </section>
  );
}

function WorkerDemandRow({ row }: { row: AdminMonitoringWorkerDemand }) {
  const label = row.kind === "browser" ? "Browser" : row.kind === "ml" ? "ML" : humanize(row.kind);
  const unserved = row.unserved_ready_jobs > 0;
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-stone-800">{label} queues</p>
        <p className="mt-0.5 text-[10px] leading-4 text-stone-500">
          {row.ready_jobs > 0 ? `${number(row.ready_jobs)} ready` : "No ready jobs"}
          {row.oldest_queued_at && ` · oldest ${formatRelative(row.oldest_queued_at)}`}
        </p>
        {unserved && <p className="mt-1 text-[10px] font-semibold text-red-700">{number(row.unserved_ready_jobs)} jobs have no matching worker online.</p>}
      </div>
      <span className="shrink-0 text-right text-[10px] text-stone-500">
        <span className="block font-semibold text-stone-700">{number(row.busy_workers)} busy · {number(row.idle_workers)} idle</span>
        <span className="block mt-0.5">{number(row.running_jobs)} running</span>
      </span>
    </div>
  );
}

function WorkerCount({ label, value, tone = "stone" }: { label: string; value: number; tone?: "stone" | "red" }) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone === "red" ? "border-red-100 bg-red-50/70" : "border-stone-100 bg-stone-50"}`}>
      <p className={`text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-800" : "text-stone-900"}`}>{number(value)}</p>
      <p className="text-[10px] text-stone-500">{label}</p>
    </div>
  );
}

function ScrapeOutcomes({ stats, windowHours, updating }: {
  stats: AdminMonitoringStatus["scrape_requests"] | undefined;
  windowHours: number;
  updating: boolean;
}) {
  const pipeline = stats?.pipeline;
  const methods = [...(stats?.methods ?? [])].sort((left, right) => (
    METHOD_ORDER.indexOf(left.method) - METHOD_ORDER.indexOf(right.method)
  ));
  return (
    <section className="admin-card overflow-hidden" aria-label="Scrape outcomes" aria-busy={updating}>
      <div className="admin-card-header">
        <h2 className="text-sm font-bold text-stone-900">Scrape outcomes</h2>
        <p className="mt-1 text-xs text-stone-500">
          {windowLabel(windowHours)}{updating ? " · Updating" : ""}. A check succeeds when any method gets a valid result.
        </p>
      </div>
      {!pipeline ? (
        <p className="px-4 py-5 text-xs text-stone-500">Scrape outcome statistics are not available yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 p-4">
            <OutcomeMetric label="Completed checks" value={pipeline.completed} />
            <OutcomeMetric label="Succeeded" value={pipeline.succeeded} tone="green" />
            <OutcomeMetric label="Failed" value={pipeline.failed} tone={pipeline.failed > 0 ? "red" : "stone"} detail={percentage(pipeline.failure_rate)} />
            <OutcomeMetric label="Recovered" value={pipeline.recovered} tone="green" detail={`${number(pipeline.affected_domains)} domains affected`} />
          </div>
          {(pipeline.pending > 0 || pipeline.unknown > 0) && (
            <p className="border-t border-stone-100 px-4 py-2.5 text-[10px] leading-4 text-stone-500">
              {number(pipeline.pending)} checks are running or awaiting retry · {number(pipeline.unknown)} have incomplete history.
            </p>
          )}
          <details className="admin-monitoring-methods border-t border-stone-200">
            <summary>Request outcomes by method <span>{methods.length} methods</span></summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-xs tabular-nums">
                <thead><tr><th scope="col">Method</th><th scope="col">Requests</th><th scope="col">Succeeded</th><th scope="col">Failed</th><th scope="col">Success rate</th></tr></thead>
                <tbody>
                  {METHOD_ORDER.map((method) => {
                    const row = methods.find((item) => item.method === method);
                    return (
                      <tr key={method}>
                        <th scope="row">{METHOD_LABELS[method]}</th>
                        <td>{number(row?.requests ?? 0)}</td>
                        <td>{number(row?.succeeded ?? 0)}</td>
                        <td className={(row?.failed ?? 0) > 0 ? "text-red-700" : "text-stone-500"}>{number(row?.failed ?? 0)}</td>
                        <td>{percentage(row?.success_rate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-3 text-[10px] leading-4 text-stone-500">
              Request counts include retries. Confirmed unavailable listings count as successful checks.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

function OutcomeMetric({ label, value, detail, tone = "stone" }: {
  label: string;
  value: number;
  detail?: string;
  tone?: "stone" | "green" | "red";
}) {
  return (
    <div className="rounded-lg border border-stone-100 bg-stone-50/70 px-3 py-2">
      <p className={`text-lg font-semibold tabular-nums ${tone === "red" ? "text-red-800" : tone === "green" ? "text-emerald-800" : "text-stone-900"}`}>{number(value)}</p>
      <p className="text-[10px] text-stone-600">{label}</p>
      {detail && <p className="mt-0.5 text-[10px] text-stone-400">{detail}</p>}
    </div>
  );
}

function workerHealthLabel(online: number, busy: number, idle: number, starting: number, unservedReadyJobs: number) {
  if (unservedReadyJobs > 0) return { label: "Capacity shortfall", tone: "red" as const };
  if (starting > 0) return { label: "Workers starting", tone: "amber" as const };
  if (idle > 0) return { label: "Capacity available", tone: "green" as const };
  if (busy > 0) return { label: "Workers processing", tone: "green" as const };
  if (online === 0) return { label: "No active workers", tone: "stone" as const };
  return { label: "Workers online", tone: "green" as const };
}

function MonitoringSkeleton() {
  return (
    <div className="admin-monitoring" aria-label="Loading monitoring status" aria-busy="true">
      <div className="admin-monitoring-summary-grid animate-pulse">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="admin-card h-28 bg-stone-100" />)}
      </div>
      <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.85fr)]">
        <div className="admin-card h-[28rem] animate-pulse bg-stone-100" />
        <div className="flex flex-col gap-[18px]"><div className="admin-card h-64 animate-pulse bg-stone-100" /><div className="admin-card h-56 animate-pulse bg-stone-100" /></div>
      </div>
    </div>
  );
}

function oldestQueuedAt(queues: AdminMonitoringQueueStage[]) {
  return queues.map((queue) => queue.oldest_queued_at).filter((value): value is string => value !== null)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function formatRelative(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (!Number.isFinite(seconds) || seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatClock(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function windowLabel(hours: number) {
  if (hours === 1) return "Last hour";
  if (hours === 24) return "Last 24 hours";
  if (hours === 168) return "Last 7 days";
  if (hours === 72) return "Last 3 days";
  return `Last ${hours} hours`;
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}
