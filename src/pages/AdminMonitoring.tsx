import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cpu,
  Eye,
  Globe2,
  HardDrive,
  LoaderCircle,
  Play,
  Radar,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
} from "lucide-react";
import type {
  AdminMonitoringActiveWorkItem,
  AdminMonitoringOverview,
  AdminMonitoringQueueStage,
  AdminMonitoringRunActivity,
  AdminMonitoringRunFilter,
  AdminMonitoringWorker,
} from "../api";
import { AdminMonitoringRunDetailPanel } from "../features/adminMonitoring/AdminMonitoringRunDetail";
import {
  useAdminMonitoringFeed,
  useAdminMonitoringRunDetail,
  type AdminMonitoringWindow,
} from "../features/adminMonitoring/useAdminMonitoringFeed";

const JOB_TYPES = ["monitor_scrape", "monitor_score", "monitor_visual_check", "finding_qualify"] as const;

const JOB_COPY: Record<string, { label: string; detail: string }> = {
  monitor_scrape: { label: "Discovery", detail: "Search and page harvesting" },
  monitor_score: { label: "Matching", detail: "Embedding and structure checks" },
  monitor_visual_check: { label: "Visual checks", detail: "Batched GPU comparisons" },
  finding_qualify: { label: "Page verification", detail: "Offer and seller evidence" },
};

const OPERATION_STYLES: Record<string, string> = {
  queued: "border-blue-200 bg-blue-50 text-blue-700",
  processing: "border-violet-200 bg-violet-50 text-violet-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  stalled: "border-amber-200 bg-amber-50 text-amber-800",
};

type WorkFilter = "all" | "in_progress" | "queued";

