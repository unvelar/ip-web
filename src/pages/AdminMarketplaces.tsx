import { useEffect, useState } from 'react';
import { AdminPage } from '../components/admin/AdminPage';
import { getMonitoringSetupCapabilities, monitoringSetupClient } from '../api/monitoringWorkspace';
import MarketplaceAdmin from '../monitoring-workspace/MarketplaceAdmin';

export default function AdminMarketplaces() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void getMonitoringSetupCapabilities().then(value => { if (active) setAvailable(value.marketplace_admin); }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  return <AdminPage section="marketplaces" title="Marketplaces" description="Manage marketplace websites, country storefronts and sectors shared across companies." wide>
    {available ? <MarketplaceAdmin client={monitoringSetupClient} embedded /> : error ? <div role="alert"><p>{error}</p><button className="mt-3 underline" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Try again</button></div> : available === false ? <p>The marketplace editor is not enabled on this API yet.</p> : <p role="status">Loading marketplace catalog…</p>}
  </AdminPage>;
}
