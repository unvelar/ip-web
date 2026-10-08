import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, ChevronDown } from 'lucide-react';
import { tenantLabel, type Tenant } from '../api';
import { useAuth } from '../context/AuthContext';
import { useActiveIp } from '../context/ActiveIpContext';

/** One global entry for tenant context and its management workspace. */
export default function TenantMenu({ tenants }: { tenants: Tenant[] }) {
  const { actingTenantId } = useAuth();
  const { ips, activeIp, activeIpId, loading, error, selectIp } = useActiveIp();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const tenant = tenants.find(value => value.id === actingTenantId);
  const name = tenant ? tenantLabel(tenant) : 'Your tenant';
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
        <div className="tenant-menu-heading"><span>Tenant</span><strong>{name}</strong></div>
        <Link className="tenant-manage-link" to="/monitoring/setup" onClick={() => setOpen(false)}><span><strong>Manage monitoring</strong><small>Brands, products and coverage</small></span><ArrowRight size={16} aria-hidden /></Link>
        <div className="tenant-menu-section">
          <label htmlFor={`${id}-ip`}>Brand or product</label>
          <select id={`${id}-ip`} value={activeIpId ?? ''} disabled={loading || !ips.length} onChange={event => selectIp(event.target.value)}>
            {loading ? <option value="">Loading brands and products…</option> : !ips.length ? <option value="">{error ? 'Records unavailable' : 'No brands or products yet'}</option> : <>
              {ips.some(ip => ip.scope_kind === 'brand') && <optgroup label="Brands">{ips.filter(ip => ip.scope_kind === 'brand').map(ip => <option key={ip.id} value={ip.id}>{ip.name}{ip.monitoring_enabled ? '' : ' · Monitoring off'}</option>)}</optgroup>}
              {ips.some(ip => ip.scope_kind === 'product') && <optgroup label="Products">{ips.filter(ip => ip.scope_kind === 'product').map(ip => <option key={ip.id} value={ip.id}>{ip.name}{ip.brand_name ? ` · ${ip.brand_name}` : ''}{ip.monitoring_enabled ? '' : ' · Monitoring off'}</option>)}</optgroup>}
              {ips.some(ip => !ip.scope_kind) && <optgroup label="Unconfigured records">{ips.filter(ip => !ip.scope_kind).map(ip => <option key={ip.id} value={ip.id}>{ip.name} · Not configured</option>)}</optgroup>}
            </>}
          </select>
          <p>{error ?? (activeIp && !activeIp.scope_kind ? 'This record has no monitoring configuration. Open Manage monitoring to configure it.' : `Shows ${activeIp?.scope_kind === 'product' ? 'product' : 'brand-wide'} results${activeIp ? ` for ${activeIp.name}` : ''}.`)}</p>
        </div>
        {Boolean(activeIp?.historical_ips.length) && <div className="tenant-menu-section" aria-label="Linked history">
          <span className="tenant-history-label">Linked history</span>
          <p>{activeIp!.historical_ips.map(ip => ip.name).join(', ')}. Included in this {activeIp!.scope_kind === 'product' ? 'product' : 'brand'}'s task history.</p>
          <Link className="tenant-history-link" to={`/monitoring/tasks?ip_id=${encodeURIComponent(activeIpId!)}`} onClick={() => setOpen(false)}>View task history<ArrowRight size={13} aria-hidden /></Link>
        </div>}
      </div>
    </>}
  </div>;
}
