import {parseSearchConversation,type ConversationState} from "./searchConversation";
export type AiChatState=ConversationState&{scope:string;draft:string};
export type AiSearchChat={id:string;title:string;createdAt:string;updatedAt:string;query:string;state:AiChatState};
export const MAX_AI_CHATS=25;
export function aiChatRecordKey(key:string,id:string){return key+":chat:"+id;}
/** Each chat has its own record, so one tab cannot overwrite another tab's
 * conversations by saving an older copy of the entire history. */
export function readAiHistory(key:string|null,storage:Storage=localStorage):AiSearchChat[]{
  if(!key)return [];
  try{
    const records=new Map(parseAiHistory(storage.getItem(key)).map(chat=>[chat.id,chat]));
    const prefix=aiChatRecordKey(key,"");
    for(let i=0;i<storage.length;i++){
      const name=storage.key(i);if(!name?.startsWith(prefix))continue;
      const raw=storage.getItem(name);const chat=raw?parseAiHistory("["+raw+"]")[0]:undefined;
      if(chat&&name===aiChatRecordKey(key,chat.id))records.set(chat.id,chat);
    }
    return [...records.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_AI_CHATS);
  }catch{return [];}
}
export function aiHistoryKey(owner:string,tenant:string|null,ip:string){return `queue-ai-history-v1:${[owner,tenant??"own",ip].map(encodeURIComponent).join(":")}`;}
export function parseAiHistory(raw:string|null):AiSearchChat[]{
  try{
    if(!raw||raw.length>2_000_000)return [];
    const rows:unknown=JSON.parse(raw);if(!Array.isArray(rows)||rows.length>MAX_AI_CHATS)return [];
    const seen=new Set<string>();
    return rows.flatMap((item):AiSearchChat[]=>{
      if(!item||typeof item!=="object")return [];
      const r=item as AiSearchChat;
      if(typeof r.id!=="string"||!/^[a-zA-Z0-9-]{1,100}$/.test(r.id)||seen.has(r.id)||typeof r.title!=="string"||!r.title.trim()||r.title.length>100||typeof r.query!=="string"||r.query.length>30000||typeof r.createdAt!=="string"||!Number.isFinite(Date.parse(r.createdAt))||typeof r.updatedAt!=="string"||!Number.isFinite(Date.parse(r.updatedAt))||!r.state||typeof r.state.scope!=="string"||r.state.scope.length>30000||typeof r.state.draft!=="string"||r.state.draft.length>2000)return [];
      const state=parseSearchConversation(r.state,r.state.scope);
      if(state.messages.length!==r.state.messages?.length||state.intent!==r.state.intent)return [];
      seen.add(r.id);return [{id:r.id,title:r.title.trim(),createdAt:r.createdAt,updatedAt:r.updatedAt,query:r.query,state:{...state,scope:r.state.scope,draft:r.state.draft}}];
    }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }catch{return [];}
}
export function newAiQuery(ip:string,source:URLSearchParams,id?:string){
  let dates:Record<string,string>={};try{dates=JSON.parse(source.get("queue_filters")??"{}");}catch{/* Default dates are resolved by the search form. */}
  const values={q:"",...( /^\d{4}-\d{2}-\d{2}$/.test(dates.from??"")?{from:dates.from}:{}),...( /^\d{4}-\d{2}-\d{2}$/.test(dates.to??"")?{to:dates.to}:{})};
  const params=new URLSearchParams({ip_id:ip,workspace:"ai",status:"pending"});
  if(values.from&&values.to)params.set("queue_filters",JSON.stringify(values));
  if(id)params.set("chat",id);return params;
}
export function restoreAiQuery(chat:AiSearchChat,ip:string){const params=new URLSearchParams(chat.query);params.set("ip_id",ip);params.set("workspace","ai");params.set("chat",chat.id);params.delete("ask");return params;}
