import { useState } from 'react';
import { assertLocalWorkspace, DraftError, workspaceClient, type WorkspaceResponse } from './api';
import { exampleCompanies, exampleWorkspace } from './fixtures';
import WorkspaceEditor from './WorkspaceEditor';
import MarketplaceAdmin from './MarketplaceAdmin';
import './workspace.css';

type Client = ReturnType<typeof workspaceClient>;

export default function App() {
  const [admin, setAdmin] = useState<Client | null>(null);
  const [session, setSession] = useState<{ client: Client; data: WorkspaceResponse } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open(company: typeof exampleCompanies[number]) {
    setBusy(true); setError('');
    try {
      assertLocalWorkspace(location.hostname, import.meta.env.DEV, import.meta.env.MODE);
      const client = workspaceClient(location.hostname);
      await client.signIn(company.email);
      let data = await client.load();
      if (data.revision === 0) {
        try { await client.save(exampleWorkspace(company.id), 0); }
        catch (err) { if (!(err instanceof DraftError && err.status === 409)) throw err; }
        data = await client.load();
      }
      setSession({ client, data: { ...data, company: { ...data.company, name: company.name } } });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function openAdmin() {
    setBusy(true); setError('');
    try { assertLocalWorkspace(location.hostname, import.meta.env.DEV, import.meta.env.MODE); const client = workspaceClient(location.hostname); await client.signIn('catalog-admin@unvelar.example', true); setAdmin(client); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  if (admin) return <MarketplaceAdmin client={admin} onLeave={() => setAdmin(null)} />;
  if (session) return <WorkspaceEditor client={session.client} loaded={session.data} onLeave={() => setSession(null)} />;
  return <div className="monitoring-workspace"><main className="welcome"><div className="eyebrow">Unvelar · Local development</div><h1>Your monitoring workspace</h1><p>Try one focused product or a larger catalog. Edits are saved in a separate local database.</p><div className="company-cards">{exampleCompanies.map(company => <button className="company-card" disabled={busy} key={company.id} onClick={() => open(company)}><strong>{company.name}</strong><span>{company.id === 'giardini' ? 'One focal product' : 'A broader product catalog'}</span><span>Open example workspace →</span></button>)}</div>{busy && <p role="status">Opening local workspace…</p>}{error && <p className="error-box" role="alert">{error}</p>}<button className="secondary" disabled={busy} onClick={openAdmin}>Open catalog admin</button><p className="field-note">Synthetic examples. Production accounts, monitoring and classification are untouched.</p></main></div>;
}
