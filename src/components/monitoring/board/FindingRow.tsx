import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { IpReviewFinding } from "../../../api";
import { sellerProfilePath } from "../../../lib/sellers";
import { actionabilityMeta, compactListingTitle, findingPlatformLabel, formatMoney, hasReviewAnalysis, statusBadge, tableImageUrls } from "./utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function FindingTableThumbnail({ urls, title }: { urls: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const src = urls[index];
  if (!src) return (
    <span className="monitoring-listing-thumbnail" role="img" aria-label="No listing image">
      <ImageOff size={18} aria-hidden="true" className="text-stone-300" />
    </span>
  );
  return (
    <a href={src} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}
      className="monitoring-listing-thumbnail focus-visible:outline-2 focus-visible:outline-stone-500"
      title="Open listing image">
      <img src={src} alt={`${title} listing image`} className="h-full w-full object-contain"
        loading="lazy" decoding="async" referrerPolicy="no-referrer"
        onError={() => setIndex((current) => current + 1)} />
    </a>
  );
}

function suggestedAction(f: IpReviewFinding) {
  const actionability = actionabilityMeta(f.actionability);
  const outcome = f.manual_candidate_outcome ?? f.suggested_review_outcome;
  // Actionability incorporates seller licenses and resale evidence. Keep those
  // safeguards ahead of a candidate bucket, and describe actions rather than
  // presenting a model's infringement assessment as an established fact.
  switch (actionability.key) {
    case "licensed_seller": return { label: "Licensed seller", reason: actionability.reason };
    case "allowed_resale": return { label: "Second hand", reason: actionability.reason };
    case "send_takedown": return { label: "Takedown recommended", reason: actionability.reason };
    case "false_positive": return { label: "Different product", reason: actionability.reason };
    default:
      return outcome === "do_not_pursue"
        ? { label: "Do not pursue", reason: f.suggested_review_reason || actionability.reason }
        : { label: "Needs review", reason: actionability.reason };
  }
}

/** The enclosing row owns selection and inspector activation. */
export function FindingRow({ f, active, showIp, showStatus }: { f: IpReviewFinding; active: boolean; showIp?: boolean; showStatus?: boolean }) {
  const title = compactListingTitle(f);
  const images = tableImageUrls(f);
  const seller = f.seller_name?.trim() || "Unknown seller";
  const sellerTarget = sellerProfilePath(f.seller_key);
  const platform = findingPlatformLabel(f);
  const recommendation = suggestedAction(f);
  const status = f.dismissed_at ? "Dismissed"
    : (!f.ready_for_review || !hasReviewAnalysis(f)) && (f.review_status ?? "pending") === "pending"
      ? "Preparing" : statusBadge(f.review_status).label;
  const price = f.price_value_usd == null ? null : Number(f.price_value_usd);
  const hasUsdPrice = price != null && Number.isFinite(price) && price >= 0;
  const nativePrice = f.price || (f.price_value != null && Number.isFinite(Number(f.price_value)) && f.price_currency
    ? formatMoney(Number(f.price_value), f.price_currency) : null);
  const priceTooltip = [
    nativePrice ? `Listed ${nativePrice}` : null,
    hasUsdPrice ? "Price in USD" : "USD price unavailable",
  ].filter(Boolean).join(" · ");

  return <>
    <td className="monitoring-listing-cell">
      <div className="monitoring-listing-main" data-active={active || undefined}>
        <FindingTableThumbnail key={images.join("|")} urls={images} title={title} />
        <div className="monitoring-listing-copy">
          <span className="monitoring-listing-title" title={title}>{title}</span>
          <div className="monitoring-listing-meta">
            {sellerTarget ? <Link to={sellerTarget} onClick={(event) => event.stopPropagation()}
              className="hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-stone-500">{seller}</Link> : <span>{seller}</span>}
            <span aria-hidden="true"> · </span><span>{platform}</span>
            {showIp && f.ip_name && <><span aria-hidden="true"> · </span><span>{f.ip_name}</span></>}
            {showStatus && <><span aria-hidden="true"> · </span><span>{status}</span></>}
          </div>
        </div>
      </div>
    </td>
    <td className="monitoring-listing-price" title={priceTooltip}>
      {hasUsdPrice ? usd.format(price) : <span aria-label="USD price unavailable">—</span>}
    </td>
    <td className="monitoring-listing-assessment" title={recommendation.reason}>
      {recommendation.label}
    </td>
  </>;
}
