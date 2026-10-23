import {request} from '../api/transport';
const contexts=new WeakMap<AbortSignal,string>();
export function associateWorkflow(signal:AbortSignal,id:string){if(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))contexts.set(signal,id);}
export const workflowForSignal=(signal?:AbortSignal)=>signal?contexts.get(signal):undefined;
/** Reporting is diagnostic. A failed report cannot turn an applied search into
 * a failed search or replay its mutation. The inspector also reads server state. */
export function reportWorkflow(signal:AbortSignal,status:'applied'|'failed'|'cancelled',message?:string){
  const id=contexts.get(signal);if(!id)return;
  void request(`/api/monitoring/listings/assistant/runs/${encodeURIComponent(id)}/outcome`,{method:'POST',body:JSON.stringify({status,...(message?{message:message.slice(0,500)}:{})})}).catch(()=>{/* Server-side search evidence remains authoritative. */});
}
