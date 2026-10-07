import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { getMonitoringSetupCapabilities } from "../../api/monitoringWorkspace";
import { useAuth } from "../../context/AuthContext";

export function MonitoringConfigurationGate({ children }: { children: ReactNode }) {
  const { actingTenantId } = useAuth();
  return <TenantConfigurationGate key={actingTenantId}>{children}</TenantConfigurationGate>;
}

function TenantConfigurationGate({ children }: { children: ReactNode }) {
  const { search } = useLocation();
  const [workspaceEnabled, setWorkspaceEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void getMonitoringSetupCapabilities()
      .then(value => { if (active) setWorkspaceEnabled(value.workspace); })
      .catch(error => {
        if (active) setError(error instanceof Error ? error.message : "Monitoring configuration could not be loaded");
      });
    return () => { active = false; };
  }, []);

  if (error) return <p className="p-8" role="alert">{error}</p>;
  if (workspaceEnabled === null) return <p className="p-8" role="status">Loading monitoring configuration…</p>;
  if (workspaceEnabled) return <Navigate to={`/monitoring/setup${search}`} replace />;
  return children;
}
