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
}: {
  groups: MonitoringListingGroup<TaskSummary>[];
  selection: Set<string>;
  disabled: boolean;
  onSelect: (ids: string[], selected: boolean) => void;
  onOpen: (group: MonitoringListingGroup<TaskSummary>) => void;
  renderRow: (row: TaskSummary) => ReactNode;
}) {
  const id = useId();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return groups.map((group, index) => {
    const expanded = !collapsed.has(group.key);
    const selected = group.findings.filter((row) =>
      selection.has(row.result_id),
    ).length;
    const bodyId = `${id}-${index}`;
    return (
      <Fragment key={group.key}>
        <tbody>
          <tr className="monitoring-group-heading">
            <th colSpan={4} scope="rowgroup">
              <div className="monitoring-group-heading-content">
                <input
                  type="checkbox"
                  aria-label={`Select tasks in ${group.label} on this page`}
                  disabled={disabled}
                  checked={selected === group.findings.length}
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
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
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
                  onClick={() => onOpen(group)}
                >
                  {group.kind === "seller" ? (
                    <Store size={14} aria-hidden="true" />
                  ) : (
                    <Box size={14} aria-hidden="true" />
                  )}
                  <span>{group.label}</span>
                </button>
                <span className="monitoring-group-count">
                  {group.findings.length} on this page
                </span>
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
          {group.findings.map(renderRow)}
        </tbody>
      </Fragment>
    );
  });
}
