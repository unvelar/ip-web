import { API, ApiError, authHeaders, request } from "../../api/transport";

export type WorkerState = "active" | "ready" | "offline" | "draining" | "starting";
export type WorkerKind = "registered" | "on_demand";
export type JobState = "running" | "unknown" | "succeeded" | "failed" | "cancelled" | "held" | "retry_scheduled" | "queued";
export type Capture = {
  id: string; job_id: string; attempt_id: string; worker_id: string; occurred_at: string;
  url: string | null; label: string; status: "ready" | "expired" | "uploading"; thumbnail_url: string | null;
};
export type ActivityPayload = {
  label?: string | null; url?: string | null; domain?: string | null; kind?: string;
  occurred_at?: string; status?: string; late?: boolean; count?: number | null; capture_id?: string;
  diagnostics?: {code: string; message: string; transport?: string; http_status?: number; error?: string} | null;
};
export type ActivityJob = {
  id: string; type: string; state: JobState; status: string; tenant_name: string | null; tenant_id: string | null;
  worker_id: string | null; worker_state: WorkerState | null; domain: string | null; keyword: string | null;
  target_url: string | null; run_id: string | null; attempts: number; max_attempts: number; latest_attempt_id: string;
  error: string | null; hold_reason: string | null; available_at: string; started_at: string | null;
  completed_at: string | null; last_activity_at: string; cursor: string; latest_event: ActivityPayload;
  result: {candidates: number | null; unavailable: boolean}; captures: Capture[];
};
export type ActivityWorker = {
  id: string; hostname: string | null; state: WorkerState; provider: string; pool: string;
  kind: WorkerKind; scrape_provider: string | null;
  last_heartbeat_at: string | null; current_job_id: string | null; job_type: string | null;
  domain: string | null; current_action: string | null; activity_version: string | null;
};
export type JobSnapshot = {jobs: ActivityJob[]; cursor: string; next_cursor: string | null; as_of: string};
export type WorkerSnapshot = {
  workers: ActivityWorker[]; counts: Partial<Record<WorkerState,number>>; next_cursor: string | null; as_of: string;
  on_demand: {total: number; providers: {provider: string; total: number; counts: Partial<Record<WorkerState,number>>}[]};
};
export type ActivityEvent = {
  cursor: string; event_id: string; attempt_id: string | null; worker_id: string | null;
  sequence: number | null; kind: string; occurred_at: string; received_at: string; payload: ActivityPayload;
};
export type Attempt = {id: string; attempt_number: number; worker_instance_id: string | null; status: string; error: string | null; started_at: string; completed_at: string | null};
export type JobHistory = {events: ActivityEvent[]; attempts: Attempt[]; captures: Capture[]; next_cursor: string | null; retained_days: number};
export type Filters = {worker: string; query: string; attention: boolean; hours: number};
export type ActivityChange = {cursor: string; job_ids: string[]; reset: boolean};

const root = "/api/admin/browser-activity";
function params(values: Record<string,string | number | boolean | undefined>) {
  const query=new URLSearchParams();
  for (const [key,value] of Object.entries(values)) if(value!==undefined && value!=="") query.set(key,String(value));
  return query.toString();
}
export const getJobs = (filters: Filters, options: {before?: string; ids?: string[]; signal?: AbortSignal} = {}) =>
  request<JobSnapshot>(`${root}/jobs?${params({...filters,before:options.before,ids:options.ids?.join(","),limit:60})}`,{signal:options.signal});
export const getWorkers = (query="", state="", before?: string, signal?: AbortSignal, kind: WorkerKind="registered") =>
  request<WorkerSnapshot>(`${root}/workers?${params({query,state,before,kind,limit:48})}`,{signal});
export const getHistory = (id: string, before?: string, signal?: AbortSignal) =>
  request<JobHistory>(`${root}/jobs/${id}?${params({before})}`,{signal});
export const getCapture = (id: string, signal?: AbortSignal) => request<{url:string}>(`${root}/captures/${id}`,{signal});

/** Bearer-authenticated SSE. Authentication stays in headers on every reconnect. */
export async function streamActivity(after: string, signal: AbortSignal, onChange: (value: ActivityChange)=>void, onLive: ()=>void) {
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal.addEventListener("abort",abort,{once:true});
  let timeout=window.setTimeout(abort,15_000);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    if(signal.aborted) return;
    const headers: Record<string,string>={Accept:"text/event-stream"};authHeaders(headers);
    const response=await fetch(`${API}${root}/stream?after=${encodeURIComponent(after)}`,{headers,signal:controller.signal});
    if(!response.ok) throw new ApiError(response.status,"Live activity is unavailable",null);
    if(!response.headers.get("Content-Type")?.includes("text/event-stream") || !response.body) throw new Error("The activity stream returned an unexpected response");
    reader=response.body.getReader();
    const decoder=new TextDecoder();let buffer="";
    while(!signal.aborted) {
      window.clearTimeout(timeout);timeout=window.setTimeout(abort,35_000);
      const {done,value}=await reader.read();if(done) break;
      buffer+=decoder.decode(value,{stream:true}).replace(/\r/g,"");
      if(buffer.length>128_000) throw new Error("Activity stream message exceeded its limit");
      let end: number;
      while((end=buffer.indexOf("\n\n"))>=0) {
        const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
        const event=frame.split("\n").find(line=>line.startsWith("event:"))?.slice(6).trim();
        if(event==="heartbeat") onLive();
        if(event==="activity") {
          const data: unknown=JSON.parse(frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).join("\n"));
          if(!data || typeof data!=="object" || !("cursor" in data) || typeof data.cursor!=="string" || !/^\d{1,19}$/.test(data.cursor)
            || !("job_ids" in data) || !Array.isArray(data.job_ids) || data.job_ids.length>500 || data.job_ids.some(id=>typeof id!=="string")
            || !("reset" in data) || typeof data.reset!=="boolean") throw new Error("Invalid activity update");
          onChange(data as ActivityChange);onLive();
        }
      }
    }
  } finally {
    window.clearTimeout(timeout);signal.removeEventListener("abort",abort);
    await reader?.cancel().catch(()=>{});controller.abort();
  }
}
