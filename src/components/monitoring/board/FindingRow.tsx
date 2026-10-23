import { ImageOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { IpReviewFinding } from "../../../api";
import { sellerProfilePath } from "../../../lib/sellers";
import { monitoringRecommendation } from "../../../lib/monitoringRecommendation";
import { MarketplaceMark } from "../../MarketplaceMark";
import { compactListingTitle, findingPlatformLabel, formatMoney, hasReviewAnalysis, statusBadge, tableImageUrls } from "./utils";

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

/** The enclosing row owns selection and inspector activation. */
export function FindingRow({ f, active, showIp, showStatus, onEntityOpen }: { f: IpReviewFinding; active: boolean; showIp?: boolean; showStatus?: boolean; onEntityOpen?: (kind: "seller" | "product", finding: IpReviewFinding) => void }) {
  const title = compactListingTitle(f);
  const images = tableImageUrls(f);
  const seller = f.seller_name?.trim() || "Unknown seller";
  const sellerTarget = sellerProfilePath(f.seller_key);
  const platform = findingPlatformLabel(f);
  const recommendation = monitoringRecommendation(f);
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
            {onEntityOpen ? <button type="button" className="monitoring-entity-link" onClick={(event) => { event.stopPropagation(); onEntityOpen("seller", f); }}>{seller}</button> : sellerTarget ? <Link to={sellerTarget} onClick={(event) => event.stopPropagation()}
              className="hover:text-stone-900 hover:underline focus-visible:outline-2 focus-visible:outline-stone-500">{seller}</Link> : <span>{seller}</span>}
            <span aria-hidden="true"> · </span><span className="monitoring-marketplace" title={platform}><MarketplaceMark source={{ domain: f.domain, name: platform }} /><span>{platform}</span></span>
            {f.product_identity && <><span aria-hidden="true"> · </span>{onEntityOpen ? <button type="button" className="monitoring-entity-link" onClick={(event) => { event.stopPropagation(); onEntityOpen("product", f); }}>{f.product_identity.display_name}</button> : <span>{f.product_identity.display_name}</span>}</>}
            {showIp && f.ip_name && <><span aria-hidden="true"> · </span><span>{f.ip_name}</span></>}
            {showStatus && <><span aria-hidden="true"> · </span><span>{status}</span></>}
          </div>
        </div>
      </div>
    </td>
    <td className="monitoring-listing-price" title={priceTooltip}>
      {hasUsdPrice ? usd.format(price) : <span aria-label="USD price unavailable">—</span>}
    </td>
    <td className="monitoring-listing-assessment" title={recommendation.reason}
      aria-label={recommendation.label ? undefined : recommendation.assessmentLabel}>
      {recommendation.label ?? recommendation.assessmentLabel}
    </td>
  </>;
}
