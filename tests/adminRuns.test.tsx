import {afterEach,expect,test} from 'bun:test';
import {Window} from 'happy-dom';
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import AdminRuns from '../src/pages/AdminRuns';
const originalFetch=globalThis.fetch;let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=originalFetch;});
const id='10000000-0000-4000-8000-000000000001';
const run={id,source:'assistant',workflow_id:'chat.discussion',workflow_version:'1',code_version:null,parent_run_id:null,title:'Prioritize recommendation evidence',status:'waiting',created_at:'2026-10-23T07:00:00Z',updated_at:'2026-10-23T07:00:02Z',completed_at:null};
async function setup(options:{unavailable?:boolean;selected?:boolean;invalid?:boolean}={}){
  const window=new Window({url:'http://localhost:5173/admin/runs'});Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,Element:window.Element,localStorage:window.localStorage,sessionStorage:window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  const calls:Array<{path:string;method:string}>=[];
  globalThis.fetch=(async(input,init)=>{
    const url=new URL(String(input),'http://localhost:5173');calls.push({path:url.pathname+url.search,method:init?.method??'GET'});
    if(options.unavailable)return Response.json({error:'Not found'},{status:404});
    if(url.pathname.endsWith('/definitions'))return Response.json({version:1,definitions:[{id:'script.command',version:'1',name:'Observed script',description:'A command with recorded steps.',coverage:'Only scripts launched through the observed runner.',source_paths:['api/scripts/run-observed.ts'],steps:[{key:'command',name:'Execute command',kind:'script'},{key:'finish',name:'Record exit status',kind:'event'}]}]});
    if(url.pathname.includes('/assistant/'))return Response.json({version:1,run:{...run,input:{message:run.title},output:{answer:'Proposal ready'},children:[],truncated:false,notes:['Search execution waits for an explicit user action.'],steps:[{id:'context',parent_step_id:null,name:'Supplied instructions',kind:'model',status:'completed',attempt:1,source_path:'api/src/services/listing_discussion.ts',code_version:null,reporter:'server',created_at:run.created_at,completed_at:run.updated_at,input:{instructions:'Inspect saved evidence before making a claim.'},output:{proposal:true}},{id:'workspace',parent_step_id:'context',name:'Apply workspace results',kind:'event',status:'pending',attempt:1,source_path:null,code_version:null,reporter:'client',created_at:run.updated_at,completed_at:null,input:null,output:null}]}});
    // Hono's mounted collection handler is strict: /api/admin/runs/ is not /api/admin/runs.
    if(url.pathname!=='/api/admin/runs')return Response.json({error:'Not found'},{status:404});
    return Response.json({version:1,runs:options.invalid?[{...run,source:'shell'}]:[run],next_cursor:url.searchParams.has('cursor')?null:'older-page'});
  }) as typeof fetch;
  const container=document.createElement('div');document.body.replaceChildren(container);root=createRoot(container);
  await act(async()=>root!.render(<MemoryRouter initialEntries={[options.selected?`/admin/runs/assistant/${id}`:'/admin/runs']}><Routes><Route path='/admin/runs' element={<AdminRuns/>}/><Route path='/admin/runs/:source/:id' element={<AdminRuns/>}/></Routes></MemoryRouter>));
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,250));});
  const click=async(name:string)=>{const button=[...container.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent?.trim()===name)!;await act(async()=>button.click());};
  return {container,calls,click,settle:()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,250));})};
}
test('Runs shows recorded steps, instructions and browser reports without offering execution controls',async()=>{
  const {container,calls}=await setup({selected:true});expect(container.textContent).toContain('Supplied instructions');expect(container.textContent).toContain('Inspect saved evidence before making a claim.');expect(container.textContent).toContain('reported by browser');expect(container.textContent).toContain('Not recorded');expect(calls.every(call=>call.method==='GET')).toBe(true);expect(container.querySelector('[aria-label="Selected run"]')).not.toBeNull();
});
test('workflow definitions explain script coverage and the intended sequence',async()=>{
  const ui=await setup();await ui.click('Workflow definitions');expect(ui.container.textContent).toContain('Only scripts launched through the observed runner.');expect(ui.container.textContent).toContain('Execute command');expect(ui.container.textContent).toContain('Record exit status');expect(ui.calls.some(call=>call.path.endsWith('/definitions'))).toBe(true);
});
test('run collection uses the canonical mounted API path',async()=>{
  const ui=await setup();expect(ui.calls.some(call=>call.path==='/api/admin/runs?q=')).toBe(true);expect(ui.container.textContent).toContain(run.title);expect(ui.container.textContent).not.toContain('Runs requires the updated API.');
});
test('an older API has an explicit availability message rather than fabricated activity',async()=>{
  const ui=await setup({unavailable:true});expect(ui.container.textContent).toContain('Runs requires the updated API.');expect(ui.container.textContent).not.toContain(run.title);
});
test('older-page navigation sends the cursor and keeps the inspector read only',async()=>{
  const ui=await setup();await ui.click('Older runs');await ui.settle();expect(ui.calls.some(call=>call.path.includes('cursor=older-page'))).toBe(true);expect(ui.container.textContent).toContain('Newest runs');expect(ui.calls.every(call=>call.method==='GET')).toBe(true);
});
