import { Link, useLocation } from 'react-router-dom';
import { isLocalMonitoringPreview } from '../monitoring-workspace/localPreviewAvailability';

export default function TenantWorkspaceNav() {
  const { pathname, search } = useLocation();
  const preview = isLocalMonitoringPreview(pathname, search, window.location.hostname, import.meta.env.DEV);
  return <div className="tenant-workspace-nav">
    <span>Tenant workspace</span>
    <nav aria-label="Tenant workspace">
      <Link to={preview ? '/monitoring/setup?preview=local' : '/monitoring/setup'} aria-current={pathname === '/monitoring/setup' ? 'page' : undefined}>Brands &amp; products</Link>
      <Link to="/ips" aria-current={pathname.startsWith('/ips') ? 'page' : undefined}>IP assets</Link>
      <Link to="/monitoring/settings" aria-current={pathname === '/monitoring/settings' ? 'page' : undefined}>Active monitoring</Link>
    </nav>
  </div>;
}