export default function AdminMonitoring() {
  const feed = useAdminMonitoringFeed();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [workFilter, setWorkFilter] = useState<WorkFilter>("all");
  const visibleSelectedRunId = selectedRunId && (
    !feed.overview || feed.overview.runs.some((run) => run.run_id === selectedRunId)
  ) ? selectedRunId : null;
  const detailFeed = useAdminMonitoringRunDetail(visibleSelectedRunId);

  const queueByType = useMemo(
    () => new Map(feed.overview?.queue.map((stage) => [stage.type, stage]) ?? []),
    [feed.overview?.queue],
  );

  if (feed.loading && !feed.overview) return <AdminMonitoringSkeleton />;
  if (!feed.overview) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-600"><AlertCircle className="h-5 w-5" /></div>
        <h1 className="mt-4 text-lg font-bold text-stone-900">Monitoring operations are unavailable</h1>
        <p className="mt-1 text-sm text-stone-500">{feed.error || "Try loading this page again."}</p>
        <button type="button" onClick={() => void feed.refresh()} className="mt-5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white">
          Try again
        </button>
      </div>
    );
  }

  const { overview } = feed;
  const visualQueue = queueByType.get("monitor_visual_check");
  const qualificationQueue = queueByType.get("finding_qualify");
  const attentionTotal = overview.summary.failed_runs
    + overview.summary.not_evaluated_checks
    + overview.summary.evidence_conflicts;
  const visibleWork = overview.active_work.filter((work) => (
    workFilter === "all"
    || (workFilter === "in_progress" && work.status === "in_progress")
    || (workFilter === "queued" && work.status === "pending")
  ));
  const openRun = (runId: string) => {
    if (!overview.runs.some((run) => run.run_id === runId)) feed.setQuery(runId);
    setSelectedRunId(runId);
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6">
      <header className="flex flex-col gap-3 border-b border-stone-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">
            <Radar className="h-3.5 w-3.5" /> Admin operations
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-950">Monitoring across every tenant</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-stone-500">
            Follow searches, queues, workers, and candidate decisions live. Open a run to see the exact evidence behind every outcome.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500" aria-live="polite">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live, updated {formatClock(overview.generated_at)}
            {feed.refreshing && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          </div>
          <button
            type="button"
            onClick={() => void feed.refresh()}
            aria-label="Refresh monitoring operations"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-800"
          >
            <RefreshCw className={`h-4 w-4 ${feed.refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {feed.error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The latest refresh failed. Showing the last known state: {feed.error}
        </div>
      )}

      <section className="mt-4 grid overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Active runs" value={overview.summary.active_runs} detail="across tenants" icon={<Activity className="h-4 w-4" />} accent={overview.summary.active_runs > 0} />
        <Metric label="Queued work" value={overview.summary.queued_units} detail={`${overview.summary.queued_jobs} ready, ${overview.summary.deferred_jobs} retrying`} icon={<Clock3 className="h-4 w-4" />} warning={overview.summary.queued_units > 0} />
        <Metric label="Visual queue" value={visualQueue?.pending_units ?? 0} detail={`${visualQueue?.pending_jobs ?? 0} batches`} icon={<Eye className="h-4 w-4" />} warning={(visualQueue?.pending_units ?? 0) > 0} />
        <Metric label="Page checks" value={qualificationQueue?.pending_jobs ?? 0} detail={`${qualificationQueue?.in_progress_jobs ?? 0} running`} icon={<Check className="h-4 w-4" />} />
        <Metric label="Findings" value={overview.summary.findings} detail={`last ${windowLabel(overview.window_hours)}`} icon={<Radar className="h-4 w-4" />} />
        <Metric label="Investigate" value={attentionTotal} detail={`${overview.summary.evidence_conflicts} conflicts`} icon={<ShieldAlert className="h-4 w-4" />} attention={attentionTotal > 0} />
      </section>

      {(overview.summary.not_evaluated_checks > 0 || overview.summary.evidence_conflicts > 0) && (
        <section className="mt-3 grid gap-2 lg:grid-cols-2">
          {overview.summary.not_evaluated_checks > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="text-xs font-bold text-amber-900">{overview.summary.not_evaluated_checks} checks were labeled without a model verdict</p>
                <p className="mt-0.5 text-[11px] leading-4 text-amber-800">This includes the former visual-check quota and legacy rejection labels with no stored VLM evidence.</p>
              </div>
            </div>
          )}
          {overview.summary.evidence_conflicts > 0 && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <div>
                <p className="text-xs font-bold text-red-900">{overview.summary.evidence_conflicts} stored labels conflict with their VLM verdict</p>
                <p className="mt-0.5 text-[11px] leading-4 text-red-800">The drill-down treats the verdict as evidence and marks the mismatch for investigation.</p>
              </div>
            </div>
          )}
        </section>
      )}

      <WorkerFleet overview={overview} onOpenRun={openRun} />

      <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold text-stone-900">Pipeline and worker capacity</h2>
            <p className="mt-0.5 text-xs text-stone-400">Counts are queue facts, not estimates from run labels.</p>
          </div>
          <WorkerSummary overview={overview} />
        </div>
        <div className="grid gap-px bg-stone-200 sm:grid-cols-2 xl:grid-cols-4">
          {JOB_TYPES.map((type) => <QueueStage key={type} type={type} stage={queueByType.get(type)} />)}
        </div>
      </section>

      <LiveWorkFeed
        work={visibleWork}
        allWork={overview.active_work}
        filter={workFilter}
        onFilter={setWorkFilter}
        onOpenRun={openRun}
      />

      <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            {([
              ["all", "All", overview.runs.length],
              ["active", "Active", overview.summary.active_runs],
              ["completed", "Completed", overview.summary.completed_runs],
              ["failed", "Failed", overview.summary.failed_runs],
            ] as Array<[AdminMonitoringRunFilter, string, number]>).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                onClick={() => feed.setStatus(value)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  feed.status === value ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                {label} <span className={feed.status === value ? "text-white/60" : "text-stone-400"}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
              <input
                value={feed.query}
                onChange={(event) => feed.setQuery(event.target.value)}
                placeholder="Search tenant, IP, website, keyword, or run ID"
                className="h-9 w-full rounded-lg border border-stone-200 bg-stone-50 pl-8 pr-3 text-xs text-stone-800 outline-none focus:border-stone-400 focus:bg-white"
              />
            </label>
            <select
              value={feed.windowHours}
              onChange={(event) => feed.setWindowHours(Number(event.target.value) as AdminMonitoringWindow)}
              aria-label="Activity window"
              className="h-9 rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-semibold text-stone-600 outline-none focus:border-stone-400"
            >
              <option value={1}>Last hour</option>
              <option value={6}>Last 6 hours</option>
              <option value={24}>Last 24 hours</option>
              <option value={72}>Last 3 days</option>
              <option value={168}>Last 7 days</option>
            </select>
          </div>
        </div>

        <div className="border-b border-stone-100 bg-stone-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400">
          Showing {overview.runs.length} newest runs in the selected window
        </div>

        {overview.runs.length > 0 ? (
          <div className="divide-y divide-stone-100">
            {overview.runs.map((run) => (
              <RunRow
                key={run.run_id}
                run={run}
                open={visibleSelectedRunId === run.run_id}
                onToggle={() => setSelectedRunId((current) => current === run.run_id ? null : run.run_id)}
                detail={visibleSelectedRunId === run.run_id ? detailFeed : null}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <Search className="h-5 w-5 text-stone-300" />
            <p className="mt-3 text-sm font-semibold text-stone-700">No monitoring runs match these filters</p>
            <p className="mt-1 text-xs text-stone-400">Try a longer activity window or clear the search.</p>
          </div>
        )}

        {overview.runs.length >= feed.limit && feed.limit < 200 && (
          <div className="border-t border-stone-200 bg-stone-50 px-4 py-3 text-center">
            <button type="button" onClick={() => feed.setLimit(Math.min(200, feed.limit + 40))} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 hover:border-stone-300 hover:text-stone-900">
              Load more runs
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function RunRow({ run, open, onToggle, detail }: {
  run: AdminMonitoringRunActivity;
  open: boolean;
  onToggle: () => void;
  detail: ReturnType<typeof useAdminMonitoringRunDetail> | null;
}) {
  const stages = new Map(run.jobs.map((stage) => [stage.type, stage]));
  const attention = run.not_evaluated_check_count + run.evidence_conflict_count;
  return (
    <article id={`monitoring-run-${run.run_id}`} className={open ? "bg-stone-50/40" : "bg-white"}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full px-4 py-3.5 text-left transition hover:bg-stone-50"
      >
        <div className="grid items-center gap-3 xl:grid-cols-[minmax(260px,1.25fr)_minmax(220px,0.9fr)_minmax(440px,1.7fr)_minmax(180px,0.7fr)_2rem]">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-[13px] font-bold text-stone-900">{run.tenant_name || "Unnamed tenant"}</span>
              <span className="text-stone-300">/</span>
              <span className="truncate text-[13px] font-semibold text-stone-700">{run.ip_name || "Unknown IP"}</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-stone-400">
              {run.source_name || run.source_domain || "Unknown source"}{run.keyword ? `, “${run.keyword}”` : ", default search"}
            </p>
            <p className="mt-1 font-mono text-[9px] text-stone-300">{shortId(run.run_id)} · {formatRelative(run.created_at)}</p>
          </div>

          <div>
            <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold ${OPERATION_STYLES[run.operation.state]}`}>
              {run.operation.label}
            </span>
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-stone-400">{run.operation.detail}</p>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {JOB_TYPES.map((type) => <RunStage key={type} type={type} stage={stages.get(type)} />)}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <CountPill value={run.candidate_count} label="candidates" />
            {run.finding_count > 0 && <CountPill value={run.finding_count} label="findings" tone="green" />}
            {run.rejected_check_count > 0 && <CountPill value={run.rejected_check_count} label="rejected" tone="rose" />}
            {run.screened_out_check_count > 0 && <CountPill value={run.screened_out_check_count} label="screened" />}
            {attention > 0 && <CountPill value={attention} label="investigate" tone="amber" />}
          </div>

          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </div>
      </button>
      {open && detail && (
        <AdminMonitoringRunDetailPanel
          detail={detail.detail}
          loading={detail.loading}
          refreshing={detail.refreshing}
          error={detail.error}
        />
      )}
    </article>
  );
}

