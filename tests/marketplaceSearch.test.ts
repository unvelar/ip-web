import {expect,test} from 'bun:test';
import {resolveMarketplace,applyMarketplace} from '../src/lib/marketplaceSearch';
import {mergeQueueView,queueViewFromParams,queueViewParams,parseQueueViewChange,queueViewSummary} from '../src/lib/queueView';
import {marketplaceGrouping} from '../src/lib/taskGrouping';
import {groupingSearchValues,queueSearchParams} from '../src/lib/taskSearchAssistant';
test('marketplace names resolve from authenticated options rather than a hardcoded site table',()=>{
 for(const site of ['goofish.com','unfamiliar-market.test'])expect(resolveMarketplace(site.split('.')[0],{options:[{value:site,label:site}]})).toEqual({kind:'resolved',website:site});
 const options=[{value:'ebay.fr',label:'eBay France'},{value:'ebay.de',label:'eBay Germany'}];
 expect(resolveMarketplace('ebay',{options}).kind).toBe('ambiguous');expect(resolveMarketplace('ebay.fr',{options})).toEqual({kind:'resolved',website:'ebay.fr'});
 expect(resolveMarketplace('unrelated',{options})).toEqual({kind:'not_found'});
 expect(resolveMarketplace('absent',{options:[]})).toEqual({kind:'not_found'});
 for(const value of ['https://host.test','host.test/path','javascript:alert(1)','bad host.test'])expect(()=>resolveMarketplace('host',{options:[{value,label:'Host'}]})).toThrow();
});
test('website filtering replaces conflicting website sources and preserves independent discovery, dates, product and count filters',()=>{
 const values={website:'old.test',source:'search:google',from:'2026-10-01',to:'2026-10-23',semantic:'{"categories":["models"]}',seller_listing_count:'{"gte":3}'};
 expect(applyMarketplace(values,'new.test')).toEqual({...values,website:'new.test'});
 expect(applyMarketplace({...values,source:'domain:old.test'},'new.test').source).toBe('');
 expect(applyMarketplace(values,null)).toEqual({...values,website:''});
});
test('group view round trips independently of marketplace predicates and retains saved search membership',()=>{
 const values={website:'goofish.com',from:'2026-10-01',to:'2026-10-23',q:''};
 const params=new URLSearchParams({task_search:'owned',queue_filters:JSON.stringify(values)});
 const view=mergeQueueView(queueViewFromParams(params),parseQueueViewChange({group_by:'none',grouping:marketplaceGrouping()}));
 const next=queueViewParams(params,view);expect(queueViewFromParams(next).grouping).toEqual(marketplaceGrouping());expect(next.get('task_search')).toBe('owned');expect(next.get('queue_filters')).toBe(params.get('queue_filters'));
 expect(groupingSearchValues(next)).toEqual(values);
 expect(queueViewSummary({group_by:'none',grouping:marketplaceGrouping()})).not.toContain('individual items');
 expect(queueSearchParams(next,{values,status:'pending',ranking:null,showListings:true},'owned').has('grouping')).toBe(false);
});

test('manual grouping preserves product-detail predicates and native selectors',()=>{
 const semantic=JSON.stringify({categories:['models']});
 const values=groupingSearchValues(new URLSearchParams({semantic,platform:'market.test',source:'search:google',seller:'Shop',from:'2026-10-01',to:'2026-10-23',selector:'suggestion',value:'takedown'}));
 expect(values).toMatchObject({semantic,website:'market.test',source:'search:google',seller_name:'Shop',candidate_outcome:'takedown',from:'2026-10-01',to:'2026-10-23'});
});

test('AI workflow groupings round trip with readable labels and cannot invent reopened history',()=>{
 for(const dimension of ['assignee','evidence','suggested_action','dismissal_reason']){
  const change=parseQueueViewChange({group_by:'none',grouping:{dimensions:[dimension,'marketplace'],metric:'articles'}});
  const view=mergeQueueView({sort:'priority',group_by:'none'},change);
  expect(queueViewFromParams(queueViewParams(new URLSearchParams(),view))).toEqual(view);
  expect(queueViewSummary(change)).not.toContain('_');
 }
 expect(()=>parseQueueViewChange({group_by:'none',grouping:{dimensions:['reopened'],metric:'articles'}})).toThrow();
});
