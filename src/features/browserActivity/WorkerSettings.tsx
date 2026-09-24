import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { getLoginSessions, loginSessionAction, saveWorkerCapacity, type ActivityWorker, type LoginSession } from "./api";

const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

export function WorkerSettings({worker,onClose,onSaved}: {worker:ActivityWorker;onClose:()=>void;onSaved:()=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [limit,setLimit] = useState(String(worker.max_parallel_jobs ?? 1));
  const [savedLimit,setSavedLimit] = useState(worker.max_parallel_jobs ?? 1);
  const [sessions,setSessions] = useState<LoginSession[] | null>(null);
  const [busy,setBusy] = useState<string | null>(null);
  const [error,setError] = useState<string | null>(null);
  const [sessionError,setSessionError] = useState<string | null>(null);
  const [notice,setNotice] = useState<string | null>(null);
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const element=dialog.current;element?.showModal();
    return ()=>element?.close();
  },[]);
  useEffect(()=>{
    if(worker.concurrency_version!=="1")return;
    const controller=new AbortController();let loading=false;
    const load=async()=>{
      if(loading)return;loading=true;
      try {const value=await getLoginSessions(worker.id,controller.signal);if(!controller.signal.aborted){setSessions(value.sessions);setSessionError(null);}}
      catch(reason){if(!controller.signal.aborted)setSessionError(reason instanceof Error?reason.message:"Logins could not be loaded");}
      finally {loading=false;}
    };
    void load();const timer=window.setInterval(()=>void load(),10_000);
    return ()=>{controller.abort();window.clearInterval(timer);};
  },[worker.id,worker.concurrency_version,revision]);
  const max=Number(limit),valid=Number.isInteger(max)&&max>=1&&max<=32;
  const supported=worker.concurrency_version==="1";
  const save=async()=>{
    if(!valid||busy)return;
    setBusy("capacity");setError(null);setNotice(null);
    try {const result=await saveWorkerCapacity(worker.id,max);setSavedLimit(result.max_parallel_jobs);onSaved();setNotice("Capacity saved. Active jobs will finish normally.");}
    catch(reason){setError(reason instanceof Error?reason.message:"Capacity could not be saved");}
    finally {setBusy(null);}
  };
  const sessionAction=async(session:LoginSession,action:"pause"|"verify")=>{
    setBusy(session.id);setError(null);setNotice(null);
    try {await loginSessionAction(worker.id,session.id,action);setRevision(value=>value+1);onSaved();
      setNotice(action==="pause"?"New jobs for this marketplace are paused. Wait for active work to finish before signing in.":"Login verification queued. Work resumes after a successful check.");}
    catch(reason){setError(reason instanceof Error?reason.message:"The login action could not be completed");}
    finally {setBusy(null);}
  };
  const ram=worker.resources;
  return <dialog ref={dialog} className="ba-settings" aria-labelledby="ba-settings-title"
    onClose={event=>{if(!event.currentTarget.open)onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <header><div><h2 id="ba-settings-title">Worker settings</h2><p>{worker.hostname || worker.id}</p></div>
      <button className="admin-button" onClick={onClose} aria-label="Close worker settings"><X size={17}/></button></header>
    <section>
      <label htmlFor="ba-capacity">Maximum parallel jobs</label>
      <p>Different websites can run together. Each marketplace keeps its existing login.</p>
      <div className="ba-capacity-control"><input id="ba-capacity" type="number" min={1} max={32} step={1}
        value={limit} onChange={event=>setLimit(event.target.value)} disabled={!supported||busy==="capacity"}/>
        <button className="admin-button" disabled={!supported||!valid||Boolean(busy)||max===savedLimit} onClick={()=>void save()}>
          {busy==="capacity"?<LoaderCircle size={14} className="ba-spin"/>:null}Save capacity</button></div>
      {!supported?<p className="ba-reason">Update this worker before enabling parallel jobs.</p>:
        <p className="ba-muted">{worker.active_jobs?.length ?? (worker.current_job_id?1:0)} jobs running. Lowering the limit takes effect as jobs finish.</p>}
      {ram&&<div className="ba-memory"><div><span>Total RAM</span><strong>{gib(ram.total_bytes)}</strong></div>
        <div><span>Available RAM</span><strong>{gib(ram.available_bytes)}</strong></div>
        <div><span>Worker processes</span><strong>{ram.process_tree_rss_bytes===null?"Unavailable":gib(ram.process_tree_rss_bytes)}</strong></div></div>}
      {ram?.memory_limited&&<p className="ba-reason">Waiting for memory. New jobs pause below {gib(ram.reserve_bytes)} available RAM.</p>}
    </section>
    <section><h3>Marketplace logins</h3><p>Pause a marketplace, open its saved profile on this worker, and sign in. Verify the login to resume work.</p>
      {sessionError&&<p className="ba-reason" role="alert">{sessionError} <button onClick={()=>setRevision(value=>value+1)}>Retry</button></p>}
      {!supported?<p className="ba-muted">Login controls become available after this worker is updated.</p>:!sessions&&!sessionError&&<p className="ba-muted">Loading logins…</p>}
      {sessions?.length===0&&<p className="ba-muted">No saved marketplace logins have been reported by this worker.</p>}
      {sessions?.map(session=>{
        const verifying=["pending","in_progress"].includes(session.verification_status ?? "");
        const paused=Boolean(session.pause_requested_at)||session.status!=="ok";
        const label=verifying?"Verifying login":session.pause_requested_at?(session.busy?"Finishing current job":"Paused for sign-in"):
          ["signed_out","mfa_required"].includes(session.status)?"Login required":session.status==="ok"?"Signed in":"Needs attention";
        return <div key={session.id} className="ba-login"><div><strong>{session.domain}{session.country?` · ${session.country}`:""}</strong>
          <span data-attention={paused}>{label}</span>{session.status_detail&&<small>{session.status_detail}</small>}</div>
          <button className="admin-button" disabled={!supported||Boolean(busy)||verifying||(paused&&session.busy)}
            onClick={()=>void sessionAction(session,paused?"verify":"pause")}>
            {busy===session.id?<LoaderCircle size={14} className="ba-spin"/>:null}{paused?"Verify login":"Pause for sign-in"}</button></div>;
      })}
    </section>
    {error&&<p className="ba-settings-notice ba-reason" role="alert">{error}</p>}
    {notice&&<p className="ba-settings-notice" role="status">{notice}</p>}
  </dialog>;
}
