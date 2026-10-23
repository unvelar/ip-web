import {Fragment,useEffect,useState,type ReactNode} from 'react';
import {taskGroups,taskGroupListings,type GroupPage,type GroupListings} from '../../../api/taskGroups';
import type {TaskSummary} from '../../../api/taskQueue';
import type {Grouping} from '../../../lib/taskGrouping';
import {ChevronRight} from 'lucide-react';
const money=(value:string|null)=>value===null?'Unavailable':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
export function GroupedTaskQueue({searchId,grouping,sort,revision,renderRow}:{searchId:string;grouping:Grouping;sort:'priority'|'newest';revision:string;renderRow:(row:TaskSummary)=>ReactNode}){
 return <GroupLevel key={JSON.stringify([searchId,grouping,sort])} searchId={searchId} grouping={grouping} sort={sort} revision={revision} renderRow={renderRow} path={[]}/>;
}
function GroupLevel({searchId,grouping,sort,revision,renderRow,path}:{searchId:string;grouping:Grouping;sort:'priority'|'newest';revision:string;renderRow:(row:TaskSummary)=>ReactNode;path:Array<string|null>}){
 const [offset,setOffset]=useState(0),[page,setPage]=useState<GroupPage|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [expanded,setExpanded]=useState<Set<string>>(new Set());
 const scope=JSON.stringify([searchId,grouping,path]);
 useEffect(()=>{const controller=new AbortController();setError('');setPage(null);
  void taskGroups(searchId,grouping,path,offset,controller.signal).then(value=>{if(!controller.signal.aborted)setPage(value);}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not load groups.');});
  return()=>controller.abort();
 // scope contains all membership and grouping inputs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,offset,revision,retry]);
 if(error)return <p role="alert" className="task-queue-notice">{error} <button onClick={()=>setRetry(v=>v+1)}>Retry</button></p>;
 if(!page)return <p role="status" className="task-queue-notice">Loading groups…</p>;
 if(page.partial)return <p role="status" className="task-queue-notice">Groups will appear when the complete search is ready.</p>;
 const dimension=grouping.dimensions[path.length];
 return <div className="monitoring-results-queue">
  <div className="monitoring-results-summary">{(path.length?grouping.subgroup_limit:grouping.group_limit)?`Top ${Math.min((path.length?grouping.subgroup_limit:grouping.group_limit)!,page.total_groups??0)} of `:''}{page.total_groups} {dimension} groups · Totals cover all matching listings</div>
  <table className="monitoring-result-list" aria-label={`Listings grouped by ${dimension}`}>
   <thead><tr><th colSpan={5}><div className="monitoring-seller-columns"><span>{dimension==='marketplace'?'Marketplace':dimension} / listings</span><span>{grouping.metric==='articles'?'Listings':grouping.metric==='total_price'?'Total listing price (USD)':'Exposure (USD)'}</span></div></th></tr></thead>
   {page.groups.map(group=>{const key=JSON.stringify(group.key),open=expanded.has(key),nextPath=[...path,group.key];return <Fragment key={key}>
    <tbody><tr className="monitoring-group-heading"><th colSpan={5} scope="rowgroup"><div className="monitoring-group-heading-content">
     <button className="monitoring-group-toggle" type="button" aria-label={`${open?'Collapse':'Expand'} ${group.label}`} aria-expanded={open} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next;})}><ChevronRight size={14}/>{group.label}</button>
     <span>{group.article_count.toLocaleString()} listings</span><span className="ml-auto">{grouping.metric==='articles'?group.article_count.toLocaleString():money(grouping.metric==='total_price'?group.total_price_usd:group.exposure_usd)}</span>
    </div></th></tr></tbody>
    {open&&(nextPath.length===grouping.dimensions.length?<GroupItems key={`${key}:${revision}`} searchId={searchId} grouping={grouping} path={nextPath} sort={sort} renderRow={renderRow}/>:<tbody><tr><td colSpan={5}><GroupLevel searchId={searchId} grouping={grouping} path={nextPath} sort={sort} revision={revision} renderRow={renderRow}/></td></tr></tbody>)}
   </Fragment>;})}
  </table>
  {!page.groups.length&&<p className="task-queue-notice">No matching groups.</p>}
  <div className="task-queue-pagination"><button disabled={!offset} onClick={()=>{setOffset(Math.max(0,offset-50));setExpanded(new Set());}}>Previous groups</button><span>Page {Math.floor(offset/50)+1}</span><button disabled={page.next_offset===null} onClick={()=>{setOffset(page.next_offset!);setExpanded(new Set());}}>Next groups</button></div>
 </div>;
}
function GroupItems({searchId,grouping,path,sort,renderRow}:{searchId:string;grouping:Grouping;path:Array<string|null>;sort:'priority'|'newest';renderRow:(row:TaskSummary)=>ReactNode}){
 const [page,setPage]=useState<GroupListings|null>(null),[offset,setOffset]=useState(0),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const scope=JSON.stringify([searchId,grouping,path,sort]);
 useEffect(()=>{const controller=new AbortController();setError('');
  void taskGroupListings(searchId,grouping,path,offset,sort,controller.signal).then(value=>{if(!controller.signal.aborted)setPage(previous=>({...value,rows:offset?[...(previous?.rows??[]),...value.rows]:value.rows}));}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Could not load listings.');});
  return()=>controller.abort();
 // scope contains all request inputs.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[scope,offset,retry]);
 return <tbody>{page?.rows.map(renderRow)}<tr><td colSpan={5} className="task-queue-notice">{error?<span role="alert">{error} <button onClick={()=>setRetry(v=>v+1)}>Retry</button></span>:page?<>Showing {page.rows.length} of {page.total_listings} matching items. Totals include all matches. {page.next_offset!==null&&<button onClick={()=>setOffset(page.next_offset!)}>Show more items</button>}</>:<span role="status">Loading listings…</span>}</td></tr></tbody>;
}
