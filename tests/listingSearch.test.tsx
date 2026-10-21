import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { Window } from "happy-dom";
import ListingSearch from "../src/pages/ListingSearch";
import { AuthProvider } from "../src/context/AuthContext";
import { ActiveIpProvider } from "../src/context/ActiveIpContext";
import { setActingTenant } from "../src/api/transport";
import { emptyListingFilters, listingSearchParams, parseListingFilters, readListingSearch, sellerCountPolicy, type ListingFilters } from "../src/lib/listingSearch";

const ip = "10000000-0000-4000-8000-000000000001";
const otherIp = "20000000-0000-4000-8000-000000000001";
const candidate = { reference: { kind: "category", id: "gid://shopify/TaxonomyCategory/aa-1", ip_id: ip }, display_name: "Figures", scope_name: "Example", category_path: "Toys / Figures" };
let root: Root | undefined;
const originalFetch = globalThis.fetch;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; globalThis.fetch = originalFetch; setActingTenant(null); });

test("shared searches preserve exact prices, OR locations and details; malformed links never become broader searches", () => {
  const filters: ListingFilters = { ...emptyListingFilters(ip), countries: ["FR", "CN"], price: { currency: "EUR", lt: "40.000000" }, semantic: { colors: ["blue"], materials: ["cotton"] } };
  const saved = readListingSearch(listingSearchParams(filters), ip);
  expect(saved.filters).toEqual({ ...filters, countries: ["CN", "FR"], price: { currency: "EUR", lt: "40" } });
  expect(saved.saved).toBe(true);
  expect(readListingSearch(new URLSearchParams({ filters: "{broken" }), ip).error).not.toBeNull();
  expect(readListingSearch(listingSearchParams(filters), otherIp)).toMatchObject({ saved: false, filters: emptyListingFilters(otherIp) });
  expect(() => parseListingFilters({ ...filters, price: { currency: "EUR", gte: "40", lt: "40" } })).toThrow();
  expect(() => parseListingFilters({ ...filters, sql: "invented" })).toThrow();
});

