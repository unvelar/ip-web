import { useMemo, useState } from "react";
import { AlertCircle, ExternalLink, Image as ImageIcon, Search } from "lucide-react";
import type { DiscoveryEvidence, DiscoveryPage } from "../../api/websiteDiscovery";
import "./WebsitePerformance.css";

const number = (value: number | null | undefined) => value == null ? "Unknown" : value.toLocaleString();
const safeUrl = (value: string | null | undefined) => Boolean(value && /^https?:\/\//i.test(value));

const COVERAGE_REASONS: Record<string, string> = {
  exhausted: "Reached the observed end of this search",
  listing_budget: "Stopped at the listing limit",
  page_budget: "Stopped at the page or batch limit",
  model_budget: "Stopped at the discovery reasoning limit",
  no_progress: "Pagination or scrolling stopped producing new results",
  uncertain_continuation: "Could not establish how to continue or whether results had ended",
  access_failure: "Could not access the next results page",
  collection_changed: "The result collection no longer matched the extraction rule",
  extraction_gaps: "Reached the end, but some listing cards could not be extracted",
  transport_changed: "The fetch method changed and needs a new extraction proof",
  query_changed: "Could not verify that pagination preserved the search",
  unsupported_action: "The fetch method could not perform the next action",
};

const FILTER_REASONS: Record<string, string> = {
  full_name: "Product name found in the listing title or URL",
  brand_product_order: "Brand and product name found together",
  alias_with_context: "Alias found with supporting brand or category",
  product_description: "Identity established by the product description",
  short_name_visual_only: "Short name proceeds to visual matching",
  result_name: "Protected name found in the search result",
  identity_not_found: "No supported product identity in the listing title or URL",
  description_no_match: "Captured product details did not establish the required identity",
  description_unavailable: "Product description evidence was unavailable",
  description_required: "A description check was required but not performed",
  description_budget: "Historical description limit reached; this listing was not checked",
  invalid_destination: "Invalid destination URL",
};

export function CoverageBadge({ coverage, active = false }: { coverage: DiscoveryEvidence["coverage"] | undefined; active?: boolean }) {
  if (active && coverage?.status !== "complete") return <span className="discovery-badge discovery-badge-active">In progress</span>;
  const status = coverage?.status ?? "unknown";
  return <span className={`discovery-badge discovery-badge-${status}`} title={coverage ? COVERAGE_REASONS[coverage.stop_reason] ?? coverage.stop_reason : "This run has no recorded proof of search completeness"}>
    {status === "complete" ? "Complete" : status === "partial" ? "Partial" : "Unknown"}
  </span>;
}

export function DiscoveryRunEvidence({ evidence, active = false }: { evidence: DiscoveryEvidence | undefined; active?: boolean }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(30);
  const items = useMemo(() => (evidence?.items ?? []).filter(item =>
    (filter === "all" || item.state === filter) && [item.title, item.page_url, item.reason, item.matched_name]
      .some(text => text?.toLowerCase().includes(query.trim().toLowerCase()))), [evidence?.items, filter, query]);
  const reasons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of evidence?.items ?? []) if (item.state !== "admitted") counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [evidence?.items]);
  const coverage = evidence?.coverage;
  const listings = evidence?.listings;
  const lastPage = coverage?.last_page;
  const pages = evidence?.pages ?? [];
  const lastPageIncluded = lastPage && pages.some(p => p.url === lastPage.url
    && p.observed_cards === lastPage.observed_cards && p.unique_listings === lastPage.unique_listings);

  return <section className="discovery-evidence" aria-label="Search coverage and filtering">
    <div className="discovery-section-heading">
      <div><h3>Search coverage and filtering</h3><p>What the search returned, what was retained, and what still lacks evidence.</p></div>
      <CoverageBadge coverage={coverage} active={active} />
    </div>
    <div className={`discovery-explanation ${coverage?.status === "partial" ? "discovery-explanation-warning" : ""}`}>
      {coverage?.status === "partial" && <AlertCircle size={16} aria-hidden="true" />}
      <div><p>{active && coverage?.status !== "complete" ? "Discovery is running or awaiting retry. These counts are provisional." : coverage ? COVERAGE_REASONS[coverage.stop_reason] ?? coverage.stop_reason : "Search completeness was not recorded for this run."}</p>
        <span>{coverage ? `${number(coverage.pages)} page or batch observations · ${number(coverage.unique_listings)} unique listings · ${number(coverage.missing_cards)} card extraction gaps` : "A successful job does not establish that all search results were collected."}</span>
        {coverage?.status === "complete" && <span>Complete covers the accessible search collection. The website's total inventory is not independently verified.</span>}
      </div>
    </div>
    <div className="discovery-funnel">
      <Fact label="Collected listings" value={listings?.found ?? coverage?.unique_listings} />
      <Fact label="Passed screening" value={listings?.admitted} />
      <Fact label="Filtered out" value={listings?.filtered} />
      <Fact label="Unverified" value={listings?.unverified} warning={(listings?.unverified ?? 0) > 0} />
      <Fact label="Descriptions checked" value={evidence?.screening?.inspected} />
    </div>
    {!listings && evidence?.screening && <p className="discovery-note">The historical audit records {number(evidence.screening.harvested)} extractor candidates and {number(evidence.screening.admitted)} admissions. Unique listing totals cannot be reconstructed from these counters.</p>}
    {(listings?.unverified ?? 0) > 0 && <p className="discovery-warning">Unverified listings were not admitted to matching. Missing description evidence is not proof that a listing is irrelevant.</p>}

    <details className="discovery-details">
      <summary>Page and pagination evidence <span>{pages.length ? `${pages.length} observation${pages.length === 1 ? "" : "s"}` : "No page history"}</span></summary>
      {pages.length === 0 && <p className="discovery-note">Detailed page observations were not retained for this run.</p>}
      {pages.map((page, index) => <PageEvidence key={`${index}-${page.url}`} page={page} label={`Observation ${index + 1}`} />)}
      {lastPage && !lastPageIncluded && <PageEvidence page={lastPage} label="Last observed page" />}
      {coverage?.resume_url && <p className="discovery-note"><Url href={coverage.resume_url}>Recorded continuation URL</Url></p>}
    </details>

    {reasons.length > 0 && <div className="discovery-reasons" aria-label="Exclusion reasons">
      {reasons.map(([reason, count]) => <div key={reason}><span>{FILTER_REASONS[reason] ?? reason.replaceAll("_", " ")}</span><strong>{number(count)}</strong></div>)}
      <p className="discovery-note">Reason counts use recorded candidate observations. Older extractors can record several images for one listing.</p>
    </div>}

    <div className="discovery-section-heading discovery-candidate-heading">
      <div><h4>Screening decisions</h4><p>Includes listings excluded before matching. Text evidence admits a listing to matching; it does not confirm a finding.</p></div>
    </div>
    {!evidence?.items_recorded && <p className="discovery-note">Individual screening decisions were not fully recorded for this run.</p>}
    {(evidence?.items.length ?? 0) > 0 && <>
      <div className="discovery-toolbar">
        <div className="discovery-tabs" role="group" aria-label="Screening outcome">
          {[["all", "All"], ["admitted", "Passed"], ["filtered", "Filtered"], ["unverified", "Unverified"]].map(([value, label]) =>
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(30); }}>{label}</button>)}
        </div>
        <label className="discovery-search"><Search size={14} aria-hidden="true" /><input aria-label="Search screening decisions" placeholder="Title, URL or reason" value={query} onChange={e => { setQuery(e.target.value); setLimit(30); }} /></label>
      </div>
      <div className="discovery-candidates">
        {items.slice(0, limit).map((item, index) => <article key={`${index}-${item.page_url}`}>
          <div className="discovery-candidate-image">{safeUrl(item.image_url)
            ? <img src={item.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = "none"; }} />
            : <ImageIcon size={18} aria-hidden="true" />}</div>
          <div className="discovery-candidate-copy">
            <div className="discovery-candidate-title"><Url href={item.page_url}>{item.title || "Untitled listing"}</Url><span className={`discovery-badge discovery-badge-${item.state === "admitted" ? "complete" : item.state === "unverified" ? "partial" : "unknown"}`}>{item.state === "admitted" ? "Passed" : item.state === "unverified" ? "Unverified" : "Filtered"}</span></div>
            <p>{FILTER_REASONS[item.reason] ?? item.reason.replaceAll("_", " ")}</p>
            {item.matched_name && <p className="discovery-note">Matched name: {item.matched_name}</p>}
            {!!item.identity_evidence?.products.length && <details className="discovery-product-evidence"><summary>Captured product evidence</summary>
              {item.identity_evidence.products.map((product, i) => <blockquote key={i}>{[product.name, product.description, product.brand, product.category].filter(Boolean).join(" · ")}</blockquote>)}
            </details>}
          </div>
        </article>)}
      </div>
      {items.length === 0 && <p className="discovery-note">No decisions match these filters.</p>}
      {items.length > limit && <button className="admin-button" type="button" onClick={() => setLimit(n => n + 30)}>Show more decisions ({number(items.length - limit)} remaining)</button>}
    </>}
  </section>;
}

