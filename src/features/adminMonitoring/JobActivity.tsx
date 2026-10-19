import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Cpu, Globe2, LoaderCircle } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AdminMonitoringWorkerDemand, AdminMonitoringWorkerKind } from "../../api/admin";
import { getAdminJobActivity, JOB_ACTIVITY_KINDS, type AdminJobActivity, type JobActivityWindow } from "../../api/adminJobActivity";
import { isApiError } from "../../api/transport";
import { WORKER_KIND_COPY } from "./workerKinds";
import "./JobActivity.css";

const COLORS = { ml: "#7c3aed", browser: "#0284c7", hybrid: "#4f46e5", unknown: "#78716c" };
const QUEUE_STATES = [
  { key: "ready", label: "Ready", color: "#d97706" },
  { key: "running", label: "Running", color: "#0d9488" },
  { key: "deferred", label: "Deferred", color: "#c7c2bc" },
] as const;
const number = (value: number) => value.toLocaleString();
const rate = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const compact = (value: number) => value.toLocaleString(undefined, { notation: "compact", maximumFractionDigits: 1 });
const clock = (value: string) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function JobActivity({ windowHours, refreshAt, demand }: {
  windowHours: JobActivityWindow;
  refreshAt: string;
  demand: AdminMonitoringWorkerDemand[];
}) {
  const [data, setData] = useState<AdminJobActivity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState<"rate" | "completed">("rate");
  useEffect(() => {
    const controller = new AbortController();
    void getAdminJobActivity(windowHours, controller.signal).then(next => {
      if (controller.signal.aborted) return;
      setData(next);
      setError(null);
    }).catch(caught => {
      if (controller.signal.aborted) return;
      setError(isApiError(caught, 404) ? "Job activity history is not available on the server yet."
        : "Job activity history could not be loaded.");
    });
    return () => controller.abort();
  }, [windowHours, refreshAt, retry]);

  const history = data?.window_hours === windowHours ? data : null;
  const kinds = JOB_ACTIVITY_KINDS.filter(kind => kind === "ml" || kind === "browser"
    || history?.summary.some(row => row.kind === kind
      && row.completed_jobs + row.arrived_jobs + row.initial_backlog_jobs > 0));
  const points = useMemo(() => history?.series.map(point => ({
    ...point,
    time: Date.parse(point.started_at),
    ...point[mode === "rate" ? "per_minute" : "completed"],
    ...Object.fromEntries(JOB_ACTIVITY_KINDS.map(kind => [`${kind}_incoming`, point.arrivals_per_minute[kind]])),
  })) ?? [], [history, mode]);
  const backlogPoints = useMemo(() => history ? [
    { time: Date.parse(history.since), backlog: Object.fromEntries(history.summary.map(row => [row.kind, row.initial_backlog_jobs])) },
    ...history.series.map(point => ({ time: Date.parse(point.ended_at), backlog: point.backlog })),
  ] : [], [history]);
  const ticks = useMemo(() => dailyTicks(history), [history]);
  const queue = JOB_ACTIVITY_KINDS.map(kind => {
    const row = demand.find(item => item.kind === kind);
    return {
      kind, label: WORKER_KIND_COPY[kind].label,
      ready: row?.ready_jobs ?? 0, running: row?.running_jobs ?? 0,
      paused: row?.paused_jobs ?? 0, scheduled: row?.scheduled_jobs ?? 0, blocked: row?.blocked_jobs ?? 0,
      deferred: (row?.paused_jobs ?? 0) + (row?.scheduled_jobs ?? 0) + (row?.blocked_jobs ?? 0),
    };
  }).filter(row => row.kind === "ml" || row.kind === "browser" || row.ready + row.running + row.deferred > 0);
  const total = history?.summary.reduce((sum, row) => sum + row.completed_jobs, 0);
  const arrived = history?.summary.reduce((sum, row) => sum + row.arrived_jobs, 0);
  const failed = history?.summary.reduce((sum, row) => sum + row.failed_jobs, 0) ?? 0;
  const cancelled = history?.summary.reduce((sum, row) => sum + row.cancelled_jobs, 0) ?? 0;

  return (
    <section className="job-activity" aria-label="Job activity">
      <div className="job-activity-heading">
        <div>
          <h2>Job activity</h2>
          <p>{history ? `${number(arrived!)} new jobs · ${number(total!)} completed in the selected period` : "Queue history, incoming jobs, and completions across ML and browser work."}</p>
        </div>
        {history && <span className="job-activity-updated">History updated {clock(history.as_of)}</span>}
      </div>
      {error && <div className="job-activity-error" role="status">
        <AlertCircle size={14} aria-hidden="true" />
        <span>{error}{history && " Showing the last loaded history."}</span>
        <button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button>
      </div>}
      <div className="job-activity-summary">
        {kinds.map(kind => <CompletionMetric key={kind} kind={kind} history={history} unavailable={Boolean(error)} />)}
      </div>
      <article className="admin-card job-backlog" aria-label="Queue backlog history">
        <div className="job-chart-heading">
          <div><h3>Queue backlog over time</h3><p>Estimated unfinished jobs, including running and deferred work</p></div>
        </div>
        <div className="job-chart-legend" aria-label="Backlog by job type">
          {kinds.map(kind => <LegendItem key={kind} color={COLORS[kind]} label={WORKER_KIND_COPY[kind].label} />)}
        </div>
        <div className="job-backlog-totals">
          {history?.summary.filter(row => kinds.includes(row.kind)).map(row => {
            const change = row.backlog_jobs - row.initial_backlog_jobs;
            return <div key={row.kind}>
              <span style={{ color: COLORS[row.kind] }}>{WORKER_KIND_COPY[row.kind].label}</span>
              <strong>{number(row.backlog_jobs)}</strong> unfinished
              <span className={change > 0 ? "job-balance-behind" : change < 0 ? "job-balance-ahead" : ""}>
                {change > 0 ? "+" : ""}{number(change)} in period
              </span>
            </div>;
          })}
        </div>
        <div className="job-history-plot" aria-busy={!history && !error}>
          {!history ? <HistoryPlaceholder unavailable={Boolean(error)} /> : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={backlogPoints} margin={{ top: 10, right: 18, left: 0, bottom: 5 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="#eeece9" strokeDasharray="3 3" />
                <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time" ticks={ticks} tickFormatter={value => timeTick(value, windowHours)} minTickGap={45} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis width={45} tickFormatter={compact} allowDecimals={false} domain={[0, 'auto']} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<BacklogTooltip kinds={kinds} />} />
                {kinds.map(kind => <Line key={kind} dataKey={`backlog.${kind}`} name={WORKER_KIND_COPY[kind].label} type="stepAfter" stroke={COLORS[kind]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <p className="job-chart-note">Earlier values are estimated from retained job records. Reopened or deleted jobs can change the history. Failures and cancellations reduce the backlog.</p>
      </article>
      <div className="job-activity-charts">
        <article className="admin-card job-history" aria-label="Job completion history">
          <div className="job-chart-heading">
            <div>
              <h3>{mode === "rate" ? "Incoming and completed jobs per minute" : "Completed jobs over time"}</h3>
              <p>{history ? `${history.bucket_minutes}-minute intervals${mode === "rate" ? ", averaged per minute" : ""}` : error ? "History unavailable" : "Loading job history"}</p>
            </div>
            <div className="job-chart-toggle" aria-label="Completion chart metric">
              <button type="button" aria-pressed={mode === "rate"} onClick={() => setMode("rate")}>Jobs/min</button>
              <button type="button" aria-pressed={mode === "completed"} onClick={() => setMode("completed")}>Completed</button>
            </div>
          </div>
          <div className="job-chart-legend" aria-label="Job types">
            {kinds.map(kind => <LegendItem key={kind} color={COLORS[kind]} label={`${WORKER_KIND_COPY[kind].label}${mode === "rate" ? " completed" : ""}`} />)}
            {mode === "rate" && kinds.map(kind => <LegendItem key={`${kind}-incoming`} color={COLORS[kind]} label={`${WORKER_KIND_COPY[kind].label} incoming`} dashed />)}
          </div>
          <div className="job-history-plot" aria-busy={!history && !error}>
            {!history ? <HistoryPlaceholder unavailable={Boolean(error)} /> : mode === "rate" ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 10, right: 18, left: 0, bottom: 5 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#eeece9" strokeDasharray="3 3" />
                  <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} scale="time" ticks={ticks} tickFormatter={value => timeTick(value, windowHours)} minTickGap={45} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis width={45} tickFormatter={rate} tick={AXIS_TICK} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                  <Tooltip content={<HistoryTooltip mode={mode} kinds={kinds} />} />
                  {kinds.map(kind => <Line key={kind} dataKey={kind} name={WORKER_KIND_COPY[kind].label} type="linear" stroke={COLORS[kind]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />)}
                  {kinds.map(kind => <Line key={`${kind}-incoming`} dataKey={`${kind}_incoming`} name={`${WORKER_KIND_COPY[kind].label} incoming`} type="linear" stroke={COLORS[kind]} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />)}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={points} margin={{ top: 10, right: 18, left: 0, bottom: 5 }} accessibilityLayer>
                  <CartesianGrid vertical={false} stroke="#eeece9" strokeDasharray="3 3" />
                  <XAxis dataKey="time" ticks={ticks} tickFormatter={value => timeTick(value, windowHours)} minTickGap={45} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis width={45} tickFormatter={compact} allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<HistoryTooltip mode={mode} kinds={kinds} />} cursor={{ fill: "#fafaf9" }} />
                  {kinds.map(kind => <Bar key={kind} dataKey={kind} stackId="completed" fill={COLORS[kind]} name={WORKER_KIND_COPY[kind].label} isAnimationActive={false} />)}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="job-chart-note">Incoming counts newly created jobs. Successful jobs and batches count once. Retries are not new arrivals.{history && " First and last intervals may be partial."}
            {history && ` ${number(failed)} failed · ${number(cancelled)} cancelled in the period.`}
          </p>
        </article>
        <article className="admin-card job-queue" aria-label="Queue by job type">
          <div className="job-chart-heading"><div><h3>Queue by job type</h3><p>Current jobs, across all queues</p></div></div>
          <div className="job-chart-legend">{QUEUE_STATES.map(state => <LegendItem key={state.key} color={state.color} label={state.label} />)}</div>
          <div className="job-queue-plot" style={{ height: 75 + queue.length * 50 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={queue} margin={{ top: 5, right: 18, bottom: 5, left: 0 }} barSize={22} accessibilityLayer>
                <CartesianGrid horizontal={false} stroke="#eeece9" strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={compact} tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={72} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <Tooltip content={<QueueTooltip />} cursor={{ fill: "#fafaf9" }} />
                {QUEUE_STATES.map(state => <Bar key={state.key} dataKey={state.key} name={state.label} stackId="queue" fill={state.color} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="job-queue-totals">
            {queue.map(row => <div key={row.kind}><span className="job-kind-label" style={{ color: COLORS[row.kind] }}>{row.label}</span><span><strong>{number(row.ready)}</strong> ready · {number(row.running)} running · {number(row.deferred)} deferred</span></div>)}
          </div>
          <p className="job-chart-note">Deferred jobs are scheduled, paused, or waiting for references.</p>
        </article>
      </div>
    </section>
  );
}

const AXIS_TICK = { fontSize: 10, fill: "#78716c" };

function CompletionMetric({ kind, history, unavailable }: {
  kind: AdminMonitoringWorkerKind;
  history: AdminJobActivity | null;
  unavailable: boolean;
}) {
  const row = history?.summary.find(item => item.kind === kind);
  const Icon = kind === "ml" ? Cpu : kind === "browser" ? Globe2 : WORKER_KIND_COPY[kind].icon;
  const balance = row ? row.recent_jobs_per_minute - row.recent_arrivals_per_minute : null;
  return <article className="admin-card job-completion-metric" aria-label={`${WORKER_KIND_COPY[kind].label} job flow`}>
    <div className="job-completion-main">
      <div className="job-completion-count">
        <p className="job-kind-label" style={{ color: COLORS[kind] }}><Icon size={14} aria-hidden="true" />{WORKER_KIND_COPY[kind].label} jobs completed</p>
        <strong>{row ? number(row.completed_jobs) : unavailable ? "Unavailable" : "Loading..."}</strong>
        <span>{row ? `${number(row.arrived_jobs)} new jobs in the period` : "In the selected period"}</span>
      </div>
      <div className="job-completion-rate">
        <p><strong>{row ? rate(row.recent_jobs_per_minute) : unavailable ? "N/A" : "..."}</strong> completed/min</p>
        <p><strong>{row ? rate(row.recent_arrivals_per_minute) : unavailable ? "N/A" : "..."}</strong> incoming/min</p>
        <span>Last {history?.recent_minutes ?? 5} minutes</span>
      </div>
    </div>
    {balance !== null && <p className={`job-flow-balance ${balance > 0 ? "job-balance-ahead" : balance < 0 ? "job-balance-behind" : ""}`}>
      {balance > 0 ? `Completing ${rate(balance)} jobs/min more than new arrivals`
        : balance < 0 ? `New arrivals exceed completions by ${rate(-balance)} jobs/min`
          : "Completions are keeping pace with new arrivals"}
    </p>}
    {row && <p className="job-flow-average">Period average: {rate(row.average_arrivals_per_minute)} incoming/min · {rate(row.average_jobs_per_minute)} completed/min</p>}
  </article>;
}

function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span><i className={dashed ? "job-legend-dashed" : ""} style={dashed ? { borderColor: color } : { background: color }} aria-hidden="true" />{label}</span>;
}

function HistoryPlaceholder({ unavailable }: { unavailable: boolean }) {
  return <div className="job-chart-empty">
    {!unavailable && <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />}
    <p>{unavailable ? "Job history unavailable" : "Loading job history..."}</p>
  </div>;
}

function BacklogTooltip({ active, payload, kinds }: {
  active?: boolean;
  payload?: Array<{ payload: { time: number; backlog: Record<AdminMonitoringWorkerKind, number> } }>;
  kinds: AdminMonitoringWorkerKind[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return <div className="job-chart-tooltip">
    <p>{new Date(point.time).toLocaleDateString([], { month: "short", day: "numeric" })} · {clock(new Date(point.time).toISOString())}</p>
    {kinds.map(kind => <div key={kind}><span style={{ color: COLORS[kind] }}>{WORKER_KIND_COPY[kind].label}</span><strong>{number(point.backlog[kind])} unfinished</strong></div>)}
    <small>Estimated backlog, including running and deferred jobs</small>
  </div>;
}

function HistoryTooltip({ active, payload, mode, kinds }: {
  active?: boolean;
  payload?: Array<{ payload: AdminJobActivity["series"][number] }>;
  mode: "rate" | "completed";
  kinds: AdminMonitoringWorkerKind[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const minutes = (Date.parse(point.ended_at) - Date.parse(point.started_at)) / 60_000;
  return <div className="job-chart-tooltip">
    <p>{new Date(point.started_at).toLocaleDateString([], { month: "short", day: "numeric" })} · {clock(point.started_at)} to {clock(point.ended_at)}</p>
    {kinds.map(kind => <div key={kind}><span style={{ color: COLORS[kind] }}>{WORKER_KIND_COPY[kind].label} completed</span><strong>{mode === "rate" ? `${rate(point.per_minute[kind])}/min` : `${number(point.completed[kind])} jobs`}</strong></div>)}
    {mode === "rate" && kinds.map(kind => <div key={`${kind}-incoming`}><span style={{ color: COLORS[kind] }}>{WORKER_KIND_COPY[kind].label} incoming</span><strong>{rate(point.arrivals_per_minute[kind])}/min</strong></div>)}
    <small>{rate(minutes)} minutes · {number(Object.values(point.completed).reduce((sum, value) => sum + value, 0))} completed</small>
  </div>;
}

function QueueTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; ready: number; running: number; paused: number; scheduled: number; blocked: number } }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return <div className="job-chart-tooltip"><p>{row.label} jobs</p>
    {[['Ready', row.ready], ['Running', row.running], ['Scheduled', row.scheduled], ['Paused', row.paused], ['Waiting for references', row.blocked]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{number(value as number)}</strong></div>)}
  </div>;
}

function timeTick(value: number, hours: number) {
  const date = new Date(value);
  if (hours >= 72) return date.toLocaleDateString([], { month: "short", day: "numeric" });
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function dailyTicks(history: AdminJobActivity | null) {
  if (!history || history.window_hours < 72) return undefined;
  const date = new Date(history.since);
  date.setHours(0, 0, 0, 0);
  if (date.getTime() < Date.parse(history.since)) date.setDate(date.getDate() + 1);
  const ticks: number[] = [];
  while (date.getTime() <= Date.parse(history.as_of)) {
    ticks.push(date.getTime());
    date.setDate(date.getDate() + 1);
  }
  return ticks;
}
