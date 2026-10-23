import {isRecord,requireResponse} from '../api/validation';
export const groupingPolicy='task-grouping-v1';
export const dimensions=['marketplace','country','seller','product','category','assignee','evidence','suggested_action','dismissal_reason'] as const;
export const groupDimensionLabels={marketplace:'Marketplace',country:'Listing country',seller:'Seller',product:'Product',category:'Product category',assignee:'Assignee',evidence:'Evidence',suggested_action:'Suggested action',dismissal_reason:'Dismissal reason'};
export const groupingLabel=(dimensions:readonly GroupDimension[])=>dimensions.map(d=>groupDimensionLabels[d]).join(' then ');
export type GroupDimension=typeof dimensions[number];
export type Grouping={dimensions:GroupDimension[];metric:'articles'|'total_price'|'exposure';group_limit:number|null;subgroup_limit:number|null;items_per_group:number};
export function parseGrouping(raw:unknown):Grouping{
 requireResponse(isRecord(raw)&&Object.keys(raw).every(key=>['dimensions','metric','group_limit','subgroup_limit','items_per_group'].includes(key)),'grouping');
 requireResponse(Array.isArray(raw.dimensions)&&raw.dimensions.length>=1&&raw.dimensions.length<=2&&new Set(raw.dimensions).size===raw.dimensions.length&&raw.dimensions.every(v=>dimensions.includes(v as GroupDimension)),'group dimensions');
 requireResponse(['articles','total_price','exposure'].includes(String(raw.metric)),'group metric');
 for(const key of ['group_limit','subgroup_limit'])requireResponse(raw[key]===undefined||raw[key]===null||Number.isInteger(raw[key])&&Number(raw[key])>=1&&Number(raw[key])<=100,'group limit');
 requireResponse(raw.items_per_group===undefined||Number.isInteger(raw.items_per_group)&&Number(raw.items_per_group)>=1&&Number(raw.items_per_group)<=50,'group preview');
 return {dimensions:raw.dimensions as GroupDimension[],metric:raw.metric as Grouping['metric'],group_limit:raw.group_limit as number|null??null,subgroup_limit:raw.subgroup_limit as number|null??null,items_per_group:raw.items_per_group as number??3};
}
export const marketplaceGrouping=():Grouping=>({dimensions:['marketplace'],metric:'articles',group_limit:null,subgroup_limit:null,items_per_group:3});
