import {request} from './transport';
import {isRecord,requireResponse} from './validation';
import {groupingPolicy,parseGrouping,type Grouping} from '../lib/taskGrouping';
import type {TaskSummary} from './taskQueue';
export type GroupBucket={key:string|null;label:string;article_count:number;priced_article_count:number;total_price_usd:string|null;exposure_usd:string|null};
export type GroupPage={partial:boolean;groups:GroupBucket[];total_groups:number|null;matching_listings:number|null;next_offset:number|null};
export type GroupListings={partial:boolean;rows:TaskSummary[];total_listings:number|null;next_offset:number|null};
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const price=(v:unknown)=>v===null||typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v)&&Number.isFinite(Number(v));
async function read(id:string,grouping:Grouping,path:Array<string|null>,offset:number,listings:boolean,sort:'priority'|'newest',signal:AbortSignal){
 const params=new URLSearchParams({grouping:JSON.stringify(grouping),path:JSON.stringify(path),offset:String(offset),...(listings?{sort}:{})});
 const raw:unknown=await request(`/api/monitoring/tasks/searches/${encodeURIComponent(id)}/groups${listings?'/listings':''}?${params}`,{signal});
 requireResponse(isRecord(raw)&&raw.policy_version===groupingPolicy&&raw.search_id===id&&JSON.stringify(parseGrouping(raw.grouping))===JSON.stringify(grouping)&&JSON.stringify(raw.path)===JSON.stringify(path)&&raw.offset===offset&&typeof raw.partial==='boolean'&&(raw.next_offset===null||count(raw.next_offset)&&raw.next_offset>offset),'group scope');
 return raw;
}
export async function taskGroups(id:string,grouping:Grouping,path:Array<string|null>,offset:number,signal:AbortSignal):Promise<GroupPage>{
 const raw=await read(id,grouping,path,offset,false,'priority',signal);
 requireResponse(Array.isArray(raw.groups)&&(raw.total_groups===null||count(raw.total_groups))&&(raw.matching_listings===null||count(raw.matching_listings)),'groups');
 for(const row of raw.groups)requireResponse(isRecord(row)&&(row.key===null||typeof row.key==='string')&&typeof row.label==='string'&&count(row.article_count)&&count(row.priced_article_count)&&Number(row.priced_article_count)<=Number(row.article_count)&&price(row.total_price_usd)&&price(row.exposure_usd),'group totals');
 requireResponse(!raw.partial||raw.groups.length===0,'completed grouping');
 return raw as unknown as GroupPage;
}
export async function taskGroupListings(id:string,grouping:Grouping,path:Array<string|null>,offset:number,sort:'priority'|'newest',signal:AbortSignal):Promise<GroupListings>{
 const raw=await read(id,grouping,path,offset,true,sort,signal);
 requireResponse(raw.sort===sort&&Array.isArray(raw.rows)&&(raw.total_listings===null||count(raw.total_listings)),'group listings');
 for(const row of raw.rows)requireResponse(isRecord(row)&&typeof row.task_id==='string'&&typeof row.result_id==='string'&&typeof row.domain==='string','group listing');
 requireResponse(!raw.partial||raw.rows.length===0,'completed group listings');
 return raw as unknown as GroupListings;
}
