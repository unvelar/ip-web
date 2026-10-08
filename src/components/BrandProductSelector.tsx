import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { useActiveIp } from '../context/ActiveIpContext';

/** Direct access to the brand or product used by the current reports. */
export default function BrandProductSelector() {
  const { ips, activeIp, activeIpId, loading, error, selectIp } = useActiveIp();
  const errorId = useId();

  return <div className="brand-product-selector">
    <select
      aria-label="Brand or product"
      aria-describedby={error ? errorId : undefined}
      title={activeIp?.name ?? 'Brand or product'}
      value={loading || !ips.length ? '' : activeIpId ?? ''}
      disabled={loading || !ips.length}
      onChange={event => selectIp(event.target.value)}
    >
      {loading ? <option value="">Loading brands and products…</option> : !ips.length ? <option value="">{error ? 'Records unavailable' : 'No brands or products yet'}</option> : <>
        {ips.some(ip => ip.scope_kind === 'brand') && <optgroup label="Brands">{ips.filter(ip => ip.scope_kind === 'brand').map(ip => <option key={ip.id} value={ip.id}>{ip.name}{ip.monitoring_enabled ? '' : ' · Monitoring off'}</option>)}</optgroup>}
        {ips.some(ip => ip.scope_kind === 'product') && <optgroup label="Products">{ips.filter(ip => ip.scope_kind === 'product').map(ip => <option key={ip.id} value={ip.id}>{ip.name}{ip.brand_name ? ` · ${ip.brand_name}` : ''}{ip.monitoring_enabled ? '' : ' · Monitoring off'}</option>)}</optgroup>}
        {ips.some(ip => !ip.scope_kind) && <optgroup label="Unconfigured records">{ips.filter(ip => !ip.scope_kind).map(ip => <option key={ip.id} value={ip.id}>{ip.name} · Not configured</option>)}</optgroup>}
      </>}
    </select>
    <ChevronDown size={13} aria-hidden />
    {error && <span id={errorId} className="sr-only">{error}</span>}
  </div>;
}
