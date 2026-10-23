import {afterEach,expect,test} from "bun:test";
import {Window} from "happy-dom";
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {AssistantTracePanel} from "../src/features/assistantTrace/AssistantTracePanel";
let root:Root|undefined;const originalFetch=globalThis.fetch;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=originalFetch;});
async function mount(fail=false){
  const window=new Window({url:"http://localhost:5173/admin/llm-activity"});Object.assign(globalThis,{window,document:window.document,navigator:window.navigator,HTMLElement:window.HTMLElement,Element:window.Element,localStorage:window.localStorage,sessionStorage:window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true});
  const calls:string[]=[];const trace={id:"60000000-0000-4000-8000-000000000001",kind:"discussion",status:"completed",input:{message:"Help prioritize"},events:[],output:null,created_at:"2026-10-23T07:00:00Z",completed_at:"2026-10-23T07:00:02Z"};
  globalThis.fetch=(async(input,init)=>{calls.push(String(input));expect(init?.method??"GET").toBe("GET");if(fail)return Response.json({error:"Not found"},{status:404});return Response.json(String(input).endsWith("/traces")?{traces:[trace]}:{...trace,events:[{at:trace.created_at,type:"instructions",data:{instructions:"Read saved results before preparing a query."}},{at:trace.completed_at,type:"translation_output",data:{query:{name:"set_queue_view",arguments:{sort:"priority"}}}}],output:{answer:"Review these recommendations",proposal:{query:{name:"set_queue_view"}}}});}) as typeof fetch;
  const container=document.createElement("div");document.body.replaceChildren(container);root=createRoot(container);await act(async()=>root!.render(<AssistantTracePanel/>));return {container,calls};
}
test("admin inspector reads the run, supplied instructions and structured translation without issuing actions",async()=>{
  const {container,calls}=await mount();const row=container.querySelector<HTMLButtonElement>('.assistant-traces-list button')!;await act(async()=>row.click());
  expect(container.textContent).toContain("Read saved results before preparing a query.");expect(container.textContent).toContain("set_queue_view");
  expect(calls).toHaveLength(2);expect(calls[1]).toEndWith("/traces/60000000-0000-4000-8000-000000000001");
});
test("an older API gets an explicit inspector availability message",async()=>{
  const {container}=await mount(true);expect(container.querySelector('[role="alert"]')?.textContent).toBe("Search assistant traces require the updated API.");
});
