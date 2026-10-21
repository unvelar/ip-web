import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, ArrowUp, X } from "lucide-react";
import { listingCapability, resolveListingCatalog, translateListingSearch } from "../api/listingSearch";
import { taskCapability, type TaskQueueQuery } from "../api/taskQueue";
import { taskAssistantFilters, applyTaskAssistantFilters, taskListingSearchPolicy, type AppliedTaskSearch, type TaskSearchValues } from "../lib/taskSearchAssistant";
import { titleSearchPolicy, type SellerRanking } from "../lib/listingSearch";

type Message = {role:"user" | "assistant"; text:string};
export function QueueSearchBar({ipId,product,status,values,ranking,initialAsk=false,onExtended,onTitleSearch,onChange,onApply}: {
  initialAsk?:boolean; ipId:string; product?:string; status:TaskQueueQuery["status"]; values:TaskSearchValues; ranking:SellerRanking|null;
  onTitleSearch:(supported:boolean)=>void; onExtended:(extended:boolean)=>void; onChange:(value:string)=>void; onApply:(next:AppliedTaskSearch,signal:AbortSignal)=>Promise<boolean>;
}) {
  const [mode,setMode] = useState<"search"|"ask">(initialAsk?"ask":"search");
  const [draft,setDraft] = useState("");
  const [messages,setMessages] = useState<Message[]>([]);
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [available,setAvailable] = useState(false);
  const [titleSearch,setTitleSearch] = useState(false);
  const [extended,setExtended] = useState(false);
  const [choices,setChoices] = useState<Array<{label:string;apply:()=>Promise<void>}>>([]);
  const request = useRef<AbortController|null>(null);
  const scope = JSON.stringify([ipId,product,status,values,ranking]);
  const latest = useRef(scope); latest.current = scope;
  const say = (text:string)=>setMessages(previous=>[...previous,{role:"assistant",text}]);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.all([listingCapability(controller.signal),taskCapability(ipId,controller.signal)]).then(([listing,task])=>{
      if (controller.signal.aborted) return;
      setAvailable(listing.enabled);
      const supported=task.listing_search_policy_version === taskListingSearchPolicy;
      setExtended(supported); onExtended(supported);
      const titleSupported=task.title_search_policy_version === titleSearchPolicy;
      setTitleSearch(titleSupported);onTitleSearch(titleSupported);
    }).catch(()=>{if(!controller.signal.aborted) setAvailable(false);});
    return ()=>controller.abort();
  },[ipId,onExtended,onTitleSearch]);
  useEffect(()=>()=>{request.current?.abort();},[]);
  useEffect(()=>{request.current?.abort();setBusy(false);setChoices([]);},[scope]);
  async function ask() {
    const message=draft.trim();
    if (!message || busy || !available) return;
    request.current?.abort(); const controller=new AbortController(); request.current=controller;
    const snapshot=scope, current=()=>!controller.signal.aborted && latest.current===snapshot;
    setBusy(true);setOpen(true);setChoices([]);setDraft("");
    setMessages(previous=>[...previous,{role:"user",text:message}]);
    const apply = async (filters:ReturnType<typeof taskAssistantFilters>, nextRanking:SellerRanking|null)=>{
      if(!current()) return;
      const nextValues=applyTaskAssistantFilters(values,filters);
      if(nextValues.title_contains && !titleSearch) throw new Error("Title filtering is not available in this queue yet. Your filters were kept.");
      if(!extended && (nextRanking || ["listing_countries","listing_price","seller_listing_count","catalog_selection"].some(field=>nextValues[field])))
        throw new Error("That search is not available in this queue yet. Your filters were kept.");
      if(await onApply({values:nextValues,status:filters.status,product:filters.catalog_product_id??undefined,ranking:nextRanking},controller.signal)) {
        // onApply commits the new scope, so a successful acknowledgement is the
        // final receipt. A stale acknowledgement returns false in TaskSearch.
        say(nextRanking ? `Searching the queue for the top ${nextRanking.limit} identified sellers by matching listings. The ranking is complete when the search finishes.` : "Filters applied to the review queue. Your date range and other queue filters were kept.");
      } else if(current()) say("Search failed. The latest request was not applied; your filters and results were kept.");
    };
    try {
      const filters=taskAssistantFilters(values,ipId,status,product);
      const translation=await translateListingSearch(message,filters,controller.signal,ranking);
      if(!current()) return;
      if(translation.name==="request_clarification") {
        const reasons:Record<string,string>={similarity:"Image similarity is not available in queue search yet.",shipping:"Shipping destinations are not available. You can filter listing locations.",live_fx:"Prices use a historical exchange-rate snapshot.",investigation:"Ask filters the queue. Use the review actions for investigations.",seller_metrics:"Seller ranking counts matching suspected listings. Other seller metrics are not available."};
        say((translation.reason==="unsupported_capability" ? reasons[translation.capability??""]??"That filter is not available yet." : "Please specify the product details or filters you want to change.")+" Your filters were kept.");
        return;
      }
      if(translation.name==="next_listing_page") {say("Use the queue’s Next page control to see more matching results.");return;}
      if(translation.catalogQuery) {
        const resolved=await resolveListingCatalog(translation.catalogQuery,ipId,controller.signal);
        if(!current()) return;
        if(resolved.status==="not_found") {say("No matching product was found in this catalog. Your filters were kept.");return;}
        if(resolved.status==="ambiguous") {
          say("Choose the catalog match you meant:");
          setChoices(resolved.candidates.map(candidate=>({label:`${candidate.display_name} · ${candidate.scope_name}`,apply:async()=>{
            if(!current()) return;
            setBusy(true);setChoices([]);
            try{await apply({...translation.filters,catalog_product_id:null,catalog_selection:candidate.reference},translation.ranking);}
            catch(error){if(current()) say(error instanceof Error?error.message:"Search failed. Your filters were kept.");}
            finally{setBusy(false);}
          }})));
          return;
        }
        await apply({...translation.filters,catalog_product_id:null,catalog_selection:resolved.candidates[0].reference},translation.ranking);
      } else await apply(translation.filters,translation.ranking);
    } catch(error) {
      if(current()) say(error instanceof Error ? `${error.message} The latest request was not applied.` : "Search failed. Your filters were kept.");
    } finally {if(request.current===controller) setBusy(false);}
  }
  return <>
    <div className="task-search-bar">
      {mode==="ask" ? <Sparkles size={18} aria-hidden="true"/> : <Search size={18} aria-hidden="true"/>}
      <input type={mode==="ask"?"text":"search"} aria-label={mode==="ask"?"Ask about listings":"Search listings or sellers"}
        placeholder={mode==="ask"?"Describe what you want to find…":"Search listings or sellers…"}
        value={mode==="ask"?draft:values.q??""} maxLength={mode==="ask"?2000:100}
        onChange={event=>mode==="ask"?setDraft(event.target.value):onChange(event.target.value)}
        onKeyDown={event=>{if(mode==="ask" && event.key==="Enter"){event.preventDefault();void ask();}}}/>
      <div className="task-search-modes" role="group" aria-label="Search mode">
        <button type="button" aria-pressed={mode==="search"} onClick={()=>setMode("search")}>Search</button>
        <button type="button" aria-pressed={mode==="ask"} disabled={!available} title={!available?"Search assistant unavailable":"Describe your filters in plain language"} onClick={()=>setMode("ask")}>Ask</button>
      </div>
      {mode==="ask" && (busy ? <button className="task-ask-send" type="button" aria-label="Cancel assistant request" onClick={()=>{request.current?.abort();setBusy(false);say("Request cancelled. Your filters were kept.");}}><X size={16}/></button>
        : <button className="task-ask-send" type="button" aria-label="Apply assistant search" disabled={!draft.trim()||!available} onClick={()=>void ask()}><ArrowUp size={16}/></button>)}
    </div>
    {(mode==="ask" || messages.length>0) && <details className="task-search-conversation" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary>{busy?"Interpreting request…":messages.length?"Search conversation":"Ask about this queue"}</summary>
      <div role="log" aria-label="Queue search conversation" aria-live="polite">
        {messages.length===0 && <p>Try “Show me the top 10 sellers by matching listings”. Your date range and queue filters stay active.</p>}
        {messages.map((message,index)=><div className={`task-search-message is-${message.role}`} key={index}><strong>{message.role==="user"?"You":"Search assistant"}</strong><p>{message.text}</p></div>)}
        {choices.map(choice=><button type="button" key={choice.label} onClick={()=>void choice.apply()}>{choice.label}</button>)}
      </div>
      {<small>Ask refines the current queue. Counts describe suspected listings; they do not establish confirmed infringement.</small>}
    </details>}
  </>;
}
