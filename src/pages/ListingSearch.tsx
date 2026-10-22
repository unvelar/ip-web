import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowUp, ImageOff, LoaderCircle, SlidersHorizontal, X } from "lucide-react";
import MonitoringToolbar from "../components/MonitoringToolbar";
import { SemanticFilterPanel } from "../components/monitoring/board/SemanticFilterPanel";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import { useProductSemanticTaxonomy } from "../hooks/useProductSemanticTaxonomy";
import { listingCapability, rankSellers, resolveListingCatalog, searchListings, translateListingSearch, type CatalogMatch, type ListingPage } from "../api/listingSearch";
import { listingSearchKey, parseSellerRanking, type SellerRanking, listingSearchParams, listingStatuses, parseListingFilters, readListingSearch, type ListingFilters, type ListingPrice } from "../lib/listingSearch";
import { readSemanticFilters, semanticFilterLabel } from "../lib/semanticFilters";
import "./ListingSearch.css";

type Message = { role: "user" | "assistant"; text: string };
type Pending = { ranking:SellerRanking|null; filters: ListingFilters; candidates: CatalogMatch[]; total: number; more: boolean };
const statusLabel = (value: string) => ({ pending: "To triage", preparing: "Preparing", review: "Legal review", takedown_pending: "Legal queue", takedown_sent: "Sent", enforced: "Enforced", dismissed: "Dismissed", all: "All statuses" })[value] ?? value;

