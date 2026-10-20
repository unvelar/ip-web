import { Fragment, useId, useMemo, useState } from "react";
import { Box, ChevronRight, PanelRight, Store } from "lucide-react";
import type { IpReviewFinding, MonitoringSortMode } from "../../../api";
import { groupMonitoringFindings, hasProductGrouping, type MonitoringGroupBy, type MonitoringListingGroup } from "../../../lib/monitoringGrouping";
import { FindingRow } from "./FindingRow";
import { compactListingTitle } from "./utils";
import { MarketplaceMark } from "../../MarketplaceMark";
import { monitoringPlatformLabel } from "../../../lib/platforms";

const sortOptions: Array<{ value: MonitoringSortMode; label: string }> = [
  { value: "score_desc", label: "Highest priority first" },
  { value: "score_asc", label: "Lowest priority first" },
  { value: "found_desc", label: "Newest found first" },
  { value: "found_asc", label: "Oldest found first" },
  { value: "updated_desc", label: "Recently updated first" },
  { value: "updated_asc", label: "Least recently updated first" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "seller_asc", label: "Seller: A to Z" },
  { value: "seller_desc", label: "Seller: Z to A" },
  { value: "platform_asc", label: "Website: A to Z" },
  { value: "platform_desc", label: "Website: Z to A" },
];

export function MonitoringSortControl({ sort, onSort, compact = false }: { sort: MonitoringSortMode; onSort: (sort: MonitoringSortMode) => void; compact?: boolean }) {
  const labels: Partial<Record<MonitoringSortMode, string>> = {
    score_desc: "Priority", score_asc: "Lowest priority", found_desc: "Newest", found_asc: "Oldest",
    updated_desc: "Recently updated", updated_asc: "Least recently updated", price_asc: "Price ↑", price_desc: "Price ↓",
    seller_asc: "Seller A–Z", seller_desc: "Seller Z–A", platform_asc: "Website A–Z", platform_desc: "Website Z–A",
  };
  return <select aria-label="Sort listings" value={sort} onChange={(event) => onSort(event.target.value as MonitoringSortMode)}>
    {sortOptions.map((option) => <option key={option.value} value={option.value}>{compact ? labels[option.value] ?? option.label : option.label}</option>)}
  </select>;
}

