import {associateWorkflow,reportWorkflow} from "../lib/workflowContext";
import {discussListings,getSearchPlan,type SearchPlan} from "../api/listingDiscussion";
import type {Translation} from "../api/listingSearch";
import {CategoryRankingResult} from "./CategoryRankingResult";
import type {CategoryRanking,CategoryRankingRequest} from "../lib/categoryRanking";
import { mergeQueueView,queueViewSummary,queueViewKey,type QueueView,type QueueViewChange } from "../lib/queueView";
import { useContext,useEffect, useId, useRef, useState } from "react";
import {AiSearchHistoryContext} from "../context/AiSearchHistoryContext";
import { Search, Sparkles, ArrowUp, X, SquarePen, ChevronDown, ChevronUp, History } from "lucide-react";
import { listingCapability, resolveListingCatalog, translateListingSearch } from "../api/listingSearch";
import { taskCapability, type TaskQueueQuery } from "../api/taskQueue";
import { taskAssistantFilters, applyTaskAssistantFilters, taskListingSearchPolicy, type AppliedTaskSearch, type TaskSearchValues } from "../lib/taskSearchAssistant";
import { titleSearchPolicy, listingFilterKey,parseListingFilters, type SellerRanking,type ListingFilters } from "../lib/listingSearch";
import { startListingAgent, getListingAgent, followListingAgent, cancelListingAgent } from "../api/listingAgent";
import type { TaskSearchResult } from "../api/taskQueue";
import { getActingTenant, isApiError } from "../api/transport";
import { newSearchValues,parseSearchConversation, readSearchConversation,clarificationRequestMessage, searchConversationMessages,searchChangeSummary,conversationSearchSummary, type SearchMessage, type SearchQuestion } from "../lib/searchConversation";
import { useProductSemanticTaxonomy } from "../hooks/useProductSemanticTaxonomy";
import { readSemanticFilters } from "../lib/semanticFilters";

