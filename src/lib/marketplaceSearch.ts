import {isRecord,requireResponse} from '../api/validation';
export const marketplacePolicy='task-marketplace-selection-v1';
export type WebsiteOption={value:string;label:string};
export function resolveMarketplace(query:string,raw:unknown):{kind:'resolved';website:string}|{kind:'ambiguous';options:WebsiteOption[]}|{kind:'not_found'}{
 requireResponse(isRecord(raw)&&Array.isArray(raw.options),'marketplace options');
 const options:WebsiteOption[]=[];const seen=new Set<string>();
 for(const value of raw.options){
  requireResponse(isRecord(value)&&typeof value.value==='string'&&typeof value.label==='string'&&value.label.length<=200&&/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value.value),'marketplace option');
  const website=value.value.toLowerCase();if(!seen.has(website)){seen.add(website);options.push({value:website,label:value.label});}
 }
 const normalized=query.trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'');
 const matches=options.filter(option=>option.value.startsWith(normalized)||option.label.toLowerCase().startsWith(normalized));
 const exact=matches.filter(option=>option.value===normalized);
 if(exact.length===1)return {kind:'resolved',website:exact[0].value};
 if(matches.length===1)return {kind:'resolved',website:matches[0].value};
 return matches.length?{kind:'ambiguous',options:matches}:{kind:'not_found'};
}
export function applyMarketplace(values:Record<string,string>,website:string|null):Record<string,string>{
 return {...values,website:website??'',...(values.source?.startsWith('domain:')?{source:''}:{})};
}
export const marketplaceLookupQuery=(query:string)=>query.trim().replace(/^https?:\/\//i,'').replace(/\/$/,'');
