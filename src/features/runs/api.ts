import {request} from '../../api/transport';
import {isRecord,requireResponse} from '../../api/validation';
export const runStates=['pending','running','waiting','completed','failed','cancelled','interrupted'] as const;
export const runSources=['assistant','agent','job','script'] as const;
export type RunState=typeof runStates[number];
export type RunSource=typeof runSources[number];
export type RunSummary={id:string;source:RunSource;workflow_id:string;workflow_version:string;code_version:string|null;parent_run_id:string|null;parent_source?:RunSource|null;title:string;status:RunState;created_at:string;updated_at:string;completed_at:string|null};
export type RunStep={id:string;parent_step_id:string|null;name:string;kind:string;status:RunState|'proposed'|'skipped';attempt:number;source_path:string|null;code_version:string|null;reporter:'server'|'client';created_at:string;completed_at:string|null;input:unknown;output:unknown;resource_kind?:string|null;resource_id?:string|null};
export type RunDetail=RunSummary&{input:unknown;output:unknown;steps:RunStep[];children:RunSummary[];truncated:boolean;notes:string[]};
export type Definition={id:string;version:string;name:string;description:string;coverage:string;source_paths:string[];steps:Array<{key:string;name:string;kind:string;optional?:boolean}>};
const uuid=(value:unknown)=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const nullableText=(value:unknown)=>value===null||typeof value==='string';
export function parseRun(value:unknown):RunSummary{
  requireResponse(isRecord(value)&&uuid(value.id)&&runSources.includes(value.source as RunSource)&&runStates.includes(value.status as RunState)&&typeof value.workflow_id==='string'&&typeof value.workflow_version==='string'&&nullableText(value.code_version)&&(value.parent_run_id===null||uuid(value.parent_run_id))&&(value.parent_source===undefined||value.parent_source===null||runSources.includes(value.parent_source as RunSource))&&typeof value.title==='string'&&value.title.length<=240&&date(value.created_at)&&date(value.updated_at)&&(value.completed_at===null||date(value.completed_at)),'workflow run');
  return value as unknown as RunSummary;
}
export async function readRuns(filters:{q:string;source:string;status:string;cursor?:string},signal:AbortSignal){
  const query=new URLSearchParams({q:filters.q,...(filters.source?{source:filters.source}:{}),...(filters.status?{status:filters.status}:{}),...(filters.cursor?{cursor:filters.cursor}:{})});
  const value=await request<unknown>('/api/admin/runs/?'+query,{signal});requireResponse(isRecord(value)&&value.version===1&&Array.isArray(value.runs)&&value.runs.length<=50&&(value.next_cursor===null||typeof value.next_cursor==='string'&&value.next_cursor.length<=512),'run list');
  return {runs:value.runs.map(parseRun),next:value.next_cursor as string|null};
}
export async function readRun(source:RunSource,id:string,signal:AbortSignal):Promise<RunDetail>{
  const response=await request<unknown>(`/api/admin/runs/${encodeURIComponent(source)}/${encodeURIComponent(id)}`,{signal});requireResponse(isRecord(response)&&response.version===1&&isRecord(response.run),'run detail');
  const value=response.run,summary=parseRun(value);requireResponse(summary.id===id&&summary.source===source&&Array.isArray(value.steps)&&value.steps.length<=160&&Array.isArray(value.children)&&value.children.length<=20&&typeof value.truncated==='boolean'&&Array.isArray(value.notes)&&value.notes.every(note=>typeof note==='string'),'run detail');
  const steps=value.steps.map(raw=>{
    requireResponse(isRecord(raw)&&typeof raw.id==='string'&&nullableText(raw.parent_step_id)&&typeof raw.name==='string'&&['script','http','tool','model','job','event'].includes(String(raw.kind))&&[...runStates,'proposed','skipped'].includes(String(raw.status) as RunState)&&Number.isInteger(raw.attempt)&&Number(raw.attempt)>=1&&nullableText(raw.source_path)&&nullableText(raw.code_version)&&['server','client'].includes(String(raw.reporter))&&date(raw.created_at)&&(raw.completed_at===null||date(raw.completed_at)),'run step');return raw as unknown as RunStep;
  });
  return {...summary,input:value.input,output:value.output,steps,children:value.children.map(parseRun),truncated:value.truncated,notes:value.notes as string[]};
}
export async function readDefinitions(signal:AbortSignal):Promise<Definition[]>{
  const response=await request<unknown>('/api/admin/runs/definitions',{signal});requireResponse(isRecord(response)&&response.version===1&&Array.isArray(response.definitions)&&response.definitions.length<=30,'workflow definitions');
  return response.definitions.map(value=>{requireResponse(isRecord(value)&&['id','version','name','description','coverage'].every(key=>typeof value[key]==='string')&&Array.isArray(value.source_paths)&&value.source_paths.every(path=>typeof path==='string')&&Array.isArray(value.steps)&&value.steps.every(step=>isRecord(step)&&typeof step.key==='string'&&typeof step.name==='string'&&typeof step.kind==='string'&&(step.optional===undefined||typeof step.optional==='boolean')),'workflow definition');return value as unknown as Definition;});
}
