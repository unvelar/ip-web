import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, ArrowUp, X } from "lucide-react";
import { listingCapability, resolveListingCatalog, translateListingSearch } from "../api/listingSearch";
import { taskCapability, type TaskQueueQuery } from "../api/taskQueue";
import { taskAssistantFilters, applyTaskAssistantFilters, taskListingSearchPolicy, type AppliedTaskSearch, type TaskSearchValues } from "../lib/taskSearchAssistant";
import { titleSearchPolicy, type SellerRanking } from "../lib/listingSearch";
import { getActingTenant } from "../api/transport";
import { newSearchValues, readSearchConversation, searchChangeSummary, type SearchMessage, type SearchQuestion } from "../lib/searchConversation";
import { useProductSemanticTaxonomy } from "../hooks/useProductSemanticTaxonomy";
import { readSemanticFilters } from "../lib/semanticFilters";

export function QueueSearchBar({ipId,product,status,values,ranking,conversationOwner,initialAsk=false,onExtended,onTitleSearch,onChange,onApply}: {
  conversationOwner?:string;
  initialAsk?:boolean; ipId:string; product?:string; status:TaskQueueQuery["status"]; values:TaskSearchValues; ranking:SellerRanking|null;
  onTitleSearch:(supported:boolean)=>void; onExtended:(extended:boolean)=>void; onChange:(value:string)=>void; onApply:(next:AppliedTaskSearch,signal:AbortSignal)=>Promise<boolean>;
}) {
  const [mode,setMode] = useState<"search"|"ask">(initialAsk?"ask":"search");
  const [draft,setDraft] = useState(initialAsk?values.q??"":"");
  const scope = JSON.stringify([ipId,product,status,values,ranking]);
  const conversationKey=conversationOwner?`queue-conversation-v1:${conversationOwner}:${getActingTenant()??"own"}:${ipId}`:null;
  const [savedConversation] = useState(()=>readSearchConversation(conversationKey,scope));
  const [messages,setMessages] = useState<SearchMessage[]>(savedConversation.messages);
  const [intent,setIntent] = useState<"new"|"continue">(savedConversation.intent);
  const [conversationAvailable,setConversationAvailable] = useState(false);
  const [question,setQuestion] = useState<SearchQuestion|null>(savedConversation.question);
  const [undo,setUndo] = useState<{search:AppliedTaskSearch;scope:string}|null>(null);
  const {labels:categoryLabels}=useProductSemanticTaxonomy(ipId,readSemanticFilters(values.semantic)?.categories);
  const [open,setOpen] = useState(false);
  const [busy,setBusy] = useState(false);
  const [available,setAvailable] = useState(false);
  const [titleSearch,setTitleSearch] = useState(false);
  const [extended,setExtended] = useState(false);
  const [choices,setChoices] = useState<Array<{label:string;apply:()=>Promise<void>}>>([]);
  const request = useRef<AbortController|null>(null);
  const latest = useRef(scope); latest.current = scope;
  const say = (text:string)=>setMessages(previous=>[...previous,{role:"assistant",text:text.slice(0,2000)}]);
  useEffect(()=>{
    if(!conversationKey)return;
    try{sessionStorage.setItem(conversationKey,JSON.stringify({scope,messages:messages.slice(-40),intent,question}));}catch{/* Storage is optional. */}
  },[conversationKey,scope,messages,intent,question]);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.all([listingCapability(controller.signal),taskCapability(ipId,controller.signal)]).then(([listing,task])=>{
      if (controller.signal.aborted) return;
      setAvailable(listing.enabled);
      setConversationAvailable(listing.conversation);
      const supported=task.listing_search_policy_version === taskListingSearchPolicy;
      setExtended(supported); onExtended(supported);
      const titleSupported=task.title_search_policy_version === titleSearchPolicy;
      setTitleSearch(titleSupported);onTitleSearch(titleSupported);
    }).catch(()=>{if(!controller.signal.aborted) setAvailable(false);});
    return ()=>controller.abort();
  },[ipId,onExtended,onTitleSearch]);
  useEffect(()=>()=>{request.current?.abort();},[]);
  const previousScope=useRef(scope);
  useEffect(()=>{
    request.current?.abort();setBusy(false);setChoices([]);
    if(previousScope.current!==scope)setQuestion(null);
    previousScope.current=scope;
  },[scope]);
  function chooseIntent(next:"new"|"continue") {
    request.current?.abort();setBusy(false);setChoices([]);setQuestion(null);setMode("ask");setOpen(true);setIntent(next);
    if(next==="new"){setMessages([]);setDraft("");}
  }
  async function undoChange() {
    if(!undo||undo.scope!==scope||busy)return;
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setQuestion(null);setChoices([]);
    try{if(await onApply(undo.search,controller.signal)){setUndo(null);say("Restored the previous search conditions.");}}
    catch(error){if(!controller.signal.aborted)say(error instanceof Error?error.message:"Could not restore the previous search.");}
    finally{if(request.current===controller)setBusy(false);}
  }
  async function ask(reply?:string,literalChoice?:"keep"|"remove",resolution?:"price"|"seller_listing_count") {
    const message=reply??draft.trim();
    if (!message || busy || !available) return;
    if(question&&!conversationAvailable){setQuestion(null);say("Contextual replies are unavailable on this API. Start a new AI search and describe the full request; your current results were kept.");return;}
    request.current?.abort(); const controller=new AbortController(); request.current=controller;
    const snapshot=scope, current=()=>!controller.signal.aborted && latest.current===snapshot;
    setBusy(true);setOpen(true);setChoices([]);setDraft("");
    const priorQuestion=question;setQuestion(null);
    setMessages(previous=>[...previous,{role:"user",text:message}]);
    if(conversationAvailable&&intent==="continue"&&values.q&&!messages.length&&!literalChoice){
      say(`This search also requires the literal text “${values.q}”. Keep that text filter, or remove it before applying your request?`);
      setQuestion({options:["Keep text filter","Remove text filter"],literalMessage:message});setBusy(false);return;
    }
    const baseValues=intent==="new"?newSearchValues(values):literalChoice==="remove"?{...values,q:""}:values;
    const baseProduct=intent==="new"?undefined:product;
    const baseRanking=intent==="new"?null:ranking;
    const before:AppliedTaskSearch={values,status,product,ranking};
    const prepare=(filters:ReturnType<typeof taskAssistantFilters>,nextRanking:SellerRanking|null)=>{
      const nextValues=applyTaskAssistantFilters(baseValues,filters);
      if(nextValues.title_contains&&!titleSearch)throw new Error("Title filtering is not available in this queue yet. Your filters were kept.");
      if(!extended&&(nextRanking||["listing_countries","listing_price","seller_listing_count","catalog_selection"].some(field=>nextValues[field])))throw new Error("That search is not available in this queue yet. Your filters were kept.");
      return {values:nextValues,status:filters.status,product:filters.catalog_product_id??undefined,ranking:nextRanking};
    };
    const apply = async (filters:ReturnType<typeof taskAssistantFilters>, nextRanking:SellerRanking|null)=>{
      if(!current()) return;
      if(await onApply(prepare(filters,nextRanking),controller.signal)) {
        // onApply commits the new scope, so a successful acknowledgement is the
        // final receipt. A stale acknowledgement returns false in TaskSearch.
        const applied=prepare(filters,nextRanking);
        setUndo({search:before,scope:JSON.stringify([ipId,applied.product,applied.status,applied.values,applied.ranking])});
        const summary=intent==="new"?"Started a new AI search. Previous search conditions were cleared; brand and dates were kept. "+searchChangeSummary({values:baseValues,status,product:baseProduct,ranking:baseRanking},applied,categoryLabels):searchChangeSummary(before,applied,categoryLabels);
        setIntent("continue");say(summary+(nextRanking?` Searching for the top ${nextRanking.limit} sellers; rankings wait for completion.`:""));
      } else if(current()){setDraft(message);say("Search failed. The latest request was not applied; your filters and results were kept.");}
    };
    try {
      const filters=taskAssistantFilters(baseValues,ipId,status,baseProduct);
      const translationMessage=resolution?priorQuestion?.requestMessage??message:message;
      const translation=await translateListingSearch(translationMessage,filters,controller.signal,baseRanking,conversationAvailable?{
        mode:intent,messages:resolution?[]:messages.slice(-12).map(item=>({role:item.role,content:item.text.slice(0,2000)})),...(resolution?{resolution}:{}),
      }:undefined);
      if(!current()) return;
      if(translation.name==="request_clarification") {
        if(translation.question){say(translation.question);setQuestion({options:translation.options??[],conflictField:translation.conflictField,requestMessage:translationMessage});return;}
        const reasons:Record<string,string>={similarity:"Image similarity is not available in queue search yet.",shipping:"Shipping destinations are not available. You can filter listing locations.",live_fx:"Prices use a historical exchange-rate snapshot.",investigation:"Ask filters the queue. Use the review actions for investigations.",seller_metrics:"Seller ranking counts matching suspected listings. Other seller metrics are not available."};
        if(!conversationAvailable)setDraft(message);
        say((translation.reason==="unsupported_capability" ? reasons[translation.capability??""]??"That filter is not available yet." : "Please specify the product details or filters you want to change.")+" Your filters were kept."+(!conversationAvailable?" Revise the full request in the box, including the conditions you want to retain.":""));
        return;
      }
      if(translation.name==="next_listing_page") {say("Use the queue’s Next page control to see more matching results.");return;}
      if(priorQuestion&&message==="Keep the current search"){say("Kept the current search.");return;}
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
      if(current()){setDraft(message);say(error instanceof Error ? `${error.message} The latest request was not applied.` : "Search failed. Your filters were kept.");}
    } finally {if(request.current===controller)setBusy(false);}
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
        <button type="button" aria-pressed={mode==="ask"} disabled={!available} title={!available?"Search assistant unavailable":"Describe your filters in plain language"} onClick={()=>{if(mode!=="ask" && !draft.trim()) setDraft(values.q??"");setMode("ask");}}>Ask</button>
      </div>
      {mode==="ask" && (busy ? <button className="task-ask-send" type="button" aria-label="Cancel assistant request" onClick={()=>{
        request.current?.abort();setBusy(false);
        say("Request cancelled. Your filters were kept.");
      }}><X size={16}/></button>
        : <button className="task-ask-send" type="button" aria-label="Apply assistant search" disabled={!draft.trim()||!available} onClick={()=>void ask()}><ArrowUp size={16}/></button>)}
    </div>
    {mode==="ask"&&<div className="task-search-conversation-actions" role="group" aria-label="AI search intent">
      <button type="button" aria-pressed={intent==="new"} onClick={()=>chooseIntent("new")}>New AI search</button>
      <button type="button" aria-pressed={intent==="continue"} onClick={()=>chooseIntent("continue")}>Continue current search</button>
      {undo?.scope===scope&&<button type="button" disabled={busy} onClick={()=>void undoChange()}>Undo last change</button>}
      <small>{intent==="new"?"Starts fresh within this brand, queue status and date range. Current results stay until your search is applied.":"Refines the active filters shown below."}</small>
    </div>}
    {(mode==="ask" || messages.length>0) && <details className="task-search-conversation" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary>{busy?"Interpreting request…":messages.length?"Search conversation":"Ask about this queue"}</summary>
      <div role="log" aria-label="Queue search conversation" aria-live="polite">
        {messages.length===0 && <p>{intent==="new"?"Describe a fresh search. Previous search conditions will be replaced when it is applied.":"Describe what to change. Unmentioned filters stay active."}</p>}
        {messages.map((message,index)=><div className={`task-search-message is-${message.role}`} key={index}><strong>{message.role==="user"?"You":"Search assistant"}</strong><p>{message.text}</p></div>)}
        {choices.map(choice=><button type="button" key={choice.label} onClick={()=>void choice.apply()}>{choice.label}</button>)}
        {question&&<div className="task-search-clarification" role="group" aria-label="Clarification answers">
          {question.options.map((option,index)=><button key={option} type="button" disabled={busy} onClick={()=>{
            if(option==="Keep the current search"){setQuestion(null);setDraft("");setIntent("continue");setMessages(previous=>[...previous,{role:"user",text:option},{role:"assistant",text:"Kept the current search."}]);return;}
            const field=question.conflictField;
            const resolution=field&&option===`Replace the previous ${field==="price"?"price":"seller count"} range`?field:undefined;
            void ask(question.literalMessage??option,question.literalMessage?(index===0?"keep":"remove"):undefined,resolution);
          }}>{option}</button>)}
        </div>}
      </div>
      {<small>Counts describe suspected listings; they do not establish confirmed infringement.</small>}
    </details>}
  </>;
}
