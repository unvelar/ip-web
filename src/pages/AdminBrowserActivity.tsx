import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowDown, ArrowLeft, Check, ChevronRight, Clock3, Globe2, ImageOff, LayoutGrid, List, LoaderCircle, Monitor, Pause, Play, RefreshCw, Search, X } from "lucide-react";
import { AdminPage } from "../components/admin/AdminPage";
import { ADMIN_JOB_COPY } from "../features/adminMonitoring/monitoringJobs";
import { useBrowserActivity } from "../features/browserActivity/useBrowserActivity";
import { getCapture, getHistory, getWorkers, type ActivityEvent, type ActivityJob, type ActivityWorker, type Capture, type JobHistory, type JobState, type WorkerSnapshot, type WorkerState } from "../features/browserActivity/api";
import "../features/browserActivity/browserActivity.css";

const STATES: Record<JobState,string> = {running:"Running",unknown:"Outcome unknown",succeeded:"Succeeded",failed:"Failed",cancelled:"Cancelled",held:"On hold",retry_scheduled:"Retry scheduled",queued:"Queued"};
const WORKERS: Record<WorkerState,string> = {active:"Working",ready:"Ready",draining:"Draining",offline:"Offline",starting:"Starting"};
const ATTEMPTS: Record<string,string> = {running:"Running",completed:"Succeeded",retry:"Retry needed",failed:"Failed",deferred:"Deferred",resource_incompatible:"Returned to queue"};
const EXTRA_TYPES: Record<string,string> = {monitor_discover_strategy:"Search discovery",marketplace_auth_check:"Access check"};
function jobType(type: string) {return ADMIN_JOB_COPY[type]?.label ?? EXTRA_TYPES[type] ?? type.replaceAll("_"," ");}
function time(value: string | null | undefined) {return value?new Date(value).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"No timestamp";}
function fullTime(value: string) {return new Date(value).toLocaleString();}
function workerName(id: string | null) {return !id?"Worker unassigned":id.length>36?`${id.slice(0,16)}…${id.slice(-12)}`:id;}
function duration(job: ActivityJob) {
  if(!job.started_at) return null;
  const seconds=Math.max(0,Math.floor(((job.completed_at?Date.parse(job.completed_at):Date.now())-Date.parse(job.started_at))/1000));
  return seconds>=3600?`${Math.floor(seconds/3600)}h ${Math.floor(seconds%3600/60)}m`:seconds>=60?`${Math.floor(seconds/60)}m ${seconds%60}s`:`${seconds}s`;
}
function outcome(job: ActivityJob) {
  switch(job.state) {
    case "unknown":return "Heartbeat lost. Waiting for the lease check to confirm what happened.";
    case "failed":return job.error || "The job failed without a reported reason.";
    case "held":return job.hold_reason || "Waiting for intervention.";
    case "retry_scheduled":return `${job.error || "The attempt could not finish."} Next attempt ${fullTime(job.available_at)}.`;
    case "succeeded":return job.result.unavailable?"Check completed. The listing is no longer available.":job.result.candidates===0?"No candidates found.":job.result.candidates!==null?`${job.result.candidates.toLocaleString()} candidates discovered.`:"Job completed successfully.";
    case "cancelled":return "This job was cancelled.";
    case "queued":return "Waiting for a worker.";
    default:return job.latest_event.label || "Worker is processing this job.";
  }
}
function eventLabel(event: ActivityEvent) {
  if(event.kind==="attempt_started")return "Attempt started";
  if(event.kind==="attempt_settled")return ATTEMPTS[event.payload.status ?? ""] || "Attempt finished";
  if(event.kind==="job_state_changed")return `Job ${event.payload.status?.replaceAll("_"," ") || "updated"}`;
  return event.payload.label || event.kind.replaceAll("_"," ");
}

