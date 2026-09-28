import { useEffect, useRef, useState } from 'react';
import { COUNTRIES, countryLabel } from '../lib/countries';
import { assertLocalWorkspace, DraftError, workspaceClient, type Brand, type Coverage, type Draft, type Plan, type Product, type Workspace, type WorkspaceResponse } from './api';
import { exampleCompanies, exampleWorkspace } from './fixtures';
import './workspace.css';

type Client = ReturnType<typeof workspaceClient>;
const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];

function WorkspaceEditor({ client, loaded, onLeave }: { client: Client; loaded: WorkspaceResponse; onLeave: () => void }) {
  const [saved, setSaved] = useState<Draft>(loaded);
  const [document, setDocument] = useState(loaded.document);
  const [brandId, setBrandId] = useState(loaded.document.brands[0]?.id ?? '');
  const [productId, setProductId] = useState<string | null>(null);
  const [page, setPage] = useState<'monitoring' | 'products'>('monitoring');
  const [query, setQuery] = useState('');
  const [websiteQuery, setWebsiteQuery] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<'brand' | 'product'>('product');
  const addDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const brand = document.brands.find(item => item.id === brandId);
  const scope = productId ? brand?.products.find(item => item.id === productId) : brand;
  const coverage = scope?.coverage ?? brand?.coverage;
  const dirty = JSON.stringify(document) !== JSON.stringify(saved.document);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!brandId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void client.preview(document, brandId, productId, controller.signal).then(result => {
        if (!controller.signal.aborted) { setPlan(result); setPreviewError(''); }
      }).catch(err => { if (!controller.signal.aborted) { setPlan(null); setPreviewError(err.message); } });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, document, brandId, productId]);

  function updateDocument(next: Workspace) { setDocument(next); setPlan(null); setMessage(''); }
  function updateScope(change: Partial<Pick<Product, 'name' | 'keywords' | 'coverage'>>) {
    if (!brand) return;
    updateDocument({ ...document, brands: document.brands.map(item => item.id !== brand.id ? item : productId
      ? { ...item, products: item.products.map(product => product.id === productId ? { ...product, ...change } : product) }
      : { ...item, ...change, coverage: change.coverage ?? item.coverage }) });
  }
  function updateCoverage(change: Partial<Coverage>) { if (coverage) updateScope({ coverage: { ...coverage, ...change } }); }
  function selectProduct(id: string | null) { setProductId(id); setPlan(null); setPage('monitoring'); }
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await client.save(document, saved.revision);
      setSaved(result); setDocument(result.document); setConflict(false);
      setMessage(`Draft saved · Revision ${result.revision}. Monitoring has not been activated.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setConflict(err instanceof DraftError && err.status === 409); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true); setError('');
    try {
      const result = await client.load(); setSaved(result); setDocument(result.document);
      setBrandId(result.document.brands[0]?.id ?? ''); setProductId(null); setPlan(null); setConflict(false);
      setMessage('Latest saved draft loaded.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function openAdd(kind: 'brand' | 'product') {
    setAdding(kind); setError(''); addDialog.current?.showModal();
  }
  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    if (!name) return;
    const keywords = String(form.get('keywords')).split('\n').filter(value => value.trim());
    const id = crypto.randomUUID();
    if (adding === 'brand') {
      const item: Brand = { id, name, keywords, coverage: { sources: [], countries: [], frequency: 'weekly' }, products: [] };
      updateDocument({ ...document, brands: [...document.brands, item] }); setBrandId(id); setProductId(null);
    } else if (brand) {
      const item: Product = { id, name, keywords, coverage: null, catalog_product_id: null };
      updateDocument({ ...document, brands: document.brands.map(b => b.id === brandId ? { ...b, products: [...b.products, item] } : b) }); setProductId(id);
    }
    setPage('monitoring'); event.currentTarget.reset(); addDialog.current?.close();
  }
  return <>
    <div className="sandbox-banner"><strong>Local development</strong><span>Saved in your sandbox database · No monitoring jobs run</span></div>
    <div className="shell">
      <aside className="sidebar"><div className="wordmark">unvelar<span>®</span></div><span className="eyebrow">Company</span>
        <strong className="company-name">{exampleCompanies.find(item => item.email.endsWith(`@${loaded.company.name}`))?.name ?? loaded.company.name}</strong>
        <button className="secondary" disabled={busy} onClick={() => dirty ? leaveDialog.current?.showModal() : onLeave()}>Switch company</button>
        <div hidden={document.brands.length < 2}><label className="eyebrow brand-label" htmlFor="brand">Brand</label><select id="brand" disabled={busy} value={brandId} onChange={e => { setBrandId(e.target.value); selectProduct(null); }}><option value="" disabled>Select brand</option>{document.brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        <button className="text-button" disabled={busy} onClick={() => openAdd('brand')}>+ Add brand</button>
        <div className="nav-label">Workspace</div><nav aria-label="Workspace"><button aria-current={page === 'monitoring' ? 'page' : undefined} onClick={() => setPage('monitoring')}>Monitoring</button><button aria-current={page === 'products' ? 'page' : undefined} onClick={() => setPage('products')}>Products <span>{brand?.products.length ?? 0}</span></button></nav>
        <div className="sidebar-note">Searches guide discovery.<br />Listing evidence determines identity.</div>
      </aside>
      <main><header className="topbar"><span>{brand?.name ?? 'Workspace'} / {page === 'monitoring' ? 'Monitoring' : 'Products'}</span><span className="demo-badge">Draft · Revision {saved.revision}</span></header>
        <div className="page">
          {error && <div className="error-box" role="alert">{error}{conflict && <p>Your edits are still here. Copy any changes you want to keep, then <button className="text-button" disabled={busy} onClick={reload}>reload the saved draft</button>.</p>}</div>}
          {!brand || !scope || !coverage ? <section className="empty-state"><h1>Set up your brands</h1><p>Add a brand to plan its keywords, websites and countries.</p><button className="primary" onClick={() => openAdd('brand')}>Add brand</button></section> : <>
            <div className="page-heading"><div><div className="eyebrow">{brand.name}</div><h1>{page === 'monitoring' ? 'Monitoring' : 'Products'}</h1><p>{page === 'monitoring' ? 'Choose what to look for, and where.' : 'Shared coverage by default. Focus a product when it needs more attention.'}</p></div>{page === 'products' && <button className="primary" disabled={busy} onClick={() => openAdd('product')}>Add product</button>}</div>
            {page === 'products' ? <>
              <label className="visually-hidden" htmlFor="product-search">Search products</label><input id="product-search" type="search" placeholder="Search products…" value={query} onChange={e => setQuery(e.target.value)} />
              <div>{brand.products.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).map(item => <div key={item.id} className="product-row"><div><span className="product-name">{item.name}</span><span className="product-meta">{item.keywords.filter(Boolean).length} {item.keywords.filter(Boolean).length === 1 ? 'keyword' : 'keywords'} · Draft product</span></div><span className="coverage-label">{item.coverage ? 'Custom coverage' : 'Uses brand coverage'}</span><button className="secondary" onClick={() => selectProduct(item.id)} aria-label={`Configure ${item.name}`}>Configure</button></div>)}</div>
              {!brand.products.some(item => item.name.toLowerCase().includes(query.toLowerCase())) && <p className="empty-state">No products match your search.</p>}<p className="field-note">These are monitoring drafts. Detected listing groups and confirmed catalog identities are kept separately.</p>
            </> : <>
              <div className="scope-bar"><label htmlFor="scope">Monitor</label><select id="scope" value={productId ?? 'brand'} onChange={e => selectProduct(e.target.value === 'brand' ? null : e.target.value)}><option value="brand">Whole brand</option>{brand.products.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><button className="text-button" disabled={busy} onClick={() => openAdd('product')}>+ Add product</button></div>
              <fieldset disabled={busy} className="editor-grid"><legend className="visually-hidden">Monitoring draft editor</legend><div>
                <section className="panel"><label className="field-heading" htmlFor="scope-name">{productId ? 'Product name' : 'Brand name'}</label><input id="scope-name" className="full-width" maxLength={160} value={scope.name} onChange={e => updateScope({ name: e.target.value })} /></section>
                <section className="panel"><div className="section-heading"><div><h2>Search keywords</h2><p>{productId ? 'Phrases used to sell this product. Brand keywords are not added automatically.' : 'Brand names, common spellings and local names.'}</p></div></div><label className="visually-hidden" htmlFor="keywords">Search keywords, one per line</label><textarea id="keywords" rows={5} value={scope.keywords.join('\n')} onChange={e => updateScope({ keywords: e.target.value.split('\n') })} /><div className="field-note">One phrase per line. Each phrase is searched separately.</div></section>
                <section className="panel coverage-panel"><h2>Coverage</h2><p className="field-note">Websites and search markets, with a shared schedule.</p>
                  {productId && <label className="inherit-row"><input type="checkbox" checked={scope.coverage === null} onChange={e => updateScope({ coverage: e.target.checked ? null : structuredClone(brand.coverage) })} />Use brand coverage</label>}
                  <fieldset disabled={scope.coverage === null || busy}><legend className="visually-hidden">Website, country and schedule selection</legend>
                    <div className="field-heading">Websites</div><p className="field-note">Selected: {coverage.sources.length ? coverage.sources.map(key => loaded.sources.find(item => item.key === key)?.name ?? key).join(', ') : 'None'}</p><input aria-label="Filter websites" type="search" placeholder="Find a website…" value={websiteQuery} onChange={e => setWebsiteQuery(e.target.value)} /><div className="choices website-choices">{loaded.sources.filter(source => source.name.toLowerCase().includes(websiteQuery.toLowerCase())).map(source => <label className="choice" key={source.key}><input type="checkbox" checked={coverage.sources.includes(source.key)} onChange={() => updateCoverage({ sources: toggle(coverage.sources, source.key) })} />{source.name}{source.kind === 'search' ? ' · Web search' : ''}</label>)}</div>
                    <div className="field-heading">Search from</div><p className="field-note">Selected: {coverage.countries.length ? coverage.countries.map(countryLabel).join(', ') : 'None'}</p><div className="choices country-choices">{COUNTRIES.map(country => <label className="choice" key={country.code}><input type="checkbox" checked={coverage.countries.includes(country.code)} onChange={() => updateCoverage({ countries: toggle(coverage.countries, country.code) })} />{country.name}</label>)}</div><div className="field-note">The market to search from. This does not mean seller location or shipping destination.</div>
                    <div className="frequency-row"><label htmlFor="frequency">Repeat</label><select id="frequency" value={coverage.frequency} onChange={e => updateCoverage({ frequency: e.target.value as Coverage['frequency'] })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
                  </fieldset>
                </section>
              </div><aside className="summary" aria-label="Search preview"><div className="eyebrow">Search preview</div><h2>{productId ? scope.name : 'Whole brand'}</h2><p>{scope.coverage === null ? 'Uses brand coverage' : 'Custom coverage'}</p>
                <div className="search-number"><strong>{plan?.total_searches ?? '—'}</strong><span>requested searches</span></div><p>{plan ? `${plan.effective_coverage.sources.length} websites · ${plan.effective_coverage.countries.length} countries · ${plan.effective_coverage.frequency}` : 'Updating preview…'}</p>
                {plan && plan.affected_products > 0 && <p className="impact">Coverage changes also apply to {plan.affected_products} {plan.affected_products === 1 ? 'product' : 'products'} using brand coverage.</p>}
                {plan?.issues.map(issue => <p className="notice" key={issue}>{issue}</p>)}{previewError && <p role="alert" className="notice">{previewError}</p>}
                <button className="secondary" disabled={!plan || !plan.total_searches} onClick={() => previewDialog.current?.showModal()}>Preview searches</button><p className="field-note">Requested coverage is unverified. Saving keeps a draft; it does not run searches.</p>
              </aside></fieldset>
            </>}
          </>}
          <div className="savebar"><div><span>{dirty ? 'Unsaved draft changes' : `Saved draft · Revision ${saved.revision}`}</span><p className="field-note">Saved as a draft. Searches remain inactive.</p></div><div className="actions"><button className="secondary" disabled={!dirty || busy} onClick={() => { setDocument(structuredClone(saved.document)); setBrandId(saved.document.brands[0]?.id ?? ''); setProductId(null); setPlan(null); if (!conflict) setError(''); setMessage('Unsaved changes discarded.'); }}>Discard changes</button><button className="primary" disabled={!dirty || busy || conflict} onClick={save}>{busy ? 'Saving…' : 'Save draft'}</button></div></div>
          <div className="status" role="status">{message}</div>
        </div>
      </main>
    </div>
    <dialog ref={addDialog} aria-labelledby="add-heading"><h2 id="add-heading">Add {adding === 'brand' ? 'a brand' : 'a product'}</h2><p>{adding === 'product' ? 'New products use brand coverage. Add only the search phrases you want to run.' : 'Brands group products and provide shared monitoring coverage.'}</p><form onSubmit={add}><label htmlFor="new-name">{adding === 'brand' ? 'Brand' : 'Product'} name</label><input id="new-name" name="name" required maxLength={160} autoFocus /><label htmlFor="new-keywords">Search keywords · one per line</label><textarea id="new-keywords" name="keywords" rows={3} /><div className="actions"><button type="button" className="secondary" onClick={() => addDialog.current?.close()}>Cancel</button><button type="submit" className="primary">Add to draft</button></div></form></dialog>
    <dialog ref={previewDialog} aria-labelledby="preview-heading"><div className="dialog-header"><h2 id="preview-heading">Requested searches · {plan?.total_searches ?? 0}</h2><button className="secondary" onClick={() => previewDialog.current?.close()}>Close</button></div><p>{plan?.coverage_notice}</p>{plan?.truncated && <p>Showing the first 500 searches.</p>}<div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Website</th><th>Search country</th></tr></thead><tbody>{plan?.searches.map((item, i) => <tr key={i}><td>{item.keyword}</td><td>{item.source_name}</td><td>{countryLabel(item.country)}</td></tr>)}</tbody></table></div></dialog>
    <dialog ref={leaveDialog} aria-labelledby="leave-heading"><h2 id="leave-heading">Keep your draft changes?</h2><p>Save before switching company, or discard the changes you have not saved.</p><div className="actions"><button className="secondary" onClick={() => leaveDialog.current?.close()}>Keep editing</button><button className="primary" onClick={onLeave}>Discard and switch</button></div></dialog>
  </>;
}

export default function App() {
  const [session, setSession] = useState<{ client: Client; data: WorkspaceResponse } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function open(company: typeof exampleCompanies[number]) {
    setBusy(true); setError('');
    try {
      assertLocalWorkspace(location.hostname, import.meta.env.DEV, import.meta.env.MODE);
      const client = workspaceClient(location.hostname);
      await client.signIn(company.email);
      let data = await client.load();
      if (data.revision === 0) {
        try { await client.save(exampleWorkspace(company.id), 0); }
        catch (err) { if (!(err instanceof DraftError && err.status === 409)) throw err; }
        data = await client.load();
      }
      setSession({ client, data });
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  if (session) return <WorkspaceEditor client={session.client} loaded={session.data} onLeave={() => setSession(null)} />;
  return <main className="welcome"><div className="eyebrow">Unvelar · Local development</div><h1>Your monitoring workspace</h1><p>Try one focused product or a larger catalog. Edits are saved in a separate local database.</p><div className="company-cards">{exampleCompanies.map(company => <button className="company-card" disabled={busy} key={company.id} onClick={() => open(company)}><strong>{company.name}</strong><span>{company.id === 'giardini' ? 'One focal product' : 'A broader product catalog'}</span><span>Open example workspace →</span></button>)}</div>{busy && <p role="status">Opening local workspace…</p>}{error && <p className="error-box" role="alert">{error}</p>}<p className="field-note">Synthetic examples. Production accounts, monitoring and classification are untouched.</p></main>;
}
