import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { openLocalCatalog, openLocalWorkspace } from './localSessions';
import { localPreviewAvailable } from './localPreviewAvailability';
import WorkspaceEditor from './WorkspaceEditor';
import MarketplaceAdmin from './MarketplaceAdmin';
import './workspace.css';

export default function LocalPreview({ kind }: { kind: 'workspace' | 'catalog' }) {
  if (!localPreviewAvailable(location.hostname, import.meta.env.DEV)) throw new Error('Local development preview required.');
  const [session, setSession] = useState<Awaited<ReturnType<typeof openLocalWorkspace>> | null>(null);
  const [admin, setAdmin] = useState<Awaited<ReturnType<typeof openLocalCatalog>> | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (kind !== 'catalog') {
      let active = true;
      setError('');
      void openLocalWorkspace(location.hostname).then(value => { if (active) setSession(value); }).catch(error => { if (active) setError(error.message); });
      return () => { active = false; };
    }
    let active = true;
    void openLocalCatalog(location.hostname).then(client => { if (active) setAdmin(client); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [kind, attempt]);
  return <>
    <div className="monitoring-workspace"><div className="local-preview-toolbar">
      <div><strong>Local development</strong><p>Local workspace · Saved locally</p></div>
      <Link to={kind === 'catalog' ? '/monitoring/setup?preview=local' : '/admin/marketplaces?preview=local'}>{kind === 'catalog' ? 'Preview tenant setup' : 'Preview marketplace catalog'} →</Link>
    </div></div>
    {session ? <WorkspaceEditor client={session.client} loaded={session.data} embedded localPreview onLeave={() => window.location.assign('/dashboard')} /> : admin ? <MarketplaceAdmin client={admin} embedded /> : <div className="monitoring-workspace"><section className="local-preview-chooser">
      {error && <div className="error-box" role="alert"><p>Could not open the local workspace. {error}</p><p className="field-note">The isolated monitoring API must be running on localhost:53000. Your website sign-in is unchanged.</p><button className="text-button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div>}
      {!error && <p role="status">Opening the local {kind === 'workspace' ? 'monitoring workspace' : 'marketplace catalog'}…</p>}
    </section></div>}
  </>;
}
