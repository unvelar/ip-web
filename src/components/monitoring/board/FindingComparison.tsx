import { ExternalLink } from "lucide-react";
import TakedownPanel from "../../TakedownPanel";
import CaseComments from "../../CaseComments";
import type { IpReviewFinding, MonitoringReviewOutcome } from "../../../api";
import { ActionabilityBadge } from "./ActionabilityBadge";
import { FindingActions, type FindingUpdateOptions } from "./FindingActions";
import { ListingCarousel } from "./ListingCarousel";
import {
  actionabilityMeta,
  dismissalBadge,
  findingFlaggedReason,
  findingStatusBadge,
  formatAgo,
  formatMoney,
  infringementTypeMeta,
  licenseStatusMeta,
  matchMethodChip,
  methodChip,
} from "./utils";

export function FindingComparison({
  f,
  ipId,
  showIp,
  isDismissed,
  isDismissing,
  onDismiss,
  onActionComplete,
  onNeedsReview,
  onTakedownSent,
  onEnforced,
  onLicensed,
  onUpdated,
}: {
  f: IpReviewFinding;
  /** Resolved IP id for this finding (`f.ip_id ?? boardIpId`). */
  ipId?: string;
  /** Render the IP-name chip on the comparison header. */
  showIp?: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onDismiss: (reason: MonitoringReviewOutcome) => void;
  onActionComplete: () => void;
  onNeedsReview: () => void;
  onTakedownSent: () => void;
  onEnforced: () => void;
  onLicensed: (dismissedCount: number) => void;
  onUpdated: (opts?: FindingUpdateOptions) => void;
}) {
  const similarity = f.similarity_score ?? f.enforcement_priority;
  const similarityLabel = Number.isFinite(similarity)
    ? `${Math.round(similarity * 100)}% sim`
    : "sim unknown";
  const licensedSeller = !!f.licensed_seller || f.dismissal_reason === "licensed";
  const canLicense = !!ipId && (!!f.seller_name || !!f.seller_url) && !licensedSeller;
  // Enrichment hit a reCAPTCHA / bot-wall — the screenshot is the challenge
  // page, not the listing.
  const isChallenge = /recaptcha|bot-wall/i.test(f.enrichment_error || "");
  const noListingDetails =
    !f.listing_title && !f.seller_name && !f.match_explanation && !f.description_summary;
  const inactiveListing =
    f.dismissal_reason?.startsWith("dead") || f.availability?.startsWith("dead");

  const sb = findingStatusBadge(f);
  const actionability = actionabilityMeta(f.actionability);
  const infringement = infringementTypeMeta(f.infringement_type);
  const licenseStatus = licenseStatusMeta(f.license_status, { licensedSeller });
  const sellerPriorEnforcement = f.seller_prior_enforcement_count ?? 0;
  const whyFlagged = findingFlaggedReason(f);
  const countryLabel = f.country || "Unknown";
  const countryTitle = f.location && f.location !== f.country ? `Raw location: ${f.location}` : undefined;
  const unitPriceUsd = f.price_value_usd == null ? null : Number(f.price_value_usd);
  const priceUsd =
    unitPriceUsd != null && Number.isFinite(unitPriceUsd)
      ? formatMoney(unitPriceUsd, "USD")
      : null;
  const primaryPrice = priceUsd ?? f.price ?? null;
  const nativePrice = priceUsd && f.price ? f.price : null;

  return (
    // Cap + center the content so the panel doesn't sprawl edge-to-edge on wide
    // monitors (which left short text lines + the comment box floating in white).
    <div className="space-y-2.5 max-w-6xl mx-auto">
      {/* Top meta strip — status · IP · source · key flags. Similarity remains
          available, but review decisions should lead with listing economics. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex items-center gap-x-2 gap-y-1 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sb.cls}`}>
            {sb.label}
          </span>
          <ActionabilityBadge
            label={actionability.label}
            reason={actionability.reason}
            className="shrink-0 gap-1"
            badgeClassName={`px-2 py-0.5 rounded-full text-[11px] font-bold ${actionability.cls}`}
            iconClassName="h-4 w-4"
          />
          {f.manual_candidate_outcome && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {showIp && f.ip_name && (
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold">
              {f.ip_name}
            </span>
          )}
          <span className="text-[11px] text-stone-500 truncate">
            <span className="uppercase tracking-wide text-stone-400">on </span>
            <span className="font-semibold text-stone-700">{f.domain}</span>
          </span>
          <span
            className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 text-[10px] font-semibold tabular-nums"
            title="Visual/text similarity"
          >
            {similarityLabel}
          </span>
          {isChallenge && (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-red-100 text-red-700"
              title="Listing-page enrichment was blocked by a bot-wall / reCAPTCHA — details deferred to a later run"
            >
              challenge
            </span>
          )}
          {isDismissed && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${dismissalBadge(f.dismissal_reason).cls}`}>
              {dismissalBadge(f.dismissal_reason).label}
            </span>
          )}
        </div>
        <a
          href={f.page_url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 hover:text-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
          title="Open listing"
        >
          <ExternalLink size={13} aria-hidden="true" />
          Open listing
        </a>
      </div>

      {/* Primary triage actions — keep them immediately below the opened table
          row/meta strip so decision controls appear before image + details. */}
      <div className="border-y border-stone-200 py-2">
        <FindingActions
          f={f}
          ipId={ipId}
          canLicense={canLicense}
          isDismissed={isDismissed}
          isDismissing={isDismissing}
          onDismiss={onDismiss}
          onActionComplete={onActionComplete}
          onNeedsReview={onNeedsReview}
          onTakedownSent={onTakedownSent}
          onEnforced={onEnforced}
          onLicensed={onLicensed}
          onUpdated={onUpdated}
        />
      </div>

      {/* Two-column body: bounded image left, enrichment data right. Collapses
          to a single column below lg. */}
      <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-x-4 gap-y-3 lg:items-stretch">
        {/* LEFT — single image carousel. Page screenshot is the first slide
            when captured; product photos follow (best-matched marked).
            min-w-0 so the thumb strip scrolls instead of widening the track. */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <ListingCarousel f={f} ipId={ipId} />
        </div>

        {/* RIGHT — enrichment data. */}
        <div className="flex flex-col space-y-2.5 min-w-0">

      {/* Listing context (from VLM enrichment) — what's on sale, type, where */}
      {f.listing_title && (
        <h3 className="text-base font-bold text-stone-900 leading-snug">{f.listing_title}</h3>
      )}

      {primaryPrice && (
        <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="text-[10px] uppercase font-semibold text-stone-400">Listing price</div>
          <div className="mt-0.5 flex items-baseline gap-x-2 gap-y-1 flex-wrap">
            <span className="text-2xl font-bold tabular-nums text-stone-950 leading-none">
              {primaryPrice}
            </span>
            {nativePrice && (
              <span className="text-sm text-stone-500">
                listed {nativePrice}
              </span>
            )}
          </div>
          {f.shipping_price && (
            <div className="mt-1 text-sm text-stone-500">
              + {f.shipping_price} delivery
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap text-sm">
        {!primaryPrice && f.shipping_price && (
          <span className="text-stone-500" title="Shipping">Shipping: {f.shipping_price}</span>
        )}
        <span
          className={`px-1.5 py-0.5 rounded font-semibold ${
            f.country ? "bg-stone-100 text-stone-600" : "bg-amber-50 text-amber-700"
          }`}
          title={countryTitle}
        >
          Country: {countryLabel}
        </span>
        {f.quantity_available != null && f.quantity_available > 0 && (
          f.quantity_available <= 5 ? (
            <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-semibold" title="Stock left">
              Only {f.quantity_available} left
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600" title="Stock available">
              {f.quantity_available.toLocaleString()} in stock
            </span>
          )
        )}
        {f.quantity_in_carts != null && f.quantity_in_carts > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold" title="Active demand">
            {f.quantity_in_carts} in carts
          </span>
        )}
      </div>

      {(f.seller_name || f.seller_url) && (
        <div className="text-sm text-stone-500 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
          <span>
            <span className="text-stone-400">Seller: </span>
            {f.seller_url ? (
              <a href={f.seller_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline font-medium">
                {f.seller_name || f.seller_url}
              </a>
            ) : (
              <span className="font-medium text-stone-600">{f.seller_name}</span>
            )}
          </span>
          {f.seller_rating != null && (
            <span>
              ★ <span className="font-semibold text-stone-600">{Number(f.seller_rating).toFixed(1)}</span>
              {f.seller_rating_count != null && f.seller_rating_count > 0 && (
                <span className="text-stone-400"> ({Number(f.seller_rating_count).toLocaleString()})</span>
              )}
            </span>
          )}
          {f.seller_sales != null && f.seller_sales > 0 && (
            <span>· {f.seller_sales.toLocaleString()} sales</span>
          )}
          {f.seller_years_active != null && f.seller_years_active > 0 && (
            <span>· {f.seller_years_active}y</span>
          )}
          {sellerPriorEnforcement > 0 && (
            <span className="font-semibold text-red-700">
              · {sellerPriorEnforcement} prior takedown/enforced
            </span>
          )}
        </div>
      )}

      {(whyFlagged || actionability.reason) && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Rationale
          </summary>
          <div className="mt-1.5 space-y-1.5 leading-relaxed">
            {whyFlagged && (
              <p>
                <span className="font-semibold text-stone-500">Why flagged: </span>
                {whyFlagged}
              </p>
            )}
            {actionability.reason && (
              <p>
                <span className="font-semibold text-stone-500">Why recommended: </span>
                {actionability.reason}
              </p>
            )}
          </div>
        </details>
      )}

      {f.description_summary && (
        <p className="text-sm text-stone-500 leading-relaxed">{f.description_summary}</p>
      )}

      {f.description_full && f.description_full !== f.description_summary && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Full description
          </summary>
          <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{f.description_full}</p>
        </details>
      )}

      {f.item_details && Object.keys(f.item_details).length > 0 && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Item details ({Object.keys(f.item_details).length})
          </summary>
          <dl className="mt-1.5 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            {Object.entries(f.item_details).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-stone-400 truncate max-w-[10rem]">{k}</dt>
                <dd className="text-stone-600 break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {noListingDetails && (
        <p className="text-sm text-stone-400 italic">
          {inactiveListing
            ? "Listing is inactive; no current listing details available."
            : f.enrichment_error
              ? `Listing details unavailable: ${f.enrichment_error}`
              : "Listing details still being analysed…"}
        </p>
      )}

      {/* Footer meta — reviewer-relevant timestamps. */}
      <div className="flex items-center gap-2 flex-wrap text-xs text-stone-400">
        <span>found {new Date(f.found_at).toLocaleDateString()}</span>
        {f.last_checked_at && (
          <span title={new Date(f.last_checked_at).toLocaleString()}>
            · last visit {formatAgo(f.last_checked_at)}
          </span>
        )}
      </div>

      {/* Signals — developer-facing match diagnostics, collapsed by default so
          they don't crowd the reviewer's primary scan. */}
      <details className="text-xs text-stone-400">
        <summary className="cursor-pointer hover:text-stone-600 select-none">Signals</summary>
        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">sim {Math.round((f.similarity_score ?? 0) * 100)}%</span>
          {f.inliers != null && (
            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">inliers {f.inliers}</span>
          )}
          {f.source_method && (
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${methodChip(f.source_method).cls}`} title={`Found via ${f.source_method}`}>
              {methodChip(f.source_method).label}
            </span>
          )}
          {f.match_method && (
            <span
              className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${matchMethodChip(f.match_method).cls}`}
              title={matchMethodChip(f.match_method).title}
            >
              {matchMethodChip(f.match_method).label}
            </span>
          )}
          {f.vlm_verdict && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600">
              vlm: {f.vlm_verdict}
              {f.vlm_confidence != null && `@${Math.round(f.vlm_confidence * 100)}%`}
            </span>
          )}
          {infringement && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600" title={infringement.title}>
              {infringement.label}
            </span>
          )}
          {licenseStatus && (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600" title={licenseStatus.title}>
              {licenseStatus.label}
            </span>
          )}
          {f.license_reasoning && (
            <span className="text-stone-500">· license: {f.license_reasoning}</span>
          )}
          {f.published_at && <span className="text-stone-400">· {f.published_at}</span>}
        </div>
      </details>

        </div>
      </div>

      {/* Takedown thread + discussion — inlined here so the email flow, reply
          thread, and case comments live with the finding instead of on a separate
          case page. Triage sends the first takedown straight from the row header
          (Send takedown); this panel surfaces the thread once a request exists.
          Comments show whenever a case exists. */}
      {f.case_id && (
        <div className="border-t border-stone-200 pt-3 space-y-4">
          {["takedown_sent", "enforced"].includes(
            (f.dismissed_at ? "dismissed" : f.review_status) ?? "",
          ) && (
            <TakedownPanel
              caseId={f.case_id}
              ipId={f.ip_id}
              platform={f.domain}
              compact
              onStatusChange={onUpdated}
            />
          )}
          <CaseComments caseId={f.case_id} compact />
        </div>
      )}
    </div>
  );
}
