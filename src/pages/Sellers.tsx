import { Fragment, useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Search,
  ShieldAlert,
  Store,
  X,
} from "lucide-react";
import {
  listMonitoringSellers,
  type MonitoringSellerListStatus,
  type MonitoringSellerSummary,
  type MonitoringSellersPage,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { useActiveIp } from "../context/ActiveIpContext";
import { monitoringPlatformLabel } from "../lib/platforms";
import { sellerProfilePath } from "../lib/sellers";
import { SellerListings } from "../components/monitoring/SellerListings";
import { SellerSales } from "../components/monitoring/SellerSales";
import { formatAgo, formatMoney } from "../components/monitoring/board/utils";
import "./Sellers.css";

const STATUS_OPTIONS: Array<{
  value: MonitoringSellerListStatus;
  label: string;
}> = [
  { value: "open", label: "Open sellers" },
  { value: "returned", label: "Returned sellers" },
  { value: "all", label: "All history" },
];

function sellerListStatus(value: string | null): MonitoringSellerListStatus {
  return value === "returned" || value === "all" ? value : "open";
}

function withQuery(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export default function Sellers() {
  const { actingTenantId } = useAuth();
  const { ips, activeIpId, selectIp, loading: loadingIps } = useActiveIp();
  const [params, setParams] = useSearchParams();
  const status = sellerListStatus(params.get("status"));
  const query = params.get("q") ?? "";
  const platform = params.get("platform") ?? "";
  const allIps = params.get("scope") === "all";
  const effectiveIpId = allIps ? null : activeIpId;
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [page, setPage] = useState<MonitoringSellersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (loadingIps) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void listMonitoringSellers({
      status,
      ip_id: effectiveIpId,
      platform: platform.trim() || null,
      query: debouncedQuery || null,
      signal: controller.signal,
    })
      .then(setPage)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPage(null);
        setError(caught instanceof Error ? caught.message : "Unable to load sellers.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [actingTenantId, allIps, debouncedQuery, effectiveIpId, loadingIps, platform, status]);

  const platformOptions = useMemo(() => Array.from(new Set([
    ...(platform ? [platform] : []),
    ...(page?.platforms ?? []),
  ])).sort(), [page?.platforms, platform]);
  const returnedSellers = page?.sellers.filter((seller) => seller.returned_listing_count > 0) ?? [];
  const otherSellers = page?.sellers.filter((seller) => seller.returned_listing_count === 0) ?? [];
  const returnedSellerCount = page?.returned_seller_count ?? 0;

  function updateParam(key: string, value: string | null, defaultValue?: string) {
    const next = new URLSearchParams(params);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === "q" });
  }

  function updateIp(value: string) {
    if (value === "all") {
      updateParam("scope", "all");
      return;
    }
    selectIp(value);
    updateParam("scope", null);
  }

  async function loadMore() {
    if (!page?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listMonitoringSellers({
        status,
        ip_id: effectiveIpId,
        platform: platform.trim() || null,
        query: debouncedQuery || null,
        cursor: page.next_cursor,
      });
      setPage((current) => current ? {
        ...next,
        sellers: [...current.sellers, ...next.sellers],
      } : next);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to load more sellers.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="sellers-page">
      <header className="sellers-header">
        <div className="sellers-title">
          <h1>Sellers</h1>
          {page && <span className="sellers-count">{page.total_sellers.toLocaleString()}</span>}
        </div>
        <p>Track marketplace accounts and review their listings.</p>
      </header>

      {returnedSellerCount > 0 && (
        <section className="sellers-notice" aria-label="Returned sellers">
          <ShieldAlert size={18} aria-hidden />
          <p><strong>{returnedSellerCount} {returnedSellerCount === 1 ? "seller has" : "sellers have"} returned.</strong>{" "}
            New listings found after a previous takedown.
          </p>
          {status !== "returned" && (
            <button type="button" onClick={() => updateParam("status", "returned")}>
              Review <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </section>
      )}

      <nav className="sellers-tabs" aria-label="Seller status">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={status === option.value}
            onClick={() => updateParam("status", option.value, "open")}
          >
            {option.label}
            {option.value === "returned" && returnedSellerCount > 0 && (
              <span className="sellers-returned-count">{returnedSellerCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sellers-toolbar">
        <div className="sellers-search">
          <Search size={16} aria-hidden />
          <input
            value={query}
            onChange={(event) => updateParam("q", event.target.value)}
            placeholder="Search sellers…"
            aria-label="Search sellers"
            type="search"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => updateParam("q", null)}>
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <div className="sellers-filters">
          <select
            value={allIps || !activeIpId ? "all" : activeIpId}
            onChange={(event) => updateIp(event.target.value)}
            disabled={loadingIps}
            aria-label="Filter sellers by IP"
          >
            <option value="all">All IPs</option>
            {ips.map((ip) => <option key={ip.id} value={ip.id}>{ip.name}</option>)}
          </select>
          <select
            value={platform}
            onChange={(event) => updateParam("platform", event.target.value)}
            aria-label="Filter sellers by marketplace"
          >
            <option value="">All marketplaces</option>
            {platformOptions.map((domain) => (
              <option key={domain} value={domain}>{monitoringPlatformLabel(domain)}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="sellers-error" role="alert">{error}</div>}

      <div key={`${actingTenantId}:${effectiveIpId}:${status}`} className="sellers-results" aria-busy={loading}>
        {loading ? (
          <SellerListSkeleton />
        ) : !page || page.sellers.length === 0 ? (
          <div className="sellers-empty">
            <Store size={25} aria-hidden />
            <h2>{error ? "Sellers could not be loaded" : status === "returned" && !query && !platform ? "No returned sellers" : "No sellers found"}</h2>
            <p>{error ? "Please try again in a moment." : status === "returned" && !query && !platform
              ? "No new listings found after a previous takedown in this view."
              : "Try a different search, marketplace, or IP."}</p>
          </div>
        ) : (
          <>
            {returnedSellers.length > 0 && (
              <SellerSection title="Returned sellers" sellers={returnedSellers} ipId={effectiveIpId} listStatus={status} returned />
            )}
            {otherSellers.length > 0 && (
              <SellerSection
                title={returnedSellers.length > 0 ? "Other sellers" : status === "all" ? "Seller history" : "Sellers with open listings"}
                sellers={otherSellers}
                ipId={effectiveIpId} listStatus={status}
              />
            )}
            <footer className="sellers-footer">
              <span role="status">Showing {page.sellers.length.toLocaleString()} of {page.total_sellers.toLocaleString()} sellers</span>
              {page.next_cursor && (
                <button type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                  {loadingMore ? "Loading…" : "Load more sellers"}
                </button>
              )}
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function SellerSection({ title, sellers, ipId, listStatus, returned = false }: {
  title: string;
  sellers: MonitoringSellerSummary[];
  ipId: string | null;
  listStatus: MonitoringSellerListStatus;
  returned?: boolean;
}) {
  return (
    <section className="sellers-section" aria-label={title}>
      {returned && <h2 className="sellers-section-label">New listings after takedown</h2>}
      <table className="sellers-table">
        <caption className="sr-only">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Seller</th>
            <th scope="col">Open listings</th>
            <th scope="col">Exposure <span>USD</span></th>
            <th scope="col">Takedowns</th>
            <th scope="col">Latest finding</th>
            <th scope="col"><span className="sr-only">Expand listings</span></th>
          </tr>
        </thead>
        <tbody>
          {sellers.map((seller) => <SellerRow key={seller.seller_key} seller={seller} ipId={ipId} listStatus={listStatus} />)}
        </tbody>
      </table>
    </section>
  );
}

function SellerRow({ seller, ipId, listStatus }: {
  seller: MonitoringSellerSummary;
  ipId: string | null;
  listStatus: MonitoringSellerListStatus;
}) {
  const [expanded, setExpanded] = useState(false);
  const listingsId = useId();
  const initialStatus = listStatus === "all" ? "all" : "open";
  const href = withQuery(sellerProfilePath(seller.seller_key) ?? "/monitoring/tasks", {
    status: initialStatus === "all" ? "all" : null,
    ip_id: ipId,
  });
  const returned = seller.returned_listing_count > 0;

  return (
    <Fragment>
      <tr className={returned ? "seller-row seller-row-returned" : "seller-row"} data-expanded={expanded}>
        <td className="seller-identity">
          <div className="seller-identity-content">
            <div className="seller-thumbnail">
              {seller.sample_image_url ? (
                <img src={seller.sample_image_url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              ) : <Store size={19} aria-hidden />}
            </div>
            <div className="seller-description">
              <Link to={href} className="seller-name">{seller.seller_name}</Link>
              <div className="seller-marketplace">
                {seller.profile_url ? (
                  <a href={seller.profile_url} target="_blank" rel="noreferrer" aria-label={`${seller.seller_name} on ${monitoringPlatformLabel(seller.domain)} (opens in a new tab)`}>
                    {monitoringPlatformLabel(seller.domain)} <ExternalLink size={11} aria-hidden />
                  </a>
                ) : <span>{monitoringPlatformLabel(seller.domain)}</span>}
                {seller.rating != null && <span className="seller-rating" aria-label={`Rating ${seller.rating.toFixed(1)}`}><span aria-hidden>★</span> {seller.rating.toFixed(1)}</span>}
                {!ipId && <span title={seller.ip_names.join(", ")}>
                  {seller.affected_ip_count === 1 ? seller.ip_names[0] ?? "1 IP" : `${seller.affected_ip_count} IPs`}
                </span>}
              </div>
              {seller.sales != null && (
                <details className="seller-history">
                  <summary aria-label={`Marketplace sales and capture details for ${seller.seller_name}`}>
                    <SellerSales count={seller.sales} observation={seller.sales_observation} showCaptureDate={false} />
                  </summary>
                  <div><SellerSales count={seller.sales} observation={seller.sales_observation} /></div>
                </details>
              )}
            </div>
          </div>
        </td>
        <td className="seller-open" data-label="Open listings">
          <button type="button" aria-expanded={expanded} aria-controls={listingsId} onClick={() => setExpanded((value) => !value)} aria-label={`Listings from ${seller.seller_name}`}>
            {seller.open_listing_count.toLocaleString()}
          </button>
          {returned && <span className="seller-returned">{seller.returned_listing_count} returned</span>}
        </td>
        <td className="seller-exposure" data-label="Exposure · USD">{formatMoney(seller.monitored_market_usd, "USD")}</td>
        <td className={seller.prior_enforcement_count === 0 ? "seller-takedowns seller-zero" : "seller-takedowns"} data-label="Takedowns">
          {seller.prior_enforcement_count.toLocaleString()}
        </td>
        <td className="seller-recency" data-label="Latest finding">
          <time dateTime={seller.latest_found_at} title={seller.latest_found_at}>{formatAgo(seller.latest_found_at) ?? "Unknown"}</time>
        </td>
        <td className="seller-action">
          <button type="button" aria-expanded={expanded} aria-controls={listingsId} onClick={() => setExpanded((value) => !value)} aria-label={`${expanded ? "Collapse" : "Expand"} listings from ${seller.seller_name}`}>
            <span>{expanded ? "Hide listings" : "Show listings"}</span><ChevronRight size={16} aria-hidden />
          </button>
        </td>
      </tr>
      <tr className="seller-listings-row" hidden={!expanded}>
        <td colSpan={6} id={listingsId}>
          {expanded && (
            <div className="seller-expanded">
              <SellerListings sellerKey={seller.seller_key} sellerName={seller.seller_name} ipId={ipId} initialStatus={initialStatus} />
            </div>
          )}
        </td>
      </tr>
    </Fragment>
  );
}

function SellerListSkeleton() {
  return (
    <div className="sellers-skeleton" role="status" aria-label="Loading sellers">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index}><span /><span /><span /></div>
      ))}
    </div>
  );
}
