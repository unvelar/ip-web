import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { monitoringSetupClient, getMonitoringSetupCapabilities } from '../api/monitoringWorkspace';
import { useAuth } from '../context/AuthContext';
import WorkspaceEditor from '../monitoring-workspace/WorkspaceEditor';
import type { WorkspaceResponse } from '../monitoring-workspace/contracts';

export default function MonitoringSetup() {
  const { actingTenantId } = useAuth();
  return <CompanySetup key={actingTenantId} />;
}

function CompanySetup() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const capabilities = await getMonitoringSetupCapabilities();
        if (!active) return;
        if (!capabilities.workspace) { setUnavailable(true); return; }
        const value = await monitoringSetupClient.load();
        if (active) setWorkspace(value);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : String(err)); }
    })();
    return () => { active = false; };
  }, [attempt]);
  if (workspace) return <WorkspaceEditor client={monitoringSetupClient} loaded={workspace} embedded onLeave={() => window.location.assign('/dashboard')} />;
  return <section className="p-8 max-w-3xl"><h1 className="text-2xl font-semibold mb-3">Monitoring setup</h1>
    {unavailable ? <><p className="text-stone-600">The new company, brand and product setup is not enabled for this company yet.</p><Link className="inline-block mt-4 underline" to="/monitoring/settings">View active monitors</Link></> : error ? <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div> : <p role="status">Loading company setup…</p>}
  </section>;
}