function Fact({ label, value, warning }: { label: string; value: number | null | undefined; warning?: boolean }) {
  return <div className={warning ? "is-warning" : ""}><strong>{number(value)}</strong><span>{label}</span></div>;
}

function PageEvidence({ page, label }: { page: DiscoveryPage; label: string }) {
  return <article className="discovery-page-evidence"><div><strong>{label}</strong><span>HTTP {page.http_status}</span></div>
    <Url href={page.url}>{page.url}</Url>
    <p>{page.observed_cards} cards observed · {page.extracted_cards} extracted · {page.unique_listings} distinct listings · {page.missing_cards} missing · {page.without_images} without images</p>
    {(page.unmatched_cards > 0 || page.truncated) && <p className="discovery-warning">{page.unmatched_cards} cards outside the saved extraction rule{page.truncated ? "; document inspection was truncated" : ""}.</p>}
    {page.search_state && <p>Observed search state: {page.search_state}. Continuation: {page.continuation === "end" ? "End observed" : page.continuation === "scroll" ? "Scroll" : page.continuation === "unknown" ? "Uncertain" : page.continuation ? "Observed control" : "Not established"}.</p>}
    {page.context && <details><summary>Recorded search context</summary><blockquote>{page.context}</blockquote></details>}
  </article>;
}

function Url({ href, children }: { href: string | null | undefined; children: React.ReactNode }) {
  return safeUrl(href) ? <a href={href!} target="_blank" rel="noreferrer">{children}<ExternalLink size={11} aria-hidden="true" /></a> : <span>{children}</span>;
}
