import { useEffect, useState } from 'react';
import { assertLocalWorkspace, workspaceClient, type WorkspaceResponse } from './api';
import WorkspaceEditor from './WorkspaceEditor';
import MarketplaceAdmin from './MarketplaceAdmin';
import './workspace.css';
import { openLocalCatalog, openLocalWorkspace } from './localSessions';

type Client = ReturnType<typeof workspaceClient>;

export default function App() {
  const [admin, setAdmin] = useState<Client | null>(null);
  const [session, setSession] = useState<{ client: Client; data: WorkspaceResponse } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    try { assertLocalWorkspace(location.hostname, import.meta.env.DEV, import.meta.env.MODE); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); return; }
    void openLocalWorkspace(location.hostname).then(value => { if (active) setSession(value); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, []);
  async function openAdmin() {
    setError('');
    try { setAdmin(await openLocalCatalog(location.hostname)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  if (admin) return <MarketplaceAdmin client={admin} onLeave={() => setAdmin(null)} />;
  if (session) return <WorkspaceEditor client={session.client} loaded={session.data} localPreview onLeave={() => window.location.assign('/')} />;
  return <div className="monitoring-workspace"><main className="welcome"><div className="eyebrow">Unvelar · Local development</div><h1>Monitoring</h1><p>Opening an isolated, empty local workspace.</p>{error ? <p className="error-box" role="alert">{error}</p> : <p role="status">Opening local workspace…</p>}<button className="secondary" onClick={() => void openAdmin()}>Open catalog admin</button><p className="field-note">It never reads production tenant data or starts monitoring.</p></main></div>;
}