export function QueueSearchBar({ipId,product,status,values,ranking,conversationOwner,view,onViewChange,onRankCategories,onShowCategoryReport,searchId,scopeLabel,standalone=false,initialAsk=false,onExtended,onTitleSearch,onChange,onApply,onAgentResult,onAgentSearching}: {
  scopeLabel?:string;
  standalone?:boolean;
  onShowCategoryReport?:(report:CategoryRanking)=>void;
  searchId?:string|null;
  onRankCategories?:(input:CategoryRankingRequest,target:AppliedTaskSearch,signal:AbortSignal,fresh:boolean)=>Promise<{report:CategoryRanking;applied:AppliedTaskSearch;searchChanged:boolean}|null>;
  view?:QueueView;
  onViewChange?:(view:QueueView,signal:AbortSignal)=>Promise<boolean>;
  conversationOwner?:string;
  initialAsk?:boolean; ipId:string; product?:string; status:TaskQueueQuery["status"]; values:TaskSearchValues; ranking:SellerRanking|null;
  onTitleSearch:(supported:boolean)=>void; onExtended:(extended:boolean)=>void; onChange:(value:string)=>void; onApply:(next:AppliedTaskSearch,signal:AbortSignal)=>Promise<boolean>;
  onAgentResult:(result:TaskSearchResult,applied:AppliedTaskSearch)=>void;
  onAgentSearching:(searching:boolean)=>void;
}) {
  const aiHistory=useContext(AiSearchHistoryContext);
  const scope = JSON.stringify([ipId,product,status,values,ranking]);
  const [mode,setMode] = useState<"search"|"ask">(standalone||initialAsk?"ask":"search");
  const [draft,setDraft] = useState(standalone?(aiHistory?.chat?.state.scope===scope?aiHistory.chat.state.draft:""):initialAsk?values.q??"":"");
  const filterScope=JSON.stringify([ipId,product,status,values]);
  const conversationKey=!standalone&&conversationOwner?`queue-conversation-v1:${conversationOwner}:${getActingTenant()??"own"}:${ipId}`:null;
  const [savedConversation] = useState(()=>standalone?(aiHistory?.chat?parseSearchConversation(aiHistory.chat.state,scope):{messages:[],intent:searchId?"continue" as const:"new" as const,question:null}):readSearchConversation(conversationKey,scope));
  const [assistantMode,setAssistantMode]=useState<"discuss"|"search">(savedConversation.assistantMode??"search");
  const [workflowsAvailable,setWorkflowsAvailable]=useState(false);
  const [traceInspector,setTraceInspector]=useState(false);
  const [lastTrace,setLastTrace]=useState<string|null>(null);
  const [discussionAvailable,setDiscussionAvailable]=useState(false);
  const [executedPlans,setExecutedPlans]=useState<string[]>([]);
  const [messages,setMessages] = useState<SearchMessage[]>(savedConversation.messages);
  const [intent,setIntent] = useState<"new"|"continue">(savedConversation.intent);
  const [conversationAvailable,setConversationAvailable] = useState(false);
  const [question,setQuestion] = useState<SearchQuestion|null>(savedConversation.question);
  const [undo,setUndo] = useState<({kind:"search";search:AppliedTaskSearch;scope:string}|{kind:"view";previous:QueueView;target:string;scope:string})|null>(null);
  const [viewAvailable,setViewAvailable]=useState(false);
  const [actionFeatures,setActionFeatures]=useState({sellerValue:false,categorySelection:false,answers:false,queryView:false});
  const [categoriesAvailable,setCategoriesAvailable]=useState(false);
  const [activity,setActivity]=useState("");
  const viewKey=queueViewKey(view);
  const previousView=useRef(viewKey);
  const {labels:categoryLabels}=useProductSemanticTaxonomy(ipId,readSemanticFilters(values.semantic)?.categories);
  const currentCategoryLabels=useRef(categoryLabels);currentCategoryLabels.current=categoryLabels;
  const [open,setOpen] = useState(initialAsk);
  const transcriptId=useId();
  const transcript=useRef<HTMLDivElement|null>(null);
  const composer=useRef<HTMLTextAreaElement|null>(null);
  const followLatest=useRef(true);
  const [busy,setBusy] = useState(false);
  const [available,setAvailable] = useState(false);
  const [agentAvailable,setAgentAvailable] = useState(false);
  const [agentMode,setAgentMode] = useState(()=>sessionStorage.getItem("queue-search-agent-mode")==="1");
  const [agentProgress,setAgentProgress] = useState("");
  const [resumeAvailable,setResumeAvailable] = useState(false);
  const [titleSearch,setTitleSearch] = useState(false);
  const [extended,setExtended] = useState(false);
  const [choices,setChoices] = useState<Array<{label:string;apply:()=>Promise<void>}>>([]);
  const request = useRef<AbortController|null>(null);
  const currentAgent=useRef<{id:string;scope:string}|null>(null);
  const agentStorageKey=`queue-search-agent:${getActingTenant()??"own"}:${ipId}`;
  const latest = useRef(scope); latest.current = scope;
  const say = (text:string)=>setMessages(previous=>[...previous,{role:"assistant",text:text.slice(0,2000)}]);
  const saveHistory=aiHistory?.save;
  const openedReport=useRef("");
  useEffect(()=>{
    const report=messages.at(-1)?.categoryReport;
    if(!standalone||!report||!onShowCategoryReport||(report.search_id??null)!==(searchId??null))return;
    const key=JSON.stringify([report.search_id,report.as_of,report.metric]);
    if(openedReport.current===key)return;
    openedReport.current=key;onShowCategoryReport(report);
  },[standalone,messages,searchId,onShowCategoryReport]);
  useEffect(()=>{if(standalone)saveHistory?.({scope,messages:messages.slice(-40),intent,question,draft,assistantMode});},[standalone,saveHistory,scope,messages,intent,question,draft,assistantMode]);
  useEffect(()=>{
    if(!conversationKey)return;
    try{sessionStorage.setItem(conversationKey,JSON.stringify({scope,messages:messages.slice(-40),intent,question,assistantMode}));}catch{/* Storage is optional. */}
  },[conversationKey,scope,messages,intent,question,assistantMode]);
  useEffect(()=>{
    const controller=new AbortController();
    void Promise.all([listingCapability(controller.signal),taskCapability(ipId,controller.signal)]).then(([listing,task])=>{
      if (controller.signal.aborted) return;
      setAvailable(listing.enabled);
      setConversationAvailable(listing.conversation);
      setDiscussionAvailable(listing.discussion&&listing.conversation);
      setTraceInspector(listing.traceInspector);
      setWorkflowsAvailable(listing.workflows);
      setActionFeatures({sellerValue:listing.sellerValue,categorySelection:listing.conversationActions,answers:listing.conversationAnswers,queryView:listing.queryView});
      setViewAvailable(listing.queueView);setCategoriesAvailable(listing.categoryRanking);
      const supported=task.listing_search_policy_version === taskListingSearchPolicy;
      setAgentAvailable(listing.searchAgent&&supported&&task.active&&task.ready);
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
    const current=currentAgent.current;
    if(current&&current.scope!==scope){void cancelListingAgent(current.id).catch(()=>{});currentAgent.current=null;sessionStorage.removeItem(agentStorageKey);}
    try{const saved=JSON.parse(sessionStorage.getItem(agentStorageKey)??"null");setResumeAvailable(saved?.scope===scope);}catch{setResumeAvailable(false);}
  },[scope,agentStorageKey]);
  useEffect(()=>{
    if(mode!=="ask"||!open)return;
    const log=transcript.current;
    if(log&&followLatest.current)log.scrollTop=log.scrollHeight;
  },[messages,question,choices,busy,agentProgress,mode,open]);
  useEffect(()=>{
    const input=composer.current;
    if(!input)return;
    input.style.height="auto";
    input.style.height=`${Math.max(48,Math.min(input.scrollHeight,144))}px`;
  },[draft,mode]);
  useEffect(()=>{if(mode==="ask")composer.current?.focus();},[mode]);
  useEffect(()=>{
    if(previousView.current!==viewKey){request.current?.abort();setBusy(false);setQuestion(null);setChoices([]);}
    previousView.current=viewKey;
  },[viewKey]);
  function chooseIntent(next:"new"|"continue") {
    followLatest.current=true;composer.current?.focus();
    request.current?.abort();setBusy(false);setChoices([]);setQuestion(null);setMode("ask");setOpen(true);setIntent(next);
    if(currentAgent.current){void cancelListingAgent(currentAgent.current.id).catch(()=>{});currentAgent.current=null;onAgentSearching(false);}
    sessionStorage.removeItem(agentStorageKey);setResumeAvailable(false);
    if(next==="new"){setMessages([]);setDraft("");sessionStorage.removeItem(agentStorageKey+":previous");}
  }
  async function undoChange() {
    if(!undo||undo.scope!==(undo.kind==="view"?filterScope:scope)||busy)return;
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);setQuestion(null);setChoices([]);
    try{const restored=undo.kind==="view"?onViewChange&&undo.target===viewKey&&await onViewChange(undo.previous,controller.signal):await onApply(undo.search,controller.signal);if(restored){setUndo(null);say(undo.kind==="view"?"Restored the previous queue view.":"Restored the previous search conditions.");}}
    catch(error){if(!controller.signal.aborted)say(error instanceof Error?error.message:"Could not restore the previous search.");}
    finally{if(request.current===controller)setBusy(false);}
  }
  const planContext=JSON.stringify([conversationOwner,getActingTenant(),scope,viewKey,searchId??null]);
  const latestPlanContext=useRef(planContext);latestPlanContext.current=planContext;
  const runningPlan=useRef(false);
  async function discuss(message:string) {
    if(!discussionAvailable||busy)return;
    const controller=new AbortController();request.current?.abort();request.current=controller;
    const snapshot=planContext;
    setBusy(true);setActivity("Reviewing your question…");setOpen(true);setDraft("");
    setMessages(previous=>[...previous,{role:"user",text:message}]);
    try {
      const result=await discussListings({message,filters:taskAssistantFilters(values,ipId,status,product),values,status,ranking,
        conversation:{mode:intent,messages:searchConversationMessages(messages,question)},
        view,searchId,contextKey:snapshot,draftId:[...messages].reverse().find(item=>item.plan?.contextKey===snapshot&&!item.plan.submitted)?.plan?.id,features:actionFeatures,categoryRanking:Boolean(categoriesAvailable&&onRankCategories)},controller.signal);
      if(controller.signal.aborted||latestPlanContext.current!==snapshot)return;
      setLastTrace(result.id);
      setMessages(previous=>[...previous,{role:"assistant",text:result.answer,...(result.plan?{plan:result.plan}:{})}]);
    }catch(error){if(!controller.signal.aborted){setDraft(message);say(error instanceof Error?error.message:"Discussion could not finish.");}}
    finally{if(request.current===controller){setBusy(false);setActivity("");}}
  }
  async function runPlan(plan:SearchPlan) {
    if(busy||runningPlan.current||plan.submitted||plan.contextKey!==planContext||executedPlans.includes(plan.id))return;
    runningPlan.current=true;
    const controller=new AbortController();request.current?.abort();request.current=controller;setBusy(true);
    try {
      const prepared=await getSearchPlan(plan,view,actionFeatures,controller.signal);
      if(controller.signal.aborted||latestPlanContext.current!==plan.contextKey)return;
      // Fetch the host-owned proposal. Stored chat text cannot authorize or alter it.
      setBusy(false);setExecutedPlans(previous=>[...previous,plan.id]);
      setMessages(previous=>previous.map(message=>message.plan?.id===plan.id?{...message,plan:{...message.plan,submitted:true}}:message));
      await ask(false,"Run this search",undefined,undefined,prepared);
    }catch(error){if(!controller.signal.aborted)say(error instanceof Error?error.message:"This search plan could not be loaded.");}
    finally{runningPlan.current=false;if(request.current===controller)setBusy(false);}
  }
  async function ask(resume=false,reply?:string,literalChoice?:"keep"|"remove",resolution?:"price"|"seller_listing_count",prepared?:{translation:Translation;intent:"new"|"continue";runId?:string}) {
    let saved:{id?:string;scope:string;message:string;requestKey:string}|null=null;
    try{saved=JSON.parse(sessionStorage.getItem(agentStorageKey)??"null");}catch{/* Invalid local state is ignored. */}
    const message=reply??(resume&&saved?.scope===scope?saved.message:draft.trim());
    if (!message || busy || !available) return;
    if(assistantMode==="discuss"&&!resume&&!prepared){await discuss(message);return;}
    const runIntent=prepared?.intent??intent;
    if(question&&!conversationAvailable){setQuestion(null);say("Contextual replies are unavailable on this API. Start a new AI search and describe the full request; your current results were kept.");return;}
    request.current?.abort(); const controller=new AbortController(); request.current=controller;
    if(prepared?.runId&&workflowsAvailable)associateWorkflow(controller.signal,prepared.runId);
    const snapshot=scope, current=()=>!controller.signal.aborted && latest.current===snapshot;
    setBusy(true);setActivity("");setOpen(true);setChoices([]);setDraft("");
    const priorQuestion=question;setQuestion(null);
    if(!resume)setMessages(previous=>[...previous,{role:"user",text:message}]);
    const needsTextChoice=Boolean(!prepared&&conversationAvailable&&runIntent==="continue"&&values.q&&!messages.length&&!literalChoice);
    const clarifyText=()=>{
      say(`This search also requires the literal text “${values.q}”. Keep that text filter, or remove it before applying your request?`);
      setQuestion({options:["Keep text filter","Remove text filter"],literalMessage:message});
    };
    if(needsTextChoice&&!viewAvailable&&!categoriesAvailable&&!actionFeatures.answers){clarifyText();setBusy(false);return;}
    const baseValues=runIntent==="new"?newSearchValues(values):literalChoice==="remove"?{...values,q:""}:values;
    const baseProduct=runIntent==="new"?undefined:product;
    const baseRanking=runIntent==="new"||view?.group_sort==="total_price"?null:ranking;
    const before:AppliedTaskSearch={values,status,product,ranking,...(view?{queueView:view}:{})};
    let translationLabels:Record<string,string>={};
    const prepare=(filters:ReturnType<typeof taskAssistantFilters>,nextRanking:SellerRanking|null)=>{
      const nextValues=applyTaskAssistantFilters(baseValues,filters);
      if(nextValues.title_contains&&!titleSearch)throw new Error("Title filtering is not available in this queue yet. Your filters were kept.");
      if(!extended&&(nextRanking||["listing_countries","listing_price","seller_listing_count","catalog_selection"].some(field=>nextValues[field])))throw new Error("That search is not available in this queue yet. Your filters were kept.");
      return {values:nextValues,status:filters.status,product:filters.catalog_product_id??undefined,ranking:nextRanking};
    };
    const apply = async (filters:ReturnType<typeof taskAssistantFilters>, nextRanking:SellerRanking|null,showListings=false,queueViewChange?:QueueViewChange)=>{
      if(!current()) return;
      const nextView=queueViewChange?mergeQueueView(runIntent==="new"?{sort:"priority",group_by:"none"}:view??{sort:"priority",group_by:"none"},queueViewChange):undefined;
      const ranked=nextView?nextView.group_by==="seller"&&nextView.group_sort==="articles"&&nextView.top_sellers?{limit:nextView.top_sellers}:null:nextRanking;
      const target={...prepare(filters,ranked),...(showListings?{showListings:true}:{}),...(nextView?{queueView:nextView}:{})};
      if(await onApply(target,controller.signal)) {
        // onApply commits the new scope, so a successful acknowledgement is the
        // final receipt. A stale acknowledgement returns false in TaskSearch.
        reportWorkflow(controller.signal,"applied");
        const applied=target;
        setUndo({kind:"search",search:before,scope:JSON.stringify([ipId,applied.product,applied.status,applied.values,applied.ranking])});
        const summaryLabels={...Object.fromEntries(messages.flatMap(item=>item.categoryReport?.groups.flatMap(group=>group.category_key?[[group.category_key,group.category_label]]:[])??[])),...currentCategoryLabels.current,...translationLabels};
        const summaryBefore=runIntent==="new"?{values:baseValues,status,product:baseProduct,ranking:baseRanking}:before;
        const summary=standalone?conversationSearchSummary(summaryBefore,applied,summaryLabels,runIntent==="new"):runIntent==="new"?"Started a new AI search. Previous search conditions were cleared; brand and dates were kept. "+searchChangeSummary(summaryBefore,applied,summaryLabels):searchChangeSummary(before,applied,summaryLabels);
        setIntent("continue");say(summary+(!standalone&&nextRanking?` Searching for the top ${nextRanking.limit} sellers; rankings wait for completion.`:""));
      } else if(current()){reportWorkflow(controller.signal,"failed");setDraft(message);say("Search failed. The latest request was not applied; your filters and results were kept.");}
    };
    try {
      const filters=taskAssistantFilters(baseValues,ipId,status,baseProduct);
      const translationMessage=resolution?priorQuestion?.requestMessage??message:message;
      const reportContext=actionFeatures.categorySelection&&runIntent==="continue"?[...messages].reverse().find(item=>item.categoryReport?.search_id===searchId)?.categoryReport:undefined;
      const translate=()=>translateListingSearch(translationMessage,filters,controller.signal,baseRanking,conversationAvailable?{
        mode:runIntent,...(reportContext?{category_context:{metric:reportContext.metric,groups:reportContext.groups.map(({category_key,category_label})=>({category_key,category_label}))}}:{}),messages:resolution?[]:searchConversationMessages(messages,priorQuestion),...(resolution?{resolution}:{}),
      }:undefined,viewAvailable&&onViewChange?view:undefined,Boolean(categoriesAvailable&&onRankCategories),{...actionFeatures,onTrace:id=>{setLastTrace(id);if(workflowsAvailable)associateWorkflow(controller.signal,id);}});
      // A question can be answered without starting or resuming a search agent.
      // Other agent requests still use discovery and execution as before.
      const conversationalTranslation=actionFeatures.answers&&conversationAvailable&&!resume&&!prepared?await translate():null;
      if(!current())return;
      if(conversationalTranslation?.name==="answer_question"){
        say(conversationalTranslation.answer);setQuestion(priorQuestion);return;
      }
      if(!prepared&&agentAvailable&&agentMode&&!(conversationalTranslation&&"queueView" in conversationalTranslation&&conversationalTranslation.queueView)){
        onAgentSearching(true);
        const continuing=saved?.scope===scope&&saved.message===message;
        if(!continuing&&saved?.id)await cancelListingAgent(saved.id);
        const requestKey=continuing?saved!.requestKey:crypto.randomUUID();
        const pending={scope,message,requestKey,...(continuing&&saved?.id?{id:saved.id}:{})};
        sessionStorage.setItem(agentStorageKey,JSON.stringify(pending));setResumeAvailable(true);
        let previousId=runIntent==="new"?undefined:sessionStorage.getItem(agentStorageKey+":previous")??undefined;
        if(previousId){
          try{const previous=await getListingAgent(previousId,controller.signal);if(previous.filters.ip_id!==ipId)previousId=undefined;}
          catch(error){if(isApiError(error,404)||isApiError(error,403))previousId=undefined;else throw error;}
          if(!previousId)sessionStorage.removeItem(agentStorageKey+":previous");
        }
        const started=continuing&&saved?.id?await getListingAgent(saved.id,controller.signal)
          :await startListingAgent(message,filters,baseValues,status,baseRanking,controller.signal,requestKey,previousId);
        if(started.filters.ip_id!==ipId)throw new Error("This search agent run belongs to another brand. Start a new request.");
        if(!current()){void cancelListingAgent(started.id).catch(()=>{});return;}
        currentAgent.current={id:started.id,scope};
        sessionStorage.setItem(agentStorageKey,JSON.stringify({...pending,id:started.id}));
        const result=await followListingAgent(started,controller.signal,run=>{if(current())setAgentProgress(run.progress);});
        if(!current())return;
        currentAgent.current=null;sessionStorage.removeItem(agentStorageKey);setResumeAvailable(false);
        sessionStorage.setItem(agentStorageKey+":previous",result.id);
        if(result.status==="completed"&&result.search){
          const applied=prepare(result.filters,result.ranking);onAgentResult(result.search,applied);
          setUndo({kind:"search",search:before,scope:JSON.stringify([ipId,applied.product,applied.status,applied.values,applied.ranking])});setIntent("continue");say(result.message);
        }
        else say(result.message||"Search stopped. Your previous results were kept.");
        return;
      }
      let translation=prepared?.translation??conversationalTranslation??await translate();
      // A model may wrap a display-only reply in search_listings. Membership is
      // already established; unchanged canonical predicates need only a view change.
      if(runIntent==="continue"&&searchId&&(translation.name==="search_listings"||translation.name==="rank_sellers")&&translation.queueView&&!translation.catalogQuery&&!translation.showListings&&listingFilterKey(translation.filters)===listingFilterKey(filters)){
        const display:QueueViewChange=translation.name==="rank_sellers"?{group_by:"seller",group_sort:"articles",top_sellers:translation.ranking!.limit,...translation.queueView}:translation.queueView;
        translation={name:"set_queue_view",view:display};
      }
      if(!current()) return;
      if(translation.name==="search_listings"||translation.name==="rank_sellers")translationLabels=translation.categoryLabels??{};
      if(translation.name==="answer_question"){
        say(translation.answer);
        setQuestion(priorQuestion);
        return;
      }
      if(translation.name==="rank_categories"){
        if(!categoriesAvailable||!onRankCategories){say("Category ranking is unavailable in this client. Your filters were kept.");return;}
        setActivity("Calculating category totals across the full search…");
        const ranked=await onRankCategories(translation.ranking,{values:baseValues,status,product:baseProduct,ranking:baseRanking},controller.signal,runIntent==="new");
        if(!ranked){if(current())say("Category ranking could not finish. Your previous filters and results were kept.");return;}
        if(ranked.searchChanged)setUndo({kind:"search",search:before,scope:JSON.stringify([ipId,ranked.applied.product,ranked.applied.status,ranked.applied.values,ranked.applied.ranking])});
        const first=ranked.report.groups[0];
        const summary=`Ranked categories by ${ranked.report.metric==="total_price"?"total known listing price (USD)":"matching listing count"} across the complete search.${first?` First: ${first.category_label}.`:""}`;
        reportWorkflow(controller.signal,"applied");
        setMessages(previous=>[...previous,{role:"assistant",text:summary,categoryReport:ranked.report}]);setIntent("continue");return;
      }
      if(translation.name==="set_queue_view"){
        if(!view||!onViewChange||!viewAvailable){say("Queue display controls are unavailable in this client. Your filters were kept.");return;}
        if(translation.view.group_sort==="total_price"&&!actionFeatures.sellerValue){say("Seller totals by listing price are not available on this API yet. Your filters and results were kept.");return;}
        const next=mergeQueueView(runIntent==="new"?{sort:"priority",group_by:"none"}:view,translation.view);
        if((next.group_by==="seller"||prepared)&&(runIntent==="new"||!searchId)){
          // A fresh chat has no saved membership to aggregate. Establish it
          // once and commit the desired view with that query, never an old chat.
          const target={...prepare(filters,next.group_sort==="articles"&&next.top_sellers?{limit:next.top_sellers}:null),queueView:next};
          if(!await onApply(target,controller.signal)){if(current())say("The seller search could not start. Your previous search was kept.");return;}
          setUndo({kind:"search",search:before,scope:JSON.stringify([ipId,target.product,target.status,target.values,target.ranking])});
          reportWorkflow(controller.signal,"applied");
          setIntent("continue");say(queueViewSummary(translation.view)+" Ranking will appear when the complete search is ready.");return;
        }
        if(queueViewKey(next)!==viewKey){
          if(!await onViewChange(next,controller.signal)){if(current())say("The queue view could not be changed. Your search was kept.");return;}
          setUndo({kind:"view",previous:view,target:queueViewKey(next),scope:filterScope});
        }
        reportWorkflow(controller.signal,"applied");
        setIntent("continue");say(queueViewSummary(translation.view));return;
      }
      if(translation.name==="request_clarification") {
        if(translation.question){setMessages(previous=>[...previous,{role:"assistant",text:translation.question!.slice(0,2000),...(translation.options?{clarificationOptions:translation.options}:{})}]);setQuestion({options:translation.options??[],conflictField:translation.conflictField,requestMessage:clarificationRequestMessage(translationMessage,priorQuestion)});return;}
        const reasons:Record<string,string>={similarity:"Image similarity is not available in queue search yet.",shipping:"Shipping destinations are not available. You can filter listing locations.",live_fx:"Prices use a historical exchange-rate snapshot.",investigation:"Ask filters the queue. Use the review actions for investigations.",seller_metrics:"Seller ranking counts matching suspected listings. Other seller metrics are not available."};
        if(!conversationAvailable)setDraft(message);
        say((translation.reason==="unsupported_capability" ? reasons[translation.capability??""]??"That filter is not available yet." : "Please specify the product details or filters you want to change.")+" Your filters were kept."+(!conversationAvailable?" Revise the full request in the box, including the conditions you want to retain.":""));
        return;
      }
      if(translation.name==="next_listing_page") {say("Use the queue’s Next page control to see more matching results.");return;}
      if(priorQuestion&&message==="Keep the current search"){say("Kept the current search.");return;}
      if(needsTextChoice){clarifyText();return;}
      if(translation.catalogQuery) {
        const resolved=await resolveListingCatalog(translation.catalogQuery,ipId,controller.signal);
        if(!current()) return;
        if(resolved.status==="not_found") {
          let titleFilters:ListingFilters|null=null;
          const name=translation.catalogQuery.trim(),existingTitle=translation.filters.title_contains;
          if(titleSearch&&(!existingTitle||existingTitle.toLowerCase()===name.toLowerCase())){try{titleFilters=parseListingFilters({...translation.filters,catalog_product_id:null,catalog_selection:null,title_contains:name});}catch{/* Offer only names supported by the canonical title-filter contract. */}}
          if(!titleFilters){say("No matching product was found in this catalog. Your filters were kept.");return;}
          const fallback=titleFilters,label=`Search titles for “${fallback.title_contains}”`;
          let selected=false;
          say(`I couldn’t find “${fallback.title_contains}” in the catalog. You can search for this text in listing titles, with the other requested filters.`);
          setChoices([{label,apply:async()=>{
            if(!current()||selected)return;
            selected=true;setBusy(true);setChoices([]);setMessages(previous=>[...previous,{role:"user",text:label}]);
            try{await apply(fallback,translation.ranking,translation.showListings,translation.queueView);}
            catch(error){if(current())say(error instanceof Error?error.message:"Search failed. Your filters were kept.");}
            finally{if(request.current===controller)setBusy(false);}
          }},{label:"Keep current search",apply:async()=>{
            if(!current()||selected)return;
            selected=true;setChoices([]);setIntent("continue");setMessages(previous=>[...previous,{role:"user",text:"Keep current search"},{role:"assistant",text:"Kept the current search."}]);
          }}]);
          return;
        }
        if(resolved.status==="ambiguous") {
          say("Choose the catalog match you meant:");
          setChoices(resolved.candidates.map(candidate=>({label:`${candidate.display_name} · ${candidate.scope_name}`,apply:async()=>{
            if(!current()) return;
            setBusy(true);setChoices([]);
            try{await apply({...translation.filters,catalog_product_id:null,catalog_selection:candidate.reference},translation.ranking,translation.showListings,translation.queueView);}
            catch(error){if(current()) say(error instanceof Error?error.message:"Search failed. Your filters were kept.");}
            finally{setBusy(false);}
          }})));
          return;
        }
        await apply({...translation.filters,catalog_product_id:null,catalog_selection:resolved.candidates[0].reference},translation.ranking,translation.showListings,translation.queueView);
      } else await apply(translation.filters,translation.ranking,translation.showListings,translation.queueView);
    } catch(error) {
      if(agentAvailable&&agentMode&&(isApiError(error,404)||isApiError(error,403))){
        sessionStorage.removeItem(agentStorageKey);setResumeAvailable(false);currentAgent.current=null;
      }
      if(current()){reportWorkflow(controller.signal,"failed",error instanceof Error?error.message:undefined);setDraft(message);say(error instanceof Error ? `${error.message} The latest request was not applied.` : "Search failed. Your filters were kept.");}
    } finally {if(request.current===controller){setBusy(false);if(current()&&agentAvailable&&agentMode)onAgentSearching(false);}}
  }
  const replying=intent==="continue"||messages.length>0;
  const searchModes=<div className="task-search-modes" role="group" aria-label="Search mode">
    <button type="button" aria-pressed={mode==="search"} onClick={()=>setMode("search")}>Search</button>
    <button type="button" aria-pressed={mode==="ask"} disabled={!available} title={!available?"Search assistant unavailable":"Describe your filters in plain language"} onClick={()=>{
      if(mode!=="ask"&&!draft.trim())setDraft(values.q??"");
      setMode("ask");setOpen(true);followLatest.current=true;
    }}>Ask</button>
  </div>;
  return mode==="search"?<div className="task-search-bar">
    <Search size={18} aria-hidden="true"/>
    <input type="search" aria-label="Search listings or sellers" placeholder="Search listings or sellers…" value={values.q??""} maxLength={100} onChange={event=>onChange(event.target.value)}/>
    {searchModes}
  </div>:<section className="task-search-chat" aria-label="AI search chat">
    <header className="task-search-chat-header">
      {standalone&&aiHistory&&<nav className="ai-chat-navigation" aria-label="Chat navigation"><button type="button" aria-haspopup="dialog" aria-expanded={aiHistory.historyOpen} aria-controls={aiHistory.historyId} onClick={aiHistory.openHistory}><History size={15} aria-hidden="true"/>History</button><button type="button" onClick={aiHistory.newChat}><SquarePen size={15} aria-hidden="true"/>New chat</button></nav>}
      <div className="task-search-chat-title">{!standalone&&<Sparkles size={17} aria-hidden="true"/>}<strong>{standalone?aiHistory?.title??"AI search":intent==="new"?"New chat":"Search chat"}</strong>{standalone&&scopeLabel&&<span className="ai-search-context">{scopeLabel}</span>}</div>
      <div className="task-search-chat-actions">
        {!standalone&&<button type="button" className="task-search-new-chat" onClick={()=>chooseIntent("new")}><SquarePen size={15} aria-hidden="true"/>New chat</button>}
        {undo&&undo.scope===(undo.kind==="view"?filterScope:scope)&&(undo.kind==="search"||undo.target===viewKey)&&<button type="button" disabled={busy} onClick={()=>void undoChange()}>Undo last change</button>}
      </div>
      {!standalone&&searchModes}
      {!standalone&&<button type="button" className="task-search-chat-toggle" aria-label={open?"Collapse chat":"Expand chat"} aria-expanded={open} aria-controls={transcriptId} onClick={()=>{setOpen(!open);followLatest.current=true;}}>{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</button>}
    </header>
    <div className="task-assistant-mode" role="group" aria-label="Assistant mode">
      <button type="button" aria-pressed={assistantMode==="discuss"} disabled={busy||!discussionAvailable} title={discussionAvailable?"Explore ideas and prepare a search before running it":"Discuss requires the updated search API"} onClick={()=>setAssistantMode("discuss")}>Discuss</button>
      <button type="button" aria-pressed={assistantMode==="search"} disabled={busy} onClick={()=>setAssistantMode("search")}>Search directly</button>
      <span>{assistantMode==="discuss"?"Explore and plan · run when ready":"Requests update your results"}</span>{!discussionAvailable&&<span>Discuss is unavailable on the connected API.</span>}
      {traceInspector&&lastTrace&&<a href={`/admin/runs/assistant/${encodeURIComponent(lastTrace)}`} target="_blank" rel="noreferrer">Inspect last run</a>}
    </div>
    {agentAvailable&&assistantMode==="search"&&<div className="task-search-agent-controls">
      <span>{agentMode?"Search agent preview":"Classic Ask"}</span>
      <button type="button" disabled={busy} onClick={()=>{const next=!agentMode;setAgentMode(next);sessionStorage.setItem("queue-search-agent-mode",next?"1":"0");}}>{agentMode?"Use classic Ask":"Try search agent"}</button>
      {agentMode&&resumeAvailable&&!busy&&<button type="button" onClick={()=>void ask(true)}>Resume agent search</button>}
    </div>}
    <div ref={transcript} id={transcriptId} className="task-search-transcript" role="log" aria-label="Queue search conversation" aria-live="polite" hidden={!open}
      onScroll={event=>{const log=event.currentTarget;followLatest.current=log.scrollHeight-log.scrollTop-log.clientHeight<48;}}>
      {messages.length===0&&<div className="task-search-chat-empty"><div className="ai-search-mark"><Search size={22} aria-hidden="true"/></div><strong>{intent==="new"?"What would you like to find?":"What would you like to change?"}</strong><p>{assistantMode==="discuss"?"Explore an approach, inspect current results, or prepare a search to run when ready.":standalone?"Find listings, compare sellers, or explore product categories.":intent==="new"?"Start a fresh search within this brand and date range.":"Ask about the current search, or start a new chat."}</p>{standalone&&<div className="ai-search-prompts">{["Miniatures under $40 in Asia","Categories by total listing price","Takedown recommendations first"].map(prompt=><button type="button" key={prompt} onClick={()=>{setDraft(prompt);composer.current?.focus();}}>{prompt}<span aria-hidden="true">↗</span></button>)}</div>}</div>}
      {messages.map((message,index)=><div className={`task-search-message is-${message.role}`} key={index}><strong>{message.role==="user"?"You":"Search assistant"}</strong><p>{message.text}</p>{message.plan&&<div className="task-search-plan"><strong>Proposed search</strong><p>{message.plan.summary}</p>{message.plan.details&&<details><summary>Query details</summary><pre>{message.plan.details}</pre></details>}<button type="button" disabled={busy||message.plan.contextKey!==planContext||message.plan.submitted||executedPlans.includes(message.plan.id)} onClick={()=>void runPlan(message.plan!)}>{message.plan.submitted||executedPlans.includes(message.plan.id)?"Plan submitted":"Run this search"}</button>{message.plan.contextKey!==planContext&&<small>The search context changed. Discuss it again to prepare an updated plan.</small>}</div>}{message.categoryReport&&(onShowCategoryReport?<button type="button" className="task-category-show-button" disabled={busy||(message.categoryReport.search_id??null)!==(searchId??null)} onClick={()=>{onShowCategoryReport(message.categoryReport!);if(!standalone)setOpen(false);}}>Show category breakdown</button>:<CategoryRankingResult report={message.categoryReport}/>)}</div>)}
      {choices.length>0&&<div className="task-search-clarification">{choices.map(choice=><button type="button" key={choice.label} disabled={busy} onClick={()=>void choice.apply()}>{choice.label}</button>)}</div>}
      {question&&<div className="task-search-clarification" role="group" aria-label="Clarification answers">
        {question.options.map((option,index)=><button key={option} type="button" disabled={busy} onClick={()=>{
          followLatest.current=true;
          if(option==="Keep the current search"){setQuestion(null);setDraft("");setIntent("continue");setMessages(previous=>[...previous,{role:"user",text:option},{role:"assistant",text:"Kept the current search."}]);composer.current?.focus();return;}
          const field=question.conflictField;
          const resolution=field&&option===`Replace the previous ${field==="price"?"price":"seller count"} range`?field:undefined;
          void ask(false,question.literalMessage??option,question.literalMessage?(index===0?"keep":"remove"):undefined,resolution);
        }}>{option}</button>)}
      </div>}
      {busy&&<div className="task-search-thinking" role="status"><span aria-hidden="true"/>{assistantMode==="search"&&agentAvailable&&agentMode?agentProgress||"Starting search agent…":activity||"Thinking…"}</div>}
    </div>
    <div className="task-search-composer">
      <textarea ref={composer} aria-label="Ask about listings" placeholder={assistantMode==="discuss"?"Explore an idea or plan a search…":question?"Reply to the assistant…":replying?"Reply to refine this search…":"Describe what you want to find…"} value={draft} maxLength={2000} rows={2}
        onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{
          if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();followLatest.current=true;void ask();}
        }}/>
      <div className="task-search-composer-footer">
        <span>{standalone?"Enter to send · Shift + Enter for a new line":intent==="new"?(replying?"Reply · continues this chat":"Fresh search · keeps brand and dates"):"Reply · keeps current filters"}</span>
        {busy?<button className="task-ask-send" type="button" aria-label="Cancel assistant request" onClick={()=>{
          if(request.current)reportWorkflow(request.current.signal,"cancelled");
          request.current?.abort();setBusy(false);
          if(agentAvailable&&agentMode)onAgentSearching(false);
          if(currentAgent.current){void cancelListingAgent(currentAgent.current.id).catch(()=>{});currentAgent.current=null;}
          sessionStorage.removeItem(agentStorageKey);setResumeAvailable(false);say("Request cancelled. Your filters were kept.");
        }}><X size={15} aria-hidden="true"/>Stop</button>:<button className="task-ask-send" type="button" aria-label={replying?"Reply":"Send message"} disabled={!draft.trim()||!available||(assistantMode==="discuss"&&!discussionAvailable)} onClick={()=>{followLatest.current=true;void ask();}}><ArrowUp size={15} aria-hidden="true"/>{replying?"Reply":"Send"}</button>}
      </div>
    </div>
  </section>;
}
