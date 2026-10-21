import { useEffect, useState } from "react";
import { listingCapability } from "../api/listingSearch";
import { emptyListingFilters, parseListingFilters } from "../lib/listingSearch";

export function QueueConstraintEditor({kind,value,onApply,onCancel}: {
  kind:"locations"|"price"|"count"; value:string; onApply:(value:string)=>void; onCancel:()=>void;
}) {
  const initial = (()=>{try{return JSON.parse(value||"null");}catch{return null;}})();
  const [locations,setLocations]=useState<string[]>(kind==="locations"?initial??[]:[]);
  const [countries,setCountries]=useState<Record<string,string>>({});
  const [currency,setCurrency]=useState(initial?.currency??"USD");
  const [lower,setLower]=useState(String(initial?.gt??initial?.gte??""));
  const [upper,setUpper]=useState(String(initial?.lt??initial?.lte??""));
  const [lowerOp,setLowerOp]=useState<"gt"|"gte">(initial?.gt!==undefined?"gt":"gte");
  const [upperOp,setUpperOp]=useState<"lt"|"lte">(initial?.lt!==undefined?"lt":"lte");
  const [error,setError]=useState("");
  useEffect(()=>{
    if(kind!=="locations") return;
    const controller=new AbortController();
    void listingCapability(controller.signal).then(result=>{if(!controller.signal.aborted)setCountries(result.countries);}).catch(()=>{if(!controller.signal.aborted)setError("Could not load listing locations. Close and retry.");});
    return()=>controller.abort();
  },[kind]);
  function apply() {
    try {
      let result:unknown;
      if(kind==="locations") result=parseListingFilters({...emptyListingFilters(null),countries:locations}).countries;
      else {
        const convert=(raw:string)=>kind==="count" ? /^\d+$/.test(raw)?Number(raw):NaN : raw;
        const range=lower||upper?{...(lower?{[lowerOp]:convert(lower)}:{}),...(upper?{[upperOp]:convert(upper)}:{}),...(kind==="price"?{currency}:{})}:null;
        const parsed=parseListingFilters({...emptyListingFilters(null),[kind==="price"?"price":"seller_listing_count"]:range});
        result=kind==="price"?parsed.price:parsed.seller_listing_count;
      }
      onApply(result && (!Array.isArray(result)||result.length)?JSON.stringify(result):"");
    } catch {setError(kind==="count"?"Enter whole counts and a range that allows at least one matching listing.":"Check the price range and currency.");}
  }
  return <div className="task-search-editor" onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();apply();}}}>
    {kind==="locations" ? <><label>Listing locations<select multiple size={6} value={locations} onChange={event=>setLocations(Array.from(event.target.selectedOptions,option=>option.value))}>{Object.entries(countries).sort(([,a],[,b])=>a.localeCompare(b)).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><p>Match any selected listing location. Marketplace country is a separate filter.</p></>
      : <>{kind==="price"&&<label>Currency<input maxLength={3} value={currency} onChange={event=>setCurrency(event.target.value.toUpperCase())}/></label>}
        <label>Minimum {kind==="count"?"matching listings":"price"}<select aria-label="Minimum comparison" value={lowerOp} onChange={event=>setLowerOp(event.target.value as "gt"|"gte")}><option value="gte">At least</option><option value="gt">More than</option></select><input aria-label="Minimum amount" inputMode={kind==="count"?"numeric":"decimal"} value={lower} onChange={event=>setLower(event.target.value)} placeholder="Any"/></label>
        <label>Maximum {kind==="count"?"matching listings":"price"}<select aria-label="Maximum comparison" value={upperOp} onChange={event=>setUpperOp(event.target.value as "lt"|"lte")}><option value="lte">At most</option><option value="lt">Less than</option></select><input aria-label="Maximum amount" inputMode={kind==="count"?"numeric":"decimal"} value={upper} onChange={event=>setUpper(event.target.value)} placeholder="Any"/></label>
        <p>{kind==="count"?"Counts distinct matching listings per identified seller across the complete search, before pagination.":"Currency comparisons use a historical FX snapshot, not live exchange rates. Listings without a purchasable price are excluded."}</p>
      </>}
    {error&&<p role="alert">{error}</p>}
    <div className="task-search-popover-actions"><button type="button" onClick={onCancel}>Cancel</button><button type="button" onClick={apply}>Apply filter</button></div>
  </div>;
}
