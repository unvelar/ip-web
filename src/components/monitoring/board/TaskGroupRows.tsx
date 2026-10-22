import { Fragment, useId, useState, type ReactNode } from "react";
import { Box, ChevronRight, PanelRight, Store } from "lucide-react";
import type { TaskSummary } from "../../../api/taskQueue";
import type { MonitoringListingGroup } from "../../../lib/monitoringGrouping";

export function TaskGroupRows({
  groups,
  selection,
  disabled,
  onSelect,
  onOpen,
  renderRow,
  onToggle,
  renderFooter,
  groupColumns,
}: {
  groups: MonitoringListingGroup<TaskSummary>[];
  selection: Set<string>;
  disabled: boolean;
  onSelect: (ids: string[], selected: boolean) => void;
  onOpen: (group: MonitoringListingGroup<TaskSummary>) => void;
  renderRow: (row: TaskSummary) => ReactNode;
  onToggle?: (group: MonitoringListingGroup<TaskSummary>, expanded: boolean) => void;
  renderFooter?: (group: MonitoringListingGroup<TaskSummary>) => ReactNode;
  groupColumns?: ReactNode;
}) {
  const id = useId();
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  return groups.map((group, index) => {
    const totalPrice=group.totals&&Object.hasOwn(group.totals,"totalPriceUsd");
    const value=totalPrice?group.totals?.totalPriceUsd:group.totals?.exposureUsd;
    const expanded = group.kind === "seller" ? toggled.has(group.key) : !toggled.has(group.key);
    const selected = group.findings.filter((row) =>
      selection.has(row.result_id),
    ).length;
    const bodyId = `${id}-${index}`;
    const toggle = () => {
      if (disabled) return;
      setToggled((previous) => {
        const next = new Set(previous);
        if (next.has(group.key)) next.delete(group.key);
        else next.add(group.key);
        return next;
      });
      onToggle?.(group, !expanded);
    };
    return (
      <Fragment key={group.key}>
        <tbody>
          <tr className="monitoring-group-heading" data-disabled={disabled || undefined}
            onClick={(event) => {
              if ((event.target as Element).closest("button, input")) return;
              toggle();
            }}>
            <th colSpan={5} scope="rowgroup">
              <div className="monitoring-group-heading-content">
                <input
                  type="checkbox"
                  aria-label={`Select ${group.totals ? "loaded articles" : "tasks"} in ${group.label}${group.totals ? "" : " on this page"}`}
                  disabled={disabled || group.findings.length === 0}
                  checked={group.findings.length > 0 && selected === group.findings.length}
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selected > 0 && selected < group.findings.length;
                  }}
                  onChange={(event) =>
                    onSelect(
                      group.findings.map((row) => row.result_id),
                      event.target.checked,
                    )
                  }
                />
                <button
                  type="button"
                  className="monitoring-group-toggle"
                  aria-label={`${expanded ? "Collapse" : "Expand"} ${group.label}`}
                  aria-expanded={expanded}
                  aria-controls={bodyId}
                  disabled={disabled}
                  onClick={toggle}
                >
                  <ChevronRight
                    size={14}
                    className={expanded ? "is-expanded" : ""}
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  className="monitoring-group-name"
                  disabled={disabled}
                  aria-expanded={expanded}
                  aria-controls={bodyId}
                  onClick={toggle}
                >
                  {group.kind === "seller" ? (
                    <Store size={14} aria-hidden="true" />
                  ) : (
                    <Box size={14} aria-hidden="true" />
                  )}
                  <span>{group.label}</span>
                </button>
                <span className="monitoring-group-count">
                  {group.totals ? `${group.totals.articles.toLocaleString()} ${group.totals.articles === 1 ? "article" : "articles"}` : `${group.findings.length} on this page`}
                </span>
                {group.totals && <span className="monitoring-group-exposure" title={`${totalPrice?"Total known listing price in USD, once per canonical matching listing; quantities are not multiplied.":"Estimated exposure in USD across all matching articles, using the same price × quantity policy as seller profiles."} ${group.totals.pricedArticles} of ${group.totals.articles} articles have a known USD price.`}>
                  <strong>{value == null ? "Unknown" : new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(value!)}{value != null && group.totals.pricedArticles < group.totals.articles ? "+" : ""}</strong>
                </span>}
                <button
                  type="button"
                  className="monitoring-group-open"
                  disabled={disabled}
                  aria-label={`Open ${group.kind} details: ${group.label}`}
                  onClick={() => onOpen(group)}
                >
                  <PanelRight size={15} aria-hidden="true" />
                </button>
              </div>
            </th>
          </tr>
        </tbody>
        <tbody id={bodyId} hidden={!expanded}>
          {group.findings.length > 0 && groupColumns}
          {group.findings.map(renderRow)}
          {renderFooter?.(group)}
        </tbody>
      </Fragment>
    );
  });
}
