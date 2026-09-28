import { useEffect, useState } from 'react';
import { AdminPage } from '../components/admin/AdminPage';
import { getMonitoringSetupCapabilities, monitoringSetupClient } from '../api/monitoringWorkspace';
import MarketplaceAdmin from '../monitoring-workspace/MarketplaceAdmin';

export default function AdminMarketplaces() {
  return <AdminPage section="marketplaces" title="Marketplaces" description="Manage marketplace websites, country storefronts and sectors shared across tenants." wide>
    <HostedCatalog />
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
  if (error) return <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div>;
  if (available === false) return <p>The marketplace editor is not enabled on the connected API yet.</p>;
  return <p role="status">Loading marketplace catalog…</p>;
}
