import { MonitoringInboxView } from "./Findings";

/**
 * `/monitoring/tasks` — the canonical monitoring task list. A thin page
 * wrapper around the tenant-wide findings board (`MonitoringInboxView`),
 * which owns the URL-driven filter/sort/cursor state.
 */
export default function MonitoringTasks() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Tasks</h1>
        <p className="mt-1 text-sm text-stone-500">
          Live infringement findings across every monitored IP.
        </p>
      </div>
      <MonitoringInboxView />
    </div>
  );
}
