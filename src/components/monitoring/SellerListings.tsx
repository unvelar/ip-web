import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, ShoppingBag } from "lucide-react";
import {
  getMonitoringSellerProfile,
  type IpReviewFinding,
  type MonitoringSellerAvailability,
  type MonitoringSellerProfilePage,
  type MonitoringSellerSort,
  type MonitoringSellerStatus,
} from "../../api";
import { sellerListingAvailability } from "../../lib/sellerListingAvailability";
import { compactListingTitle, findingStatusBadge, formatAgo, formatMoney, tableImageUrls } from "./board/utils";

const statuses: { value: MonitoringSellerStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "enforced", label: "Enforced" },
  { value: "dismissed", label: "Closed" },
];

export function SellerListings({ sellerKey, sellerName, ipId, initialStatus }: {
  sellerKey: string;
  sellerName: string;
  ipId: string | null;
  initialStatus: MonitoringSellerStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [availability, setAvailability] = useState<MonitoringSellerAvailability | "">("");
  const [sort, setSort] = useState<MonitoringSellerSort>("found_desc");

  return (
    <section className="seller-listings" aria-label={`Listings from ${sellerName}`}>
      <div className="seller-listings-toolbar">
        <div className="seller-listing-tabs" role="group" aria-label="Listing status">
          {statuses.map((option) => (
            <button key={option.value} type="button" aria-pressed={status === option.value} onClick={() => setStatus(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="seller-listing-filters">
          <select aria-label="Listing availability" value={availability} onChange={(event) => setAvailability(event.target.value as MonitoringSellerAvailability | "")}>
            <option value="">Any availability</option>
            <option value="available">Available</option>
            <option value="blocked">Couldn’t verify</option>
            <option value="unknown">Not yet verified</option>
            <option value="unavailable">Unavailable</option>
          </select>
          <select aria-label="Sort seller listings" value={sort} onChange={(event) => setSort(event.target.value as MonitoringSellerSort)}>
            <option value="found_desc">Newest found</option>
            <option value="price_desc">Highest price</option>
            <option value="risk_desc">Highest risk</option>
          </select>
        </div>
      </div>
      {/* A new filter gets its own request lifetime, including pagination. */}
      <SellerListingResults
        key={JSON.stringify([sellerKey, ipId, status, availability, sort])}
        sellerKey={sellerKey}
        ipId={ipId}
        status={status}
        availability={availability || null}
        sort={sort}
      />
    </section>
  );
}

function SellerListingResults({ sellerKey, ipId, status, availability, sort }: {
  sellerKey: string;
  ipId: string | null;
  status: MonitoringSellerStatus;
  availability: MonitoringSellerAvailability | null;
  sort: MonitoringSellerSort;
}) {
  const [page, setPage] = useState<MonitoringSellerProfilePage | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const morePending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    setError("");
    void getMonitoringSellerProfile(sellerKey, {
      ip_id: ipId, status, availability, sort, limit: 10, signal: controller.signal,
    }).then((next) => {
      if (!controller.signal.aborted) setPage(next);
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load listings.");
    });
    return () => controller.abort();
  }, [sellerKey, ipId, status, availability, sort, attempt]);

  async function loadMore() {
    const controller = requestController.current;
    if (!page?.next_cursor || morePending.current || !controller || controller.signal.aborted) return;
    morePending.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const next = await getMonitoringSellerProfile(sellerKey, {
        ip_id: ipId, status, availability, sort, limit: 10,
        cursor: page.next_cursor, signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setPage((current) => current ? { ...next, findings: [...current.findings, ...next.findings] } : next);
      }
    } catch (caught: unknown) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to load more listings.");
    } finally {
      morePending.current = false;
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  return (
    <div aria-busy={!page && !error || loadingMore}>
      {error && (
        <div className="seller-listings-message" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => page ? void loadMore() : setAttempt((value) => value + 1)}>Try again</button>
        </div>
      )}
      {!page && !error && <p className="seller-listings-message" role="status">Loading listings…</p>}
      {page && page.findings.length === 0 && (
        <p className="seller-listings-message">No listings match these filters.</p>
      )}
      {page && page.findings.length > 0 && (
        <>
          <div className="seller-item-columns seller-item-heading" aria-hidden="true">
            <span>Listing</span><span>Status</span><span>Availability</span><span>Price</span><span>Found</span><span />
          </div>
          <ul className="seller-items">
            {page.findings.map((finding) => <SellerListingRow key={finding.result_id} finding={finding} showIp={!ipId} />)}
          </ul>
          <div className="seller-listings-footer">
            <span role="status">{page.findings.length} {page.findings.length === 1 ? "listing" : "listings"}{page.next_cursor ? " loaded" : ""}</span>
            {page.next_cursor && <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more listings"}</button>}
          </div>
        </>
      )}
    </div>
  );
}

function SellerListingRow({ finding, showIp }: { finding: IpReviewFinding; showIp: boolean }) {
  const title = compactListingTitle(finding);
  const image = tableImageUrls(finding)[0];
  const status = findingStatusBadge(finding);
  const availability = sellerListingAvailability(finding.availability);
  const price = finding.price_value_usd != null ? formatMoney(Number(finding.price_value_usd), "USD") : finding.price;

  return (
    <li className="seller-item-columns seller-item">
      <Link className="seller-item-title" to={`/monitoring/tasks/${finding.result_id}`} title={title}>
        <span className="seller-item-image">{image
          ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          : <ShoppingBag size={14} aria-hidden />}</span>
        <span className="seller-item-name">{title}</span>
        {showIp && finding.ip_name && <span className="seller-item-ip">{finding.ip_name}</span>}
      </Link>
      <span className={`seller-item-status ${status.cls}`}>{status.label}</span>
      <span className={`seller-item-availability ${availability.cls}`} title={availability.title}>{availability.label}</span>
      <span className="seller-item-price" aria-label={`Price ${price || "unavailable"}`}>{price || "—"}</span>
      <time className="seller-item-found" dateTime={finding.found_at} title={finding.found_at}>{formatAgo(finding.found_at) ?? "Unknown"}</time>
      <a className="seller-item-external" href={finding.page_url} target="_blank" rel="noreferrer" aria-label={`Open ${title} on marketplace (opens in a new tab)`}><ExternalLink size={13} aria-hidden /></a>
    </li>
  );
}
