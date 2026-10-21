import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ImageOff, Images, Link2, Loader2, RefreshCw, Store } from "lucide-react";
import { getSellerIntelligence, type SellerIntelligence as Intelligence, type SellerSimilaritySignal } from "../../api/sellerIntelligence";
import { isApiError } from "../../api/transport";
import type { SharedListingImage } from "../../api/monitoring";
import { sellerProfilePath } from "../../lib/sellers";
import "./sellerIntelligence.css";

function safeUrl(value: string | null | undefined) {
  try { const url = new URL(value ?? ""); return ["https:","http:"].includes(url.protocol) && !url.username && !url.password ? url.toString() : undefined; }
  catch { return undefined; }
}
function date(value: string) {
  return new Date(value).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
}
function Source({url,observedAt,label="View source"}:{url:string;observedAt:string;label?:string}) {
  return <div className="seller-evidence-source"><a href={safeUrl(url)} target="_blank" rel="noreferrer">{label}<ExternalLink size={11} aria-hidden /></a>
    <time dateTime={observedAt}>Captured {date(observedAt)}</time></div>;
}
function Photo({image,label}:{image:SharedListingImage;label:string}) {
  const [failed,setFailed]=useState(false);
  const url=safeUrl(image.url);
  return <div className="seller-evidence-photo">{url&&!failed
    ? <a href={url} target="_blank" rel="noreferrer" aria-label={`Enlarge ${label}`}><img src={url} alt={label} loading="lazy" onError={()=>setFailed(true)} /></a>
    : <span><ImageOff size={20} aria-hidden />Archived photo unavailable</span>}</div>;
}
const labels: Record<SellerSimilaritySignal["kind"],string>={shared_contact:"Shared contact detail",linked_storefront:"Published storefront link",
  shared_text:"Shared wording",exact_image:"Identical archived image",possible_copy:"Possible edited image copy"};

function Evidence({signal}:{signal:SellerSimilaritySignal}) {
  if (signal.kind==="shared_contact") return <div className="seller-similarity-evidence">
    <h4>{signal.label}</h4><p className="seller-shared-value">{signal.value}</p>
    <div className="seller-evidence-pair">{[signal.source,signal.target].map((source,index)=><div key={index}>
      <span className="seller-evidence-side">{index===0?"This seller":"Similar seller"}</span><blockquote>{source.source_quote}</blockquote>
      <Source url={source.source_url} observedAt={source.observed_at}/></div>)}</div>
    {signal.other_sellers>0&&<p className="seller-evidence-caveat">Also captured on {signal.other_sellers} other compared seller accounts.</p>}
  </div>;
  if (signal.kind==="linked_storefront") return <div className="seller-similarity-evidence">
    <p>A captured shop page explicitly links to the other storefront.</p><blockquote>{signal.source.source_quote}</blockquote>
    <a className="seller-evidence-link" href={safeUrl(signal.target_url)} target="_blank" rel="noreferrer">{signal.target_url}<ExternalLink size={12} aria-hidden /></a>
    <Source url={signal.source.source_url} observedAt={signal.source.observed_at}/>
  </div>;
  if (signal.kind==="shared_text") return <div className="seller-similarity-evidence"><div className="seller-evidence-pair">
    {[signal.source,signal.target].map((source,index)=><div key={index}><span className="seller-evidence-side">{index===0?"This seller":"Similar seller"} · {source.label}</span>
      <blockquote>{source.text}</blockquote><Source url={source.page_url} observedAt={source.observed_at}/></div>)}</div>
    <p className="seller-evidence-caveat">Original captured wording. Shared product or supplier copy can appear on unrelated stores.</p>
    {signal.other_sellers>0&&<p className="seller-evidence-caveat">Also captured on {signal.other_sellers} other compared seller accounts.</p>}
  </div>;
  return <div className="seller-similarity-evidence"><div className="seller-evidence-pair">
    <div><span className="seller-evidence-side">This seller</span><Photo image={signal.source} label="This seller's archived listing photo"/>
      <p className="seller-image-listing-title" title={signal.source_listing.text}>{signal.source_listing.text}</p>
      <Source url={signal.source_listing.page_url} observedAt={signal.source_listing.observed_at} label="View listing"/></div>
    <div><span className="seller-evidence-side">Similar seller</span><Photo image={signal.target} label="Similar seller's archived listing photo"/>
      <p className="seller-image-listing-title" title={signal.target_listing.text}>{signal.target_listing.text}</p>
      <Source url={signal.target_listing.page_url} observedAt={signal.target_listing.observed_at} label="View listing"/></div></div>
    <p className="seller-evidence-caveat">{signal.kind==="possible_copy"?"The photos may be edits of the same image. ":"The archived image content matches. "}Supplier photos and copied images can connect unrelated stores.</p>
    {signal.other_sellers>0&&<p className="seller-evidence-caveat">This image also matched at least {signal.other_sellers} other compared seller accounts.</p>}
  </div>;
}