function FilterEditor({ filters, countries, sellerCounts, titleSearch, onApply, onClose }: {
  filters: ListingFilters; countries: Record<string, string>; sellerCounts: boolean; titleSearch:boolean; onApply: (filters: ListingFilters) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [currency, setCurrency] = useState(filters.price?.currency ?? "USD");
  const [lower, setLower] = useState(filters.price?.gt ?? filters.price?.gte ?? "");
  const [upper, setUpper] = useState(filters.price?.lt ?? filters.price?.lte ?? "");
  const [lowerOp, setLowerOp] = useState<"gt" | "gte">(filters.price?.gt !== undefined ? "gt" : "gte");
  const [upperOp, setUpperOp] = useState<"lt" | "lte">(filters.price?.lt !== undefined ? "lt" : "lte");
  const [sellerLower, setSellerLower] = useState(String(filters.seller_listing_count?.gt ?? filters.seller_listing_count?.gte ?? ""));
  const [sellerUpper, setSellerUpper] = useState(String(filters.seller_listing_count?.lt ?? filters.seller_listing_count?.lte ?? ""));
  const [sellerLowerOp, setSellerLowerOp] = useState<"gt" | "gte">(filters.seller_listing_count?.gt !== undefined ? "gt" : "gte");
  const [sellerUpperOp, setSellerUpperOp] = useState<"lt" | "lte">(filters.seller_listing_count?.lt !== undefined ? "lt" : "lte");
  const [error, setError] = useState("");
  function apply(event: FormEvent) {
    event.preventDefault();
    const price: ListingPrice | null = lower || upper ? { currency, ...(lower ? { [lowerOp]: lower } : {}), ...(upper ? { [upperOp]: upper } : {}) } : null;
    const sellerCount = sellerLower || sellerUpper ? { ...(sellerLower ? { [sellerLowerOp]: /^\d+$/.test(sellerLower) ? Number(sellerLower) : NaN } : {}), ...(sellerUpper ? { [sellerUpperOp]: /^\d+$/.test(sellerUpper) ? Number(sellerUpper) : NaN } : {}) } : null;
    try { onApply(parseListingFilters({ ...draft, price, ...(sellerCounts || Object.hasOwn(draft,"seller_listing_count") ? { seller_listing_count: sellerCount } : {}) })); onClose(); }
    catch { setError("Check the ranges. Prices use nonnegative decimals; seller listing counts use whole numbers and must allow at least one matching listing."); }
  }
  return <section className="listing-filter-editor" aria-label="Edit listing filters" onKeyDown={event => { if (event.key === "Escape") onClose(); }}>
    <div className="listing-section-heading"><h2>Edit filters</h2><button type="button" onClick={onClose} aria-label="Close filter editor"><X size={17} /></button></div>
    <form onSubmit={apply}>
      <div className="listing-filter-fields">
        <label>Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as ListingFilters["status"] })}>{listingStatuses.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label>
        <label>Sort<select value={draft.sort} onChange={event => setDraft({ ...draft, sort: event.target.value as ListingFilters["sort"] })}><option value="found_desc">Newest first</option><option value="found_asc">Oldest first</option><option value="score_desc">Highest score</option></select></label>
        <label className="listing-countries">Listing locations<select multiple size={5} value={draft.countries} onChange={event => setDraft({ ...draft, countries: Array.from(event.target.selectedOptions, option => option.value) })}>{Object.entries(countries).sort(([, a], [, b]) => a.localeCompare(b)).map(([code, name]) => <option value={code} key={code}>{name}</option>)}</select><span>Match any selected location. Select none for all locations.</span></label>
        <label>Currency<input value={currency} maxLength={3} onChange={event => setCurrency(event.target.value.toUpperCase())} /></label>
        <label>Minimum price<div className="listing-price-field"><select aria-label="Minimum price comparison" value={lowerOp} onChange={event => setLowerOp(event.target.value as "gt" | "gte")}><option value="gte">At least</option><option value="gt">Above</option></select><input aria-label="Minimum price amount" inputMode="decimal" value={lower} onChange={event => setLower(event.target.value)} placeholder="Any" /></div></label>
        <label>Maximum price<div className="listing-price-field"><select aria-label="Maximum price comparison" value={upperOp} onChange={event => setUpperOp(event.target.value as "lt" | "lte")}><option value="lte">At most</option><option value="lt">Under</option></select><input aria-label="Maximum price amount" inputMode="decimal" value={upper} onChange={event => setUpper(event.target.value)} placeholder="Any" /></div></label>
        {sellerCounts && <>
          <label>Minimum matching listings per seller<div className="listing-price-field"><select aria-label="Minimum seller count comparison" value={sellerLowerOp} onChange={event => setSellerLowerOp(event.target.value as "gt" | "gte")}><option value="gte">At least</option><option value="gt">More than</option></select><input aria-label="Minimum seller listing count" inputMode="numeric" value={sellerLower} onChange={event => setSellerLower(event.target.value)} placeholder="Any" /></div></label>
          <label>Maximum matching listings per seller<div className="listing-price-field"><select aria-label="Maximum seller count comparison" value={sellerUpperOp} onChange={event => setSellerUpperOp(event.target.value as "lt" | "lte")}><option value="lte">At most</option><option value="lt">Fewer than</option></select><input aria-label="Maximum seller listing count" inputMode="numeric" value={sellerUpper} onChange={event => setSellerUpper(event.target.value)} placeholder="Any" /></div></label>
        </>}
        {titleSearch && <label>Title contains<input value={draft.title_contains??""} maxLength={100} placeholder="Text or code anywhere in the title" onChange={event=>setDraft({...draft,title_contains:event.target.value.trim()?event.target.value:null})}/></label>}
        <label>Literal listing text<input value={draft.query ?? ""} maxLength={100} placeholder="Exact words in listing text" onChange={event => setDraft({ ...draft, query: event.target.value.trim() ? event.target.value : null })} /></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="listing-editor-actions"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="listing-primary">Apply filters</button></div>
    </form>
  </section>;
}

