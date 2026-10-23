import {AssistantTracePanel} from "../features/assistantTrace/AssistantTracePanel";
import { useState } from "react";
import { Activity as ActivityIcon, ArrowDown, ArrowRight, Check, CheckCheck, ChevronRight, CircleAlert, Clock3, Code2, Cpu, FileInput, GitBranch, List, Pause, Play, Search, Server, X } from "lucide-react";
import { AdminPage } from "../components/admin/AdminPage";
import { stateLabels, providerLabel, type Activity, type ActivityState } from "../features/llmActivity/model";
import { useLlmActivity, useJobInspector } from "../features/llmActivity/useLlmActivity";
import "../features/llmActivity/llmActivity.css";

function time(value: number) { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
function StateBadge({ state }: { state: ActivityState }) {
  return <span className="la-status" data-state={state}><i />{stateLabels[state]}</span>;
}

export default function AdminLlmActivity() {
  const [showAssistant,setShowAssistant]=useState(()=>new URLSearchParams(window.location.search).has("assistant_trace"));
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState<"feed" | "fleet">("feed");
  const [provider, setProvider] = useState<string>("all");
  const [state, setState] = useState<ActivityState | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"output" | "input" | "timeline">("output");
  const [raw, setRaw] = useState(false);
  const [workerFilter, setWorkerFilter] = useState<string | null>(null);

  const [showOffline, setShowOffline] = useState(false);
  const [fleetLimit, setFleetLimit] = useState(48);
  const feed = useLlmActivity(paused, Boolean(selectedId));
  const jobs = feed.snapshot?.jobs ?? [];
  const workers = (feed.snapshot?.workers ?? []).map(worker => ({ ...worker, provider: providerLabel(worker.provider) }));
  const fleetWorkers = workers.filter(worker => (showOffline || !["offline", "drained"].includes(worker.effective_status)) && (provider === "all" || worker.provider === provider) && `${worker.id} ${worker.provider} ${worker.pool}`.toLowerCase().includes(query.toLowerCase()));
  const providers = [...new Set([...workers.map(worker => worker.provider), ...jobs.map(job => job.provider)])].sort();
  const filtered = jobs.filter(job => (provider === "all" || job.provider === provider)
    && (state === "all" || job.state === state) && (!workerFilter || job.worker === workerFilter)
    && `${job.title} ${job.tenant} ${job.worker} ${job.type} ${job.id} ${job.summary}`.toLowerCase().includes(query.toLowerCase()));
  const selectedRow = filtered.find(job => job.id === selectedId) ?? null;
  const inspector = useJobInspector(selectedRow, workers, paused);
  const selected = inspector?.activity ?? selectedRow;
  const updatedCount = feed.pending;
  function select(job: Activity) { setSelectedId(job.id); setTab("output"); setRaw(false); }
  function reset() { setProvider("all"); setState("all"); setWorkerFilter(null); setQuery(""); }
  function applyUpdates() { feed.applyUpdates(); }

  return <AdminPage section="llm-activity" title="LLM activity" description="See what your workers are processing, what they return, and what happens next." wide
    actions={<><span className="la-connection"><i />{paused ? "Paused" : feed.error ? "Reconnecting" : feed.loading ? "Connecting" : "Connected · refreshes every 10s"}</span><button className="admin-button" onClick={() => setPaused(value => !value)}>{paused ? <Play size={14} /> : <Pause size={14} />}{paused ? "Resume feed" : "Pause feed"}</button></>}>
    <button className="admin-button" aria-expanded={showAssistant} onClick={()=>setShowAssistant(value=>!value)}>{showAssistant?"Hide search assistant traces":"Inspect search assistant traces"}</button>
    {showAssistant&&<AssistantTracePanel/>}
    {feed.error && <div className="la-error" role="alert"><CircleAlert size={15}/><span>{feed.error}{feed.snapshot ? " Showing the last available snapshot." : ""}</span><button className="admin-button" onClick={feed.refresh}>Retry</button></div>}
    {feed.warning && <div className="la-error" role="status"><CircleAlert size={15}/><span>{feed.warning}</span></div>}
    <div className="la-live-note"><span>Live worker status & saved job results</span><small>Recent monitoring jobs + model work observed in this session · read only</small></div>
    <div className="la-stats admin-card" aria-label="Activity counts">
      <button onClick={() => { reset(); setShowOffline(true); setView("fleet"); }}><span>Registered workers</span><strong>{feed.loading ? "…" : workers.length}</strong><small>Seen in the last 14 days</small></button>
      {(["running", "queued", "succeeded", "failed"] as const).map(value => <button key={value} aria-pressed={view === "feed" && state === value} onClick={() => { reset(); setState(value); setView("feed"); }}><span><i className="la-dot" data-state={value} />{value === "running" ? "Working now" : value === "queued" ? "Queued" : value === "failed" ? "Needs attention" : "Accepted results"}</span><strong>{feed.loading ? "…" : jobs.filter(job => job.state === value).length}</strong><small>{value === "running" ? "Model work & coordination" : value === "queued" ? "Waiting to start" : value === "failed" ? "Failed jobs in this view" : "Completed jobs in this view"}</small></button>)}
    </div>
    <div className="la-toolbar">
      <div className="la-segment" aria-label="Activity view"><button aria-pressed={view === "feed"} onClick={() => setView("feed")}><List size={14} />Feed</button><button aria-pressed={view === "fleet"} onClick={() => setView("fleet")}><Server size={14} />Fleet</button></div>
      <label className="admin-search"><Search size={14} /><input aria-label="Search LLM activity" placeholder={view === "feed" ? "Search task, tenant, worker, or output…" : "Search worker, location, or pool…"} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <select aria-label="Execution location" value={provider} onChange={event => setProvider(event.target.value)}><option value="all">All locations</option>{providers.map(value => <option key={value}>{value}</option>)}</select>
      {view === "feed" && <select aria-label="Job status" value={state} onChange={event => setState(event.target.value as ActivityState | "all")}><option value="all">All statuses</option>{Object.entries(stateLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
    </div>
    {workerFilter && <div className="la-filter"><span>Following <strong>{workerFilter}</strong></span><button onClick={() => setWorkerFilter(null)} aria-label="Stop following worker"><X size={13} /></button></div>}
    {view === "feed" ? <>
      <div className="la-content">
        <section className="la-feed" aria-label="LLM job activity">
          <div className="la-heading"><h2>Latest work <span>{filtered.length}</span></h2><small>{feed.snapshot ? `Updated ${time(Date.parse(feed.snapshot.asOf))}` : "Loading worker activity…"}</small></div>
          {updatedCount > 0 && <div className="la-updates" role="status"><span>{updatedCount} {updatedCount === 1 ? "job has" : "jobs have"} new activity</span><button onClick={applyUpdates}><ArrowDown size={13} />Show updates</button></div>}
          {filtered.map(job => <button className={`la-job admin-card${selected?.id === job.id ? " la-selected" : ""}`} key={job.id} aria-pressed={selected?.id === job.id} onClick={() => select(job)}>
            <header><span className="la-worker-icon" data-state={job.state}>{job.state === "succeeded" ? <Check size={17} /> : job.state === "failed" ? <CircleAlert size={17} /> : job.provider === "Coordinator" ? <GitBranch size={17} /> : <Cpu size={17} />}</span><div><strong>{job.worker}</strong><small>{job.provider} <span>·</span> {job.tenant}</small></div><div className="la-job-state"><StateBadge state={job.state} /><time>{time(job.updated)}</time></div></header>
            <h3>{job.title}</h3><p className="la-context">{job.context}</p>
            {job.state === "running" && <div className="la-progress"><div><span>{job.phase}</span><strong>{job.totalUnits !== null ? `${job.totalUnits} ${job.unit}` : "Progress not reported"}</strong></div></div>}
            <div className="la-output-preview" data-state={job.state}><span>{job.state === "failed" ? <CircleAlert size={13} /> : <Code2 size={13} />}{job.state === "queued" ? "No output yet" : job.state === "running" || job.state === "unknown" ? "Output pending" : "Output"}</span><p>{job.summary}</p></div>
            <footer><span>{job.model ?? "Model not reported"} <span>·</span> <Clock3 size={12} />{job.elapsed !== null ? `${job.elapsed}s` : "Not started"} <span>·</span> Attempt {job.attempt}</span><span>Inspect <ChevronRight size={13} /></span></footer>
          </button>)}
          {!filtered.length && !feed.loading && <div className="la-empty admin-card"><Search size={24} /><h3>{feed.error && !feed.snapshot ? "Activity unavailable" : "No matching activity"}</h3><p>Try a different location, status, or search.</p><button className="admin-button" onClick={reset}>Clear filters</button></div>}
        </section>
        <aside className="la-rail">
          {selected ? <section className="la-inspector admin-card" aria-label="Job inspector">
            <header><span><ActivityIcon size={15} />Job inspector</span><button aria-label="Close job inspector" onClick={() => setSelectedId(null)}><X size={16} /></button></header>
            <div className="la-inspector-summary"><div><span className="la-provider">{selected.provider}</span><StateBadge state={selected.state} /></div><h2>{selected.title}</h2><p>{selected.worker} · {selected.tenant}</p><code>{selected.type}</code></div>
            <div className="la-tabs" role="tablist" aria-label="Job details">{(["output", "input", "timeline"] as const).map(value => <button key={value} role="tab" id={`la-${value}-tab`} tabIndex={tab === value ? 0 : -1} aria-selected={tab === value} aria-controls="la-detail-panel" onClick={() => setTab(value)} onKeyDown={event => {
              const tabs = ["output", "input", "timeline"] as const;
              const index = tabs.indexOf(value);
              const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length] : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length] : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : null;
              if (next) { event.preventDefault(); setTab(next); event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#la-${next}-tab`)?.focus(); }
            }}>{value === "output" ? <Code2 size={13} /> : value === "input" ? <FileInput size={13} /> : <Clock3 size={13} />}{value === "output" ? "Output" : value === "input" ? "Input" : "Timeline"}</button>)}</div>
            <div id="la-detail-panel" role="tabpanel" aria-labelledby={`la-${tab}-tab`} className="la-detail">
              {inspector?.error && <p className="la-error" role="alert">{inspector.error}</p>}
              {!inspector && <p className="la-no-output">Loading recorded job details…</p>}
              {tab === "output" && <>
                <div className="la-output-heading"><span>{selected.raw ? "Saved result preview" : "Output pending / unavailable"}</span><button aria-pressed={raw} onClick={() => setRaw(value => !value)} disabled={!selected.raw}><Code2 size={12} />{raw ? "Summary" : "JSON"}</button></div>
                <div className="la-acceptance" data-state={selected.state}>{selected.state === "succeeded" ? <CheckCheck size={14} /> : selected.state === "failed" ? <CircleAlert size={14} /> : <Clock3 size={14} />}<span>{selected.state === "succeeded" ? selected.raw ? "Output saved · job completed" : "Job completed · output unavailable" : selected.state === "failed" ? "Failed · no accepted result" : selected.state === "queued" ? "Inference has not started" : "No accepted output reported"}</span></div>
                {raw ? <pre><code>{JSON.stringify(selected.raw, null, 2)}</code></pre> : selected.output.length ? <div className="la-result-rows">{selected.output.map(row => <div key={row.label}><span>{row.label}</span><strong>{row.value}</strong><p>{row.detail}</p></div>)}</div> : <p className="la-no-output">{selected.summary}</p>}
                <p className="la-evidence-note">{selected.provider === "Coordinator" ? "Coordinator events show routing and capacity decisions. No LLM response is attributed to this process." : "The API exposes saved job results. Token streaming and intermediate model responses are not recorded."}</p>
              </>}
              {tab === "input" && <><div className="la-output-heading"><span>Input context</span><FileInput size={14} /></div><dl className="la-input-meta"><div><dt>Job</dt><dd>{selected.id}</dd></div><div><dt>Worker</dt><dd>{selected.worker}</dd></div><div><dt>Attempt</dt><dd>{selected.attempt}</dd></div><div><dt>Model</dt><dd>{selected.model ?? "Not reported"}</dd></div></dl><pre><code>{JSON.stringify(selected.input, null, 2)}</code></pre><p className="la-evidence-note">Recorded job payload. Credentials, large vectors, and long fields are omitted or redacted in this preview.</p></>}
              {tab === "timeline" && <><div className="la-output-heading"><span>Attempt {selected.attempt}</span><span>{selected.elapsed !== null ? `${selected.elapsed}s` : "Not started"}</span></div><ol className="la-timeline">{selected.events.map((event, index) => <li key={`${event.label}-${index}`}><i /><div><strong>{event.label}</strong><p>{event.detail}</p></div><time>{event.seconds !== null ? `+${event.seconds}s` : "—"}</time></li>)}</ol>{inspector && <div className="la-attempts"><h3>Recorded attempts</h3>{inspector.attempts.length ? inspector.attempts.map(attempt => <article key={attempt.id}><strong>Attempt {attempt.attempt_number} · {attempt.status}</strong><p>{attempt.worker_instance_id ?? "Worker unrecorded"} · {time(Date.parse(attempt.started_at))}</p>{attempt.error && <p>{attempt.error}</p>}</article>) : <p className="la-no-output">No attempt records available.</p>}</div>}<p className="la-evidence-note">Timeline uses recorded claims and completion times. Intermediate inference events are not exposed.</p></>}
            </div><footer><span>Job <code>{selected.id}</code></span><span>Recorded backend data</span></footer>
          </section> : <div className="la-empty admin-card"><Cpu size={24} /><h3>Inspect a job</h3><p>Select any activity card to see its input, output, and timeline.</p></div>}
          <section className="la-working admin-card"><header><h2>Working now</h2><button onClick={() => setView("fleet")}>View fleet <ArrowRight size={12} /></button></header>{jobs.filter(job => job.state === "running" && (provider === "all" || job.provider === provider)).map(job => <button key={job.id} onClick={() => { reset(); select(job); }}><div><Cpu size={14} /><strong>{job.worker}</strong><i className="la-dot" data-state="running" /></div><p>{job.phase}</p><small>{job.provider} · {job.elapsed !== null ? `${job.elapsed}s` : "Timing unavailable"}</small></button>)}{!jobs.some(job => job.state === "running" && (provider === "all" || job.provider === provider)) && <p className="la-no-output">No workers processing jobs in this view.</p>}</section>
        </aside>
      </div><p className="la-footnote">Each card follows a job. The feed updates automatically; new activity is buffered while an inspector is open.</p>
    </> : <section aria-label="Worker fleet"><div className="la-heading"><h2>Worker fleet</h2><button className="admin-button" aria-pressed={showOffline} onClick={() => { setShowOffline(value => !value); setFleetLimit(48); }}>{showOffline ? "Hide offline workers" : "Show offline workers"}</button></div><div className="la-fleet">{fleetWorkers.slice(0, fleetLimit).map(worker => {
      const work = jobs.find(job => job.worker === worker.id && job.state === "running");
      const workerState = ({ busy: "Working", idle: "Ready", offline: "Offline", error: "Error", draining: "Draining", drained: "Drained", registered: "Starting", provisioning: "Starting" } as Record<string, string>)[worker.effective_status] ?? worker.effective_status;
      return <article className="admin-card la-fleet-worker" key={worker.id}><header><span className="la-worker-icon"><Server size={19} /></span><span className="la-status" data-state={["Offline", "Error"].includes(workerState) ? "failed" : workerState === "Working" ? "running" : workerState === "Ready" ? "succeeded" : "held"}><i />{workerState}</span></header><h3>{worker.id}</h3><p>{worker.provider} · {worker.hardware.gpu_name ?? worker.hardware.hostname ?? "Hardware not reported"}</p><dl><div><dt>Pool</dt><dd>{worker.pool}</dd></div><div><dt>Worker state</dt><dd>{workerState}</dd></div><div><dt>Heartbeat</dt><dd>{worker.last_heartbeat_at ? `Last seen ${time(Date.parse(worker.last_heartbeat_at))}` : "Not recorded"}</dd></div></dl><div className="la-fleet-work"><small>Current work</small><strong>{work?.title ?? (worker.current_job_type ? worker.current_job_type.replaceAll("_", " ") : workerState === "Ready" ? "Available for compatible work" : workerState === "Offline" ? "Heartbeat missing; availability unknown" : "No current model job reported")}</strong></div><button className="admin-button" onClick={() => { setWorkerFilter(worker.id); setQuery(""); setState("all"); setView("feed"); if (work) select(work); }}>Follow worker <ArrowRight size={13} /></button></article>;
    })}</div>{fleetWorkers.length > fleetLimit && <button className="admin-button" onClick={() => setFleetLimit(value => value + 48)}>Show more workers ({fleetWorkers.length - fleetLimit} remaining)</button>}{!fleetWorkers.length && !feed.loading && <div className="la-empty admin-card"><h3>No matching workers</h3><button className="admin-button" onClick={reset}>Clear filters</button></div>}</section>}
  </AdminPage>;
}
