import { useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import TakedownPanel from "../../TakedownPanel";
import {
  reenrichIpFinding,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type ProductGroupCorrectionReason,
} from "../../../api";
import { FindingActions, type FindingUpdateOptions } from "./FindingActions";
import { ListingCarousel } from "./ListingCarousel";
import { sellerProfilePath } from "../../../lib/sellers";
import { monitoringPlatformLabel } from "../../../lib/platforms";
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

export function FindingTechnicalDetails({ f }: { f: IpReviewFinding }) {
  const licensedSeller = !!f.licensed_seller || f.dismissal_reason === "licensed";
  const infringement = infringementTypeMeta(f.infringement_type);
  const licenseStatus = licenseStatusMeta(f.license_status, { licensedSeller });

  return (
    <details className="text-xs text-stone-400">
      <summary className="w-fit cursor-pointer select-none text-[11px] font-medium hover:text-stone-600">
        Technical details
      </summary>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
          sim {Math.round((f.similarity_score ?? 0) * 100)}%
        </span>
        {f.inliers != null && (
          <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">
            inliers {f.inliers}
          </span>
        )}
        {f.source_method && (
          <span
            className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${methodChip(f.source_method).cls}`}
            title={`Found via ${f.source_method}`}
          >
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
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600"
            title={infringement.title}
          >
            {infringement.label}
          </span>
        )}
        {licenseStatus && (
          <span
            className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-stone-100 text-stone-600"
            title={licenseStatus.title}
          >
            {licenseStatus.label}
          </span>
        )}
        {f.license_reasoning && (
          <span className="text-stone-500">· license: {f.license_reasoning}</span>
        )}
        {f.published_at && <span className="text-stone-400">· {f.published_at}</span>}
      </div>
    </details>
  );
}

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
  productGroupId,
  onCorrectProductGroup,
}: {
  f: IpReviewFinding;
  /** Resolved IP id for this finding (`f.ip_id ?? boardIpId`). */
  ipId?: string;
  /** Render the IP-name chip on the comparison header. */
  showIp?: boolean;
  isDismissed: boolean;
  isDismissing: boolean;
  onDismiss: (reason: MonitoringReviewOutcome, reasonCode?: MonitoringDismissReasonCode) => void;
  onActionComplete: () => void;
  onNeedsReview: () => void;
  onTakedownSent: () => void;
  onEnforced: () => void;
  onLicensed: (dismissedCount: number) => void;
  onUpdated: (opts?: FindingUpdateOptions) => void;
  productGroupId?: string;
  onCorrectProductGroup?: (reason: ProductGroupCorrectionReason) => Promise<void>;
}) {
  const sellerTarget = sellerProfilePath(f.seller_key);
  const [refreshing, setRefreshing] = useState(false);
  const [correctingProduct, setCorrectingProduct] = useState(false);
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
  const fullDescription = f.description_full_en || f.description_full;
  const hasTranslatedDescription = Boolean(
    f.description_full_en &&
    f.description_full &&
    f.description_full_en !== f.description_full,
  );

  const sb = findingStatusBadge(f);
  const actionability = actionabilityMeta(f.actionability);
  const authenticityLabel =
    f.authenticity_status === "likely_genuine"
      ? "Likely genuine"
      : f.authenticity_status === "likely_counterfeit"
        ? "Likely counterfeit"
        : f.authenticity_status === "unclear"
          ? "Authenticity unclear"
          : null;
  const authenticityConfidence =
    f.authenticity_confidence != null && Number.isFinite(f.authenticity_confidence)
      ? `${Math.round((f.authenticity_confidence <= 1
          ? f.authenticity_confidence * 100
          : f.authenticity_confidence))}%`
      : null;
  const sellerPriorEnforcement = f.seller_prior_enforcement_count ?? 0;
  const whyFlagged = findingFlaggedReason(f);
  const productAuthenticityAssessment = f.product_authenticity_assessment;
  const normalizedAvailability = f.availability?.trim().toLowerCase();
  const availabilityNotice =
    normalizedAvailability === "blocked"
      ? {
          label: "Couldn't verify",
          title: "The website blocked our latest automated check. This finding remains open and will be checked again.",
        }
      : normalizedAvailability === "error"
        ? {
            label: "Not yet verified",
            title: "We do not have a reliable availability result yet. This finding remains open.",
          }
        : null;
  const countryLabel = f.country || "Unknown";
  const countryTitle = f.location && f.location !== f.country ? `Raw location: ${f.location}` : undefined;
  const unitPriceUsd = f.price_value_usd == null ? null : Number(f.price_value_usd);
  const priceUsd =
    unitPriceUsd != null && Number.isFinite(unitPriceUsd)
      ? formatMoney(unitPriceUsd, "USD")
      : null;
  const primaryPrice = priceUsd ?? f.price ?? null;
  const nativePrice = priceUsd && f.price ? f.price : null;
  const advancedMenu = ipId ? (
    <details className="relative shrink-0">
      <summary
        aria-label="Advanced actions"
        title="Advanced actions"
        className="flex h-8 w-8 cursor-pointer select-none list-none items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-300 [&::-webkit-details-marker]:hidden"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-10 mt-1 rounded-md border border-stone-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          disabled={refreshing}
          title="Re-scrape the listing and re-run enrichment + bbox localization"
          onClick={async () => {
            if (refreshing || !ipId) return;
            setRefreshing(true);
            try {
              await reenrichIpFinding(ipId, f.result_id);
              onUpdated();
            } catch (e) {
              alert(e instanceof Error ? e.message : "Failed to refresh finding");
            } finally {
              setRefreshing(false);
            }
          }}
          className="h-7 whitespace-nowrap rounded-md border border-stone-200 bg-white px-2.5 text-xs font-medium leading-none text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        {productGroupId && f.case_id && onCorrectProductGroup && (
          <div className="mt-1 border-t border-stone-100 pt-1">
            <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">
              Correct product
            </p>
            <button
              type="button"
              disabled={correctingProduct}
              onClick={async () => {
                setCorrectingProduct(true);
                try {
                  await onCorrectProductGroup("wrong_product");
                } finally {
                  setCorrectingProduct(false);
                }
              }}
              className="block h-7 w-full whitespace-nowrap rounded-md px-2.5 text-left text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Not this product
            </button>
            <button
              type="button"
              disabled={correctingProduct}
              onClick={async () => {
                setCorrectingProduct(true);
                try {
                  await onCorrectProductGroup("different_variant");
                } finally {
                  setCorrectingProduct(false);
                }
              }}
              className="block h-7 w-full whitespace-nowrap rounded-md px-2.5 text-left text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Different variant
            </button>
          </div>
        )}
      </div>
    </details>
  ) : null;

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
          {f.manual_candidate_outcome && (
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700"
              title="Manually moved during grouped triage"
            >
              Moved
            </span>
          )}
          {availabilityNotice && (
            <span
              className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700"
              title={availabilityNotice.title}
            >
              {availabilityNotice.label}
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
        {advancedMenu && (
          <div className="shrink-0 flex items-center gap-1.5">
            {advancedMenu}
          </div>
        )}
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
            {sellerTarget ? (
              <Link to={sellerTarget} className="text-blue-700 hover:underline font-medium">
                {f.seller_name || "Seller profile"}
              </Link>
            ) : (
              <span className="font-medium text-stone-600">{f.seller_name}</span>
            )}
          </span>
          {f.seller_url && (
            <a href={f.seller_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
              {monitoringPlatformLabel(f.domain)} <ExternalLink size={12} />
            </a>
          )}
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

      <a
        href={f.page_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
        title="Open listing"
      >
        <ExternalLink size={16} aria-hidden="true" />
        Open listing
      </a>

      {productAuthenticityAssessment &&
        productAuthenticityAssessment.rule_assessments.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-bold text-stone-900">Product authenticity checks</h3>
            <span className="text-[10px] font-semibold text-stone-500">
              {productAuthenticityAssessment.rule_assessments.length} checked
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {productAuthenticityAssessment.rule_assessments.map((assessment) => {
              const verdict = assessment.verdict === "violated"
                ? { label: "Failed", cls: "bg-red-50 text-red-700" }
                : assessment.verdict === "satisfied"
                  ? { label: "Passed", cls: "bg-emerald-50 text-emerald-700" }
                  : assessment.verdict === "not_visible"
                    ? { label: "Not visible", cls: "bg-stone-200 text-stone-700" }
                    : { label: "Unclear", cls: "bg-amber-50 text-amber-800" };
              return (
                <div key={`${assessment.rule_id}:${assessment.rule_version}`} className="rounded-md bg-white px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${verdict.cls}`}>
                      {verdict.label}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {Math.round(assessment.confidence * 100)}% confidence
                    </span>
                    {assessment.failure_action === "takedown" && (
                      <span className="text-[9px] font-semibold text-red-600">
                        decisive check
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-semibold leading-5 text-stone-800">
                    {assessment.expected_feature}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    {assessment.evidence || assessment.reasoning ||
                      "The available listing evidence was not enough to explain this result."}
                  </p>
                  {assessment.evidence_image_positions.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-stone-400">
                      Listing photo{assessment.evidence_image_positions.length === 1 ? "" : "s"}{" "}
                      {assessment.evidence_image_positions.map((position) => position + 1).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-stone-500">
            “Not visible” means the listing did not show enough evidence. It is
            not treated as a failed check.
          </p>
        </section>
      )}

      {(whyFlagged || actionability.reason || authenticityLabel ||
        f.offer_subject === "packaging_only" || f.authenticity_reasoning) && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Rationale
          </summary>
          <div className="mt-1.5 space-y-1.5 leading-relaxed">
            {(authenticityLabel || f.offer_subject === "packaging_only") && (
              <div className="flex flex-wrap items-center gap-1.5">
                {authenticityLabel && (
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-600">
                    {authenticityLabel}{authenticityConfidence && ` · ${authenticityConfidence}`}
                  </span>
                )}
                {f.offer_subject === "packaging_only" && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 font-semibold text-purple-700">
                    Packaging only
                  </span>
                )}
              </div>
            )}
            {f.authenticity_reasoning && (
              <p>
                <span className="font-semibold text-stone-500">Authenticity: </span>
                {f.authenticity_reasoning}
              </p>
            )}
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

      {fullDescription && fullDescription !== f.description_summary && (
        <details className="text-sm text-stone-500">
          <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
            Full description
          </summary>
          <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{fullDescription}</p>
          {hasTranslatedDescription && (
            <details className="mt-2 border-l-2 border-stone-200 pl-3">
              <summary className="cursor-pointer text-stone-400 hover:text-stone-600 select-none">
                View original{f.description_language ? ` (${f.description_language.toUpperCase()})` : ""}
              </summary>
              <p className="mt-1.5 leading-relaxed whitespace-pre-wrap">{f.description_full}</p>
            </details>
          )}
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

        </div>
      </div>

      {/* Triage sends the first takedown from the row header; surface its thread
          here once a request exists. */}
      {f.case_id && ["takedown_sent", "enforced"].includes(
        (f.dismissed_at ? "dismissed" : f.review_status) ?? "",
      ) && (
        <div className="border-t border-stone-200 pt-3 space-y-4">
          <TakedownPanel
            caseId={f.case_id}
            ipId={f.ip_id}
            platform={f.domain}
            compact
            onStatusChange={onUpdated}
          />
        </div>
      )}
    </div>
  );
}
