import { MonitoringInboxView } from "./Findings";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useActiveIp } from "../context/ActiveIpContext";
import { isApiError } from "../api";
import { taskCapability, type TaskCapability } from "../api/taskQueue";
import TaskQueue from "./TaskQueue";

/**
 * `/monitoring/tasks` — the canonical monitoring task list. A thin page
 * negotiates the indexed queue for active scopes and keeps the existing
 * findings board available during rollout and rollback.
 */
export default function MonitoringTasks() {
  const { activeIpId } = useActiveIp(),
    { actingTenantId } = useAuth();
  const key = actingTenantId + ":" + activeIpId;
  const [capability, setCapability] = useState<{
    key: string;
    value: TaskCapability | null;
    error?: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const renegotiate = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!activeIpId) return;
    const controller = new AbortController();
    void taskCapability(activeIpId, controller.signal)
      .then((value) => setCapability({ key, value }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setCapability({
          key,
          value: null,
          ...(isApiError(error, 404)
            ? {}
            : {
                error: error instanceof Error ? error.message : String(error),
              }),
        });
      });
    return () => controller.abort();
  }, [activeIpId, key, revision]);
  if (activeIpId && capability?.key !== key)
    return (
      <p className="p-8 text-sm text-stone-500" role="status">
        Loading tasks…
      </p>
    );
  if (capability?.key === key && capability.error)
    return (
      <p className="p-8 text-sm" role="alert">
        {capability.error}{" "}
        <button
          className="underline"
          onClick={() => setRevision((value) => value + 1)}
        >
          Retry
        </button>
      </p>
    );
  if (activeIpId && capability?.key === key && capability.value?.active)
    return (
      <div className="monitoring-task-page">
        <TaskQueue key={key} ipId={activeIpId} onUnavailable={renegotiate} />
      </div>
    );
  return (
    <div className="monitoring-task-page">
      <MonitoringInboxView />
    </div>
  );
}
