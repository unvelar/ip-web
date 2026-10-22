import {afterEach,expect,test} from "bun:test";
import {Window} from "happy-dom";
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {CategoryResultsWorkspace} from "../src/components/CategoryResultsWorkspace";
import {categoryRankingPolicy,categoryListingsPolicy,type CategoryRanking} from "../src/lib/categoryRanking";
const fetchBefore=globalThis.fetch;
let root:Root|undefined;
afterEach(async()=>{if(root)await act(async()=>root?.unmount());root=undefined;globalThis.fetch=fetchBefore;});
const report:CategoryRanking={policy_version:categoryRankingPolicy,listing_policy_version:categoryListingsPolicy,search_id:"saved",state:"completed",metric:"total_price",currency:"USD",price_basis:"stored_listing_price",consistency:"saved_membership_current_categories",as_of:"2026-10-22T09:00:00Z",groups:[{category_key:"action",category_label:"Action Figures",article_count:51,priced_article_count:50,missing_price_count:1,total_price_usd:"100.30"},{category_key:null,category_label:"Uncategorized",article_count:1,priced_article_count:0,missing_price_count:1,total_price_usd:null}],total_categories:2,matching_listings:52,priced_listings:50,missing_price_listings:2};
async function setup(options:{legacy?:boolean;fail?:boolean;hold?:boolean;mismatch?:boolean;fresh?:boolean}={}){
 const w=new Window({url:"http://localhost:5173"});Object.assign(globalThis,{window:w,document:w.document,navigator:w.navigator,HTMLElement:w.HTMLElement,Element:w.Element,IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.replaceChildren(host);const requests:URL[]=[];let resets=0,closed=0,release:(()=>void)|undefined;
 globalThis.fetch=(async(input,init)=>{
  expect(init?.method??'GET').toBe('GET');const u=new URL(String(input),w.location.origin);requests.push(u);
  if(u.pathname.endsWith('/categories'))return Response.json({...report,...(options.legacy?{listing_policy_version:undefined}:{})});
  const offset=Number(u.searchParams.get('offset'));const result=()=>Response.json({policy_version:categoryListingsPolicy,search_id:options.mismatch?'foreign':'saved',state:'completed',category_key:u.searchParams.get('category_key'),sort:u.searchParams.get('sort'),offset,total_listings:51,rows:[{task_id:'task-'+offset,result_id:'result-'+offset,found_at:'2026-10-21T09:00:00Z',price_value_usd:10,listing_title:'Listing '+offset}],next_offset:offset===0?50:null});
  if(options.fail)return Response.json({error:'Temporarily unavailable'},{status:503});
  if(options.hold)return await new Promise<Response>(resolve=>{release=()=>resolve(result());});
  return result();
 }) as typeof fetch;
 root=createRoot(host);await act(async()=>root!.render(<CategoryResultsWorkspace initialReport={options.fresh?{...report,as_of:new Date().toISOString()}:report} onClose={()=>closed++} onSelectionReset={()=>resets++} renderRow={row=><tr key={row.task_id}><td>{row.listing_title}</td></tr>}/>));
 const click=async(name:string)=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent===name||b.getAttribute('aria-label')===name);expect(b).toBeDefined();await act(async()=>b!.click());};
 return{host,requests,click,resets:()=>resets,closed:()=>closed,release:async()=>act(async()=>release?.())};
}
test('category table drills and pages within the saved membership, supports Uncategorized, and restores totals',async()=>{
 const ui=await setup();expect(ui.host.querySelector('[aria-label="Product category ranking"]')).not.toBeNull();
 await ui.click('View listings in Action Figures');expect(ui.host.textContent).toContain('Listing 0');expect(ui.host.querySelector('[aria-label="Product category ranking"]')).toBeNull();
 expect(ui.requests.at(-1)?.searchParams.get('category_key')).toBe('action');expect(ui.requests.at(-1)?.searchParams.get('sort')).toBe('priority');
 await ui.click('Next');expect(ui.host.textContent).toContain('Listing 50');expect(ui.host.textContent).not.toContain('Listing 0');
 await ui.click('Previous');expect(ui.host.textContent).toContain('Listing 0');
 await ui.click('← Back to categories');expect(ui.host.querySelector('[aria-label="Category listings"]')).toBeNull();expect(ui.host.textContent).toContain('100.30');
 await ui.click('View listings in Uncategorized');expect(ui.requests.at(-1)?.searchParams.get('uncategorized')).toBe('true');expect(ui.requests.at(-1)?.searchParams.has('category_key')).toBe(false);
 await ui.click('Show all listings');expect(ui.closed()).toBe(1);expect(ui.resets()).toBeGreaterThan(4);
});
test('opening a newly calculated report does not immediately repeat the full category aggregate',async()=>{
 const ui=await setup({fresh:true});expect(ui.requests).toHaveLength(0);expect(ui.host.textContent).toContain('100.30');await ui.click('Refresh totals');expect(ui.requests).toHaveLength(1);
});
test('older APIs keep the category table usable without promising unsupported drill-down',async()=>{
 const ui=await setup({legacy:true});const b=ui.host.querySelector<HTMLButtonElement>('[aria-label="View listings in Action Figures"]')!;expect(b.disabled).toBe(true);expect(ui.host.textContent).toContain('Viewing listings by category is not available yet');
});
test('a failed category page never shows rows from the original queue or stale category',async()=>{
 const ui=await setup({fail:true});await ui.click('View listings in Action Figures');expect(ui.host.querySelector('[role="alert"]')?.textContent).toContain('Category listings could not be loaded');expect(ui.host.querySelector('tbody')?.textContent).toBe('');
 await ui.click('← Back to categories');expect(ui.host.querySelector('[aria-label="Product category ranking"]')).not.toBeNull();
});
test('late page responses cannot replace the restored category table',async()=>{
 const ui=await setup({hold:true});await ui.click('View listings in Action Figures');expect(ui.host.textContent).toContain('Loading category listings');await ui.click('← Back to categories');await ui.release();expect(ui.host.querySelector('[aria-label="Category listings"]')).toBeNull();expect(ui.host.textContent).not.toContain('Listing 0');
});
test('category pages for another search are rejected at the client boundary',async()=>{
 const ui=await setup({mismatch:true});await ui.click('View listings in Action Figures');expect(ui.host.querySelector('[role="alert"]')).not.toBeNull();expect(ui.host.querySelector('tbody')?.textContent).toBe('');
});
