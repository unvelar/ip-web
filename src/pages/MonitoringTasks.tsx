import { MonitoringInboxView } from "./Findings";

/**
 * `/monitoring/tasks` — the canonical monitoring task list. A thin page
 * wrapper around the tenant-wide findings board (`MonitoringInboxView`),
 * which owns the URL-driven filter/sort/cursor state.
 */
export default function MonitoringTasks() {
  return (
    <div className="monitoring-task-page">
      <MonitoringInboxView />
    </div>
  );
}
