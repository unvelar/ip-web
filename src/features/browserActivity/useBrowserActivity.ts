import { useEffect, useRef, useState } from "react";
import { isApiError } from "../../api/transport";
import { getJobs, streamActivity, type ActivityJob, type Filters } from "./api";

export type Connection = "connecting" | "live" | "reconnecting" | "unavailable";

export function useBrowserActivity(filters: Filters, paused: boolean) {
  const [jobs,setJobs]=useState<ActivityJob[]>([]);
  const [next,setNext]=useState<string | null>(null);
  const [asOf,setAsOf]=useState<string | null>(null);
  const [connection,setConnection]=useState<Connection>("connecting");
  const [error,setError]=useState<string | null>(null);
  const [loading,setLoading]=useState(true);
  const [pending,setPending]=useState(0);
  const [revision,setRevision]=useState(0);
  const [page,setPage]=useState<{filter: string; cursor: string}>();
  const pausedRef=useRef(paused);
  useEffect(()=>{pausedRef.current=paused;},[paused]);
  const filterKey=JSON.stringify(filters);
  const before=page?.filter===filterKey?page.cursor:undefined;

  useEffect(()=>{
    const controller=new AbortController(), {signal}=controller;
    const active: Filters=JSON.parse(filterKey);
    let cursor="0",visible: ActivityJob[]=[],dirty=new Set<string>();
    const buffered=new Set<string>();
    let needsReset=false,resetRequested=false,busy=false,retryDelay=1000;
    let timer: number | undefined,healthTimer: number | undefined,retryTimer: number | undefined;
    const fail=(reason: unknown)=>{
      if(signal.aborted) return;
      setError(isApiError(reason,404)?"Browser activity is not available on the API yet.":reason instanceof Error?reason.message:"Activity could not be loaded");
    };
    const buffer=(ids: string[],reset=false)=>{
      for(const id of ids) {if(buffered.size<500) buffered.add(id);else needsReset=true;}
      needsReset ||= reset;setPending(needsReset?501:buffered.size);
    };
    const flush=async()=>{
      if(busy || signal.aborted || (!dirty.size && !resetRequested)) return;
      const ids=[...dirty];dirty=new Set();
      const fullRefresh=resetRequested;resetRequested=false;
      if(pausedRef.current || before) {buffer(ids,fullRefresh);return;}
      busy=true;
      try {
        // A busy fleet still costs at most two bounded reads per refresh.
        const visibleIds=visible.filter(job=>fullRefresh || ids.includes(job.id)).map(job=>job.id);
        const snapshot=await getJobs(active,{ids:!fullRefresh&&ids.length<=60?ids:undefined,signal});if(signal.aborted) return;
        const current=(fullRefresh || ids.length>60)&&visibleIds.length?await getJobs(active,{ids:visibleIds,signal}):null;
        if(signal.aborted)return;
        if(pausedRef.current) {buffer(ids,fullRefresh);return;}
        const updates=new Map([...snapshot.jobs,...(current?.jobs ?? [])].map(job=>[job.id,job]));
        const existing=new Set(visible.map(job=>job.id));
        // Existing cards keep their place. New cards wait behind one explicit button.
        visible=visible.flatMap(job=>updates.has(job.id)?[updates.get(job.id)!]:visibleIds.includes(job.id)?[]:[job]);
        buffer(snapshot.jobs.filter(job=>!existing.has(job.id)).map(job=>job.id));
        setJobs(visible);setAsOf(snapshot.as_of);setError(null);
      } catch(reason) {fail(reason);buffer(ids,true);resetRequested=true;}
      finally {busy=false;}
    };
    const delay=(ms: number)=>new Promise<void>(resolve=>{
      const done=()=>{window.clearTimeout(retryTimer);signal.removeEventListener("abort",done);resolve();};
      retryTimer=window.setTimeout(done,ms);signal.addEventListener("abort",done,{once:true});
    });
    const run=async()=>{
      setLoading(true);setError(null);setPending(0);setConnection("connecting");
      try {
        const snapshot=await getJobs(active,{before,signal});if(signal.aborted) return;
        visible=snapshot.jobs;cursor=snapshot.cursor;
        setJobs(visible);setNext(snapshot.next_cursor);setAsOf(snapshot.as_of);setLoading(false);
      } catch(reason) {if(signal.aborted)return;fail(reason);setLoading(false);setConnection("unavailable");return;}
      timer=window.setInterval(()=>void flush(),800);
      // Heartbeat expiry is a change even if the worker never sends another event.
      healthTimer=window.setInterval(()=>{if(!pausedRef.current && !before){for(const job of visible)dirty.add(job.id);void flush();}},15_000);
      while(!signal.aborted) {
        try {
          await streamActivity(cursor,signal,change=>{
            cursor=change.cursor;
            if(change.reset) resetRequested=true;
            for(const id of change.job_ids) {if(dirty.size<500)dirty.add(id);else resetRequested=true;}
          },()=>{if(!signal.aborted){setConnection("live");retryDelay=1000;}});
          if(!signal.aborted) await delay(250);
        } catch(reason) {
          if(signal.aborted) break;
          if(isApiError(reason,401)||isApiError(reason,403)||isApiError(reason,404)) {fail(reason);setConnection("unavailable");break;}
          setConnection("reconnecting");await delay(retryDelay+Math.random()*250);retryDelay=Math.min(retryDelay*2,15_000);
        }
      }
    };
    void run();
    return ()=>{controller.abort();window.clearInterval(timer);window.clearInterval(healthTimer);window.clearTimeout(retryTimer);};
  },[filterKey,revision,before]);

  const refresh=()=>{setPage(undefined);setRevision(value=>value+1);};
  return {jobs,next,asOf,connection,error,loading,pending,historical:Boolean(before),refresh,
    clearPage:()=>setPage(undefined),
    older:()=>{if(next)setPage({filter:filterKey,cursor:next});}};
}
