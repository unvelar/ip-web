import {useEffect,useState} from "react";
import {request,isApiError} from "../../api/transport";
import {isRecord,requireResponse} from "../../api/validation";
import "./assistantTrace.css";
type Trace={id:string;kind:"discussion"|"translation";status:"working"|"completed"|"failed"|"interrupted";input:unknown;output:unknown;events:Array<{at:string;type:string;data:unknown}>;created_at:string;completed_at:string|null};
function parseTrace(value:unknown):Trace {
  requireResponse(isRecord(value)&&typeof value.id==="string"&&["discussion","translation"].includes(String(value.kind))&&["working","completed","failed","interrupted"].includes(String(value.status))&&typeof value.created_at==="string"&&Array.isArray(value.events)&&value.events.length<=40&&value.events.every(event=>isRecord(event)&&typeof event.at==="string"&&typeof event.type==="string"),"assistant trace");
  return value as unknown as Trace;
}
const json=(value:unknown)=>JSON.stringify(value,null,2);
export function AssistantTracePanel(){
  const [traces,setTraces]=useState<Trace[]>([]),[selected,setSelected]=useState<Trace|null>(null),[error,setError]=useState("");
  const [traceId,setTraceId]=useState(()=>new URLSearchParams(window.location.search).get("assistant_trace")??"");
  const [refresh,setRefresh]=useState(0),[loaded,setLoaded]=useState("");
  const loading=Boolean(traceId&&selected?.id!==traceId&&loaded!==`${traceId}:${refresh}`);
  useEffect(()=>{const timer=window.setInterval(()=>{if(!document.hidden)setRefresh(value=>value+1);},10000);return ()=>window.clearInterval(timer);},[]);
  useEffect(()=>{
    const controller=new AbortController();
    void request<unknown>("/api/monitoring/listings/assistant/traces",{signal:controller.signal}).then(value=>{
      requireResponse(isRecord(value)&&Array.isArray(value.traces)&&value.traces.length<=50,"assistant trace list");
      if(!controller.signal.aborted){setTraces(value.traces.map(parseTrace));setError("");}
    }).catch(reason=>{if(!controller.signal.aborted)setError(isApiError(reason,404)?"Search assistant traces require the updated API.":reason instanceof Error?reason.message:"Traces could not be loaded.");});
    return ()=>controller.abort();
  },[refresh]);
  useEffect(()=>{
    if(!traceId)return;
    const controller=new AbortController();
    void request<unknown>("/api/monitoring/listings/assistant/traces/"+encodeURIComponent(traceId),{signal:controller.signal}).then(value=>{
      const result=parseTrace(value);if(!controller.signal.aborted){setSelected(result);setError("");}
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Trace could not be loaded.");}).finally(()=>{if(!controller.signal.aborted)setLoaded(`${traceId}:${refresh}`);});
    return ()=>controller.abort();
  },[traceId,refresh]);
  return <section className="assistant-traces" aria-label="Search assistant traces">
    <div className="assistant-traces-heading"><div><h2>Search assistant</h2><p>Supplied instructions, translations and tool observations · current tenant · last 7 days · refreshes every 10s</p></div><button className="admin-button" onClick={()=>setRefresh(value=>value+1)}>Refresh traces</button></div>
    <p className="assistant-traces-note">A completed trace means the discussion or translation finished. Search proposals run only after the user chooses to run them. Private model reasoning is not recorded.</p>
    {error&&<p role="alert">{error}</p>}
    <div className="assistant-traces-layout"><div className="assistant-traces-list" aria-label="Recent assistant runs">
      {!traces.length&&!error&&<p>No recent assistant runs.</p>}
      {traces.map(trace=><button key={trace.id} aria-pressed={traceId===trace.id} onClick={()=>{setTraceId(trace.id);setSelected(null);}}><span>{trace.kind} · {trace.status}</span><strong>{isRecord(trace.input)&&typeof trace.input.message==="string"?trace.input.message:"Assistant run"}</strong><small>{new Date(trace.created_at).toLocaleString()}</small></button>)}
    </div><div className="assistant-trace-detail">
      {loading?<p role="status">Loading trace…</p>:selected?<><h3>{selected.kind} · {selected.status}</h3><small>Run {selected.id}</small>
        <details open><summary>Request and starting context</summary><pre>{json(selected.input)}</pre></details>
        <ol>{selected.events.map((event,index)=><li key={index}><details open={event.type==="tool_call"||event.type==="translation_output"}><summary>{event.type.replaceAll("_"," ")} <small>{new Date(event.at).toLocaleTimeString()}</small></summary><pre>{json(event.data)}</pre></details></li>)}</ol>
        {selected.status==="interrupted"&&<p>No completion was recorded within the request deadline. The process or connection may have stopped.</p>}
        <details open><summary>{selected.status==="failed"?"Failure":"Final response / proposed query"}</summary><pre>{json(selected.output)}</pre></details>
      </>:<p>Select a run to inspect its instructions and translation.</p>}
    </div></div>
  </section>;
}
