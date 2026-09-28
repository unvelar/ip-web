import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { exampleCompanies } from './fixtures';
import { openLocalCatalog, openLocalCompany } from './localSessions';
import { localPreviewAvailable } from './localPreviewAvailability';
import WorkspaceEditor from './WorkspaceEditor';
import MarketplaceAdmin from './MarketplaceAdmin';
import './workspace.css';

export default function LocalPreview({ kind }: { kind: 'workspace' | 'catalog' }) {
  if (!localPreviewAvailable(location.hostname, import.meta.env.DEV)) throw new Error('Local development preview required.');
  const [session, setSession] = useState<Awaited<ReturnType<typeof openLocalCompany>> | null>(null);
  const [admin, setAdmin] = useState<Awaited<ReturnType<typeof openLocalCatalog>> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (kind !== 'catalog') return;
    let active = true;
    void openLocalCatalog(location.hostname).then(client => { if (active) setAdmin(client); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [kind, attempt]);
  async function open(company: typeof exampleCompanies[number]) {
    setBusy(true); setError('');
    try { setSession(await openLocalCompany(company, location.hostname)); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="monitoring-workspace"><div className="local-preview-toolbar">
      <div><strong>Local preview</strong><p>Sample data · Saved locally</p></div>
      <Link to={kind === 'catalog' ? '/monitoring/setup?preview=local' : '/admin/marketplaces?preview=local'}>{kind === 'catalog' ? 'Preview tenant setup' : 'Preview marketplace catalog'} →</Link>
    </div></div>
    {session ? <WorkspaceEditor client={session.client} loaded={session.data} embedded localPreview tenantSwitcherLabel="Switch sample tenant" onLeave={() => setSession(null)} /> : admin ? <MarketplaceAdmin client={admin} embedded /> : <div className="monitoring-workspace"><section className="local-preview-chooser">
      {error && <div className="error-box" role="alert"><p>Could not open the local preview. {error}</p><p className="field-note">The isolated monitoring API must be running on localhost:53000. Your website sign-in is unchanged.</p>{kind === 'catalog' && <button className="text-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button>}</div>}
      {kind === 'workspace' ? <><h1>Choose a sample tenant</h1><p>Try tenant, brand and product setup inside the website.</p><div className="company-cards">{exampleCompanies.map(company => <button className="company-card" key={company.id} disabled={busy} onClick={() => void open(company)}><strong>{company.name}</strong><span>{company.id === 'giardini' ? 'One focal product' : 'A broader product catalog'}</span><span>Open sample tenant →</span></button>)}</div>{busy && <p role="status">Opening sample tenant…</p>}</> : !error && <p role="status">Opening the local marketplace catalog…</p>}
    </section></div>}
  </>;
}
