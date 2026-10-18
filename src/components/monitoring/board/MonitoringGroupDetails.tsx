import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Box, Store, X } from "lucide-react";
import type { MonitoringListingGroup, MonitoringGroupFinding } from "../../../lib/monitoringGrouping";
import { sellerProfilePath } from "../../../lib/sellers";
import { useOutsideDismiss } from "../../../hooks/useOutsideDismiss";
import { APP_SHELL_OVERLAY_TOP } from "../../appShellLayout";
import { getMonitoringSellerProfile, type MonitoringSellerProfilePage } from "../../../api";
import { SellerSales } from "../../../features/sellers/SellerSales";
import { MarketplaceMark } from "../../MarketplaceMark";
import { monitoringPlatformLabel } from "../../../lib/platforms";
import "./FindingInspector.css";

export function MonitoringGroupDetails({ group, sellerFiltered = false, onClose, onFilter, scope = "loaded" }: {
  group: MonitoringListingGroup<MonitoringGroupFinding>;
  sellerFiltered?: boolean;
  onClose: () => void;
  onFilter?: () => void;
  scope?: "loaded" | "page";
}) {
  const panel = useRef<HTMLElement>(null);
  useOutsideDismiss(panel, onClose, ".monitoring-group-control");
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("keydown", escape); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, [onClose]);
  const seller = group.kind === "seller";
  const sellerPath = sellerProfilePath(group.sellerKey);
  const destination = seller ? sellerPath && `${sellerPath}${group.ipId ? `?${new URLSearchParams({ ip_id: group.ipId })}` : ""}`
    : group.productId ? `/monitoring/products?${new URLSearchParams({ group: group.productId, ...(group.ipId ? { ip_id: group.ipId } : {}) })}` : null;
  const domains = [...new Set(group.findings.map((finding) => finding.domain))];
  const sellers = new Set(group.findings.map((finding) => finding.seller_key).filter(Boolean)).size;
  return <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none flex justify-end" style={{ top: APP_SHELL_OVERLAY_TOP }}>
    <aside ref={panel} role="dialog" aria-modal="false" aria-label={`${seller ? "Seller" : "Product"} details`} tabIndex={-1}
      className="finding-inspector monitoring-group-inspector pointer-events-auto focus:outline-none">
      <header className="finding-inspector-header">
        <div className="finding-inspector-label">{seller ? <Store size={16} aria-hidden /> : <Box size={16} aria-hidden />}<span>{seller ? "Seller" : "Product"} details</span></div>
        <button type="button" className="finding-inspector-close" aria-label="Close group details" onClick={onClose}><X size={18} aria-hidden /></button>
      </header>
      <div className="finding-inspector-scroll monitoring-group-detail-body">
        <h2>{group.label}</h2>
        <p>{group.findings.length} matching {group.findings.length === 1 ? "task" : "tasks"} {scope === "page" ? "on this page" : "in the loaded results"}</p>
        <dl><div><dt>Sources</dt><dd className="monitoring-marketplace-list">{domains.map((domain) => <span key={domain} className="monitoring-marketplace"><MarketplaceMark source={{ domain, name: monitoringPlatformLabel(domain) }} /><span>{monitoringPlatformLabel(domain)}</span></span>)}</dd></div>{!seller && <div><dt>Identified sellers</dt><dd>{sellers}</dd></div>}</dl>
        {seller && group.sellerKey && <SellerDetailsFacts key={`${group.sellerKey}:${group.ipId}`} sellerKey={group.sellerKey} ipId={group.ipId} />}
        {destination && <div className="monitoring-group-detail-actions">
          {sellerFiltered ? <span role="status">Task list filtered to this seller</span>
            : onFilter && <button type="button" onClick={onFilter}>Filter to this {seller ? "seller" : "product"}</button>}
          <Link to={destination}>{seller ? "Seller profile & history" : "Product grouping & rules"}</Link>
        </div>}
        <p className="monitoring-group-detail-note">{scope === "page" ? "Counts cover tasks on this page. Other pages may contain more tasks in this group." : "Counts cover loaded tasks matching the current filters. Load more to expand this group."} Each task keeps its own evidence, assignment, and review decision.</p>
      </div>
    </aside>
  </div>;
}

function SellerDetailsFacts({ sellerKey, ipId }: { sellerKey: string; ipId: string | null }) {
  const [profile, setProfile] = useState<MonitoringSellerProfilePage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void getMonitoringSellerProfile(sellerKey, { ip_id: ipId, status: "all", limit: 1, signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) setProfile(value); })
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load seller information."); });
    return () => controller.abort();
  }, [sellerKey, ipId]);
  if (error) return <p role="alert">Could not load seller information. {error}</p>;
  if (!profile) return <p role="status">Loading seller information…</p>;
  const { seller, summary } = profile;
  return <section aria-label="Seller overview">
    <h3>Seller overview</h3>
    <dl>
      {seller.location && <div><dt>Location</dt><dd>{seller.location}</dd></div>}
      {seller.rating != null && <div><dt>Rating</dt><dd>{seller.rating.toFixed(1)}{seller.rating_count != null && ` (${seller.rating_count.toLocaleString()} reviews)`}</dd></div>}
      {seller.sales != null && <div><dt>Sales</dt><dd><SellerSales count={seller.sales} observation={seller.sales_observation} /></dd></div>}
      {seller.years_active != null && <div><dt>Years active</dt><dd>{seller.years_active}</dd></div>}
      <div><dt>Prior enforcement</dt><dd>{summary.prior_enforcement_count.toLocaleString()}</dd></div>
      <div><dt>Returned listings</dt><dd>{summary.returned_listing_count.toLocaleString()}</dd></div>
    </dl>
    {seller.profile_url && <a href={seller.profile_url} target="_blank" rel="noreferrer" className="monitoring-seller-shop">Marketplace shop ↗</a>}
  </section>;
}
