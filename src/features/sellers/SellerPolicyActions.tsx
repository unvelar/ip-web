import { useEffect, useRef, useState } from 'react';
import { Search, ShieldCheck, X } from 'lucide-react';
import {
  authorizeMonitoringSeller,
  investigateMonitoringSeller,
  revokeMonitoringSellerAuthorization,
  type MonitoringSellerProfilePage,
  type SellerPolicy,
} from '../../api/monitoring';
import { formatAgo } from '../../components/monitoring/board/utils';

type SellerDialog = 'authorize' | 'investigate' | { authorizationId: string };

function investigationLabel(row: SellerPolicy['investigations'][number]) {
  if (row.status === 'authorized') return 'Stopped, seller authorized';
  if (row.hold_reason) return 'Paused';
  switch (row.status) {
    case 'complete': return row.matching_pending ? 'Inventory complete, matching listings' : 'Inventory complete';
    case 'partial': return 'Partial coverage';
    case 'blocked': return 'Could not access inventory';
    case 'running': return 'Scanning inventory';
    case 'queued': return 'Queued';
  }
}

export function SellerPolicyActions({ profile, onChanged, ipId }: {
  profile: MonitoringSellerProfilePage;
  onChanged: () => Promise<void>;
  ipId: string | null;
}) {
  const policy = profile.policy;
  const [dialog, setDialog] = useState<SellerDialog | null>(null);
  const [scope, setScope] = useState('tenant');
  const [targetIp, setTargetIp] = useState(ipId ?? profile.ips[0]?.ip_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tenantAuthorization = policy?.authorizations.find(rule => rule.scope === 'tenant');
  const active = policy?.investigations.some(row => ['queued', 'running'].includes(row.status) || row.matching_pending);
  const hasAuthorization = Boolean(policy?.authorizations.length);

  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [dialog]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => { void onChanged().catch(() => {}); }, 10000);
    return () => window.clearInterval(timer);
  }, [active, onChanged]);

  function open(action: SellerDialog) {
    setError('');
    setScope('tenant');
    setTargetIp(profile.ips.find(ip => ip.ip_id === ipId)?.ip_id ?? profile.ips[0]?.ip_id ?? '');
    setDialog(action);
  }

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    setError('');
    try {
      if (dialog === 'authorize') {
        const result = await authorizeMonitoringSeller(
          profile.seller.key, scope === 'tenant' ? 'tenant' : 'brand', scope === 'tenant' ? null : scope,
        );
        setNotice(`${result.dismissed} ${result.dismissed === 1 ? 'finding' : 'findings'} dismissed as Do not pursue. Future listings in this scope will also be dismissed.`);
      } else if (dialog === 'investigate') {
        const result = await investigateMonitoringSeller(profile.seller.key, targetIp);
        setNotice(result.enqueued ? 'Seller investigation queued.'
          : result.skipped_reason === 'already_pending' ? 'An investigation is already queued or running.'
            : 'Seller investigation updated.');
      } else {
        const result = await revokeMonitoringSellerAuthorization(profile.seller.key, dialog.authorizationId);
        setNotice(`Authorization revoked. ${result.restored} ${result.restored === 1 ? 'finding returned' : 'findings returned'} for review.`);
      }
      setDialog(null);
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The seller action could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const revokeRule = typeof dialog === 'object' && dialog
    ? policy?.authorizations.find(rule => rule.id === dialog.authorizationId) : null;
  const revokeScope = revokeRule?.scope === 'tenant' ? 'the entire tenant'
    : policy?.brands.find(brand => brand.id === revokeRule?.brand_id)?.name ?? 'this authorization scope';
  const title = dialog === 'authorize' ? 'Authorize seller'
    : dialog === 'investigate' ? 'Investigate seller' : 'Revoke authorization';

  return (
    <section className="seller-policy" aria-label="Seller authorization and investigation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {hasAuthorization ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
              <ShieldCheck size={16} />Authorized seller
            </p>
          ) : <p className="text-sm font-semibold text-stone-800">Seller actions</p>}
          <p className="mt-1 text-xs text-stone-500">
            {tenantAuthorization ? 'Current and future findings are not pursued across your entire tenant.'
              : hasAuthorization ? 'Current and future findings are not pursued for the authorized brands.'
                : 'Investigate their inventory or authorize this marketplace account.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button" className="seller-policy-button"
            disabled={!policy?.discovery_enabled || policy.discovery_paused || Boolean(tenantAuthorization)
              || !profile.seller.profile_url || !profile.ips.length}
            onClick={() => open('investigate')}
          >
            <Search size={14} />Investigate seller
          </button>
          {!tenantAuthorization && (
            <button type="button" className="seller-policy-button" disabled={!policy?.can_authorize} onClick={() => open('authorize')}>
              <ShieldCheck size={14} />Authorize seller
            </button>
          )}
        </div>
      </div>
      {policy?.authorizations.map(rule => (
        <div key={rule.id} className="mt-3 flex items-center justify-between gap-3 border-t border-emerald-100 pt-3 text-xs">
          <span>{rule.scope === 'tenant' ? 'Entire tenant'
            : policy.brands.find(brand => brand.id === rule.brand_id)?.name ?? 'Existing authorization scope'}</span>
          <button
            type="button" className="font-semibold text-stone-600 hover:text-stone-900" disabled={busy}
            onClick={() => open({ authorizationId: rule.id })}
          >
            Revoke authorization
          </button>
        </div>
      ))}
      {policy?.discovery_paused && (
        <p className="mt-3 text-xs text-stone-500">Seller investigations are paused. Queued investigations will wait until discovery resumes.</p>
      )}
      {policy && !profile.seller.profile_url && (
        <p className="mt-3 text-xs text-stone-500">Inventory investigation requires a recorded marketplace shop URL.</p>
      )}
      {!policy && <p className="mt-3 text-xs text-stone-500">Seller actions are currently unavailable.</p>}
      {notice && <p role="status" className="mt-3 text-xs text-stone-700">{notice}</p>}
      {!dialog && error && <p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      {!!policy?.investigations.length && (
        <div className="mt-4 space-y-2 border-t border-stone-200 pt-3">
          {policy.investigations.map(row => (
            <div key={row.id} className="text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-semibold text-stone-700">{row.ip_name}</span>
                <span className="text-stone-500">{investigationLabel(row)}</span>
              </div>
              <p className="mt-1 text-stone-500">
                {row.listings_checked.toLocaleString()} listings checked · {row.findings_created.toLocaleString()} new findings · {formatAgo(row.updated_at) ?? 'Just now'}
              </p>
            </div>
          ))}
        </div>
      )}
      <dialog
        ref={dialogRef} aria-labelledby="seller-policy-title" className="seller-policy-dialog"
        onCancel={event => { if (busy) event.preventDefault(); else setDialog(null); }}
        onClose={() => { if (!busy) setDialog(null); }}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="seller-policy-title" className="text-lg font-bold text-stone-950">{title}</h2>
          <button
            type="button" aria-label="Close seller action" disabled={busy} onClick={() => setDialog(null)}
            className="rounded p-1 text-stone-500 hover:bg-stone-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mt-2 text-sm text-stone-600">{profile.seller.name} · {profile.seller.domain}</p>
        {dialog === 'authorize' ? (
          <>
            <label htmlFor="seller-authorization-scope" className="mt-5 block text-sm font-semibold text-stone-700">Authorize for</label>
            <select id="seller-authorization-scope" className="seller-policy-select" value={scope} onChange={event => setScope(event.target.value)} disabled={busy}>
              <option value="tenant">Entire tenant, all brands and products</option>
              {policy?.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}
            </select>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              All current open listings and future listings from {profile.seller.profile_url ? 'this marketplace account' : 'this exact seller name on this marketplace'} will be dismissed as Do not pursue for {scope === 'tenant' ? 'every brand and product in this tenant' : policy?.brands.find(brand => brand.id === scope)?.name}. Pending investigations and unsent takedowns in this scope will stop.
            </p>
            {!profile.seller.profile_url && (
              <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                This seller has no recorded shop URL. The rule matches the exact name "{profile.seller.name}" on {profile.seller.domain}, including other accounts using that same name. A changed name will need a new rule.
              </p>
            )}
          </>
        ) : dialog === 'investigate' ? (
          <>
            <label htmlFor="seller-investigation-ip" className="mt-5 block text-sm font-semibold text-stone-700">Investigate for</label>
            <select id="seller-investigation-ip" className="seller-policy-select" value={targetIp} onChange={event => setTargetIp(event.target.value)} disabled={busy}>
              {profile.ips.map(ip => <option key={ip.ip_id} value={ip.ip_id}>{ip.ip_name}</option>)}
            </select>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              Scan this seller's inventory and check each listing against the selected IP. Any new findings will enter the normal review process. Saved progress is reused when the scan can continue.
            </p>
          </>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-stone-600">
            Revoke authorization for {revokeScope}. Findings dismissed by this authorization return for review. Separate manual decisions and takedowns already sent remain recorded. Cancelled takedowns will not be sent automatically.
          </p>
        )}
        {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="seller-policy-button" disabled={busy} onClick={() => setDialog(null)}>Cancel</button>
          <button
            type="button" className="seller-policy-button seller-policy-primary"
            disabled={busy || (dialog === 'investigate' && !targetIp)} onClick={() => void submit()}
          >
            {busy ? 'Saving…' : dialog === 'investigate' ? 'Start investigation' : title}
          </button>
        </div>
      </dialog>
    </section>
  );
}
