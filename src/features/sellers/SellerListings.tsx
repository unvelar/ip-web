import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, ShoppingBag } from "lucide-react";
import {
  getMonitoringSellerProfile,
  isApiError,
  type IpReviewFinding,
  type TakedownFeedbackAssociationScope,
  type MonitoringSellerAvailability,
  type MonitoringSellerProfilePage,
  type MonitoringSellerSort,
  type MonitoringSellerStatus,
} from "../../api";
import { sellerListingAvailability } from "./sellerListingAvailability";
import { compactListingTitle, findingStatusBadge, formatAgo, formatMoney, tableImageUrls } from "../../components/monitoring/board/utils";

import { ListingDecisionBar } from "../../components/monitoring/board/ListingDecisionBar";
import { BatchConfirmModal } from "../../components/monitoring/board/batch";
import { BatchResultNotice } from "../../components/monitoring/board/BatchResultNotice";
import type { BatchAction, BatchResult } from "../../components/monitoring/board/batchUtils";
import { partitionSellerListings, runSellerListingBatch } from "./sellerListingBatch";
import { recommendedBatchActionForSelection } from "../products/reviewDecisions";
import type { SellerListingFilters } from "./filters";
import { SellerFindingPanel } from "./SellerFindingPanel";

const batchActions: BatchAction[] = ["send", "submit", "enforce", "false_positive", "second_hand", "do_not_pursue", "allow_product", "review"];
const isSelectable = (finding: IpReviewFinding) => !finding.dismissed_at && finding.review_status !== "enforced";

const statuses: { value: MonitoringSellerStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "enforced", label: "Enforced" },
  { value: "dismissed", label: "Closed" },
];

type FilterControl = {
  filters: SellerListingFilters;
  onFiltersChange: (filters: SellerListingFilters) => void;
} | {
  filters?: undefined;
  onFiltersChange?: undefined;
};

type FindingControl = {
  activeFindingId?: string | null;
  onActiveFindingChange?: (resultId: string | null) => void;
};

