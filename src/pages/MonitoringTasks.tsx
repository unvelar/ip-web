import { MonitoringInboxView } from "./Findings";

/**
 * `/monitoring/tasks` — the canonical monitoring task list. A thin page
 * wrapper around the tenant-wide findings board (`MonitoringInboxView`),
 * which owns the URL-driven filter/sort/cursor state.
 */
export default function MonitoringTasks() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-2 space-y-2">
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Triage Queue</h1>
      <MonitoringInboxView />
    </div>
  );
}
