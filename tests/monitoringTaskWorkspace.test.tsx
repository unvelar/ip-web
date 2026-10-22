import {afterEach,expect,test} from "bun:test";
import {Window} from "happy-dom";
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {MemoryRouter,useLocation} from "react-router-dom";
import {AuthProvider} from "../src/context/AuthContext";
import {ActiveIpProvider} from "../src/context/ActiveIpContext";
import {MonitoringTaskWorkspace} from "../src/components/MonitoringTaskWorkspace";
import {aiHistoryKey,aiChatRecordKey,readAiHistory} from "../src/lib/aiSearchHistory";
const fetchBefore=globalThis.fetch;let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=fetchBefore;});
function Location(){const l=useLocation();return <output data-location>{l.search}</output>;}
async function setup(execute=false){
 const w=new Window({url:'http://localhost:5173'});Object.assign(globalThis,{window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,Element:w.Element,Node:w.Node,localStorage:w.localStorage,sessionStorage:w.sessionStorage,ResizeObserver:w.ResizeObserver,requestAnimationFrame:(f:()=>void)=>{f();return 1;},IS_REACT_ACT_ENVIRONMENT:true});w.HTMLElement.prototype.scrollIntoView=()=>{};
 const host=document.createElement('div');document.body.replaceChildren(host);const requests:{path:string;method:string}[]=[];
 globalThis.fetch=(async(input,init)=>{const u=new URL(String(input),w.location.origin);requests.push({path:u.pathname,method:init?.method??'GET'});
  if(u.pathname.endsWith('/translation-capability'))return Response.json({version:1,enabled:true,country_labels:{CN:'China'},conversation_policy_version:'listing-conversation-v1'});
  if(u.pathname.endsWith('/tasks/capability'))return Response.json({active:true,ready:true,listing_search_policy_version:'task-listing-search-v1'});
  if(u.pathname.endsWith('/queue'))return Response.json({rows:[],counts:{pending:1,review:0,takedown_pending:0,takedown_sent:0,enforced:0,preparing:0,dismissed:0},next_cursor:null});
  if(u.pathname.endsWith('/searches/saved'))return Response.json({id:'saved',state:'completed',scanned:1,matched:0,rows:[],next:null});
  if(u.pathname.endsWith('/searches')&&init?.method==='POST')return Response.json({id:'created-search',state:'completed',scanned:1,matched:0,rows:[],next:null});
  if(u.pathname.endsWith('/searches/created-search'))return Response.json({id:'created-search',state:'completed',scanned:1,matched:0,rows:[],next:null});
  if(u.pathname.endsWith('/translate')&&execute)return Response.json({version:1,jobs_started:0,filters:{...JSON.parse(String(init?.body)).filters,countries:['CN'],price:{currency:'USD',lt:'40'}},query:{name:'search_listings',arguments:{}}});
  if(u.pathname.endsWith('/translate'))return Response.json({version:1,jobs_started:0,filters:JSON.parse(String(init?.body)).filters,query:{name:'request_clarification',arguments:{reason:'ambiguous_request',question:'Which category should I use?',options:['Scale Models','Action Figures']}}});
  return Response.json({members:[],comments:[],options:[],ips:[]});
 }) as typeof fetch;
 const initial='/monitoring/tasks?ip_id=10000000-0000-4000-8000-000000000001&task_search=saved&status=pending&queue_filters='+encodeURIComponent(JSON.stringify({q:'existing',from:'2026-10-01',to:'2026-10-23'}));
 const render=(url:string)=>root!.render(<MemoryRouter initialEntries={[url]}><AuthProvider><ActiveIpProvider><MonitoringTaskWorkspace ipId='10000000-0000-4000-8000-000000000001' owner='owner' tenant='tenant' onUnavailable={()=>{}}/><Location/></ActiveIpProvider></AuthProvider></MemoryRouter>);
 root=createRoot(host);await act(async()=>render(initial));
 const click=async(name:string)=>{const b=[...host.querySelectorAll<HTMLElement>('button,summary')].find(b=>b.getAttribute('aria-label')===name||b.textContent?.trim()===name);expect(b).toBeDefined();await act(async()=>b!.click());};
 const fill=async(value:string)=>{const input=host.querySelector('textarea')!;await act(async()=>{Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));});};
 const location=()=>host.querySelector('[data-location]')!.textContent!;
 return{host,requests,click,fill,initial,location,externalStorage:async(key:string,value:string|null)=>{await act(async()=>{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);w.dispatchEvent(new w.StorageEvent('storage',{key,newValue:value}));});},rename:async(value:string)=>{const input=host.querySelector('[aria-label="Chat name"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new w.Event('input',{bubbles:true}));});},remount:async()=>{const url='/monitoring/tasks'+location();await act(async()=>root!.unmount());root=createRoot(host);await act(async()=>render(url));}};
}
test('Listings restores the manual search; AI chats preserve independent history, drafts and clarifications across reload',async()=>{
 const ui=await setup();expect(ui.host.querySelector('input[aria-label="Search listings or sellers"]')?.getAttribute('value')).toBe('existing');expect(ui.host.querySelector('.task-search-chat')).toBeNull();expect(ui.requests.some(r=>r.path.endsWith('/translation-capability'))).toBe(false);
 await ui.click('AI searchNew');expect(ui.host.querySelector('textarea')).not.toBeNull();expect(ui.host.querySelector('.task-search-modes')).toBeNull();expect(ui.host.querySelector('.task-search-filter-row')?.hasAttribute('hidden')).toBe(true);expect(ui.host.textContent).toContain('A place for your findings');
 await ui.fill('First question');await ui.click('Send message');expect(ui.host.textContent).toContain('Which category should I use?');await ui.fill('Follow-up draft');
 await ui.click('New chat');expect(ui.host.querySelector('textarea')?.value).toBe('');await ui.fill('Second question');await ui.click('Send message');
 await ui.click('History');await ui.click('First question');expect(ui.host.querySelector('textarea')?.value).toBe('Follow-up draft');expect(ui.host.querySelector('[aria-label="Clarification answers"]')).not.toBeNull();
 localStorage.setItem(aiHistoryKey('owner','tenant','10000000-0000-4000-8000-000000000001')+':listings','ip_id=foreign&task_search=foreign');
 await ui.remount();expect(ui.host.querySelector('textarea')?.value).toBe('Follow-up draft');await ui.click('History');expect(ui.host.textContent).toContain('First question');expect(ui.host.textContent).toContain('Second question');await ui.click('Close chat history');
 await ui.click('Listings');expect(new URLSearchParams(ui.location()).get('task_search')).toBe('saved');expect(ui.host.querySelector('input[aria-label="Search listings or sellers"]')?.getAttribute('value')).toBe('existing');expect(ui.host.querySelector('.task-search-chat')).toBeNull();
 await ui.click('AI searchNew');expect(ui.host.querySelector('textarea')?.value).toBe('Follow-up draft');
 await ui.click('History');await ui.click('Actions for First question');await ui.click('Rename');await ui.rename('Asia review');await ui.click('Save chat name');expect(ui.host.querySelector('.ai-history-row.is-active')?.textContent).toContain('Asia review');
 await ui.click('Actions for Asia review');await ui.click('Remove');expect(ui.host.querySelector('.ai-history-list')?.textContent).not.toContain('Asia review');await ui.click('Undo');await ui.click('Asia review');expect(ui.host.querySelector('textarea')?.value).toBe('Follow-up draft');
 expect(ui.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/searches'))).toHaveLength(0);
});
test('updates from another tab do not overwrite this chat or resurrect a removed active chat',async()=>{
 const ui=await setup();await ui.click('AI searchNew');await ui.fill('First question');await ui.click('Send message');
 const key=aiHistoryKey('owner','tenant','10000000-0000-4000-8000-000000000001');const current=readAiHistory(key)[0];
 const other={...current,id:'other-tab-chat',title:'Other tab conversation'};
 await ui.externalStorage(aiChatRecordKey(key,other.id),JSON.stringify(other));await ui.click('History');expect(ui.host.querySelector('.ai-history-list')?.textContent).toContain('Other tab conversation');await ui.click('Close chat history');
 await ui.fill('Local draft');expect(readAiHistory(key).map(chat=>chat.id).sort()).toEqual([current.id,other.id].sort());
 await ui.externalStorage(aiChatRecordKey(key,current.id),null);expect(ui.host.querySelector('textarea')?.value).toBe('');expect(readAiHistory(key).some(chat=>chat.id===current.id)).toBe(false);
 await ui.fill('A new draft');expect(readAiHistory(key).some(chat=>chat.id===current.id)).toBe(false);expect(readAiHistory(key).some(chat=>chat.id===other.id)).toBe(true);
});

test('restoring an executed AI chat restores its confirmed filters and saved membership without creating another search',async()=>{
 const ui=await setup(true);await ui.click('AI searchNew');await ui.fill('Listings in China under $40');await ui.click('Send message');
 expect(new URLSearchParams(ui.location()).get('task_search')).toBe('created-search');expect(ui.host.textContent).toContain('China');
 const creates=()=>ui.requests.filter(r=>r.method==='POST'&&r.path.endsWith('/searches')).length;expect(creates()).toBe(1);
 await ui.click('New chat');await ui.click('History');await ui.click('Listings in China under $40');expect(new URLSearchParams(ui.location()).get('task_search')).toBe('created-search');expect(ui.host.textContent).toContain('Listing locations: China');
 await ui.remount();expect(ui.host.textContent).toContain('Listing locations: China');expect(creates()).toBe(1);
 await ui.click('Listings');expect(new URLSearchParams(ui.location()).get('task_search')).toBe('saved');expect(creates()).toBe(1);
});

test('history and focused results preserve the current chat draft, filters and search without starting work',async()=>{
 const ui=await setup(true);await ui.click('AI searchNew');
 expect(ui.host.querySelector('dialog')).toBeNull();
 await ui.fill('Listings in China under $40');await ui.click('Send message');await ui.fill('Keep this follow-up draft');
 const before=ui.location();const posts=ui.requests.filter(r=>r.method==='POST').length;
 const composer=ui.host.querySelector('textarea');
 await ui.click('Focus results');expect(ui.host.querySelector('.task-ai-conversation')?.hasAttribute('hidden')).toBe(true);
 expect(ui.host.querySelector('.task-ai-results')?.hasAttribute('hidden')).toBe(false);
 await ui.click('Show chat');expect(ui.host.querySelector('textarea')).toBe(composer);expect(composer?.value).toBe('Keep this follow-up draft');
 const historyButton=[...ui.host.querySelectorAll('button')].find(b=>b.textContent==='History')!;historyButton.focus();
 await ui.click('History');expect(ui.host.querySelector('dialog')?.open).toBe(true);expect(document.activeElement?.getAttribute('aria-label')).toBe('Search chat history');
 await act(async()=>{ui.host.querySelector('dialog')!.dispatchEvent(new window.Event('cancel',{cancelable:true}));});
 expect(ui.host.querySelector('dialog')).toBeNull();expect(document.activeElement).toBe(historyButton);
 expect(ui.location()).toBe(before);expect(ui.requests.filter(r=>r.method==='POST')).toHaveLength(posts);
 expect(ui.host.querySelector('textarea')?.value).toBe('Keep this follow-up draft');
 expect(ui.host.querySelectorAll('.task-search-matches')).toHaveLength(1);
});