function LocationProbe() {
  const location = useLocation(), navigate = useNavigate();
  return <><output>{location.search}</output><button onClick={() => navigate(-1)}>Browser back</button></>;
}
type Call = { path: string; body: Record<string, unknown> };
async function setup(handler: (call: Call) => Response | Promise<Response>, initial?: ListingFilters, raw?: string, supportsCounts = true) {
  const window = new Window({ url: "http://localhost:5174" });
  Object.assign(globalThis, { window, document: window.document, navigator: window.navigator, localStorage: window.localStorage, sessionStorage: window.sessionStorage,
    HTMLElement: window.HTMLElement, Element: window.Element, IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear(); setActingTenant("tenant");
  const calls: Call[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const path = new URL(String(input), window.location.origin).pathname;
    if (path === "/api/ip/selector") return Response.json({ ips: [{ id: ip, name: "Example", scope_kind: "brand", monitoring_enabled: true, historical_ips: [] }] });
    if (path.endsWith("/semantic-taxonomy")) return Response.json({categories:[{key:"miniature",label:"Miniature"},{key:"statue",label:"Statue"},{key:"ae_2_2_8",label:"Scale Models"}]});
    if (path === "/api/auth/me") return Response.json({ user: null });
    if (path.endsWith("/translation-capability")) return Response.json({ version: 1, enabled: true, ...(supportsCounts ? {seller_count_policy_version:sellerCountPolicy,seller_ranking_policy_version:"matching-distinct-seller-ranking-v1"} : {}), country_labels: { FR: "France", CN: "China" } });
    const call = { path, body: init?.body ? JSON.parse(String(init.body)) : {} };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  const container = document.createElement("div"); document.body.replaceChildren(container); root = createRoot(container);
  const query = raw ?? (initial ? listingSearchParams(initial).toString() : `ip_id=${ip}`);
  await act(async () => root!.render(<MemoryRouter initialEntries={[`/monitoring/search?${query}`]}><AuthProvider><ActiveIpProvider><ListingSearch /><LocationProbe /></ActiveIpProvider></AuthProvider></MemoryRouter>));
  const wait = async (predicate: () => boolean) => {
    for (let i = 0; i < 100 && !predicate(); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
    expect(predicate()).toBe(true);
  };
  await wait(() => Boolean(container.querySelector(raw ? "textarea" : "textarea:not([disabled])")));
  const button = (name: string) => [...container.querySelectorAll("button")].find(item => item.textContent?.trim() === name || item.getAttribute("aria-label") === name)!;
  const click = async (name: string) => { await act(async () => button(name).click()); };
  const send = async (message: string) => {
    const input = container.querySelector("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!.call(input, message);
      input.dispatchEvent(new window.Event("input", { bubbles: true })); input.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await click("Send search request");
  };
  const filters = () => JSON.parse(new URLSearchParams(container.querySelector("output")!.textContent!).get("filters") ?? "null") as ListingFilters | null;
  return { container, calls, click, send, filters, wait };
}
function page(filters: unknown, extra: Record<string, unknown> = {}) {
  const f = filters as ListingFilters;
  return Response.json({ version: 1, filters: f, jobs_started: 0, consistency: "live_keyset", total: 2, next_cursor: null,
    ...(f.seller_listing_count ? {seller_count_policy_version:sellerCountPolicy} : {}),
    catalog_match: f.catalog_selection ? candidate : null,
    fx_snapshot: f.price ? { as_of: "2026-08-10", basis: "Historical snapshot" } : null,
    findings: [{ result_id: "row-one", listing_title: "Verified listing", seller_name: "Shop", ...(f.seller_listing_count ? {seller_matching_listing_count:11} : {}), country: "France", price_value_usd: "25.00" }], ...extra });
}
const translation = (filters: ListingFilters, catalogQuery?: string) => Response.json({ version: 1, jobs_started: 0, filters,
  query: { name: "search_listings", arguments: { changes: {}, ...(catalogQuery ? { catalog_query: catalogQuery } : {}) } } });

test("ambiguous catalog choices retain all constraints and execute only after a human choice", async () => {
  const next = { ...emptyListingFilters(ip), countries: ["CN", "FR"], price: { currency: "EUR", lt: "40" }, semantic: { colors: ["blue"] } };
  const ui = await setup(call => call.path.endsWith("/translate") ? translation(next, "Figures") : call.path.endsWith("/resolve-catalog")
    ? Response.json({ version: 1, jobs_started: 0, status: "ambiguous", candidates: [candidate], total: 1, has_more: false }) : page(call.body.filters));
  await ui.send("Find blue Figures below 40 euros in France and China");
  expect(ui.calls.map(call => call.path.split("/").at(-1))).toEqual(["translate", "resolve-catalog"]);
  expect(ui.filters()).toBeNull();
  await act(async () => [...ui.container.querySelectorAll("button")].find(item => item.querySelector("strong")?.textContent === "Figures")!.click());
  expect(ui.filters()).toEqual({ ...next, catalog_selection: candidate.reference });
  expect(ui.container.textContent).toContain("2 matching listings");
  expect(ui.calls.filter(call => call.path.endsWith("/translate"))).toHaveLength(1);
});

test("cancellation and manual edits supersede a slow translation even if the response ignores abort", async () => {
  let finish!: (response: Response) => void;
  const initial = { ...emptyListingFilters(ip), countries: ["FR"], price: { currency: "EUR", lt: "40" } };
  const ui = await setup(call => call.path.endsWith("/translate") ? new Promise(resolve => { finish = resolve; }) : page(call.body.filters), initial);
  await ui.wait(() => ui.container.textContent!.includes("2 matching listings"));
  await ui.send("Make everything blue");
  await ui.click("Remove location filter");
  expect(ui.filters()?.countries).toEqual([]);
  await act(async () => finish(translation({ ...initial, semantic: { colors: ["blue"] } })));
  expect(ui.filters()).toEqual({ ...initial, countries: [] });
  expect(ui.calls.filter(call => call.path.endsWith("/search"))).toHaveLength(2);
});

test("failed search and filter drift retain the confirmed URL and previous results", async () => {
  const initial = { ...emptyListingFilters(ip), countries: ["FR"] };
  let searches = 0;
  const ui = await setup(call => call.path.endsWith("/translate") ? translation({ ...initial, countries: ["CN"] })
    : ++searches === 1 ? page(call.body.filters) : page(initial), initial);
  await ui.wait(() => ui.container.textContent!.includes("2 matching listings"));
  await ui.send("Only China");
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("search filter confirmation");
  expect(ui.filters()).toEqual(initial);
  expect(ui.container.textContent).toContain("Verified listing");
});

test("pagination uses the current signed cursor, deduplicates rows and never invokes translation", async () => {
  let searches = 0;
  const initial = { ...emptyListingFilters(ip), countries: ["FR"] };
  const ui = await setup(call => ++searches === 1 ? page(call.body.filters, { next_cursor: "signed-page-two" }) : page(call.body.filters, {
    findings: [{ result_id: "row-two", listing_title: "Second listing", seller_name: null, country: "France", price_value_usd: null }],
  }), initial);
  await ui.wait(() => Boolean(ui.container.textContent?.includes("Load more listings")));
  await ui.click("Load more listings");
  expect(ui.calls.at(-1)?.body.cursor).toBe("signed-page-two");
  expect(ui.container.textContent).toContain("2 loaded");
  expect(ui.container.textContent).toContain("Second listing");
  expect(ui.calls.every(call => call.path.endsWith("/search"))).toBe(true);
});

test("invalid saved links and unsupported requests cannot silently broaden or start a search", async () => {
  let ui = await setup(() => { throw new Error("No listing request should run"); }, undefined, `ip_id=${ip}&filters=%7Bbroken`);
  expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain("invalid filters");
  expect(ui.calls).toHaveLength(0);
  await act(async () => root?.unmount()); root = undefined;
  ui = await setup(() => Response.json({ version: 1, jobs_started: 0, query: { name: "request_clarification", arguments: { reason: "unsupported_capability" } } }));
  await ui.send("Investigate this seller");
  expect(ui.calls).toHaveLength(1);
  expect(ui.container.textContent).toContain("This request needs a capability that is not available");
  expect(ui.filters()).toBeNull();
});


test("seller count links, follow-ups, pagination and clearing preserve the complete matching scope",async()=>{
 const initial={...emptyListingFilters(ip),seller_listing_count:{gt:10},semantic:{categories:["statue","miniature"]},countries:["FR"]};
 const ui=await setup(call=>call.path.endsWith("/translate") ? translation({...call.body.filters as ListingFilters,price:{currency:"EUR",lte:"30"}}) : page(call.body.filters,{next_cursor:call.body.cursor?null:"count-page-two"}),initial);
 await ui.wait(()=>ui.container.textContent!.includes("2 matching listings"));
 expect(ui.container.textContent).toContain("before pagination");expect(ui.container.textContent).toContain("Matching listings");
 await ui.send("At most 30 euros");expect(ui.filters()?.seller_listing_count).toEqual({gt:10});
 await ui.click("Load more listings");expect(ui.calls.at(-1)?.body.cursor).toBe("count-page-two");
 expect((ui.calls.at(-1)?.body.filters as ListingFilters).seller_listing_count).toEqual({gt:10});
 await ui.click("Remove seller count filter");expect(ui.filters()?.seller_listing_count).toBeNull();expect(ui.filters()?.semantic).toEqual(initial.semantic);
});
test("saved seller counts fail closed on an older API and malformed counts cannot execute",async()=>{
 for(const range of [{},{gt:10,lte:10},{gt:1.5},{lte:0}])expect(()=>parseListingFilters({...emptyListingFilters(ip),seller_listing_count:range})).toThrow();
 const ui=await setup(()=>{throw new Error("No unsupported search should run");},{...emptyListingFilters(ip),seller_listing_count:{gt:10}},undefined,false);
 await ui.wait(()=>Boolean(ui.container.querySelector('[role="alert"]')));
 expect(ui.calls).toHaveLength(0);expect(ui.container.textContent).toContain("does not yet support seller listing counts");
});

test("manual seller count editing uses a strict integer bound and rejects unconfirmed row counts",async()=>{
 let drift=false;
 const ui=await setup(call=>page(call.body.filters,drift?{findings:[{result_id:'wrong-count',listing_title:'Wrong',seller_name:'Shop',country:'France',seller_matching_listing_count:10}]}:{}));
 await ui.click('Edit filters');
 const input=ui.container.querySelector<HTMLInputElement>('[aria-label="Minimum seller listing count"]')!;
 const select=ui.container.querySelector<HTMLSelectElement>('[aria-label="Minimum seller count comparison"]')!;
 await act(async()=>{
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,'10');
  input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));
  select.value='gt';select.dispatchEvent(new window.Event('change',{bubbles:true}));
 });
 await ui.click('Apply filters');expect(ui.filters()?.seller_listing_count).toEqual({gt:10});
 drift=true;await ui.click('Refresh ask listings');
 await ui.wait(()=>Boolean(ui.container.querySelector('[role="alert"]')));
 expect(ui.container.textContent).toContain('seller matching count');expect(ui.container.textContent).toContain('Verified listing');
 expect(ui.filters()?.seller_listing_count).toEqual({gt:10});
});

function rankedPage(filters:unknown,ranking:unknown,extra:Record<string,unknown>={}) {
 return Response.json({version:1,filters,ranking,catalog_match:null,sellers:[{seller_key:'seller-a',seller_name:'Big miniature shop',domain:'market.test',matching_listing_count:42},
  {seller_key:'seller-b',seller_name:'Other miniature shop',domain:'market.test',matching_listing_count:11}],total_sellers:2,
  policy_version:'matching-distinct-seller-ranking-v1',consistency:'live_aggregate',jobs_started:0,fx_snapshot:(filters as ListingFilters).price?{as_of:'2026-08-10',basis:'Historical snapshot'}:null,...extra});
}
test('top seller requests show seller rows, retain ranking on refinements/reload and return to listings explicitly',async()=>{
 const ui=await setup(call=>call.path.endsWith('/translate')?Response.json({version:1,jobs_started:0,filters:{...call.body.filters as ListingFilters,semantic:{categories:['miniature']}},
  query:{name:'rank_sellers',arguments:{changes:{semantic:{categories:['miniature']}},ranking:{limit:10}}}}):call.path.endsWith('/rank-sellers')?rankedPage(call.body.filters,call.body.ranking):page(call.body.filters));
 await ui.send('Show me the top 10 sellers by miniature infringements');
 expect(ui.container.textContent).toContain('2 matching sellers');expect(ui.container.textContent).toContain('Big miniature shop');expect(ui.container.textContent).toContain('42');
 expect(ui.container.textContent).not.toContain('Verified listing');
 expect(new URLSearchParams(ui.container.querySelector('output')!.textContent!).get('ranking')).toBe('{"limit":10}');
 expect(ui.calls.filter(call=>call.path.endsWith('/search'))).toHaveLength(0);
 await ui.click('Refresh ask listings');expect(ui.calls.at(-1)?.path).toEndWith('/rank-sellers');
 expect(ui.calls.at(-1)?.body.ranking).toEqual({limit:10});
 await ui.click('Return to listing results');expect(ui.calls.at(-1)?.path).toEndWith('/search');
 expect(new URLSearchParams(ui.container.querySelector('output')!.textContent!).get('ranking')).toBeNull();
 expect(ui.filters()?.semantic).toEqual({categories:['miniature']});
});
test('rankings reject unsorted or incomplete responses without replacing confirmed listing results',async()=>{
 const initial={...emptyListingFilters(ip),semantic:{categories:['miniature']}};
 const ui=await setup(call=>call.path.endsWith('/translate')?Response.json({version:1,jobs_started:0,filters:initial,query:{name:'rank_sellers',arguments:{ranking:{limit:10}}}})
  :call.path.endsWith('/rank-sellers')?rankedPage(call.body.filters,call.body.ranking,{sellers:[{seller_key:'a',seller_name:'Small',domain:'market.test',matching_listing_count:1},{seller_key:'b',seller_name:'Big',domain:'market.test',matching_listing_count:42}]}):page(call.body.filters),initial);
 await ui.wait(()=>ui.container.textContent!.includes('Verified listing'));await ui.send('Top 10 sellers');
 expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain('ranking order/count');expect(ui.container.textContent).toContain('Verified listing');
 expect(new URLSearchParams(ui.container.querySelector('output')!.textContent!).get('ranking')).toBeNull();
});

test('saved rankings execute the aggregate query on reload and old APIs cannot broaden them',async()=>{
 const filters={...emptyListingFilters(ip),semantic:{categories:['miniature']}};
 const params=listingSearchParams(filters,{limit:10});
 expect(readListingSearch(params,ip).ranking).toEqual({limit:10});
 const ui=await setup(call=>rankedPage(call.body.filters,call.body.ranking),undefined,params.toString());
 await ui.wait(()=>ui.container.textContent!.includes('Big miniature shop'));
 expect(ui.calls).toHaveLength(1);expect(ui.calls[0].path).toEndWith('/rank-sellers');
 await act(async()=>root?.unmount());root=undefined;
 const old=await setup(()=>{throw Error('No fallback search');},undefined,params.toString(),false);
 await old.wait(()=>Boolean(old.container.querySelector('[role="alert"]')));
 expect(old.calls).toHaveLength(0);expect(old.container.textContent).toContain('does not yet support seller ranking');
 const invalid=listingSearchParams(filters);invalid.set('ranking','{"limit":0}');expect(readListingSearch(invalid,ip).error).not.toBeNull();
});


test('stored product-type chips show the scope label rather than an opaque taxonomy key',async()=>{
 const initial={...emptyListingFilters(ip),semantic:{categories:['ae_2_2_8']}};
 const ui=await setup(call=>page(call.body.filters),initial);
 await ui.wait(()=>Boolean(ui.container.querySelector('[aria-label="Remove product detail filters"]')?.textContent?.includes('Scale Models')));
 expect(ui.container.querySelector('[aria-label="Remove product detail filters"]')?.textContent).not.toContain('ae 2 2 8');
 expect(ui.filters()?.semantic).toEqual({categories:['ae_2_2_8']});
});

test('a failed count refinement labels retained rankings as previous results and a successful retry commits the count',async()=>{
 const initial={...emptyListingFilters(ip),semantic:{categories:['miniature']},countries:['FR'],price:{currency:'EUR',lt:'40'}};
 const next={...initial,seller_listing_count:{gt:10}};
 let attempts=0;
 const ui=await setup(call=>call.path.endsWith('/translate')?Response.json({version:1,jobs_started:0,filters:next,query:{name:'rank_sellers',arguments:{ranking:{limit:10}}}})
  :++attempts===2?Response.json({error:'The database is temporarily taking too long to respond'},{status:503})
  :rankedPage(call.body.filters,call.body.ranking),undefined,listingSearchParams(initial,{limit:10}).toString());
 await ui.wait(()=>ui.container.textContent!.includes('Big miniature shop'));
 await ui.send('Only sellers with more than 10 matching listings');
 expect(ui.container.querySelector('[role="alert"]')?.textContent).toContain('Showing results from your previous successful search');
 expect(ui.container.querySelector('[role="log"]')?.textContent).toContain('Your latest request was not applied');
 expect(ui.container.querySelector('.listing-section-heading')?.textContent).toContain('previous search results');
 expect(ui.container.querySelector('.listing-section-heading')?.textContent).not.toContain('live results');
 expect(ui.filters()).toEqual(initial);expect(ui.container.textContent).toContain('Big miniature shop');
 await ui.send('Only sellers with more than 10 matching listings');
 expect(ui.filters()).toEqual(next);expect(ui.container.querySelector('[role="alert"]')).toBeNull();
 expect(ui.container.querySelector('.listing-section-heading')?.textContent).toContain('live results');
});


test("title substring filters survive shared URLs and reject unsupported shapes",()=>{
  const filters={...emptyListingFilters(ip),title_contains:"L261"};
  expect(readListingSearch(listingSearchParams(filters),ip).filters.title_contains).toBe("L261");
  expect(parseListingFilters({...filters,title_contains:null}).title_contains).toBeNull();
  for(const title_contains of ["", "   ","L261\u0000code",42,["L261"],{sql:"invented"}])expect(()=>parseListingFilters({...filters,title_contains})).toThrow();
});