function SearchWorkspace({ ipId, ipName }: { ipId: string; ipName: string }) {
  const [params, setParams] = useSearchParams();
  const saved = readListingSearch(params, ipId);
  const filters = saved.filters;
  const ranking = saved.ranking;
  const filterKey = listingSearchKey(filters,ranking);
  const currentKey = useRef(filterKey);
  currentKey.current = filterKey;
  const [capability, setCapability] = useState<Awaited<ReturnType<typeof listingCapability>> | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const { labels: categoryLabels } = useProductSemanticTaxonomy(ipId, filters.semantic?.categories);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [result, setResult] = useState<{ key: string; page: ListingPage } | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<"filters" | "details" | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const invalidateRequest = useCallback(() => { generation.current++; request.current?.abort(); }, []);
  const page = result?.key === filterKey ? result.page : null;
  const say = (text: string) => setMessages(current => [...current, { role: "assistant", text }]);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [messages.length, busy, pending]);

  useEffect(() => {
    const controller = new AbortController();
    void listingCapability(controller.signal).then(setCapability).catch(caught => {
      if (!controller.signal.aborted) setCapabilityError(caught instanceof Error ? caught.message : "Search is unavailable.");
    });
    return () => controller.abort();
  }, []);

  function begin(label: string) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const ticket = ++generation.current, snapshot = currentKey.current;
    setBusy(label); setError(""); setPending(null);
    return { signal: controller.signal, current: () => generation.current === ticket && currentKey.current === snapshot && !controller.signal.aborted };
  }
  function cancel() {
    invalidateRequest(); setBusy(null); setPending(null);
  }
  async function retrieve(next: ListingFilters, operation: ReturnType<typeof begin>, append = false, nextRanking:SellerRanking|null = ranking) {
    if (next.seller_listing_count && !capability?.sellerCounts) throw new Error("This API does not yet support seller listing counts. Your filters were kept.");
    if (nextRanking && !capability?.sellerRanking) throw new Error("This API does not yet support seller ranking. Your filters were kept.");
    const response = nextRanking ? await rankSellers(next,nextRanking,operation.signal) : await searchListings(next, append ? page?.nextCursor ?? null : null, operation.signal);
    if (!operation.current()) return;
    const combined = append && page ? { ...response, rows: [...new Map([...page.rows, ...response.rows].map(row => [row.id, row])).values()] } : response;
    const key = listingSearchKey(next,nextRanking);
    resultRef.current = { key, page: combined };
    setResult(resultRef.current);
    if (!append) {
      // Commit the exact successfully executed filters. Failed and stale turns
      // never change the URL, manual controls or the previous result page.
      currentKey.current = key;
      setParams(listingSearchParams(next,nextRanking));
    }
    return response;
  }
  function fail(caught: unknown, operation: ReturnType<typeof begin>, conversational = false) {
    if (!operation.current()) return;
    setError(caught instanceof Error ? caught.message : "Search failed.");
    if (conversational) say("Search failed. Your latest request was not applied. Your previous filters and results were kept.");
  }
  async function apply(next: ListingFilters, nextRanking:SellerRanking|null = ranking) {
    const operation = begin(nextRanking ? "Ranking sellers…" : "Searching listings…");
    try { await retrieve(next, operation, false, nextRanking); }
    catch (caught) { fail(caught, operation); }
    finally { if (operation.current() || request.current?.signal === operation.signal) setBusy(null); }
  }
  async function more() {
    if (!page?.nextCursor) { say("All currently matching listings are already loaded."); return; }
    const operation = begin("Loading more listings…");
    try { await retrieve(filters, operation, true); }
    catch (caught) { fail(caught, operation); }
    finally { if (operation.current()) setBusy(null); }
  }
  async function choose(candidate: CatalogMatch) {
    if (!pending) return;
    const nextRanking=pending.ranking;
    const next = { ...pending.filters, catalog_selection: candidate.reference, catalog_product_id: null };
    const operation = begin("Searching listings…");
    try { const response = await retrieve(next, operation, false, nextRanking); if (response) say(response.sellers ? `Showing ${response.sellers.length} of ${response.total} matching sellers, ranked by matching listings.` : `${response.total.toLocaleString()} listings match the selected catalog and filters.`); }
    catch (caught) { fail(caught, operation); }
    finally { if (request.current?.signal === operation.signal) setBusy(null); }
  }
  async function submit(event?: FormEvent, example?: string) {
    event?.preventDefault();
    const message = (example ?? input).trim();
    if (!message || busy || saved.error || !capability?.enabled) return;
    setInput(""); setMessages(current => [...current, { role: "user", text: message }]);
    const operation = begin("Understanding your request…");
    try {
      const translation = await translateListingSearch(message, filters, operation.signal, ranking);
      if (!operation.current()) return;
      if(translation.name==="set_queue_view"){setError("Queue display controls are available in the review queue. Your filters were kept.");return;}
      if (translation.name === "request_clarification") {
        say(translation.reason === "unsupported_capability"
          ? (({ seller_metrics: "Seller counts and ranking use all active listing filters. Other seller metrics, including total inventory outside these filters, need an API extension.", similarity: "Image and text similarity search is not available here yet.", shipping: "Shipping-destination filtering is not available here yet. Listing location is supported.", live_fx: "Live exchange rates are not available. Price filters use the disclosed historical snapshot.", investigation: "Investigation actions are not available in listing search." } as Record<string,string>)[translation.capability ?? ""] ?? "This request needs a capability that is not available. Please clarify the filter you need.") + " Your filters were kept."
          : "Please specify the product or filters you want to change. Your current filters were kept.");
        return;
      }
      if (translation.name === "next_listing_page") { await more(); return; }
      let next = translation.filters;
      if (translation.catalogQuery) {
        setBusy("Finding the catalog match…");
        const resolution = await resolveListingCatalog(translation.catalogQuery, ipId, operation.signal);
        if (!operation.current()) return;
        if (resolution.status === "not_found") { say(`No catalog match for “${translation.catalogQuery}” in ${ipName}. Try a stored brand, product or category name. Your filters were kept.`); return; }
        if (resolution.status === "ambiguous") {
          setPending({ ranking:translation.ranking, filters: structuredClone(next), candidates: resolution.candidates, total: resolution.total, more: resolution.has_more });
          say("Choose the intended catalog match. Your requested filters will be applied together after you choose."); return;
        }
        next = { ...next, catalog_product_id: null, catalog_selection: resolution.candidates[0].reference };
      }
      setBusy(translation.ranking ? "Ranking sellers…" : "Searching listings…");
      const response = await retrieve(next, operation, false, translation.ranking);
      if (response) say(response.sellers ? `Showing ${response.sellers.length} of ${response.total} matching sellers, ranked by all matching suspected listings.` : `${response.total.toLocaleString()} ${response.total === 1 ? "listing matches" : "listings match"}. ${response.nextCursor ? "More results are available below." : "The current matching set is loaded."}`);
    } catch (caught) { fail(caught, operation, true); }
    finally { if (request.current?.signal === operation.signal) { setBusy(null); inputRef.current?.focus(); } }
  }

  useEffect(() => {
    // Back/forward, shared URLs and scope changes supersede any in-flight turn.
    invalidateRequest();
    setPending(null); setBusy(null);
    if (saved.saved && !saved.error && (capability || capabilityError) && resultRef.current?.key !== filterKey) void apply(filters);
    return invalidateRequest;
    // The canonical URL fingerprint is the source of truth, not object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, invalidateRequest, capability, capabilityError]);

  const remove = (change: Partial<ListingFilters>) => void apply({ ...filters, ...change });
  const countries = capability?.countries ?? {};
  const catalogLabel = page?.catalog ? `${page.catalog.scope_name} · ${page.catalog.display_name}` : filters.catalog_selection ? "Selected catalog" : filters.catalog_product_id ? "Selected product" : null;
  return <>
    <MonitoringToolbar title="Ask listings" showStatus={false} onRefresh={() => { if (saved.saved) void apply(filters); }} refreshing={Boolean(busy)}
      actions={<Link className="listing-back-link" to={`/monitoring/tasks?ip_id=${encodeURIComponent(ipId)}`}><ArrowLeft size={14} />Tasks</Link>}>
      <span className="listing-scope-summary">{ipName}</span>
    </MonitoringToolbar>
    <main className="listing-search-workspace">
      <aside className="listing-chat" aria-label="Listing search conversation">
        <div className="listing-chat-heading"><span className="listing-eyebrow">YOUR EXISTING LISTINGS</span><h2>What are you looking for?</h2><p>Describe a product and refine your search as you go.</p></div>
        <div ref={conversationRef} className="listing-conversation" role="log" aria-label="Search messages" aria-live="polite">
          {messages.length === 0 && <div className="listing-examples"><p>Try a request</p>{["Show blue products under 40 euros in France and China", ...(capability?.sellerCounts ? ["Find sellers with more than 10 matching listings"] : ["Find products made of cotton"]), "Filter to variants with a content volume of 50 millilitres"].map(example => <button key={example} type="button" disabled={!capability?.enabled || Boolean(saved.error)} onClick={() => void submit(undefined, example)}>{example}<ArrowUp size={14} /></button>)}</div>}
          {messages.map((message, index) => <div key={index} className={`listing-message listing-message-${message.role}`}><span>{message.role === "user" ? "You" : "Search assistant"}</span><p>{message.text}</p></div>)}
          {pending && <div className="listing-catalog-choices"><p>{pending.total} catalog matches{pending.more ? "; showing the first 20. Refine the name for more specific choices." : ""}</p>{pending.candidates.map(candidate => <button type="button" key={JSON.stringify(candidate.reference)} onClick={() => void choose(candidate)}><strong>{candidate.display_name}</strong><span>{candidate.scope_name} · {candidate.reference.kind}{candidate.category_path ? ` · ${candidate.category_path}` : ""}</span></button>)}<button type="button" onClick={() => { cancel(); say("Catalog choice cancelled. Your filters were kept."); }}>Cancel choice</button></div>}
          {busy && <p className="listing-progress" role="status"><LoaderCircle size={14} className="animate-spin" />{busy}</p>}
        </div>
        {capabilityError && <p role="alert" className="listing-error">{capabilityError}</p>}
        {capability && !capability.enabled && <p role="status" className="listing-error">Conversational search is unavailable. You can still edit filters manually.</p>}
        <form className="listing-composer" onSubmit={event => void submit(event)}>
          <label className="sr-only" htmlFor="listing-request">Describe your listing search</label>
          <textarea ref={inputRef} id="listing-request" rows={3} maxLength={2000} value={input} placeholder="Ask about your listings…" onChange={event => setInput(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} disabled={!capability?.enabled || Boolean(saved.error)} />
          <div><span>Search only · no investigation jobs</span>{busy ? <button type="button" onClick={() => { cancel(); say("Search cancelled. Your filters were kept."); }}>Cancel</button> : <button type="submit" className="listing-send" aria-label="Send search request" disabled={!input.trim() || !capability?.enabled || Boolean(saved.error)}><ArrowUp size={17} /></button>}</div>
        </form>
      </aside>
      <section className="listing-search-results" aria-label="Listing results">
        <div className="listing-section-heading"><div><h2>{page ? `${page.total.toLocaleString()} matching ${page.sellers ? "sellers" : page.total === 1 ? "listing" : "listings"}` : "Search results"}</h2><p>{page ? `${page.sellers?.length ?? page.rows.length} loaded · ${busy || error ? "previous search results" : "live results"}` : "Your results will appear here."}</p></div><button type="button" onClick={() => setEditor(editor === "filters" ? null : "filters")} disabled={Boolean(saved.error)}><SlidersHorizontal size={14} />Edit filters</button></div>
        <div className="listing-filter-chips" aria-label="Applied search filters">
          <span>{statusLabel(filters.status)}</span>
          {ranking && <button type="button" aria-label="Return to listing results" onClick={()=>void apply(filters,null)}>Top {ranking.limit} sellers<X size={12}/></button>}
          {!ranking && capability?.sellerRanking && <button type="button" onClick={()=>void apply(filters,{limit:10})}>Rank sellers</button>}
          {catalogLabel && <button type="button" onClick={() => remove({ catalog_selection: null, catalog_product_id: null })} aria-label="Remove catalog filter">{catalogLabel}<X size={12} /></button>}
          {filters.countries.length > 0 && <button type="button" onClick={() => remove({ countries: [] })} aria-label="Remove location filter">{filters.countries.map(code => countries[code] ?? code).join(" or ")}<X size={12} /></button>}
          {filters.price && <button type="button" onClick={() => remove({ price: null })} aria-label="Remove price filter">{filters.price.gt !== undefined ? `> ${filters.price.gt}` : filters.price.gte !== undefined ? `≥ ${filters.price.gte}` : ""}{(filters.price.gt ?? filters.price.gte) !== undefined && (filters.price.lt ?? filters.price.lte) !== undefined ? " · " : ""}{filters.price.lt !== undefined ? `< ${filters.price.lt}` : filters.price.lte !== undefined ? `≤ ${filters.price.lte}` : ""} {filters.price.currency}<X size={12} /></button>}
          {filters.seller_listing_count && <button type="button" onClick={() => remove({ seller_listing_count: null })} aria-label="Remove seller count filter">Seller matching listings: {Object.entries(filters.seller_listing_count).map(([op,value]) => `${({gt:">",gte:"≥",lt:"<",lte:"≤"} as Record<string,string>)[op]} ${value}`).join(" · ")}<X size={12} /></button>}
          {filters.title_contains && <button type="button" onClick={()=>remove({title_contains:null})} aria-label="Remove title filter">Title contains: {filters.title_contains}<X size={12}/></button>}
          {filters.query && <button type="button" onClick={() => remove({ query: null })} aria-label="Remove literal text filter">Text: {filters.query}<X size={12} /></button>}
          {filters.semantic && <button type="button" onClick={() => remove({ semantic: null })} aria-label="Remove product detail filters">{semanticFilterLabel(JSON.stringify(filters.semantic),categoryLabels)}<X size={12} /></button>}
          <button type="button" className="listing-details-trigger" onClick={() => setEditor(editor === "details" ? null : "details")} disabled={Boolean(saved.error)}>Product details</button>
        </div>
        {editor === "filters" && <FilterEditor key={filterKey} filters={filters} countries={countries} titleSearch={Boolean(capability?.titleSearch)} sellerCounts={Boolean(capability?.sellerCounts)} onApply={next => void apply(next)} onClose={() => setEditor(null)} />}
        {editor === "details" && <section className="listing-filter-editor" aria-label="Edit product details"><div className="listing-section-heading"><h2>Product details</h2><button type="button" onClick={() => setEditor(null)} aria-label="Close product detail editor"><X size={17} /></button></div><SemanticFilterPanel key={filterKey} ipId={ipId} value={filters.semantic ? JSON.stringify(filters.semantic) : null} onApply={value => { remove({ semantic: readSemanticFilters(value) }); setEditor(null); }} /></section>}
        {(error || saved.error) && <p role="alert" className="listing-error">{saved.error ?? error}{error && page && " Showing results from your previous successful search. Your latest request was not applied."}{saved.error && <button type="button" onClick={() => { cancel(); setResult(null); setParams(new URLSearchParams({ ip_id: ipId })); }}>Reset search</button>}</p>}
        {ranking && <form key={ranking.limit} className="listing-editor-actions" onSubmit={event=>{event.preventDefault();try{const form=new FormData(event.currentTarget);void apply(filters,parseSellerRanking({limit:Number(form.get("top_sellers"))}));}catch{setError("Choose a whole number from 1 to 100 sellers.");}}}><label>Top sellers <input aria-label="Number of top sellers" name="top_sellers" type="number" min={1} max={100} step={1} defaultValue={ranking.limit}/></label><button type="submit" disabled={Boolean(busy)}>Update ranking</button></form>}
        {page?.sellers && <p className="listing-coverage">Ranked by distinct suspected listings matching all active filters across the complete result set. These counts do not establish confirmed infringement. Unknown sellers are excluded; ties use a stable seller identity.</p>}
        {page?.sellers && page.sellers.length>0 && <div className="listing-result-table"><table><thead><tr><th>Rank</th><th>Seller</th><th>Marketplace</th><th>Matching listings</th></tr></thead><tbody>{page.sellers.map((seller,index)=><tr key={seller.sellerKey}><td>{index+1}</td><td>{seller.name??"Identified seller"}</td><td>{seller.domain}</td><td>{seller.count.toLocaleString()}</td></tr>)}</tbody></table></div>}
        {page?.fx && <p className="listing-coverage">Currency comparisons use the historical FX snapshot dated {page.fx.asOf}; these are not live exchange rates. Listings with unknown prices or currencies are excluded.</p>}
        {filters.seller_listing_count && <p className="listing-coverage">Counts distinct listings matching all active filters per identified seller across the full result set, before pagination. Listings without an identified seller are excluded.</p>}
        {filters.semantic && <p className="listing-coverage">Matches recorded product details on the same component. Listings without those details are excluded.</p>}
        {!page && <div className="listing-empty"><div className="listing-empty-mark"><SlidersHorizontal size={24} /></div><h3>Find the listings that matter</h3><p>Ask a question or set filters to search existing listings for {ipName}.</p></div>}
        {page && (page.sellers ? page.sellers.length===0 : page.rows.length === 0) && <div className="listing-empty"><h3>No matching {page.sellers ? "sellers" : "listings"}</h3><p>Try removing a filter or using another catalog name.</p></div>}
        {page && page.rows.length > 0 && <div className="listing-result-table"><table><thead><tr><th>Listing</th><th>Seller</th>{filters.seller_listing_count && <th>Matching listings</th>}<th>Location</th><th>Price · USD</th></tr></thead><tbody>{page.rows.map(row => <tr key={row.id}><td><Link to={`/monitoring/tasks/${encodeURIComponent(row.id)}?ip_id=${encodeURIComponent(ipId)}`}><span className="listing-result-image">{row.image ? <img src={row.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = "none"; }} /> : <ImageOff size={17} />}</span><span>{row.title || "Untitled listing"}</span></Link></td><td>{row.seller || "Unknown seller"}</td>{filters.seller_listing_count && <td>{row.sellerMatchingCount?.toLocaleString()}</td>}<td>{row.country || "Unknown location"}</td><td>{row.priceUsd === null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(row.priceUsd))}</td></tr>)}</tbody></table></div>}
        {page?.nextCursor && <button type="button" className="listing-load-more" disabled={Boolean(busy)} onClick={() => void more()}>Load more listings</button>}
        {page && <p className="listing-coverage">Results come from current stored listings. The set can change as listings are updated.</p>}
        {saved.saved && <button type="button" className="listing-reset" onClick={() => { cancel(); setResult(null); resultRef.current = null; setParams(new URLSearchParams({ ip_id: ipId })); setMessages([]); }}>Reset search</button>}
      </section>
    </main>
  </>;
}

export default function ListingSearch() {
  const { activeIpId, activeIp, loading } = useActiveIp();
  const { actingTenantId } = useAuth();
  if (loading) return <p className="p-8 text-sm text-stone-500" role="status">Loading search…</p>;
  if (!activeIpId) return <p className="p-8 text-sm text-stone-500">Select a brand or product to search its listings.</p>;
  return <SearchWorkspace key={`${actingTenantId}:${activeIpId}`} ipId={activeIpId} ipName={activeIp?.name ?? "the selected scope"} />;
}
