import {afterEach,expect,test} from "bun:test";
import {taskSellerValue,taskSellerValueListings} from "../src/api/sellerValue";
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const query={ip_id:"brand",status:"pending" as const,sort:"newest" as const,group_sort:"total_price" as const,search_id:"owned"};
const response={policy_version:"task-seller-value-v1",search_id:"owned",state:"completed",offset:0,ranking_limit:null,as_of:"2026-10-22T09:00:00Z",updating:false,partial:false,total_groups:2,next_offset:null,groups:[{seller_key:"first",seller_name:"First",article_count:3,priced_article_count:2,total_price_usd:"30.30"},{seller_key:"unknown",seller_name:"Unknown",article_count:1,priced_article_count:0,total_price_usd:null}]};
test("seller value responses confirm membership, basis, order and price coverage",async()=>{
 globalThis.fetch=(async()=>Response.json(response)) as typeof fetch;
 expect((await taskSellerValue(query)).groups[0]).toMatchObject({total_price_usd:30.3,priced_article_count:2,exposure_usd:null});
 for(const changed of [{policy_version:"old"},{search_id:"foreign"},{groups:[...response.groups].reverse()},{groups:[{...response.groups[0],total_price_usd:null}]},{groups:[response.groups[0],response.groups[0]]},{partial:true}]){
   globalThis.fetch=(async()=>Response.json({...response,...changed})) as typeof fetch;
   await expect(taskSellerValue(query)).rejects.toThrow();
 }
 await expect(taskSellerValue({...query,search_id:undefined})).rejects.toThrow();
});
test("seller value drill-down validates the echoed seller and every returned row",async()=>{
 const base={policy_version:"task-seller-value-v1",search_id:"owned",state:"completed",offset:0,sort:"newest",seller_key:"first",partial:false,next_offset:null,rows:[{task_id:"t",result_id:"r",seller_key:"first"}]};
 globalThis.fetch=(async()=>Response.json(base)) as typeof fetch;expect((await taskSellerValueListings({...query,seller_key:"first"})).rows).toHaveLength(1);
 globalThis.fetch=(async()=>Response.json({...base,rows:[{task_id:"t",result_id:"r",seller_key:"other"}]})) as typeof fetch;
 await expect(taskSellerValueListings({...query,seller_key:"first"})).rejects.toThrow();
});
