import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, request } from '../api/transport';
import { listMonitoringSellers, type MonitoringSellerSummary } from '../api/monitoring';
import { sellerProfilePath } from '../lib/sellers';
import type { Brand } from './contracts';

type Authorization = { id: string; scope: 'tenant' | 'brand' | 'legacy_ip'; brand_id: string | null; ip_catalog_id: string | null; domain: string; seller_name: string | null; seller_url: string | null };
const endpoint = '/api/monitoring-workspace/seller-authorizations';

function AuthorizedSellerProfileLink({ rule }: { rule: Authorization }) {
  const [profile, setProfile] = useState<{ path: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    // Use server-issued keys: authorization names and URLs are matching rules,
    // not necessarily the seller's canonical profile identity.
    async function resolve() {
      const sellers: MonitoringSellerSummary[] = [];
      let cursor: string | null = null;
      const name = rule.seller_name?.trim().replace(/^@+/, '').toLowerCase();
      const url = rule.seller_url?.trim().toLowerCase();
      const ipId = rule.scope === 'legacy_ip' ? rule.ip_catalog_id : null;
      do {
        const page = await listMonitoringSellers({ status: 'all', platform: rule.domain,
          ip_id: ipId, query: url ? undefined : name?.slice(0, 100), cursor, limit: 100, signal: controller.signal });
        sellers.push(...page.sellers);
        cursor = page.next_cursor;
      } while (cursor);
      const byUrl = url ? sellers.filter(seller => seller.profile_url?.trim().toLowerCase() === url) : [];
      const matches = byUrl.length ? byUrl : name ? sellers.filter(seller =>
        seller.seller_name.trim().replace(/^@+/, '').toLowerCase() === name) : [];
      const path = matches.length === 1 ? sellerProfilePath(matches[0].seller_key) : null;
      if (!controller.signal.aborted) setProfile({
        path: path && ipId ? `${path}?${new URLSearchParams({ ip_id: ipId })}` : path, failed: false,
      });
    }
    void resolve().catch(() => {
      if (!controller.signal.aborted) setProfile({ path: null, failed: true });
    });
    return () => controller.abort();
  }, [rule.domain, rule.seller_name, rule.seller_url, rule.scope, rule.ip_catalog_id]);
  return profile?.path ? <Link to={profile.path}>Visit shop</Link>
    : <div className="field-note">{!profile ? 'Loading shop profile…' : profile.failed ? 'Shop profile could not be loaded' : 'No monitored shop profile'}</div>;
}

export default function AuthorizedSellers({ brands, tenantName, scopeId, onScopeChange }: { brands: Brand[]; tenantName: string; scopeId?: string; onScopeChange?: (scope: string) => void }) {
  const [rules, setRules] = useState<Authorization[]>([]);
  const [localScope, setLocalScope] = useState(brands[0]?.id ?? 'tenant');
  const scope = scopeId ?? localScope;
  const [domain, setDomain] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await request<{authorizations: Authorization[]}>(endpoint);
    setRules(response.authorizations);
  }
  useEffect(() => { let active = true;
    request<{authorizations: Authorization[]}>(endpoint).then(value => { if (active) { setRules(value.authorizations); setAvailable(true); } })
      .catch(err => { if (active) setError(err instanceof ApiError && err.status === 404 ? 'Seller authorization management is waiting for the backend update. Existing authorizations are unchanged.' : err.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await request(endpoint, { method: 'POST', body: JSON.stringify({ scope: scope === 'tenant' ? 'tenant' : 'brand', brand_id: scope === 'tenant' ? null : scope, domain, seller_name: name.trim() || null, seller_url: url.trim() || null }) });
      setDomain(''); setName(''); setUrl(''); await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  async function revoke(rule: Authorization) {
    setBusy(true); setError('');
    try { await request(`${endpoint}/${rule.id}`, {method:'DELETE'}); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  }
  const visible = rules.filter(rule => scope === 'tenant' || rule.scope === 'tenant' || rule.brand_id === scope);
  return <section className="panel authorized-sellers" aria-label="Authorized resellers">
    <h2>Authorized resellers</h2><p>Manage sellers you trust to sell your brands. Matching listings are automatically dismissed.</p>
    <label htmlFor="authorization-scope">Authorization scope</label>
    <select id="authorization-scope" value={scope} onChange={event => (onScopeChange ?? setLocalScope)(event.target.value)}>
      <option value="tenant">Entire tenant · {tenantName}</option>{brands.map(brand => <option key={brand.id} value={brand.id}>Brand · {brand.name}</option>)}
    </select>
    <p className="field-note">{scope === 'tenant' ? 'Tenant-wide authorization covers every current and future brand and product.' : 'Brand authorization covers every current and future product in this brand. Tenant-wide rules also apply.'}</p>
    {error && <p role="alert" className="error-box">{error}</p>}
    {loading ? <p role="status">Loading authorized sellers…</p> : available ? <>
      {!visible.length && <p>No authorized sellers for this scope yet.</p>}
      {!!visible.length && <div className="table-wrap"><table><thead><tr><th>Seller</th><th>Marketplace</th><th>Authorized for</th><th>Action</th></tr></thead><tbody>{visible.map(rule => <tr key={rule.id}>
        <td>{rule.seller_name}<AuthorizedSellerProfileLink rule={rule} /></td><td>{rule.domain}</td>
        <td>{rule.scope === 'tenant' ? 'Entire tenant' : rule.scope === 'legacy_ip' ? 'Existing IP · brand mapping needed' : brands.find(brand => brand.id === rule.brand_id)?.name ?? 'Brand unavailable'}</td>
        <td><button className="secondary" disabled={busy} onClick={() => void revoke(rule)} aria-label={`Revoke authorization for ${rule.seller_name ?? rule.seller_url} on ${rule.domain}`}>Revoke authorization</button></td>
      </tr>)}</tbody></table></div>}
    </> : null}
    <form onSubmit={add}><h3>Authorize a seller</h3><div className="authorization-fields">
      <label>Marketplace domain<input required placeholder="ebay.com" value={domain} onChange={event => setDomain(event.target.value)} /></label>
      <label>Seller name<input placeholder="Shop name" value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Shop URL<input type="url" placeholder="https://…" value={url} onChange={event => setUrl(event.target.value)} /></label>
    </div><button className="primary" disabled={!available || loading || busy || !domain.trim() || (!name.trim() && !url.trim())}>Authorize seller</button></form>
    <p className="field-note">Changes take effect immediately for the selected marketplace. Revoking authorization does not reopen previously dismissed listings.</p>
  </section>;
}