export default function AdminBrowserActivity() {
  const [params,setParams]=useSearchParams();
  const [query,setQuery]=useState(params.get("q") ?? "");
  const [view,setView]=useState<"feed" | "fleet">("feed");
  const [paused,setPaused]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  const feedStart=useRef<HTMLDivElement>(null);
  const [inspecting,setInspecting]=useState<string | null>(null);
  const [capture,setCapture]=useState<Capture | null>(null);
  const [compact,setCompact]=useState(false);
  const [workers,setWorkers]=useState<WorkerSnapshot | null>(null);
  const [workerError,setWorkerError]=useState<string | null>(null);
  const [fleetQuery,setFleetQuery]=useState("");
  const [fleetState,setFleetState]=useState("");
  const [workerBefore,setWorkerBefore]=useState<string>();
  const [workerPages,setWorkerPages]=useState<(string | undefined)[]>([]);
  const [workerRevision,setWorkerRevision]=useState(0);
  const [workerLoadedKey,setWorkerLoadedKey]=useState("");
  const workerKey=JSON.stringify([view,fleetQuery,fleetState,workerBefore]);
  const worker=params.get("worker") ?? "", attention=params.get("attention")==="true";
  const hours=[1,24,168].includes(Number(params.get("hours")))?Number(params.get("hours")):24;
  const feed=useBrowserActivity({worker,attention,hours,query:params.get("q") ?? ""},paused || scrolled || Boolean(inspecting) || Boolean(capture) || view==="fleet");
  useEffect(()=>{
    const onScroll=()=>setScrolled(Boolean(feedStart.current && feedStart.current.getBoundingClientRect().top < -60));
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const setFilter=(key: string,value: string)=>{
    feed.clearPage();
    setParams(current=>{const next=new URLSearchParams(current);if(value)next.set(key,value);else next.delete(key);return next;},{replace:true});
    setInspecting(null);
  };
  useEffect(()=>{
    const timer=window.setTimeout(()=>setParams(current=>{const next=new URLSearchParams(current);if(query.trim())next.set("q",query.trim());else next.delete("q");return next;},{replace:true}),350);
    return ()=>window.clearTimeout(timer);
  },[query,setParams]);
  useEffect(()=>{
    const controller=new AbortController();let running=false;
    const load=async()=>{
      if(running)return;running=true;
      try {const result=await getWorkers(view==="fleet"?fleetQuery:"",view==="fleet"?fleetState:"active",view==="fleet"?workerBefore:undefined,controller.signal);if(!controller.signal.aborted){setWorkers(result);setWorkerError(null);setWorkerLoadedKey(workerKey);}}
      catch(error){if(!controller.signal.aborted)setWorkerError(error instanceof Error?error.message:"Workers could not be loaded");}
      finally {running=false;}
    };
    const initial=window.setTimeout(()=>void load(),250),timer=window.setInterval(()=>void load(),15_000);
    return ()=>{controller.abort();window.clearTimeout(initial);window.clearInterval(timer);};
  },[fleetQuery,fleetState,workerBefore,workerRevision,view,workerKey]);
  const chooseWorker=(id: string)=>{setFilter("worker",id);setView("feed");setScrolled(false);window.scrollTo({top:0,behavior:"instant"});};
  const resume=()=>{setPaused(false);setScrolled(false);setInspecting(null);feed.refresh();window.scrollTo({top:0,behavior:"instant"});};
  const total=Object.values(workers?.counts ?? {}).reduce((sum,count)=>sum+(count ?? 0),0);
  const machines=new Map<string,ActivityWorker[]>();
  for(const item of workers?.workers ?? []) {const host=item.hostname || item.id;machines.set(host,[...(machines.get(host) ?? []),item]);}
  const viewingPaused=paused || scrolled || Boolean(inspecting) || Boolean(capture) || feed.historical;

  return <AdminPage section="browser-activity" title="Browser activity" description="A live view of the pages, captures, and outcomes across your browser workers." wide
    actions={<><span className="ba-connection" data-state={feed.connection} role="status"><i />{feed.connection==="live"?"Connected":feed.connection==="connecting"?"Connecting":feed.connection==="reconnecting"?"Reconnecting":"Disconnected"}</span>
      <button className="admin-button" onClick={()=>viewingPaused?resume():setPaused(true)} disabled={Boolean(capture)}>{viewingPaused?<Play size={14}/>:<Pause size={14}/>} {viewingPaused?"Resume feed":"Pause feed"}</button></>}>
    <div className="ba-stats admin-card" aria-label="Browser worker counts">
      <div><span>Workers seen in 14 days</span><strong>{workers?total.toLocaleString():"…"}</strong><small>{workers?.counts.starting?`${workers.counts.starting} starting · `:""}Updated every 15 seconds</small></div>
      {(["active","ready","draining","offline"] as WorkerState[]).map(state=><button key={state} onClick={()=>{setView("fleet");setFleetState(state);setWorkerBefore(undefined);setWorkerPages([]);}}>
        <span><i className="ba-dot" data-state={state}/>{WORKERS[state]}</span><strong>{workers?(workers.counts[state] ?? 0).toLocaleString():"…"}</strong><small>{state==="active"?"Jobs in progress":state==="ready"?"Available for work":state==="draining"?"Finishing current work":"Heartbeat missing"}</small>
      </button>)}
    </div>
    <div className="ba-toolbar">
      <div className="ba-segment" aria-label="Activity view"><button aria-pressed={view==="feed"} onClick={()=>setView("feed")}><List size={14}/>Feed</button><button aria-pressed={view==="fleet"} onClick={()=>setView("fleet")}><LayoutGrid size={14}/>Fleet</button></div>
      {view==="feed"?<>
        <label className="admin-search"><Search size={14}/><input value={query} onChange={event=>{feed.clearPage();setQuery(event.target.value);}} placeholder="Search domain, tenant, keyword, or job…" aria-label="Search activity"/></label>
        <button className="admin-button ba-attention" aria-pressed={attention} onClick={()=>setFilter("attention",attention?"":"true")}><AlertCircle size={14}/>Needs attention</button>
        <label className="ba-select"><span className="sr-only">Activity period</span><select value={hours} onChange={event=>setFilter("hours",event.target.value)}><option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label>
        <button className="admin-icon-button" title={compact?"Show screenshots":"Compact view"} aria-label={compact?"Show screenshots":"Compact view"} aria-pressed={compact} onClick={()=>setCompact(!compact)}>{compact?<Monitor size={15}/>:<List size={15}/>}</button>
      </>:<>
        <label className="admin-search"><Search size={14}/><input value={fleetQuery} onChange={event=>{setFleetQuery(event.target.value);setWorkerBefore(undefined);setWorkerPages([]);}} placeholder="Find a worker or host…" aria-label="Search workers"/></label>
        <label className="ba-select"><span className="sr-only">Worker state</span><select value={fleetState} onChange={event=>{setFleetState(event.target.value);setWorkerBefore(undefined);setWorkerPages([]);}}><option value="">All states</option>{Object.entries(WORKERS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </>}
    </div>
    {workerError && <div className="admin-notice" role="alert">Worker status could not be refreshed.{workers?` Last updated ${time(workers.as_of)}.`:""} <button onClick={()=>setWorkerRevision(value=>value+1)}>Try again</button></div>}
    {worker && view==="feed" && <div className="ba-filter"><Monitor size={14}/>Following <strong title={worker}>{workerName(worker)}</strong><button onClick={()=>setFilter("worker","")} aria-label="Show all workers"><X size={14}/></button></div>}
    {view==="feed"?<div className="ba-layout"><main className="ba-feed" aria-label="Browser job activity">
      <div className="ba-feed-heading" ref={feedStart}><span>{feed.historical?"Earlier jobs":attention?"Jobs needing attention":"Latest jobs"}</span><span>{feed.asOf?`Updated ${time(feed.asOf)}`:feed.loading?"Loading activity":"No activity snapshot"}</span></div>
      {feed.error && <div className="admin-notice" role="alert">{feed.error} <button onClick={feed.refresh}>Try again</button></div>}
      {(feed.pending>0 || viewingPaused) && <div className="ba-updates" role="status"><span>{inspecting?"Feed paused while you inspect a job.":feed.historical?"Viewing earlier jobs.":scrolled?"Feed paused while you browse earlier activity.":viewingPaused?"Feed paused.":"New activity is ready."} {feed.pending>0?`${feed.pending>500?"Many":feed.pending} updated ${feed.pending===1?"job":"jobs"}.`:""}</span><button onClick={resume} disabled={Boolean(capture)}><ArrowDown size={14}/>{feed.pending>0?"Show updates":"Back to live"}</button></div>}
      {feed.loading?<div className="admin-card admin-empty"><LoaderCircle className="ba-spin" size={22}/><strong>Loading browser activity</strong></div>:feed.jobs.length===0 && !feed.error?<div className="admin-card admin-empty"><Monitor size={28}/><strong>{attention?"No jobs need attention":"No activity in this view yet"}</strong><p>{worker||query||attention?"Try another worker, search, or time period.":"Browser jobs will appear here when a worker starts them."}</p></div>:feed.jobs.map(job=><JobCard key={job.id} job={job} compact={compact} open={inspecting===job.id} onToggle={()=>setInspecting(inspecting===job.id?null:job.id)} onWorker={chooseWorker} onCapture={setCapture}/>)}
      {!feed.loading && <div className="ba-footer"><span>Page events kept for 7 days. Times are local.</span><div>{feed.historical&&<button className="admin-button" onClick={resume}><ArrowLeft size={13}/>Latest jobs</button>}{feed.next&&<button className="admin-button" onClick={()=>{setInspecting(null);feed.older();window.scrollTo({top:0,behavior:"instant"});}}>Earlier jobs<ChevronRight size={13}/></button>}</div></div>}
    </main><aside className="ba-rail"><div className="ba-rail-title"><h2>Working now</h2><button onClick={()=>{setView("fleet");setFleetQuery("");setFleetState("");setWorkerBefore(undefined);setWorkerPages([]);}}>View fleet<ChevronRight size={13}/></button></div>
      {workerError?<div className="ba-muted" role="alert">Worker status is unavailable. <button onClick={()=>setWorkerRevision(value=>value+1)}>Retry</button></div>:!workers||workerLoadedKey!==workerKey?<p className="ba-muted">Loading workers…</p>:workers.workers.length===0?<p className="ba-muted">No workers are processing jobs.</p>:workers.workers.slice(0,8).map(item=><WorkerTile key={item.id} worker={item} selected={item.id===worker} onClick={()=>chooseWorker(item.id)}/>)}
      <p className="ba-rail-note">One card follows each job through every attempt. Open a card to see page visits, captures, and failure reasons.</p>
    </aside></div>:<>
      <div className="ba-fleet" aria-busy={workerLoadedKey!==workerKey}>{[...machines].map(([host,slots])=>slots.length===1?<WorkerTile key={host} worker={slots[0]} onClick={()=>chooseWorker(slots[0].id)}/>:<section className="ba-machine" key={host}><h2>{host}<small>{slots.length} workers on this page</small></h2><div className="ba-machine-grid">{slots.map(item=><WorkerTile key={item.id} worker={item} showHost={false} onClick={()=>chooseWorker(item.id)}/>)}</div></section>)}</div>
      {workers?.workers.length===0 && <div className="admin-empty admin-card"><Monitor size={26}/><strong>No workers match this view</strong></div>}
      <div className="ba-footer"><span>{workers?.workers.length ?? 0} workers on this page · {total} seen in 14 days</span><div><button className="admin-button" disabled={!workerPages.length || workerLoadedKey!==workerKey} onClick={()=>{setWorkerBefore(workerPages.at(-1));setWorkerPages(pages=>pages.slice(0,-1));}}><ArrowLeft size={13}/>Previous</button><button className="admin-button" disabled={!workers?.next_cursor || workerLoadedKey!==workerKey} onClick={()=>{if(workers?.next_cursor){setWorkerPages(pages=>[...pages,workerBefore]);setWorkerBefore(workers.next_cursor);}}}>Next<ChevronRight size={13}/></button></div></div>
    </>}
    {capture&&<CaptureViewer capture={capture} onClose={()=>setCapture(null)}/>}
  </AdminPage>;
}

function WorkerTile({worker,selected,onClick,showHost=true}: {worker: ActivityWorker; selected?: boolean; onClick: ()=>void; showHost?: boolean}) {
  return <button className={`ba-worker${selected?" is-selected":""}`} onClick={onClick}>
    <div className="ba-worker-top"><span className="ba-worker-icon"><Monitor size={17}/></span><strong title={worker.id}>{workerName(worker.id)}</strong><i className="ba-dot" data-state={worker.state}/></div>
    {showHost&&worker.hostname&&worker.hostname!==worker.id&&<small className="ba-worker-host" title={worker.hostname}>{worker.hostname}</small>}
    <div className="ba-worker-state"><span>{WORKERS[worker.state]}</span><small>{worker.pool || worker.provider}</small></div>
    <p>{worker.state==="offline"?`Last heartbeat ${worker.last_heartbeat_at?fullTime(worker.last_heartbeat_at):"unavailable"}`:worker.domain || (worker.job_type?jobType(worker.job_type):"Waiting for a job")}</p>
    {!worker.activity_version&&<small className="ba-muted">Page activity requires a worker update</small>}
    <span className="ba-worker-link">Follow worker<ChevronRight size={12}/></span>
  </button>;
}

function JobCard({job,open,compact,onToggle,onWorker,onCapture}: {job: ActivityJob; open: boolean; compact: boolean; onToggle: ()=>void; onWorker: (id:string)=>void; onCapture: (capture:Capture)=>void}) {
  const url=job.latest_event.url || job.target_url;
  const elapsed=duration(job);
  return <article className="ba-job admin-card" data-state={job.state}>
    <header><span className="ba-job-icon">{job.state==="succeeded"?<Check size={18}/>:job.state==="failed"||job.state==="unknown"?<AlertCircle size={18}/>:<Globe2 size={18}/>}</span>
      <div className="ba-job-identity"><button className="ba-worker-name" onClick={()=>job.worker_id&&onWorker(job.worker_id)} disabled={!job.worker_id} title={job.worker_id ?? undefined}>{workerName(job.worker_id)}</button><span>{jobType(job.type)} · {job.tenant_name || "System"}</span></div>
      <div className="ba-job-state"><span className="ba-status" data-state={job.state}>{job.state==="succeeded"&&job.attempts>1?"Succeeded after retry":STATES[job.state]}</span><time dateTime={job.last_activity_at} title={fullTime(job.last_activity_at)}>{time(job.last_activity_at)}</time></div>
    </header>
    <div className="ba-job-content"><h2>{job.keyword || job.domain || jobType(job.type)}</h2>{url&&<p className="ba-url" title={url}><Globe2 size={12}/>{url}</p>}
      <p className="ba-outcome">{outcome(job)}</p>
      {!compact && job.captures.length>0 && <div className="ba-captures">{job.captures.map(item=><CaptureThumb key={item.id} capture={item} onClick={()=>onCapture(item)}/>)}</div>}
    </div>
    <footer><span>{elapsed&&<><Clock3 size={12}/><span title="Duration of the latest attempt">{elapsed}</span><span aria-hidden="true">·</span></>}{job.attempts} {job.attempts===1?"attempt":"attempts"}<span className="ba-job-id" title={job.id}>Job {job.id.slice(0,8)}</span></span><button aria-expanded={open} onClick={onToggle}>{open?"Close timeline":"View timeline"}<ChevronRight className={open?"ba-rotate":""} size={14}/></button></footer>
    {open&&<JobTimeline job={job} onCapture={onCapture}/>}
  </article>;
}

function CaptureThumb({capture,onClick}: {capture: Capture; onClick: ()=>void}) {
  const [failedUrl,setFailedUrl]=useState<string | null>(null);
  const ready=capture.status==="ready" && capture.thumbnail_url && capture.thumbnail_url!==failedUrl;
  return <button className="ba-capture" onClick={onClick} disabled={capture.status!=="ready"} aria-label={`Open ${capture.label} at ${time(capture.occurred_at)}`}>
    {ready?<img src={capture.thumbnail_url!} loading="lazy" alt={capture.label} onError={()=>setFailedUrl(capture.thumbnail_url)}/>:<span className="ba-capture-placeholder"><ImageOff size={20}/>{capture.status==="expired"?"Capture expired":capture.status==="uploading"?"Uploading":"Preview unavailable"}</span>}
    <span><strong>{capture.label}</strong><time>{time(capture.occurred_at)}</time></span>
  </button>;
}

function JobTimeline({job,onCapture}: {job: ActivityJob; onCapture:(capture:Capture)=>void}) {
  const [history,setHistory]=useState<JobHistory | null>(null),[error,setError]=useState<string | null>(null);
  const [before,setBefore]=useState<string>(),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    void getHistory(job.id,before,controller.signal).then(value=>{if(!controller.signal.aborted){setHistory(value);setError(null);}}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Timeline unavailable");});
    return ()=>controller.abort();
  },[job.id,before,revision]);
  const attempts=history?.attempts ?? [];
  const orphaned=history?.events.filter(event=>!attempts.some(attempt=>attempt.id===event.attempt_id)) ?? [];
  const renderEvent=(event: ActivityEvent)=><li key={event.event_id}><time title={fullTime(event.occurred_at)}>{time(event.occurred_at)}</time><span className="ba-timeline-dot"/><div><strong>{eventLabel(event)}</strong>{event.payload.url&&<p title={event.payload.url}>{event.payload.url}</p>}{event.payload.diagnostics&&event.payload.diagnostics.code!=="accepted"&&<p className="ba-reason">{event.payload.diagnostics.message}</p>}{event.payload.late&&<small>Received after this attempt ended · {time(event.received_at)}</small>}{event.kind==="activity_gap"&&event.payload.count&&<small>{event.payload.count} events omitted</small>}</div></li>;
  return <section className="ba-timeline" aria-label={`Timeline for job ${job.id}`}>
    <div className="ba-timeline-title"><h3>Job timeline</h3><button onClick={()=>{setBefore(undefined);setRevision(value=>value+1);}}><RefreshCw size={12}/>Refresh</button></div>
    {error&&<p role="alert" className="ba-reason">{error}</p>}
    {!history&&!error?<p className="ba-muted">Loading timeline…</p>:<>
      {attempts.map((attempt,index)=>{
        const events=history!.events.filter(event=>event.attempt_id===attempt.id);
        const captures=history!.captures.filter(item=>item.attempt_id===attempt.id);
        return <div className="ba-attempt" key={attempt.id}><div className="ba-attempt-title"><strong>{index===0?"Latest attempt":"Earlier attempt"}</strong><span>{ATTEMPTS[attempt.status] || attempt.status}</span></div>
          <p className="ba-attempt-meta" title={attempt.worker_instance_id ?? ""}>{workerName(attempt.worker_instance_id)} · {fullTime(attempt.started_at)}<span title={`Immutable attempt ${attempt.id}`}>#{attempt.id}</span></p>
          {attempt.error&&<p className="ba-reason">{attempt.error}</p>}
          {captures.length>0&&<div className="ba-captures">{captures.map(item=><CaptureThumb key={item.id} capture={item} onClick={()=>onCapture(item)}/>)}</div>}
          <ol>{events.map(renderEvent)}</ol>{events.length===0&&<p className="ba-muted">No page events in this portion of the retained timeline.</p>}
        </div>;
      })}
      {orphaned.length>0&&<div className="ba-attempt"><h3>Earlier activity</h3><ol>{orphaned.map(renderEvent)}</ol></div>}
      <div className="ba-timeline-bottom"><small>Page events: 7 days. Captures: 72 hours, or 7 days for failures.</small><div>{before&&<button onClick={()=>setBefore(undefined)}>Latest events</button>}{history?.next_cursor&&<button onClick={()=>setBefore(history.next_cursor!)}>Earlier events<ChevronRight size={12}/></button>}</div></div>
    </>}
  </section>;
}

function CaptureViewer({capture,onClose}: {capture:Capture;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  const [url,setUrl]=useState<string | null>(null),[error,setError]=useState<string | null>(null);
  useEffect(()=>{
    const dialog=ref.current;dialog?.showModal();const controller=new AbortController();
    void getCapture(capture.id,controller.signal).then(result=>{if(!controller.signal.aborted)setUrl(result.url);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Capture unavailable");});
    return ()=>{controller.abort();dialog?.close();};
  },[capture.id]);
  return <dialog ref={ref} className="ba-viewer" aria-labelledby="ba-capture-title" onClose={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div><header><div><h2 id="ba-capture-title">{capture.label}</h2><p>{workerName(capture.worker_id)} · {fullTime(capture.occurred_at)}</p></div><button autoFocus onClick={onClose} aria-label="Close capture"><X size={20}/></button></header>
      {error?<p className="ba-viewer-message" role="alert">{error}</p>:url?<img src={url} alt={`${capture.label}, captured at ${fullTime(capture.occurred_at)}`} onError={()=>setError("This capture could not be loaded. Close and reopen it to retry.")}/>:<p className="ba-viewer-message">Loading capture…</p>}
      {capture.url&&<p className="ba-viewer-url">{capture.url}</p>}
    </div>
  </dialog>;
}
