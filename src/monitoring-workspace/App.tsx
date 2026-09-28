import { useEffect, useRef, useState } from 'react';
import { countryLabel } from '../lib/countries';
import { assertLocalWorkspace, DraftError, workspaceClient, type Brand, type Draft, type Plan, type Product, type Workspace, type WorkspaceResponse } from './api';
import { exampleCompanies, exampleWorkspace } from './fixtures';
import CoverageEditor from './CoverageEditor';
import './workspace.css';

type Client = ReturnType<typeof workspaceClient>;

function WorkspaceEditor({ client, loaded, onLeave }: { client: Client; loaded: WorkspaceResponse; onLeave: () => void }) {
  const [saved, setSaved] = useState<Draft>(loaded);
  const [document, setDocument] = useState(loaded.document);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [page, setPage] = useState<'monitoring' | 'products'>('monitoring');
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<'brand' | 'product'>('product');
  const coverageSection = useRef<HTMLElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const brand = document.brands.find(item => item.id === brandId);
  const scope = productId ? brand?.products.find(item => item.id === productId) : brand;
  const coverage = brand?.coverage;
  const companyName = exampleCompanies.find(item => item.email.endsWith(`@${loaded.company.name}`))?.name ?? loaded.company.name;
  const products = (brand ? [brand] : document.brands).flatMap(owner => owner.products.map(product => ({ ...product, brand: owner })));
  const dirty = JSON.stringify(document) !== JSON.stringify(saved.document);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void client.preview(document, brandId, productId, controller.signal).then(result => {
        if (!controller.signal.aborted) { setPlan(result); setPreviewError(''); }
      }).catch(err => { if (!controller.signal.aborted) { setPlan(null); setPreviewError(err.message); } });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, document, brandId, productId]);

  function updateDocument(next: Workspace) { setDocument(next); setPlan(null); setMessage(''); }
  function updateScope(change: Partial<Pick<Product, 'name' | 'keywords'>>) {
    if (!brand) return;
    updateDocument({ ...document, brands: document.brands.map(item => item.id !== brand.id ? item : productId
      ? { ...item, products: item.products.map(product => product.id === productId ? { ...product, ...change } : product) }
      : { ...item, ...change }) });
  }
  function selectScope(brand: string | null, product: string | null = null) { setBrandId(brand); setProductId(product); setPlan(null); setPreviewError(''); setPage('monitoring'); }
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
      setBrandId(null); setProductId(null); setPlan(null); setConflict(false);
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
      const item: Brand = { id, name, keywords, coverage: { markets: [], frequency: 'weekly' }, products: [] };
      updateDocument({ ...document, brands: [...document.brands, item] }); setBrandId(id); setProductId(null);
    } else if (brand) {
      const item: Product = { id, name, keywords, coverage: null, catalog_product_id: null };
      updateDocument({ ...document, brands: document.brands.map(b => b.id === brandId ? { ...b, products: [...b.products, item] } : b) }); setProductId(id);
    }
    setPage('monitoring'); event.currentTarget.reset(); addDialog.current?.close();
  }
  const summary = <aside className="summary" aria-label="Search preview">
    <div className="eyebrow">Search preview</div><h2>{scope?.name ?? companyName}</h2>
    <p>{!brandId ? 'All brands and products' : productId ? 'Uses brand coverage automatically' : 'Brand searches only'}</p>
    <div className="search-number"><strong>{plan?.total_searches ?? '—'}</strong><span>requested searches</span></div>
    <p>{plan ? `${plan.source_keys.length} websites · ${plan.countries.length} countries${plan.effective_coverage ? ` · ${plan.effective_coverage.frequency}` : ''}` : 'Updating preview…'}</p>
    {!!plan?.combined_searches && <p className="impact">{plan.combined_searches} duplicate {plan.combined_searches === 1 ? 'search combined' : 'searches combined'} across scopes with the same schedule.</p>}
    {!!plan?.affected_products && <p className="impact">Coverage changes also apply to {plan.affected_products} {plan.affected_products === 1 ? 'product' : 'products'} using brand coverage.</p>}
    {plan?.issues.slice(0, 3).map(issue => <p className="notice" key={issue}>{issue}</p>)}
    {plan && plan.issues.length > 3 && <details className="more-issues"><summary>{plan.issues.length - 3} more items to review</summary>{plan.issues.slice(3).map(issue => <p className="notice" key={issue}>{issue}</p>)}</details>}
    {previewError && <p role="alert" className="notice">{previewError}</p>}
    <button className="secondary" disabled={!plan?.total_searches} onClick={() => previewDialog.current?.showModal()}>Preview searches</button>
    <p className="field-note">Saving keeps a draft; it does not run searches.</p>
  </aside>;
  return <>
    <div className="sandbox-banner"><strong>Local development</strong><span>Saved in your sandbox database · No monitoring jobs run</span></div>
    <div className="shell">
      <aside className="sidebar"><div className="wordmark">unvelar<span>®</span></div><span className="eyebrow">Company</span>
        <strong className="company-name">{companyName}</strong>
        <button className="secondary" disabled={busy} onClick={() => dirty ? leaveDialog.current?.showModal() : onLeave()}>Switch company</button>
        <div className="nav-label">Workspace</div><nav aria-label="Workspace"><button aria-current={page === 'monitoring' ? 'page' : undefined} onClick={() => setPage('monitoring')}>Monitoring</button><button aria-current={page === 'products' ? 'page' : undefined} onClick={() => setPage('products')}>Products <span>{products.length}</span></button></nav>
        <div className="sidebar-note">Searches guide discovery.<br />Listing evidence determines identity.</div>
      </aside>
      <main><header className="topbar"><span>{companyName}{brand ? ` / ${brand.name}` : ''}</span><span className="demo-badge">Draft · Revision {saved.revision}</span></header>
        <div className="page">
          {error && <div className="error-box" role="alert">{error}{conflict && <p>Your edits are still here. Copy any changes you want to keep, then <button className="text-button" disabled={busy} onClick={reload}>reload the saved draft</button>.</p>}</div>}
          <div className="page-heading"><div><div className="eyebrow">{brand?.name ?? companyName}</div><h1>{page === 'monitoring' ? 'Monitoring' : 'Products'}</h1><p>{page === 'monitoring' ? 'Choose what to look for, and where.' : 'Organize product searches and their coverage.'}</p></div><button className="secondary" disabled={busy} onClick={() => openAdd(brand ? 'product' : 'brand')}>{brand ? '+ Add product' : '+ Add brand'}</button></div>
          <div className="scope-bar"><label htmlFor="scope">Scope</label><select id="scope" disabled={busy} value={productId ? `product:${brandId}:${productId}` : brandId ? `brand:${brandId}` : 'company'} onChange={event => {
            const [kind, owner, item] = event.target.value.split(':'); selectScope(kind === 'company' ? null : owner, kind === 'product' ? item : null);
          }}><option value="company">Entire company · All brands & products</option>{document.brands.map(item => <optgroup key={item.id} label={item.name}><option value={`brand:${item.id}`}>{item.name} · Brand only</option>{item.products.map(product => <option key={product.id} value={`product:${item.id}:${product.id}`}>↳ {product.name}</option>)}</optgroup>)}</select></div>
          {page === 'products' ? <>
            <label className="visually-hidden" htmlFor="product-search">Search products</label><input id="product-search" type="search" placeholder="Search products…" value={query} onChange={event => setQuery(event.target.value)} />
            <div>{products.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).map(item => <div key={item.id} className="product-row"><div><span className="product-name">{item.name}</span><span className="product-meta">{item.brand.name} · {item.keywords.filter(Boolean).length} keywords</span></div><span className="coverage-label">Uses brand coverage</span><button className="secondary" onClick={() => selectScope(item.brand.id, item.id)} aria-label={`Configure ${item.name}`}>Configure</button></div>)}</div>
            {!products.some(item => item.name.toLowerCase().includes(query.toLowerCase())) && <p className="empty-state">No products match your search.</p>}
          </> : !brandId ? <div className="editor-grid company-overview"><section>
            <h2>Company coverage</h2><p className="field-note">A combined view of every brand and product’s searches. Set coverage once per brand. Each product has its own keywords and automatically uses its brand’s coverage.</p>
            <div className="company-totals"><span><strong>{document.brands.length}</strong> {document.brands.length === 1 ? 'brand' : 'brands'}</span><span><strong>{products.length}</strong> {products.length === 1 ? 'product' : 'products'}</span></div>
            {document.brands.map(item => <div className="brand-plan-row" key={item.id}><div><strong>{item.name}</strong><p>{item.keywords.filter(Boolean).length} brand keywords · {item.products.length} {item.products.length === 1 ? 'product' : 'products'} · {item.coverage.markets.length} {item.coverage.markets.length === 1 ? 'country' : 'countries'}</p></div><button className="secondary" onClick={() => selectScope(item.id)} aria-label={`Edit ${item.name}`}>Edit brand</button></div>)}
            <button className="text-button" disabled={busy} onClick={() => openAdd('brand')}>+ Add brand</button>
            {!document.brands.length && <p className="empty-state">Add a brand to start planning company monitoring.</p>}
          </section>{summary}</div> : brand && scope && coverage ? <fieldset disabled={busy} className="editor-grid"><legend className="visually-hidden">Monitoring draft editor</legend><div>
            <section className="panel"><label className="field-heading" htmlFor="scope-name">{productId ? 'Product name' : 'Brand name'}</label><input id="scope-name" className="full-width" maxLength={160} value={scope.name} onChange={event => updateScope({ name: event.target.value })} /></section>
            <section className="panel"><div className="section-heading"><div><h2>Search keywords</h2><p>{productId ? 'Phrases used to sell this product. Brand keywords are not added automatically.' : 'Only these brand phrases are searched. Choose Entire company to include product searches.'}</p></div></div><label className="visually-hidden" htmlFor="keywords">Search keywords, one per line</label><textarea id="keywords" rows={5} value={scope.keywords.join('\n')} onChange={event => updateScope({ keywords: event.target.value.split('\n') })} /><div className="field-note">One phrase per line. Each phrase is searched separately.</div></section>
            <section ref={coverageSection} tabIndex={-1} aria-label="Brand coverage" className="panel coverage-panel"><h2>Brand coverage</h2>
              {productId ? <>
                <p className="field-note">This product automatically uses {brand.name}’s countries, marketplaces and schedule.</p>
                <div className="inherited-coverage-summary">{coverage.markets.length ? coverage.markets.map(market => <div className="inherited-market" key={market.country}><strong>{countryLabel(market.country)}</strong><span>{market.sources.length ? market.sources.map(key => loaded.sources.find(source => source.key === key)?.name ?? key).join(', ') : 'No marketplaces selected'}</span></div>) : <p>No countries selected yet.</p>}<p className="inherited-schedule">Schedule: {coverage.frequency}</p></div>
                <button className="secondary" onClick={() => { selectScope(brand.id); requestAnimationFrame(() => { coverageSection.current?.focus(); coverageSection.current?.scrollIntoView({ block: 'start' }); }); }}>Edit brand coverage</button>
              </> : <>
                <p className="field-note">Choose countries, marketplaces and a schedule for this brand and all its products.</p>
                <CoverageEditor key={brandId} value={coverage} sources={loaded.sources} disabled={busy} onChange={value => updateDocument({ ...document, brands: document.brands.map(item => item.id === brand.id ? { ...item, coverage: value } : item) })} />
              </>}
            </section>
          </div>{summary}</fieldset> : null}
          <div className="savebar"><div><span>{dirty ? 'Unsaved draft changes' : `Saved draft · Revision ${saved.revision}`}</span><p className="field-note">Saved as a draft. Searches remain inactive.</p></div><div className="actions"><button className="secondary" disabled={!dirty || busy} onClick={() => { setDocument(structuredClone(saved.document)); selectScope(null); if (!conflict) setError(''); setMessage('Unsaved changes discarded.'); }}>Discard changes</button><button className="primary" disabled={!dirty || busy || conflict} onClick={save}>{busy ? 'Saving…' : 'Save draft'}</button></div></div>
          <div className="status" role="status">{message}</div>
        </div>
      </main>
    </div>
    <dialog ref={addDialog} aria-labelledby="add-heading"><h2 id="add-heading">Add {adding === 'brand' ? 'a brand' : 'a product'}</h2><p>{adding === 'product' ? 'All products automatically use their brand’s countries, marketplaces and schedule. Add only the search phrases you want to run.' : 'Brands group products and provide shared monitoring coverage.'}</p><form onSubmit={add}><label htmlFor="new-name">{adding === 'brand' ? 'Brand' : 'Product'} name</label><input id="new-name" name="name" required maxLength={160} autoFocus /><label htmlFor="new-keywords">Search keywords · one per line</label><textarea id="new-keywords" name="keywords" rows={3} /><div className="actions"><button type="button" className="secondary" onClick={() => addDialog.current?.close()}>Cancel</button><button type="submit" className="primary">Add to draft</button></div></form></dialog>
    <dialog ref={previewDialog} aria-labelledby="preview-heading"><div className="dialog-header"><h2 id="preview-heading">Requested searches · {plan?.total_searches ?? 0}</h2><button className="secondary" onClick={() => previewDialog.current?.close()}>Close</button></div><p>{plan?.coverage_notice}</p>{plan?.truncated && <p>Showing the first 500 searches.</p>}<div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Website</th><th>Country</th><th>Schedule</th><th>Scope</th></tr></thead><tbody>{plan?.searches.map((item, i) => <tr key={i}><td>{item.keyword}</td><td>{item.source_name}<span className="preview-domain">{item.storefront_domain}</span></td><td>{countryLabel(item.country)}</td><td>{item.frequency}</td><td>{item.origins.map(origin => origin.name).join(", ")}</td></tr>)}</tbody></table></div></dialog>
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
