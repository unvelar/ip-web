import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdminPage } from '../components/admin/AdminPage';
import { getMonitoringSetupCapabilities, monitoringSetupClient } from '../api/monitoringWorkspace';
import MarketplaceAdmin from '../monitoring-workspace/MarketplaceAdmin';
import LocalMonitoringPreviewLink from '../components/LocalMonitoringPreviewLink';
import { isLocalMonitoringPreview } from '../monitoring-workspace/localPreviewAvailability';

const LocalPreview = import.meta.env.DEV ? lazy(() => import('../monitoring-workspace/LocalPreview')) : null;

export default function AdminMarketplaces() {
  const location = useLocation();
  const local = LocalPreview && isLocalMonitoringPreview(location.pathname, location.search, window.location.hostname, import.meta.env.DEV);
  return <AdminPage section="marketplaces" title="Marketplaces" description="Manage marketplace websites, country storefronts and sectors shared across tenants." wide>
    {local && LocalPreview ? <Suspense fallback={<p role="status">Opening local preview…</p>}><LocalPreview kind="catalog" /></Suspense> : <HostedCatalog />}
  </AdminPage>;
}

function HostedCatalog() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getMonitoringSetupCapabilities().then(value => { if (active) setAvailable(value.marketplace_admin); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  if (available) return <MarketplaceAdmin client={monitoringSetupClient} embedded />;
  if (error) return <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button><LocalMonitoringPreviewLink to="/admin/marketplaces" /></div>;
  if (available === false) return <><p>The marketplace editor is not enabled on the connected API yet.</p><LocalMonitoringPreviewLink to="/admin/marketplaces" /></>;
  return <p role="status">Loading marketplace catalog…</p>;
}
