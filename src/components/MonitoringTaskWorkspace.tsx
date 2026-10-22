import {useCallback,useEffect,useId,useMemo,useRef,useState} from "react";
import {useNavigate,useSearchParams} from "react-router-dom";
import {List,MessageSquare,Pencil,Plus,Search,Trash2,X,Check} from "lucide-react";
import TaskQueue from "../pages/TaskQueue";
import {AiSearchHistoryContext} from "../context/AiSearchHistoryContext";
import {aiHistoryKey,aiChatRecordKey,readAiHistory,MAX_AI_CHATS,newAiQuery,parseAiHistory,restoreAiQuery,type AiSearchChat,type AiChatState} from "../lib/aiSearchHistory";

function storedListingPosition(key:string){try{return sessionStorage.getItem(key);}catch{return null;}}
export function MonitoringTaskWorkspace({ipId,owner,tenant,onUnavailable}:{ipId:string;owner?:string;tenant:string|null;onUnavailable:()=>void}){
  const [params]=useSearchParams(),navigate=useNavigate();
  const ai=params.get("workspace")==="ai";
  const storageKey=owner?aiHistoryKey(owner,tenant,ipId):null;
  const [history,setHistory]=useState(()=>readAiHistory(storageKey));
  const persistedHistory=useRef(history);
  const [storageAvailable,setStorageAvailable]=useState(Boolean(storageKey));
  const [historyOpen,setHistoryOpen]=useState(false),[historyQuery,setHistoryQuery]=useState("");
  const historyId=useId();
  const historyDialog=useRef<HTMLDialogElement>(null);
  const [renaming,setRenaming]=useState<string|null>(null),[name,setName]=useState("");
  const [removed,setRemoved]=useState<AiSearchChat|null>(null);
  const [draftId]=useState(()=>crypto.randomUUID());
  const chatId=params.get("chat")??draftId;
  const lastAiId=useRef(chatId);
  useEffect(()=>{if(ai)lastAiId.current=chatId;},[ai,chatId]);
  const chat=history.find(item=>item.id===chatId)??null;
  const title=chat?.title??"New chat";
  const listingQuery=useRef(storedListingPosition((storageKey??"")+":listings")??new URLSearchParams({ip_id:ipId}).toString());
  const query=params.toString();
  useEffect(()=>{if(!ai){listingQuery.current=query;try{if(storageKey)sessionStorage.setItem(storageKey+":listings",query);}catch{/* The current tab still keeps its place. */}}},[ai,query,storageKey]);
  const update=useCallback((state:AiChatState)=>{
    if(!state.messages.length&&!state.draft)return;
    setHistory(previous=>{
      const existing=previous.find(item=>item.id===chatId);
      if(existing&&existing.query===query&&JSON.stringify(existing.state)===JSON.stringify(state))return previous;
      const now=new Date().toISOString(),first=state.messages.find(message=>message.role==="user")?.text.trim().replace(/\s+/g," ");
      const entry:AiSearchChat={id:chatId,title:existing&&existing.title!=="New chat"?existing.title:first?.slice(0,80)||"New chat",createdAt:existing?.createdAt??now,updatedAt:now,query,state};
      return [entry,...previous.filter(item=>item.id!==chatId)].slice(0,MAX_AI_CHATS);
    });
  },[chatId,query]);
  useEffect(()=>{
    if(!storageKey)return;
    const previous=persistedHistory.current;
    persistedHistory.current=history;
    const changes=history.filter(chat=>JSON.stringify(previous.find(item=>item.id===chat.id))!==JSON.stringify(chat));
    const removed=previous.filter(chat=>!history.some(item=>item.id===chat.id));
    let active=true;
    void Promise.resolve().then(()=>{
      const legacy=parseAiHistory(localStorage.getItem(storageKey));
      if(legacy.length){for(const chat of history){const recordKey=aiChatRecordKey(storageKey,chat.id);if(!localStorage.getItem(recordKey))localStorage.setItem(recordKey,JSON.stringify(chat));}localStorage.removeItem(storageKey);}
      for(const chat of changes)localStorage.setItem(aiChatRecordKey(storageKey,chat.id),JSON.stringify(chat));
      for(const chat of removed)localStorage.removeItem(aiChatRecordKey(storageKey,chat.id));
    }).catch(()=>{if(active)setStorageAvailable(false);});
    return()=>{active=false;};
  },[history,storageKey]);
  const newChat=useCallback((keepHistory=false)=>{if(!keepHistory)setHistoryOpen(false);navigate({pathname:"/monitoring/tasks",search:"?"+newAiQuery(ipId,params,crypto.randomUUID())});setHistoryQuery("");if(!keepHistory)requestAnimationFrame(()=>document.querySelector<HTMLTextAreaElement>('.task-ai-conversation textarea')?.focus());},[navigate,ipId,params]);
  const openHistory=useCallback(()=>setHistoryOpen(true),[]);
  useEffect(()=>{
    if(!ai||!historyOpen)return;
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const dialog=historyDialog.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLInputElement>('[aria-label="Search chat history"]')?.focus();
    return()=>{dialog?.close();if(previous?.isConnected)previous.focus();};
  },[ai,historyOpen,chatId]);
  useEffect(()=>{
    if(!storageKey)return;
    const sync=(event:StorageEvent)=>{
      if(event.key!==null&&event.key!==storageKey&&!event.key.startsWith(aiChatRecordKey(storageKey,"")))return;
      const next=readAiHistory(storageKey);persistedHistory.current=next;setHistory(next);
      if(event.key===aiChatRecordKey(storageKey,chatId)&&event.newValue===null&&ai)newChat();
    };
    window.addEventListener("storage",sync);return()=>window.removeEventListener("storage",sync);
  },[storageKey,chatId,ai,newChat]);
  const context=useMemo(()=>({chat,title,save:update,newChat:()=>newChat(),openHistory,historyOpen,historyId}),[chat,title,update,newChat,openHistory,historyOpen,historyId]);
  const switchTo=(mode:"listings"|"ai")=>{
    if((mode==="ai")===ai)return;
    const lastChat=history.find(item=>item.id===lastAiId.current);
    const next=mode==="listings"?new URLSearchParams(listingQuery.current):lastChat?restoreAiQuery(lastChat,ipId):newAiQuery(ipId,params,lastAiId.current);
    if(mode==="listings"){next.delete("workspace");next.delete("chat");next.delete("ask");next.set("ip_id",ipId);}
    navigate({pathname:"/monitoring/tasks",search:"?"+next});
  };
  const tabs=<nav className="task-workspace-tabs" aria-label="Review queue workspace"><button type="button" aria-current={!ai?"page":undefined} onClick={()=>switchTo("listings")}><List size={15}/>Listings</button><button type="button" aria-current={ai?"page":undefined} onClick={()=>switchTo("ai")}><MessageSquare size={15}/>AI search<span className="task-workspace-new">New</span></button></nav>;
  const visible=history.filter(item=>item.title.toLowerCase().includes(historyQuery.toLowerCase()));
  const historyPanel=historyOpen?<dialog ref={historyDialog} id={historyId} className="ai-history-dialog" aria-label="AI chat history" onCancel={event=>{event.preventDefault();setHistoryOpen(false);}} onClick={event=>{if(event.target===event.currentTarget)setHistoryOpen(false);}}>
  <aside className="ai-history" aria-label="Saved chats">
    <div className="ai-history-top"><h2>Chat history</h2><button type="button" aria-label="Close chat history" onClick={()=>setHistoryOpen(false)}><X size={16}/></button></div>
    <button className="ai-new-chat" type="button" aria-label="Start a new chat" onClick={()=>newChat()}><Plus size={16}/>New chat</button>
      <label className="ai-history-search"><Search size={14}/><input aria-label="Search chat history" placeholder="Search chats…" value={historyQuery} onChange={event=>setHistoryQuery(event.target.value)}/></label>
      <div className="ai-history-list">
        {!visible.length&&<p className="ai-history-empty">{historyQuery?"No chats found.":"Your conversations will appear here."}</p>}
        {visible.map((item,index)=>{const group=new Date(item.updatedAt).toDateString()===new Date().toDateString()?"Today":"Earlier";const prior=visible[index-1];const priorGroup=prior&&(new Date(prior.updatedAt).toDateString()===new Date().toDateString()?"Today":"Earlier");return <div key={item.id}>
          {group!==priorGroup&&<h2>{group}</h2>}
          {renaming===item.id?<form className="ai-history-rename" onSubmit={event=>{event.preventDefault();if(!name.trim())return;setHistory(previous=>previous.map(entry=>entry.id===item.id?{...entry,title:name.trim(),updatedAt:new Date().toISOString()}:entry));setRenaming(null);}}><input autoFocus aria-label="Chat name" value={name} maxLength={100} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();setRenaming(null);}}}/><button type="submit" aria-label="Save chat name"><Check size={14}/></button><button type="button" aria-label="Cancel rename" onClick={()=>setRenaming(null)}><X size={14}/></button></form>:<div className={`ai-history-row${item.id===chatId?" is-active":""}`}>
            <button type="button" className="ai-history-chat" aria-current={item.id===chatId?"true":undefined} title={item.title} onClick={()=>{setHistoryOpen(false);navigate({pathname:"/monitoring/tasks",search:"?"+restoreAiQuery(item,ipId)});}}>{item.title}</button>
            <details className="ai-history-menu" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))event.currentTarget.open=false;}} onKeyDown={event=>{if(event.key==="Escape"&&event.currentTarget.open){event.preventDefault();event.stopPropagation();event.currentTarget.open=false;event.currentTarget.querySelector("summary")?.focus();}}}><summary aria-label={`Actions for ${item.title}`}>···</summary><div><button type="button" onClick={()=>{setRenaming(item.id);setName(item.title);}}><Pencil size={13}/>Rename</button><button type="button" onClick={()=>{setRemoved(item);setHistory(previous=>previous.filter(entry=>entry.id!==item.id));if(item.id===chatId)newChat(true);}}><Trash2 size={13}/>Remove</button></div></details>
          </div>}
        </div>;})}
      </div>
      {removed&&<div className="ai-history-undo" role="status">Chat removed.<button type="button" onClick={()=>{setHistory(previous=>[removed,...previous.filter(item=>item.id!==removed.id)].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,MAX_AI_CHATS));setRemoved(null);}}>Undo</button></div>}
      <p className="ai-history-storage">{storageAvailable?"Saved on this browser":"Saved for this session"}</p>
  </aside></dialog>:null;
  return <AiSearchHistoryContext.Provider value={ai?context:null}><TaskQueue key={`${ai?chatId:"listings"}:${ipId}`} ipId={ipId} conversationOwner={owner} onUnavailable={onUnavailable} mode={ai?"ai":"listings"} workspaceTabs={tabs} historyPanel={ai?historyPanel:undefined}/></AiSearchHistoryContext.Provider>;
}
