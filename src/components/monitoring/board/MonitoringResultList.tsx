import type { IpReviewFinding, MonitoringSortMode } from "../../../api";
import { FindingRow } from "./FindingRow";
import { compactListingTitle } from "./utils";

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

/** A readable review queue. Filtering and sorting still cover the full server corpus. */
export function MonitoringResultList({
  findings, total, sort, selected, activeId, dismissing, showIp, showStatus,
  onSort, onSelect, onOpen, emptyMessage, onClearFilters,
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
  onOpen: (id: string) => void;
  emptyMessage?: string;
  onClearFilters?: () => void;
}) {
  return <>
    <div className="monitoring-results-summary">
      <span aria-live="polite"><strong>{total.toLocaleString()} {total === 1 ? "listing" : "listings"}</strong> matching this view</span>
      <select aria-label="Sort listings" value={sort} onChange={(event) => onSort(event.target.value as MonitoringSortMode)}>
        {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
    <table className="monitoring-result-list" aria-label="Monitoring listings">
      <colgroup><col className="monitoring-checkbox-column" /><col /><col className="monitoring-price-column" /><col className="monitoring-assessment-column" /></colgroup>
      <thead><tr>
        <th colSpan={2} scope="col">Listing / seller / website</th>
        <th scope="col" className="monitoring-price-heading">Price (USD)</th>
        <th scope="col" className="monitoring-assessment-heading">Suggested action</th>
      </tr></thead>
      <tbody>{findings.map((finding) => {
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
          <FindingRow f={finding} active={active} showIp={showIp} showStatus={showStatus} />
        </tr>;
      })}</tbody>
    </table>
    {findings.length === 0 && <div className="monitoring-results-empty">
      <p>{onClearFilters ? "No listings match these filters" : emptyMessage ?? "No listings in this view yet"}</p>
      {onClearFilters && <><span>Remove a filter to broaden this view.</span><button type="button" onClick={onClearFilters}>Clear filters</button></>}
    </div>}
  </>;
}