function WorkerFleet({ overview, onOpenRun }: {
  overview: AdminMonitoringOverview;
  onOpenRun: (runId: string) => void;
}) {
  const browserWorkers = overview.workers.filter((worker) => worker.capabilities.browser);
  const runpodWorkers = overview.workers.filter((worker) => worker.provider === "runpod");
  const pools = Array.from(new Set([
    ...overview.runpod.coordinators.map((coordinator) => coordinator.pool),
    ...runpodWorkers.map((worker) => worker.pool),
    ...overview.runpod.instances.map((instance) => instance.pool),
  ])).sort();

  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-stone-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Worker fleet right now</h2>
          <p className="mt-0.5 text-xs text-stone-400">Heartbeat-backed status for browser workers and provider-backed state for RunPod.</p>
        </div>
        <WorkerSummary overview={overview} />
      </div>

      <div className="grid gap-px bg-stone-200 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.6fr)]">
        <div className="bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-blue-700" />
              <h3 className="text-xs font-bold text-stone-900">Browser-capable workers</h3>
            </div>
            <span className="text-[10px] font-semibold text-stone-400">{browserWorkers.length} known</span>
          </div>
          <div className="space-y-2">
            {browserWorkers.length > 0
              ? browserWorkers.map((worker) => (
                <WorkerRow key={worker.id} worker={worker} onOpenRun={onOpenRun} />
              ))
              : <EmptyFleet label="No browser worker is registered." />}
          </div>
        </div>

        <div className="bg-stone-50/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-violet-700" />
              <h3 className="text-xs font-bold text-stone-900">RunPod GPU capacity</h3>
            </div>
            <span className="text-[10px] font-semibold text-stone-400">{runpodWorkers.length} recent workers</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {pools.length > 0 ? pools.map((pool) => {
              const coordinator = overview.runpod.coordinators.find((row) => row.pool === pool);
              const workers = runpodWorkers.filter((worker) => worker.pool === pool);
              const instances = overview.runpod.instances.filter((instance) => instance.pool === pool);
              const providerStarting = instances.filter((instance) => (
                instance.status === "requested" || instance.status === "provisioning"
              )).length;
              const hasError = Boolean(coordinator?.last_error)
                || instances.some((instance) => instance.status === "error");
              return (
                <article key={pool} className="rounded-xl border border-stone-200 bg-white p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-stone-900">{pool}</p>
                      <p className="mt-0.5 text-[10px] text-stone-400">{poolRuntimeLabel(workers)}</p>
                    </div>
                    <span className={`rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-wide ${
                      hasError ? "bg-red-50 text-red-700"
                        : providerStarting > 0 ? "bg-amber-50 text-amber-700"
                          : (coordinator?.ready_instances ?? 0) > 0 ? "bg-emerald-50 text-emerald-700"
                            : "bg-stone-100 text-stone-500"
                    }`}>
                      {hasError ? "Error" : providerStarting > 0 ? "Starting" : (coordinator?.ready_instances ?? 0) > 0 ? "Ready" : "Scaled down"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1.5">
                    <FleetMetric label="Wanted" value={coordinator?.desired_instances ?? 0} />
                    <FleetMetric label="Ready" value={coordinator?.ready_instances ?? 0} />
                    <FleetMetric label="Starting" value={providerStarting} />
                    <FleetMetric label="Busy" value={coordinator?.busy_workers ?? workers.filter((worker) => worker.effective_status === "busy").length} />
                  </div>
                  <div className="mt-3 rounded-lg bg-stone-50 px-3 py-2">
                    <p className="text-[10px] font-semibold text-stone-700">
                      {coordinator?.pending_jobs ?? 0} queued, {coordinator?.in_progress_jobs ?? 0} running
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-stone-500">
                      {coordinator?.last_error || coordinator?.last_reason || "Waiting for the coordinator's first observation."}
                    </p>
                    {coordinator?.last_reconciled_at && (
                      <p className="mt-1 text-[9px] text-stone-400">Coordinator checked {formatRelative(coordinator.last_reconciled_at)}</p>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {workers.length > 0
                      ? workers.map((worker) => (
                        <WorkerRow key={worker.id} worker={worker} onOpenRun={onOpenRun} compact />
                      ))
                      : instances.slice(0, 4).map((instance) => (
                        <div key={instance.id} className="flex items-center justify-between rounded-lg border border-stone-100 px-2.5 py-2 text-[10px]">
                          <span className="truncate font-mono text-stone-500">{instance.name || shortId(instance.provider_instance_id)}</span>
                          <span className="font-semibold text-amber-700">{humanize(instance.status)}</span>
                        </div>
                      ))}
                    {workers.length === 0 && instances.length === 0 && <EmptyFleet label="No pod is active for this pool." />}
                  </div>
                </article>
              );
            }) : <EmptyFleet label="RunPod has no configured or recently active pools." />}
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkerRow({ worker, onOpenRun, compact = false }: {
  worker: AdminMonitoringWorker;
  onOpenRun: (runId: string) => void;
  compact?: boolean;
}) {
  const statusStyle = worker.effective_status === "busy" ? "bg-blue-50 text-blue-700"
    : worker.effective_status === "idle" ? "bg-emerald-50 text-emerald-700"
      : worker.effective_status === "provisioning" || worker.effective_status === "registered" ? "bg-amber-50 text-amber-700"
        : worker.effective_status === "error" ? "bg-red-50 text-red-700"
          : "bg-stone-100 text-stone-500";
  const name = worker.hardware.pod_name || worker.hardware.hostname || worker.id;
  const work = worker.current_work;
  return (
    <div className={`rounded-lg border border-stone-200 bg-white ${compact ? "px-2.5 py-2" : "p-3"}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${worker.effective_status === "busy" ? "bg-blue-500" : worker.effective_status === "idle" ? "bg-emerald-500" : worker.effective_status === "error" ? "bg-red-500" : "bg-amber-400"}`} />
          <span className="truncate font-mono text-[10px] font-semibold text-stone-700" title={worker.id}>{name}</span>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold ${statusStyle}`}>{humanize(worker.effective_status)}</span>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {worker.current_job_type ? (
            <>
              <p className="truncate text-[10px] font-semibold text-stone-700">{JOB_COPY[worker.current_job_type]?.label || humanize(worker.current_job_type)}</p>
              <p className="mt-0.5 truncate text-[9px] text-stone-400">
                {work ? workContext(work) : "Current job is outside the monitoring pipeline"}
                {worker.current_job_started_at ? `, started ${formatRelative(worker.current_job_started_at)}` : ""}
              </p>
            </>
          ) : (
            <p className="text-[10px] text-stone-400">
              {worker.effective_status === "provisioning" ? "Provider is starting this worker" : "No job assigned"}
            </p>
          )}
          {!compact && (
            <p className="mt-1 text-[9px] text-stone-400">
              {worker.hardware.gpu_name || (worker.capabilities.browser ? "Browser runtime" : worker.runtime_mode || worker.pool)}
              {worker.last_heartbeat_at ? `, heartbeat ${formatRelative(worker.last_heartbeat_at)}` : ", no heartbeat yet"}
            </p>
          )}
        </div>
        {work?.run_id && (
          <button type="button" onClick={() => onOpenRun(work.run_id!)} className="shrink-0 text-[9px] font-bold text-blue-700 hover:text-blue-900">
            Open run
          </button>
        )}
      </div>
    </div>
  );
}

function LiveWorkFeed({ work, allWork, filter, onFilter, onOpenRun }: {
  work: AdminMonitoringActiveWorkItem[];
  allWork: AdminMonitoringActiveWorkItem[];
  filter: WorkFilter;
  onFilter: (filter: WorkFilter) => void;
  onOpenRun: (runId: string) => void;
}) {
  const running = allWork.filter((item) => item.status === "in_progress").length;
  const queued = allWork.filter((item) => item.status === "pending" && !item.deferred).length;
  const deferred = allWork.filter((item) => item.deferred).length;
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Play className="h-3.5 w-3.5 text-blue-700" />
            <h2 className="text-sm font-bold text-stone-900">Live work feed</h2>
          </div>
          <p className="mt-0.5 text-xs text-stone-400">
            Running jobs first, followed by a balanced live sample from each queue.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {([
            ["all", "All", allWork.length],
            ["in_progress", "Running", running],
            ["queued", "Queued", queued + deferred],
          ] as Array<[WorkFilter, string, number]>).map(([value, label, count]) => (
            <button key={value} type="button" onClick={() => onFilter(value)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${filter === value ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"}`}>
              {label} <span className={filter === value ? "text-white/60" : "text-stone-400"}>{count}</span>
            </button>
          ))}
        </div>
      </div>
      {deferred > 0 && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-[10px] font-medium text-amber-800">
          {deferred} job{deferred === 1 ? " is" : "s are"} waiting for a scheduled retry. They are retained, not dropped.
        </div>
      )}
      {work.length > 0 ? (
        <div className="max-h-[36rem] divide-y divide-stone-100 overflow-y-auto">
          {work.map((item) => (
            <article key={item.id} className="grid gap-3 px-4 py-3 hover:bg-stone-50 lg:grid-cols-[9rem_minmax(220px,0.9fr)_minmax(280px,1.3fr)_minmax(170px,0.7fr)_6rem] lg:items-center">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${item.status === "in_progress" ? "bg-blue-500" : item.deferred ? "bg-violet-400" : "bg-amber-400"}`} />
                  <span className={`text-[10px] font-bold ${item.status === "in_progress" ? "text-blue-700" : item.deferred ? "text-violet-700" : "text-amber-700"}`}>
                    {item.status === "in_progress" ? "Running" : item.deferred ? "Retry scheduled" : "Queued"}
                  </span>
                </div>
                <p className="mt-1 text-[9px] text-stone-400">
                  {item.status === "in_progress" && item.started_at
                    ? `Started ${formatRelative(item.started_at)}`
                    : item.deferred
                      ? formatAvailability(item.available_at)
                      : `Queued ${formatRelative(item.queued_at)}`}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-stone-800">{JOB_COPY[item.type]?.label || humanize(item.type)}</p>
                <p className="mt-0.5 truncate text-[10px] text-stone-400">{workScope(item)}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-semibold text-stone-700">{workContext(item)}</p>
                <p className="mt-0.5 truncate text-[10px] text-stone-400">{item.candidate_title || item.keyword || item.candidate_page_url || "Waiting for run context"}</p>
              </div>
              <div className="min-w-0">
                {item.worker_instance_id ? (
                  <>
                    <p className="truncate font-mono text-[9px] font-semibold text-stone-600" title={item.worker_instance_id}>{shortId(item.worker_instance_id)}</p>
                    <p className="mt-0.5 text-[9px] text-stone-400">worker {humanize(item.worker_status || "assigned")}</p>
                  </>
                ) : <p className="text-[10px] text-stone-400">No worker assigned</p>}
              </div>
              <div className="text-right">
                {item.run_id ? (
                  <button type="button" onClick={() => onOpenRun(item.run_id!)} className="rounded-md border border-stone-200 bg-white px-2 py-1.5 text-[9px] font-bold text-stone-600 hover:border-blue-200 hover:text-blue-700">
                    Inspect
                  </button>
                ) : <span className="text-[9px] text-stone-300">Run pending</span>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-28 items-center justify-center px-6 text-center text-xs text-stone-400">
          No work matches this view.
        </div>
      )}
    </section>
  );
}

function FleetMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-stone-100 bg-stone-50 px-2 py-1.5 text-center">
      <p className="text-sm font-black tabular-nums text-stone-800">{value}</p>
      <p className="text-[8px] font-semibold uppercase tracking-wide text-stone-400">{label}</p>
    </div>
  );
}

function EmptyFleet({ label }: { label: string }) {
  return <div className="rounded-lg border border-dashed border-stone-200 px-3 py-5 text-center text-[10px] text-stone-400">{label}</div>;
}

function QueueStage({ type, stage }: { type: string; stage: AdminMonitoringQueueStage | undefined }) {
  const copy = JOB_COPY[type];
  const waiting = stage?.pending_jobs ?? 0;
  const deferred = stage?.deferred_jobs ?? 0;
  const running = stage?.in_progress_jobs ?? 0;
  const units = stage?.pending_units ?? 0;
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-stone-800">{copy?.label || humanize(type)}</p>
          <p className="mt-0.5 text-[10px] text-stone-400">{copy?.detail}</p>
        </div>
        <span className={`mt-0.5 h-2 w-2 rounded-full ${running > 0 ? "bg-blue-500" : waiting > 0 ? "bg-amber-400" : "bg-emerald-500"}`} />
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="text-lg font-black tabular-nums text-stone-900">{waiting}</span>
        <span className="text-[10px] text-stone-400">queued</span>
        <span className="text-sm font-bold tabular-nums text-blue-700">{running}</span>
        <span className="text-[10px] text-stone-400">running</span>
      </div>
      <p className="mt-1 text-[10px] text-stone-400">
        {type === "monitor_visual_check" ? `${units} comparisons waiting` : `${units} capacity units waiting`}
        {deferred > 0 ? `, ${deferred} scheduled retries` : ""}
        {stage?.oldest_queued_at ? `, oldest ${formatRelative(stage.oldest_queued_at)}` : ""}
      </p>
    </div>
  );
}

function RunStage({ type, stage }: { type: string; stage: AdminMonitoringRunActivity["jobs"][number] | undefined }) {
  const status = stageStatus(stage);
  const color = status === "failed" ? "bg-red-100 text-red-700"
    : status === "running" ? "bg-blue-100 text-blue-700"
      : status === "queued" ? "bg-amber-100 text-amber-700"
        : status === "done" ? "bg-emerald-100 text-emerald-700"
          : "bg-stone-100 text-stone-400";
  return (
    <div className={`min-w-0 rounded-md px-2 py-1.5 ${color}`} title={stage?.latest_error || JOB_COPY[type]?.detail}>
      <p className="truncate text-[9px] font-bold">{JOB_COPY[type]?.label}</p>
      <p className="mt-0.5 truncate text-[9px] opacity-75">
        {status === "running" ? `${stage?.in_progress_jobs} running`
          : status === "queued" ? `${(stage?.pending_jobs ?? 0) + (stage?.deferred_jobs ?? 0)} queued`
            : status === "failed" ? `${stage?.failed_jobs} failed`
              : status === "done" ? "done"
                : "waiting"}
      </p>
    </div>
  );
}

function WorkerSummary({ overview }: { overview: NonNullable<ReturnType<typeof useAdminMonitoringFeed>["overview"]> }) {
  const workers = overview.summary.workers;
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500">
      <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700"><Cpu className="h-3 w-3" /> {workers.busy} busy</span>
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700"><Server className="h-3 w-3" /> {workers.idle} idle</span>
      {workers.starting > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 font-semibold text-amber-700">{workers.starting} starting</span>}
      {workers.offline > 0 && <span className="rounded-md bg-red-50 px-2 py-1 font-semibold text-red-700">{workers.offline} offline</span>}
    </div>
  );
}

function Metric({ label, value, detail, icon, accent = false, warning = false, attention = false }: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
  warning?: boolean;
  attention?: boolean;
}) {
  return (
    <div className={`border-b border-stone-100 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r xl:last:border-r-0 ${
      attention ? "bg-rose-50/60" : warning ? "bg-amber-50/50" : accent ? "bg-blue-50/50" : ""
    }`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-semibold ${attention ? "text-rose-700" : warning ? "text-amber-700" : accent ? "text-blue-700" : "text-stone-500"}`}>
        {icon}{label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`text-xl font-black tabular-nums ${attention ? "text-rose-900" : warning ? "text-amber-900" : accent ? "text-blue-900" : "text-stone-950"}`}>{value.toLocaleString()}</span>
        <span className="text-[10px] text-stone-400">{detail}</span>
      </div>
    </div>
  );
}

function CountPill({ value, label, tone = "stone" }: { value: number; label: string; tone?: "stone" | "green" | "rose" | "amber" }) {
  const style = tone === "green" ? "bg-emerald-50 text-emerald-700"
    : tone === "rose" ? "bg-rose-50 text-rose-700"
      : tone === "amber" ? "bg-amber-50 text-amber-800"
        : "bg-stone-100 text-stone-500";
  return <span className={`rounded px-1.5 py-1 text-[9px] font-semibold ${style}`}>{value.toLocaleString()} {label}</span>;
}

function stageStatus(stage: AdminMonitoringRunActivity["jobs"][number] | undefined) {
  if (!stage) return "waiting";
  if (stage.failed_jobs > 0) return "failed";
  if (stage.in_progress_jobs > 0) return "running";
  if (stage.pending_jobs + stage.deferred_jobs > 0) return "queued";
  if (stage.completed_jobs > 0) return "done";
  return "waiting";
}

function AdminMonitoringSkeleton() {
  return (
    <div className="mx-auto max-w-[1600px] animate-pulse px-4 py-5 sm:px-6">
      <div className="h-3 w-28 rounded bg-stone-200" />
      <div className="mt-3 h-7 w-96 max-w-full rounded bg-stone-200" />
      <div className="mt-2 h-4 w-[42rem] max-w-full rounded bg-stone-100" />
      <div className="mt-5 h-24 rounded-xl border border-stone-200 bg-white" />
      <div className="mt-3 h-40 rounded-xl border border-stone-200 bg-white" />
      <div className="mt-3 h-[28rem] rounded-xl border border-stone-200 bg-white" />
    </div>
  );
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
  if (hours === 1) return "hour";
  if (hours < 24) return `${hours}h`;
  if (hours === 24) return "24h";
  return `${Math.round(hours / 24)}d`;
}

function workContext(work: AdminMonitoringActiveWorkItem) {
  const tenant = work.tenant_name || "Unknown tenant";
  const ip = work.ip_name || "Unknown IP";
  const source = work.source_name || work.source_domain;
  return `${tenant} / ${ip}${source ? ` / ${source}` : ""}`;
}

function workScope(work: AdminMonitoringActiveWorkItem) {
  if (work.type === "monitor_visual_check") {
    return `${work.scope_count.toLocaleString()} visual comparison${work.scope_count === 1 ? "" : "s"}`;
  }
  if (work.type === "monitor_score") {
    return `${work.scope_count.toLocaleString()} candidate${work.scope_count === 1 ? "" : "s"} in this run`;
  }
  if (work.type === "finding_qualify") return "One listing-page decision";
  if (work.type === "monitor_scrape") return work.keyword ? `Search “${work.keyword}”` : "Marketplace discovery";
  return work.scope_count > 0 ? `${work.scope_count.toLocaleString()} item${work.scope_count === 1 ? "" : "s"}` : "Monitoring work";
}

function poolRuntimeLabel(workers: AdminMonitoringWorker[]) {
  const worker = workers.find((row) => row.runtime_mode) ?? workers[0];
  if (!worker) return "Managed GPU pool";
  if (worker.runtime_mode === "vllm") return "Multimodal VLM runtime";
  if (worker.runtime_mode === "product_cuda") return "Product identity runtime";
  return worker.execution_class || "Managed GPU pool";
}

function formatAvailability(value: string) {
  const milliseconds = Date.parse(value) - Date.now();
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "Ready now";
  const seconds = Math.ceil(milliseconds / 1_000);
  if (seconds < 60) return `Available in ${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `Available in ${minutes}m`;
  return `Available in ${Math.ceil(minutes / 60)}h`;
}

function humanize(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