export function SellerIntelligenceView({intelligence}:{intelligence:Intelligence}) {
  const {dossier,coverage,similar_sellers}=intelligence;
  return <div className="seller-intelligence">
    <section className="seller-intelligence-section" aria-label="Seller profile evidence">
      <div className="seller-intelligence-heading"><div><h2>Seller profile</h2><p>Shop information and listing content collected over time.</p></div>
        <span className="seller-intelligence-count">{coverage.source_listings.toLocaleString()} observed listings</span></div>
      {dossier.facts.length>0?<div className="seller-profile-facts">{dossier.facts.map((fact,index)=><details key={JSON.stringify([fact.kind,fact.label,fact.value,fact.source_url])} open={index===0&&fact.kind==="description"}>
        <summary>{fact.label}<span>{date(fact.observed_at)}</span></summary><blockquote>{fact.kind==="storefront"
          ?<a className="seller-evidence-link" href={safeUrl(fact.value)} target="_blank" rel="noreferrer">{fact.value}<ExternalLink size={12} aria-hidden /></a>:fact.value}</blockquote>
        <Source url={fact.source_url} observedAt={fact.observed_at}/></details>)}</div>
        :<p className="seller-intelligence-empty">No shop biography or policies have been captured yet. Profile evidence grows as this seller's listings are enriched.</p>}
      {dossier.facts_available>dossier.facts.length&&<p className="seller-intelligence-note">Showing the latest {dossier.facts.length} of {dossier.facts_available} captured profile observations.</p>}
      {dossier.listings.length>0&&<details className="seller-catalog-evidence"><summary><Images size={15} aria-hidden />Observed listing content<span>{dossier.listings.length} of {coverage.source_listings.toLocaleString()} listings</span></summary>
        <div className="seller-catalog-list">{dossier.listings.map(listing=><article key={listing.case_id}>
          <h3>{listing.title??"Listing"}</h3><Source url={listing.page_url} observedAt={listing.observed_at} label="View listing"/>
          {listing.description?<details className="seller-listing-description"><summary>{listing.description_source==="captured"?"Captured description":"Extracted description"}</summary><p>{listing.description}</p></details>
            :<p className="seller-intelligence-note">No description captured.</p>}
          {listing.captured_description&&listing.captured_description!==listing.description&&<details className="seller-listing-description"><summary>Original captured wording</summary><p>{listing.captured_description}</p></details>}
          {listing.images.length>0&&<div className="seller-catalog-photos">{listing.images.map(image=><Photo key={image.content_hash} image={image} label="Archived listing photo"/>)}</div>}
        </article>)}</div></details>}
    </section>
    <section className="seller-intelligence-section" aria-label="Similar sellers">
      <div className="seller-intelligence-heading"><div><h2><Link2 size={17} aria-hidden />Similar sellers</h2><p>Accounts with shared public details, wording, or listing images.</p></div>
        {similar_sellers.length>0&&<span className="seller-intelligence-count">{similar_sellers.length}{intelligence.has_more?"+":""} leads</span>}</div>
      <p className="seller-intelligence-note">These are investigation leads. Shared content does not establish a common owner.</p>
      <details className="seller-comparison-coverage"><summary>{intelligence.status==="partial"?"Partial comparison · More matches may exist":"Comparison coverage"}</summary>
        <p>Compared {coverage.source_listings_checked.toLocaleString()} of {coverage.source_listings.toLocaleString()} listings from this seller with {coverage.candidate_listings_checked.toLocaleString()} of {coverage.candidate_listings.toLocaleString()} other collected listings across {coverage.candidate_sellers.toLocaleString()} accounts in this workspace.</p>
        <p>Image comparison: {coverage.source_images_checked.toLocaleString()}/{coverage.source_images.toLocaleString()} archived photos here and {coverage.candidate_images_checked.toLocaleString()} retrieved candidates from {coverage.candidate_images.toLocaleString()} available photos in the compared listings. Edited-copy fingerprints: {coverage.source_copy_fingerprints.toLocaleString()} here and {coverage.candidate_copy_fingerprints.toLocaleString()} retrieved elsewhere.</p>
        {coverage.approximate_image_retrieval&&<p>Image retrieval is approximate and can miss matches. Every displayed candidate passed an image similarity check against the archived captures.</p>}
        <p>{coverage.source_captured_descriptions.toLocaleString()} source listings have captured description text. Text matching also uses original shop descriptions and policies. Translations and generated summaries do not count as shared wording.</p>
        <p>Only collected sellers are compared. This is not a complete search of marketplace inventories.</p>
        {coverage.image_pairs_truncated&&<p>The image match limit was reached. Additional matches may exist.</p>}
        {coverage.observations_truncated&&<p>Some older profile or contact observations were outside this comparison. The latest 40 profile facts and 80 contacts per listing were checked.</p>}
      </details>
      {similar_sellers.length===0?<div className="seller-similarity-empty"><Store size={23} aria-hidden /><h3>{intelligence.status==="not_analyzed"?"More seller evidence is needed":"No similar sellers found in the compared evidence"}</h3>
        <p>{intelligence.status==="not_analyzed"?"Contact details, captured profile text, and archived listing images will make comparisons possible as this seller is enriched.":"New captures can reveal more connections over time."}</p></div>
        :<div className="seller-similarity-list">{similar_sellers.map(match=><article className="seller-similarity-card" key={match.seller.key}>
          <header><div><Link to={sellerProfilePath(match.seller.key)!} className="seller-similar-name">{match.seller.name}</Link>
            <p>{match.seller.domain}<span>{match.cross_marketplace?"Different marketplace":"Same marketplace"}</span></p></div>
            <span className="seller-similarity-tag">{match.relationship==="shared_business_details"?"Shared business details":"Shared content"}</span></header>
          {match.matched_target_listings>0&&<p className="seller-overlap-count">Content overlaps across {match.matched_source_listings} of {coverage.source_listings_checked} compared listings here and {match.matched_target_listings} of {match.compared_target_listings} for this seller.</p>}
          <div className="seller-similarity-signals">{match.signals.map((signal,index)=><details key={index}><summary>{labels[signal.kind]}</summary><Evidence signal={signal}/></details>)}</div>
          {match.signal_count>match.signals.length&&<p className="seller-intelligence-note">Showing {match.signals.length} of {match.signal_count} captured evidence signals.</p>}
        </article>)}</div>}
      {intelligence.has_more&&<p className="seller-intelligence-note">Showing the first 12 leads. More evidence matches were found.</p>}
    </section>
  </div>;
}

function IntelligenceRequest({sellerKey,onRetry}:{sellerKey:string;onRetry:()=>void}) {
  const [data,setData]=useState<Intelligence|null>(null);
  const [error,setError]=useState("");
  const [missing,setMissing]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void getSellerIntelligence(sellerKey,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result.intelligence);})
      .catch(error=>{if(!controller.signal.aborted){if(isApiError(error,404))setMissing(true);else setError(error instanceof Error?error.message:"Could not load seller evidence.");}});
    return ()=>controller.abort();
  },[sellerKey]);
  if(missing)return null;
  if(data)return <SellerIntelligenceView intelligence={data}/>;
  return <section className="seller-intelligence-section seller-intelligence-loading" aria-label="Seller profile evidence" aria-busy={!error}>
    {error?<><p role="alert">{error}</p><button type="button" onClick={onRetry}><RefreshCw size={14} aria-hidden />Retry</button></>
      :<><Loader2 size={16} className="animate-spin" aria-hidden /><p>Loading seller profile and comparisons…</p></>}</section>;
}
export function SellerIntelligence({sellerKey}:{sellerKey:string}) {
  const [attempt,setAttempt]=useState(0);
  return <IntelligenceRequest key={`${sellerKey}:${attempt}`} sellerKey={sellerKey} onRetry={()=>setAttempt(value=>value+1)}/>;
}
