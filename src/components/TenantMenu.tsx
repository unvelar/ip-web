import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ChevronDown } from 'lucide-react';
import { tenantLabel, type Tenant } from '../api';
import { useAuth } from '../context/AuthContext';
import { useActiveIp } from '../context/ActiveIpContext';

/** One global entry for tenant context and its management workspace. */
export default function TenantMenu({ tenants, preview }: { tenants: Tenant[]; preview: boolean }) {
  const { user, actingTenantId, switchTenant } = useAuth();
  const { ips, activeIp, activeIpId, loading, error, selectIp } = useActiveIp();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const tenant = tenants.find(value => value.id === actingTenantId);
  const name = preview ? 'Local workspace' : tenant ? tenantLabel(tenant) : 'Your tenant';
  const managementUrl = preview ? '/monitoring/setup?preview=local' : '/monitoring/setup';
  return <div className="tenant-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }}>
    <button ref={trigger} type="button" className="tenant-trigger" aria-label={`Tenant menu: ${name}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
      <Building2 size={15} aria-hidden /><span className="tenant-trigger-label">Tenant</span><span className="tenant-trigger-name">{name}</span><ChevronDown size={13} aria-hidden />
    </button>
    {open && <>
      <div className="tenant-menu-dismiss" onPointerDown={() => setOpen(false)} aria-hidden />
      <div id={id} className="tenant-popover" role="region" aria-label="Tenant context">
        <div className="tenant-menu-heading"><span>{preview ? 'Local preview' : 'Tenant'}</span><strong>{name}</strong></div>
        <Link className="tenant-manage-link" to={managementUrl} onClick={() => setOpen(false)}><span><strong>Manage monitoring</strong><small>Brands, products and coverage</small></span><ArrowRight size={16} aria-hidden /></Link>
        {!preview && <div className="tenant-menu-section">
          <label htmlFor={`${id}-ip`}>Working IP</label>
          <select id={`${id}-ip`} value={activeIpId ?? ''} disabled={loading || !ips.length} onChange={event => selectIp(event.target.value)}>
            {loading ? <option value="">Loading IPs…</option> : !ips.length ? <option value="">{error ? 'IPs unavailable' : 'No IPs yet'}</option> : ips.map(ip => <option key={ip.id} value={ip.id}>{ip.name}</option>)}
          </select>
          <p>{error ?? `Filters the current reports${activeIp ? ` for ${activeIp.name}` : ''}.`}</p>
        </div>}
        {!preview && user?.role === 'admin' && <div className="tenant-menu-section">
          <label htmlFor={`${id}-tenant`}>Switch tenant</label>
          <select id={`${id}-tenant`} value={actingTenantId ?? ''} disabled={!tenants.length} onChange={event => switchTenant(event.target.value)}>{tenants.map(value => <option key={value.id} value={value.id}>{tenantLabel(value)}</option>)}</select>
        </div>}
      </div>
    </>}
  </div>;
}