/** A readable review queue. Filtering and sorting still cover the full server corpus. */
export function MonitoringResultList({
  findings, total, sort, selected, activeId, dismissing, showIp, showStatus,
  onSort, onSelect, onSelectAll, onOpen, emptyMessage, onClearFilters,
  groupBy = "none", compact = false, onSelectGroup, onGroupOpen, onEntityOpen,
  hideSort = false,
}: {
  findings: IpReviewFinding[];
  total: number;
  sort: MonitoringSortMode;
  selected: Set<string>;
  activeId: string | null;
  dismissing: Set<string>;
  showIp: boolean;
  showStatus: boolean;
  onSort: (sort: MonitoringSortMode) => void;
  onSelect: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onOpen: (id: string) => void;
  emptyMessage?: string;
  onClearFilters?: () => void;
  groupBy?: MonitoringGroupBy;
  compact?: boolean;
  onSelectGroup?: (ids: string[], checked: boolean) => void;
  onGroupOpen?: (group: MonitoringListingGroup) => void;
  onEntityOpen?: (kind: "seller" | "product", finding: IpReviewFinding) => void;
  hideSort?: boolean;
}) {
  const groupId = useId();
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupMonitoringFindings(findings, groupBy), [findings, groupBy]);
  const allSelected = findings.length > 0 && findings.every((finding) => selected.has(finding.result_id));
  const partiallySelected = !allSelected && findings.some((finding) => selected.has(finding.result_id));

  return <>
    {!compact && <div className="monitoring-results-summary">
      <span aria-live="polite"><strong>{total.toLocaleString()} {total === 1 ? "listing" : "listings"}</strong> matching this view</span>
      {!hideSort && <MonitoringSortControl sort={sort} onSort={onSort} />}
    </div>}
    {groupBy === "product" && findings.length > 0 && !hasProductGrouping(findings) && <div className="monitoring-grouping-notice" role="status">
      Product grouping needs the API update. Your filtered tasks remain below.
    </div>}
    <table className="monitoring-result-list" aria-label="Monitoring listings">
      <colgroup><col className="monitoring-checkbox-column" /><col /><col className="monitoring-price-column" /><col className="monitoring-assessment-column" /></colgroup>
      <thead><tr>
        <th scope="col" className="monitoring-listing-checkbox">
          <label title="Select all loaded listings">
            <input
              type="checkbox"
              aria-label="Select all loaded listings"
              checked={allSelected}
              ref={(element) => { if (element) element.indeterminate = partiallySelected; }}
              disabled={findings.length === 0}
              onChange={(event) => onSelectAll(event.target.checked)}
            />
          </label>
        </th>
        <th scope="col" className="monitoring-listing-heading">Listing / seller / website</th>
        <th scope="col" className="monitoring-price-heading">Price (USD)</th>
        <th scope="col" className="monitoring-assessment-heading">Suggested action</th>
      </tr></thead>
      {groups.length > 0 ? groups.map((group, index) => {
        const all = group.findings.every((finding) => selected.has(finding.result_id));
        const some = !all && group.findings.some((finding) => selected.has(finding.result_id));
        const expanded = group.kind === "seller" ? toggled.has(group.key) : !toggled.has(group.key);
        const id = `${groupId}-group-${index}`;
        const toggle = () => setToggled((previous) => { const next = new Set(previous); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; });
        return <Fragment key={group.key}>
          <tbody><tr className="monitoring-group-heading" onClick={(event) => {
            if ((event.target as Element).closest("button, input")) return;
            toggle();
          }}><th colSpan={4} scope="rowgroup">
            <div className="monitoring-group-heading-content">
              <input type="checkbox" aria-label={`Select loaded tasks in ${group.label}`} checked={all}
                ref={(element) => { if (element) element.indeterminate = some; }}
                onChange={(event) => onSelectGroup?.(group.findings.map((finding) => finding.result_id), event.target.checked)} />
              <button type="button" className="monitoring-group-toggle" aria-expanded={expanded} aria-controls={id}
                aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
                onClick={toggle}>
                <ChevronRight size={13} className={expanded ? "is-expanded" : ""} aria-hidden />
              </button>
              <button type="button" className="monitoring-group-name" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
                {group.kind === "seller" ? <Store size={14} aria-hidden /> : <Box size={14} aria-hidden />}
                <span>{group.label}</span>
              </button>
              <span className="monitoring-group-count">{group.findings.length} loaded</span>
              {group.kind === "seller" && [...new Set(group.findings.map((finding) => finding.domain))].map((domain) => <span key={domain} className="monitoring-marketplace" role="img" aria-label={monitoringPlatformLabel(domain)} title={monitoringPlatformLabel(domain)}><MarketplaceMark source={{ domain, name: monitoringPlatformLabel(domain) }} /></span>)}
              {onGroupOpen && <button type="button" className="monitoring-group-open" aria-label={`Open ${group.kind} details: ${group.label}`} onClick={() => onGroupOpen(group)}><PanelRight size={15} aria-hidden /></button>}
            </div>
          </th></tr></tbody>
          <tbody id={id} hidden={!expanded}>{group.findings.map(renderFinding)}</tbody>
        </Fragment>;
      }) : <tbody>{findings.map(renderFinding)}</tbody>}
    </table>
    {findings.length === 0 && <div className="monitoring-results-empty">
      <p>{onClearFilters ? "No listings match these filters" : emptyMessage ?? "No listings in this view yet"}</p>
      {onClearFilters && <><span>Remove a filter to broaden this view.</span><button type="button" onClick={onClearFilters}>Clear filters</button></>}
    </div>}
  </>;

  function renderFinding(finding: IpReviewFinding) {
        const active = finding.result_id === activeId;
        const title = compactListingTitle(finding);
        return <tr key={finding.result_id} tabIndex={0} aria-label={`Open task: ${title}`}
          onClick={() => onOpen(finding.result_id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
            event.preventDefault(); onOpen(finding.result_id);
          }}
          className={`monitoring-listing-row${active ? " is-active" : ""}${selected.has(finding.result_id) ? " is-selected" : ""}${finding.dismissed_at || dismissing.has(finding.result_id) ? " is-dismissed" : ""}`}>
          <td className="monitoring-listing-checkbox" onClick={(event) => event.stopPropagation()}>
            <label><input type="checkbox" aria-label={`Select ${title}`} checked={selected.has(finding.result_id)} onChange={() => onSelect(finding.result_id)} /></label>
          </td>
          <FindingRow f={finding} active={active} showIp={showIp} showStatus={showStatus} onEntityOpen={onEntityOpen} />
        </tr>;
  }
}
