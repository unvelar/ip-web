import { useEffect, useRef, useState } from 'react';
import { MarketplaceMark } from './CoverageEditor';
import { countryLabel, flagEmoji } from '../lib/countries';
import { DraftError, type AdminCatalog, type AdminMarketplace, type MarketplaceEdit, type MarketplaceClient } from './contracts';
import './workspace.css';
import { useDraftNavigationGuard } from './useDraftNavigationGuard';

const blank = (): MarketplaceEdit => ({ key: null, expected_revision: 0, name: '', domain: '', logo_key: null, categories: [], markets: [] });
const edit = (source: AdminMarketplace): MarketplaceEdit => ({ key: source.key, expected_revision: source.revision, name: source.name, domain: source.domain, logo_key: source.logo_key, categories: source.categories.map(item => item.key), markets: structuredClone(source.markets) });

export default function MarketplaceAdmin({ client, onLeave, embedded = false }: { client: MarketplaceClient; onLeave?: () => void; embedded?: boolean }) {
  const Content = embedded ? 'div' : 'main';
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [form, setForm] = useState<MarketplaceEdit | null>(null);
  const [savedForm, setSavedForm] = useState('');
  const [formError, setFormError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [sectorName, setSectorName] = useState('');
  const [sectorError, setSectorError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const dirty = form !== null && JSON.stringify(form) !== savedForm;

  useEffect(() => { let active = true; void client.catalog().then(value => { if (active) setCatalog(value); }).catch(err => { if (active) setError(err.message); }); return () => { active = false; }; }, [client]);
  useEffect(() => { if (form && !dialog.current?.open) dialog.current?.showModal(); }, [form]);
  useDraftNavigationGuard(dirty);
  async function refresh() { setError(''); try { setCatalog(await client.catalog()); } catch (err) { setError(err instanceof Error ? err.message : String(err)); } }
  function open(source?: AdminMarketplace) { const value = source ? edit(source) : blank(); setForm(value); setSavedForm(JSON.stringify(value)); setFormError(''); setSectorError(''); setSectorName(''); setConflict(false); setDiscarding(false); setMessage(''); }
  function close() { dialog.current?.close(); setForm(null); }
  function requestClose() { if (busy) return; if (dirty) setDiscarding(true); else close(); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!form) return;
    setBusy(true); setFormError('');
    try {
      await client.saveMarketplace(form);
      // The persisted mutation is complete even if the subsequent list refresh fails.
      close(); setMessage(`${form.name} saved. Available in the selected countries and sectors.`);
      await refresh();
    } catch (err) { setFormError(err instanceof Error ? err.message : String(err)); setConflict(err instanceof DraftError && err.status === 409); }
    finally { setBusy(false); }
  }
  async function reloadMarketplace() {
    if (!form) return; setBusy(true);
    try { const latest = await client.catalog(); setCatalog(latest); const source = latest.marketplaces.find(item => item.key === form.key || item.domain === form.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '')); if (source) open(source); else setFormError('Marketplace no longer available. Your edits are still here.'); }
    catch (err) { setFormError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  async function addSector() {
    if (!sectorName.trim() || !form) return; setBusy(true); setSectorError('');
    try {
      const created = await client.addSector(sectorName.trim());
      setCatalog(current => current ? { ...current, categories: [...current.categories.filter(item => item.key !== created.key), created].sort((a, b) => a.name.localeCompare(b.name)) } : current);
      setForm({ ...form, categories: [...new Set([...form.categories, created.key])] }); setSectorName('');
    } catch (err) { setSectorError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function changeMarket(index: number, change: Partial<MarketplaceEdit['markets'][number]>) {
    if (form) setForm({ ...form, markets: form.markets.map((market, i) => i === index ? { ...market, ...change } : market) });
  }
  const matches = catalog?.marketplaces.filter(source => `${source.name} ${source.domain}`.toLowerCase().includes(query.toLowerCase()) && (!country || source.markets.some(market => market.country === country)) && (!sector || source.categories.some(category => category.key === sector))) ?? [];
  return <div className={`monitoring-workspace${embedded ? " embedded-catalog" : ""}`}>
    {!embedded && <div className="sandbox-banner"><strong>Local admin</strong><span>Shared sandbox catalog · No monitoring jobs run</span></div>}
    <div className="shell">{!embedded && <aside className="sidebar"><div className="wordmark">unvelar<span>®</span></div><span className="eyebrow">Admin</span><nav aria-label="Admin"><button aria-current="page">Marketplace catalog</button></nav><button className="secondary" onClick={onLeave}>Back to workspaces</button></aside>}
      <Content className="workspace-content">{!embedded && <header className="topbar">Admin / Marketplace catalog</header>}<div className="page">
        <div className="page-heading"><div>{!embedded && <><h1>Marketplaces</h1><p>Manage where companies can monitor, and the sectors each marketplace covers.</p></>}</div><button className="primary" disabled={!catalog || busy} onClick={() => open()}>Add marketplace</button></div>
        {error && <div className="error-box" role="alert">{error} <button className="text-button" onClick={refresh}>Retry catalog</button></div>}
        <div className="status" role="status">{message}</div>
        {!catalog ? !error && <p>Loading catalog…</p> : <>
          <div className="catalog-filters"><input aria-label="Search marketplaces" type="search" placeholder="Search marketplaces…" value={query} onChange={event => setQuery(event.target.value)} /><select aria-label="Filter by country" value={country} onChange={event => setCountry(event.target.value)}><option value="">All countries</option>{catalog.countries.map(item => <option key={item.code} value={item.code}>{flagEmoji(item.code)} {item.name}</option>)}</select><select aria-label="Filter by sector" value={sector} onChange={event => setSector(event.target.value)}><option value="">All sectors</option>{catalog.categories.map(item => <option key={item.key} value={item.key}>{item.name}</option>)}</select></div>
          <div className="catalog-list"><div className="catalog-table-head" aria-hidden="true"><span>Marketplace</span><span>Countries</span><span>Sectors</span><span /></div>{matches.map(source => <div className="catalog-row" key={source.key}><div className="catalog-identity"><MarketplaceMark source={source} /><div><strong>{source.name}</strong><p>{source.domain}</p></div></div><div className="catalog-countries">{source.markets.length ? source.markets.map(market => <span key={market.country} title={catalog.countries.find(item => item.code === market.country)?.name ?? market.country}>{flagEmoji(market.country)} {market.country}</span>) : <span className="field-note">No countries assigned</span>}</div><div className="marketplace-genres">{source.categories.map(category => <span className="genre-tag" key={category.key}>{category.name}</span>)}</div><button className="secondary" aria-label={`Edit ${source.name}`} onClick={() => open(source)}>Edit</button></div>)}</div>
          {!matches.length && <p className="empty-state">No marketplaces match these filters.</p>}
          <p className="field-note">{matches.length} marketplaces · Catalog entries are shared across companies. Monitoring support remains unverified until a connector is validated.</p>
        </>}
      </div></Content>
    </div>
    <dialog className="catalog-dialog" ref={dialog} aria-labelledby="marketplace-heading" onCancel={event => { event.preventDefault(); requestClose(); }}>
      {form && catalog && <form onSubmit={save}>
        <div className="dialog-header"><div><h2 id="marketplace-heading">{form.key ? 'Edit marketplace' : 'Add marketplace'}</h2><p>Available to all companies in this catalog.</p></div><button type="button" className="secondary" disabled={busy} onClick={requestClose}>Close</button></div>
        {formError && <div className="error-box" role="alert">{formError}{conflict && <p>Your edits have been kept. <button type="button" className="text-button" disabled={busy} onClick={reloadMarketplace}>Discard edits and load latest</button></p>}</div>}
        <fieldset disabled={busy}>
          <div className="catalog-form-grid"><div><label htmlFor="marketplace-name">Marketplace name</label><input id="marketplace-name" autoFocus required maxLength={160} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div><div><label htmlFor="marketplace-domain">Main website</label><input id="marketplace-domain" required readOnly={!!form.key} placeholder="marketplace.com" value={form.domain} onChange={event => setForm({ ...form, domain: event.target.value })} /></div></div>
          <label htmlFor="marketplace-logo">Logo</label><select id="marketplace-logo" value={form.logo_key ?? ''} onChange={event => setForm({ ...form, logo_key: event.target.value || null })}><option value="">Automatic initials</option>{['amazon', 'ebay', 'etsy', 'facebook', 'google', 'shopify'].map(key => <option key={key} value={key}>{key === 'ebay' ? 'eBay' : key[0].toUpperCase() + key.slice(1)}</option>)}</select>
          <div className="catalog-section-heading"><h3>Countries & storefronts</h3><select aria-label="Add marketplace country" value="" onChange={event => { const code = event.target.value; if (!code) return; const domain = form.domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''); setForm({ ...form, markets: [...form.markets, { country: code, storefront_domain: domain, evidence_url: domain ? `https://${domain}/` : '' }] }); }}><option value="">+ Add country</option>{catalog.countries.filter(item => !form.markets.some(market => market.country === item.code)).map(item => <option key={item.code} value={item.code}>{flagEmoji(item.code)} {item.name}</option>)}</select></div>
          {!form.markets.length && <p className="field-note">Add the countries where this marketplace should appear.</p>}
          {form.markets.map((market, index) => <div className="catalog-market" key={market.country}><div className="catalog-market-heading"><strong>{flagEmoji(market.country)} {catalog.countries.find(item => item.code === market.country)?.name ?? countryLabel(market.country)}</strong><button type="button" className="text-button" aria-label={`Remove ${market.country}`} onClick={() => setForm({ ...form, markets: form.markets.filter((_, i) => i !== index) })}>Remove</button></div><div className="catalog-form-grid"><div><label htmlFor={`storefront-${market.country}`}>Storefront domain</label><input id={`storefront-${market.country}`} required placeholder="marketplace.it" value={market.storefront_domain} onChange={event => changeMarket(index, { storefront_domain: event.target.value })} /></div><div><label htmlFor={`reference-${market.country}`}>Reference URL</label><input id={`reference-${market.country}`} required type="url" placeholder="https://marketplace.it/" value={market.evidence_url} onChange={event => changeMarket(index, { evidence_url: event.target.value })} /></div></div></div>)}
          <div className="catalog-section-heading"><h3>Sectors</h3><span className="field-note">Select all that apply</span></div><div className="catalog-sector-choices">{catalog.categories.map(category => <label key={category.key}><input type="checkbox" checked={form.categories.includes(category.key)} onChange={() => setForm({ ...form, categories: form.categories.includes(category.key) ? form.categories.filter(key => key !== category.key) : [...form.categories, category.key] })} />{category.name}</label>)}</div>
          <div className="catalog-new-sector"><input aria-label="New sector name" placeholder="New sector…" maxLength={80} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void addSector(); } }} value={sectorName} onChange={event => setSectorName(event.target.value)} /><button type="button" className="secondary" disabled={!sectorName.trim()} onClick={addSector}>Add sector</button></div><p className="field-note">New sectors are saved to the shared catalog immediately.</p>{sectorError && <p className="error-box" role="alert">{sectorError}</p>}
        </fieldset>
        {discarding ? <div className="catalog-discard"><p>Discard unsaved marketplace changes?</p><div className="actions"><button type="button" className="secondary" onClick={() => setDiscarding(false)}>Keep editing</button><button type="button" className="primary" onClick={close}>Discard changes</button></div></div> : <div className="actions"><button type="button" className="secondary" disabled={busy} onClick={requestClose}>Cancel</button><button type="submit" className="primary" disabled={!dirty || busy || conflict}>{busy ? 'Saving…' : 'Save marketplace'}</button></div>}
      </form>}
    </dialog>
  </div>;
}