export function SellerListings({ sellerKey, sellerName, ipId, initialStatus = "open", onChanged, filters, onFiltersChange, onIpChange, renderHeader, activeFindingId, onActiveFindingChange }: {
  sellerKey: string;
  sellerName?: string;
  ipId: string | null;
  initialStatus?: MonitoringSellerStatus;
  onChanged?: () => void;
  onIpChange?: (ipId: string | null) => void;
  renderHeader?: (profile: MonitoringSellerProfilePage) => ReactNode;
} & FilterControl & FindingControl) {
  const [localFilters, setLocalFilters] = useState<SellerListingFilters>({ status: initialStatus, availability: null, sort: "found_desc" });
  const { status, availability, sort } = filters ?? localFilters;
  const scope = JSON.stringify([sellerKey, ipId, status, availability, sort]);
  const changeFilters = onFiltersChange ?? setLocalFilters;
  const [knownIps, setKnownIps] = useState<MonitoringSellerProfilePage["ips"]>([]);
  const rememberIps = useCallback((profile: MonitoringSellerProfilePage) => {
    setKnownIps((current) => !ipId || current.length === 0 ? profile.ips : current);
  }, [ipId]);

  const filterToolbar = (busy: boolean) => (
    <div className="seller-listings-toolbar">
      <div className="seller-listing-filters">
        <select disabled={busy} aria-label="Listing status" value={status} onChange={(event) => changeFilters({ status: event.target.value as MonitoringSellerStatus, availability, sort })}>
          {statuses.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <select disabled={busy} aria-label="Listing availability" value={availability ?? ""} onChange={(event) => changeFilters({ status, availability: (event.target.value || null) as MonitoringSellerAvailability | null, sort })}>
          <option value="">Any availability</option>
          <option value="available">Available</option>
          <option value="blocked">Couldn’t verify</option>
          <option value="unknown">Not yet verified</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <select disabled={busy} aria-label="Sort seller listings" value={sort} onChange={(event) => changeFilters({ status, availability, sort: event.target.value as MonitoringSellerSort })}>
          <option value="found_desc">Newest found</option>
          <option value="price_desc">Highest price</option>
          <option value="risk_desc">Highest risk</option>
        </select>
        {onIpChange && (ipId || knownIps.length > 1) && (
          <select disabled={busy} aria-label="Listing IP" value={ipId ?? ""} onChange={(event) => onIpChange(event.target.value || null)}>
            <option value="">All IPs</option>
            {knownIps.map((ip) => <option key={ip.ip_id} value={ip.ip_id}>{ip.ip_name} · {ip.findings}</option>)}
            {ipId && !knownIps.some((ip) => ip.ip_id === ipId) && <option value={ipId}>Selected IP</option>}
          </select>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* A new filter gets its own request lifetime, including pagination. */}
      <SellerListingResults
        key={scope}
        sellerKey={sellerKey}
        sellerName={sellerName}
        activeFindingId={activeFindingId}
        onActiveFindingChange={onActiveFindingChange}
        renderHeader={renderHeader}
        onLoaded={rememberIps}
        filterToolbar={filterToolbar}
        onChanged={onChanged}
        ipId={ipId}
        status={status}
        availability={availability || null}
        sort={sort}
      />
    </>
  );
}

function SellerListingResults({ sellerKey, sellerName, ipId, status, availability, sort, onChanged, filterToolbar, renderHeader, onLoaded, activeFindingId, onActiveFindingChange }: {
  sellerKey: string;
  ipId: string | null;
  status: MonitoringSellerStatus;
  availability: MonitoringSellerAvailability | null;
  sort: MonitoringSellerSort;
  sellerName?: string;
  filterToolbar: (busy: boolean) => ReactNode;
  onChanged?: () => void;
  renderHeader?: (profile: MonitoringSellerProfilePage) => ReactNode;
  onLoaded: (profile: MonitoringSellerProfilePage) => void;
} & FindingControl) {
  const [localFindingId, setLocalFindingId] = useState<string | null>(null);
  const findingId = activeFindingId === undefined ? localFindingId : activeFindingId;
  const openFinding = onActiveFindingChange ?? setLocalFindingId;
  const [page, setPage] = useState<MonitoringSellerProfilePage | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const morePending = useRef(false);
  const actionPending = useRef(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const selectedFindings = useMemo(() => page?.findings.filter((finding) => selected.has(finding.result_id)) ?? [], [page, selected]);
  const confirmation = useMemo(() => confirmAction ? partitionSellerListings(selectedFindings, confirmAction, ipId) : null, [confirmAction, selectedFindings, ipId]);
  const selectable = page?.findings.filter(isSelectable) ?? [];
  const allSelected = selectable.length > 0 && selectable.every((finding) => selected.has(finding.result_id));
  const locked = Boolean(progress) || loadingMore;
  const recommendedAction = recommendedBatchActionForSelection(selectedFindings);
  const primaryAction = selectedFindings.every((finding) => finding.review_status === "takedown_sent") ? "enforce"
    : selectedFindings.every((finding) => finding.review_status === "takedown_pending") ? "submit"
    : recommendedAction ?? "send";
  const availableActions = batchActions.filter((action) => partitionSellerListings(selectedFindings, action, ipId).eligible.length > 0);

  function toggleSelection(resultId: string) {
    if (locked || actionPending.current) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(resultId)) next.delete(resultId); else next.add(resultId);
      return next;
    });
  }

  async function refreshLoaded() {
    const controller = requestController.current;
    if (!controller || controller.signal.aborted) return;
    const targetCount = page?.findings.length ?? 10;
    let refreshed: MonitoringSellerProfilePage | null = null;
    do {
      const next: MonitoringSellerProfilePage = await getMonitoringSellerProfile(sellerKey, {
        ip_id: ipId, status, availability, sort, limit: 10,
        cursor: refreshed?.next_cursor, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      refreshed = refreshed ? { ...next, findings: [...refreshed.findings, ...next.findings] } : next;
    } while (refreshed.next_cursor && refreshed.findings.length < targetCount);
    setPage(refreshed);
    onLoaded(refreshed);
    setSelected((current) => new Set(refreshed.findings.filter((finding) => current.has(finding.result_id) && isSelectable(finding)).map((finding) => finding.result_id)));
    setNeedsRefresh(false);
    setError("");
  }

  async function retryRead() {
    if (!needsRefresh) {
      if (page) void loadMore(); else setAttempt((value) => value + 1);
      return;
    }
    if (actionPending.current) return;
    const controller = requestController.current;
    if (!controller || controller.signal.aborted) return;
    actionPending.current = true;
    setProgress({ done: 0, total: 0 });
    try { await refreshLoaded(); }
    catch (caught: unknown) {
      if (!requestController.current?.signal.aborted) setError(caught instanceof Error ? caught.message : "Unable to refresh listings.");
    } finally {
      actionPending.current = false;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  async function refreshAfterInspectorChange() {
    const controller = requestController.current;
    if (!controller || controller.signal.aborted) return;
    setNeedsRefresh(true);
    onChanged?.();
    try { await refreshLoaded(); }
    catch {
      if (!controller.signal.aborted) setError("Changes saved, but listings could not be refreshed. Try again to reload their current state.");
    }
  }

  async function runAction(action: BatchAction, decisionReason?: string, associationScopes?: TakedownFeedbackAssociationScope[]) {
    if (actionPending.current || morePending.current || needsRefresh) return;
    const controller = requestController.current;
    if (!controller || controller.signal.aborted) return;
    actionPending.current = true;
    setConfirmAction(null);
    setResult(null);
    setProgress({ done: 0, total: selectedFindings.length });
    try {
      const outcome = await runSellerListingBatch({ action, findings: selectedFindings, ipId, decisionReason, associationScopes,
        isActive: () => !controller.signal.aborted, onProgress: setProgress });
      if (controller.signal.aborted) return;
      setResult(outcome.result);
      setSelected((current) => new Set([...current].filter((id) => !outcome.processed.has(id))));
      if (outcome.processed.size > 0) {
        // Do not offer acknowledged successes again if the subsequent read fails.
        setPage((current) => current ? { ...current, findings: current.findings.filter((finding) => !outcome.processed.has(finding.result_id)) } : current);
        setNeedsRefresh(true);
        onChanged?.();
        try { await refreshLoaded(); }
        catch {
          if (!controller.signal.aborted) setError("Actions saved, but listings could not be refreshed. Try again to reload their current state.");
        }
      }
    } catch (caught: unknown) {
      if (!controller.signal.aborted) setResult(`Could not complete the action. ${caught instanceof Error ? caught.message : "Please try again."}`);
    } finally {
      actionPending.current = false;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    requestController.current = controller;
    setError("");
    void getMonitoringSellerProfile(sellerKey, {
      ip_id: ipId, status, availability, sort, limit: 10, signal: controller.signal,
    }).then((next) => {
      if (!controller.signal.aborted) {
        setPage(next);
        onLoaded(next);
      }
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(isApiError(caught, 404) ? "This seller profile could not be found." : caught instanceof Error ? caught.message : "Unable to load listings.");
    });
    return () => controller.abort();
  }, [sellerKey, ipId, status, availability, sort, attempt, onLoaded]);

  async function loadMore() {
    const controller = requestController.current;
    if (actionPending.current || needsRefresh || !page?.next_cursor || morePending.current || !controller || controller.signal.aborted) return;
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

  const name = page?.seller?.name ?? sellerName ?? "Seller";
  return (
    <>
      {page && renderHeader?.(page)}
      <section className="seller-listings" aria-label={`Listings from ${name}`} aria-busy={!page && !error || loadingMore}>
        <div className="seller-toolbar-slot">
          <div className="seller-toolbar-filters" inert={selectedFindings.length > 0 || Boolean(progress)} aria-hidden={selectedFindings.length > 0 || Boolean(progress)}>
            {filterToolbar(Boolean(progress))}
          </div>
          <ListingDecisionBar
            placement="toolbar"
            selectedCount={selectedFindings.length}
            primaryAction={primaryAction}
            actions={needsRefresh ? [] : availableActions}
            recommendedAction={recommendedAction}
            progress={progress}
            disabled={locked || needsRefresh}
            onAction={(action) => { if (!locked) setConfirmAction(action); }}
            onClear={() => { if (!locked) setSelected(new Set()); }}
          />
        </div>
        {error && (
          <div className="seller-listings-message" role="alert">
            <span>{error}</span>
            <button type="button" disabled={locked} onClick={() => void retryRead()}>Try again</button>
          </div>
        )}
        {result && <BatchResultNotice result={result} onDismiss={() => setResult(null)} profileIpId={ipId} className="mx-3 my-2" />}
        {!page && !error && <p className="seller-listings-message" role="status">Loading listings…</p>}
        {page && page.findings.length === 0 && (
          <p className="seller-listings-message">No listings match these filters.</p>
        )}
        {page && page.findings.length > 0 && (
          <>
            <div className="seller-item-columns seller-item-heading">
              <input type="checkbox" className="seller-item-checkbox" aria-label="Select all loaded listings" checked={allSelected}
                ref={(element) => { if (element) element.indeterminate = selected.size > 0 && !allSelected; }}
                disabled={locked || needsRefresh || selectable.length === 0}
                onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((finding) => finding.result_id)))} />
              <span>Listing</span><span>Status</span><span>Availability</span><span>Price</span><span>Found</span><span />
            </div>
            <ul className="seller-items">
              {page.findings.map((finding) => <SellerListingRow key={finding.result_id} finding={finding} showIp={!ipId} selected={selected.has(finding.result_id)} disabled={locked || needsRefresh || !isSelectable(finding)} onSelect={() => toggleSelection(finding.result_id)} onOpen={() => openFinding(finding.result_id)} />)}
            </ul>
            <div className="seller-listings-footer">
              <span role="status">{page.findings.length} {page.findings.length === 1 ? "listing" : "listings"}{page.next_cursor ? " loaded" : ""}</span>
              {page.next_cursor && <button type="button" disabled={locked || needsRefresh} onClick={() => void loadMore()}>{loadingMore ? "Loading…" : "Load more listings"}</button>}
            </div>
          </>
        )}

        {confirmAction && confirmation && createPortal(<BatchConfirmModal action={confirmAction} scopeLabel={name}
          eligible={confirmation.eligible} skipped={confirmation.skipped} onCancel={() => setConfirmAction(null)}
          onConfirm={(reason, scopes) => void runAction(confirmAction, reason, scopes)} />, document.body)}
      </section>
      {page && findingId && createPortal(
        <SellerFindingPanel
          key={findingId}
          findingId={findingId}
          finding={page.findings.find((finding) => finding.result_id === findingId)}
          ipId={ipId ?? undefined}
          onClose={() => openFinding(null)}
          onResolved={() => {
            openFinding(null);
            void refreshAfterInspectorChange();
          }}
          onFindingChange={() => void refreshAfterInspectorChange()}
        />,
        // Escape the seller table's clipping while retaining shell overlay offsets.
        document.querySelector(".app-shell") ?? document.body,
      )}
    </>
  );
}

function SellerListingRow({ finding, showIp, selected, disabled, onSelect, onOpen }: {
  finding: IpReviewFinding; showIp: boolean; selected: boolean; disabled: boolean; onSelect: () => void; onOpen: () => void;
}) {
  const title = compactListingTitle(finding);
  const image = tableImageUrls(finding)[0];
  const status = findingStatusBadge(finding);
  const availability = sellerListingAvailability(finding.availability);
  const price = finding.price_value_usd != null ? formatMoney(Number(finding.price_value_usd), "USD") : finding.price;

  return (
    <li className="seller-item-columns seller-item" data-selected={selected}>
      <input type="checkbox" className="seller-item-checkbox" aria-label={`Select ${title}`} checked={selected} disabled={disabled} onChange={onSelect} />
      <button type="button" className="seller-item-title text-left" onClick={onOpen} title={title} aria-haspopup="dialog">
        <span className="seller-item-image">{image
          ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          : <ShoppingBag size={14} aria-hidden />}</span>
        <span className="seller-item-name">{title}</span>
        {showIp && finding.ip_name && <span className="seller-item-ip">{finding.ip_name}</span>}
      </button>
      <span className={`seller-item-status ${status.cls}`}>{status.label}</span>
      <span className={`seller-item-availability ${availability.cls}`} title={availability.title}>{availability.label}</span>
      <span className="seller-item-price" aria-label={`Price ${price || "unavailable"}`}>{price || "—"}</span>
      <time className="seller-item-found" dateTime={finding.found_at} title={finding.found_at}>{formatAgo(finding.found_at) ?? "Unknown"}</time>
      <a className="seller-item-external" href={finding.page_url} target="_blank" rel="noreferrer" aria-label={`Open ${title} on marketplace (opens in a new tab)`}><ExternalLink size={13} aria-hidden /></a>
    </li>
  );
}
