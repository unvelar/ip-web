import { useEffect, useMemo, useRef, useState } from 'react';
import { countryLabel } from '../lib/countries';
import { DraftError, type Brand, type Draft, type Plan, type Product, type ReferenceMaterial, type Workspace, type WorkspaceResponse, type WorkspaceClient } from './contracts';
import ScopeNavigator from './ScopeNavigator';
import CoverageEditor from './CoverageEditor';
import './workspace.css';
import { useDraftNavigationGuard } from './useDraftNavigationGuard';
import { coverageFromLegacy, mergeCoverage } from './legacyMigration';
import { getTrademark } from '../api/registry';

export default function WorkspaceEditor({ client, loaded, onLeave, embedded = false, tenantSwitcherLabel }: { client: WorkspaceClient; loaded: WorkspaceResponse; onLeave: () => void; embedded?: boolean; tenantSwitcherLabel?: string }) {
  const Content = embedded ? 'div' : 'main';
  const [saved, setSaved] = useState<Draft>(loaded);
  const [document, setDocument] = useState(loaded.document);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [activationPlan, setActivationPlan] = useState<Plan | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [busy, setBusy] = useState(false);
  const [legacyImageFallbacks, setLegacyImageFallbacks] = useState<Record<string, { id: string; url: string; status: string }[]>>({});
  const [adding, setAdding] = useState<'brand' | 'product' | 'reference'>('product');
  const coverageSection = useRef<HTMLElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const brand = document.brands.find(item => item.id === brandId);
  const scope = productId ? brand?.products.find(item => item.id === productId) : brand;
  const coverage = brand?.coverage;
  const tenantName = loaded.company.name;
  const products = (brand ? [brand] : document.brands).flatMap(owner => owner.products.map(product => ({ ...product, brand: owner })));
  const linkedLegacyIps = useMemo(() => scope ? loaded.legacy_ips.filter(ip => scope.legacy_ip_ids.includes(ip.id)) : [], [loaded.legacy_ips, scope]);
  const linkedLegacyImages = linkedLegacyIps.flatMap(ip => (ip.images ?? legacyImageFallbacks[ip.id] ?? []).map(image => ({ ...image, ipName: ip.name })));
  const dirty = JSON.stringify(document) !== JSON.stringify(saved.document);
  const active = saved.revision > 0 && saved.active_revision === saved.revision;

  useDraftNavigationGuard(dirty);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void client.preview(document, brandId, productId, controller.signal).then(result => {
        if (!controller.signal.aborted) { setPlan(result); setPreviewError(''); }
      }).catch(err => { if (!controller.signal.aborted) { setPlan(null); setPreviewError(err.message); } });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, document, brandId, productId]);

  useEffect(() => {
    if (!brandId && !productId) {
      setActivationPlan(plan);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void client.preview(document, null, null, controller.signal).then(result => {
        if (!controller.signal.aborted) setActivationPlan(result);
      }).catch(() => { if (!controller.signal.aborted) setActivationPlan(null); });
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [client, document, brandId, productId, plan]);

  useEffect(() => {
    const missing = linkedLegacyIps.filter(ip => ip.images === undefined && legacyImageFallbacks[ip.id] === undefined);
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async ip => ({ ip, detail: await getTrademark(ip.id, controller.signal) }))).then(results => {
      if (controller.signal.aborted) return;
      setLegacyImageFallbacks(current => ({ ...current, ...Object.fromEntries(results.map(({ ip, detail }) => [ip.id,
        detail.images.map(image => ({ id: image.id, url: image.url, status: image.status })),
      ])) }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [linkedLegacyIps, legacyImageFallbacks]);

  function updateDocument(next: Workspace) { setDocument(next); setPlan(null); setMessage(''); }
  function updateScope(change: Partial<Pick<Product, 'name' | 'keywords' | 'reference_materials' | 'legacy_ip_ids'>>) {
    if (!brand) return;
    updateDocument({ ...document, brands: document.brands.map(item => item.id !== brand.id ? item : productId
      ? { ...item, products: item.products.map(product => product.id === productId ? { ...product, ...change } : product) }
      : { ...item, ...change }) });
  }
  function selectScope(brand: string | null, product: string | null = null) { setBrandId(brand); setProductId(product); setPlan(null); setPreviewError(''); }
  function toggleLegacyIp(ipId: string, checked: boolean) {
    if (!brand || !scope) return;
    if (!checked) { updateScope({ legacy_ip_ids: scope.legacy_ip_ids.filter(id => id !== ipId) }); return; }
    const legacy = loaded.legacy_ips.find(ip => ip.id === ipId);
    if (!legacy) return;
    const importedCoverage = coverageFromLegacy(legacy, loaded.sources);
    updateDocument({ ...document, brands: document.brands.map(item => item.id !== brand.id ? item : {
      ...item,
      coverage: mergeCoverage(item.coverage, importedCoverage),
      ...(productId ? { products: item.products.map(product => product.id === productId ? {
        ...product, legacy_ip_ids: [...product.legacy_ip_ids, ipId], keywords: product.keywords.length ? product.keywords : legacy.keywords,
      } : product) } : {
        legacy_ip_ids: [...item.legacy_ip_ids, ipId], keywords: item.keywords.length ? item.keywords : legacy.keywords,
      }),
    }) });
  }
  async function activate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await client.activate(document, saved.revision);
      setSaved(result); setDocument(result.document); setConflict(false);
      setMessage(`Monitoring activated · Revision ${result.revision}. ${result.execution.scopes} scopes and ${result.execution.sources} sources are scheduled.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setConflict(err instanceof DraftError && err.status === 409); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true); setError('');
    try {
      const result = await client.load(); setSaved(result); setDocument(result.document);
      setBrandId(null); setProductId(null); setPlan(null); setConflict(false);
      setMessage('Latest monitoring configuration loaded.');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function openAdd(kind: 'brand' | 'product' | 'reference') {
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
      const item: Brand = { id, name, keywords, reference_materials: [], coverage: { markets: [], frequency: 'weekly' }, legacy_ip_ids: [], products: [] };
      updateDocument({ ...document, brands: [...document.brands, item] }); setBrandId(id); setProductId(null);
    } else if (brand) {
      if (adding === 'product') {
        const item: Product = { id, name, keywords, reference_materials: [], coverage: null, catalog_product_id: null, legacy_ip_ids: [] };
        updateDocument({ ...document, brands: document.brands.map(b => b.id === brandId ? { ...b, products: [...b.products, item] } : b) }); setProductId(id);
      } else {
        const material: ReferenceMaterial = { id, name, kind: String(form.get('kind')) === 'document' ? 'document' : 'image', note: String(form.get('note')).trim() };
        updateScope({ reference_materials: [...scope!.reference_materials, material] });
      }
    }
    event.currentTarget.reset(); addDialog.current?.close();
  }
  const summary = <aside className="summary" aria-label="Search preview">
    <div className="eyebrow">Search preview</div><h2>{scope?.name ?? tenantName}</h2>
    <p>{!brandId ? 'All brands and products' : productId ? 'Uses brand coverage automatically' : 'Brand searches only'}</p>
    <div className="search-number"><strong>{plan?.total_searches ?? '—'}</strong><span>requested searches</span></div>
    <p>{plan ? `${plan.source_keys.length} websites · ${plan.countries.length} countries${plan.effective_coverage ? ` · ${plan.effective_coverage.frequency}` : ''}` : 'Updating preview…'}</p>
    {!!plan?.combined_searches && <p className="impact">{plan.combined_searches} duplicate {plan.combined_searches === 1 ? 'search combined' : 'searches combined'} across scopes with the same schedule.</p>}
    {!!plan?.affected_products && <p className="impact">Coverage changes also apply to {plan.affected_products} {plan.affected_products === 1 ? 'product' : 'products'} using brand coverage.</p>}
    {plan?.issues.slice(0, 3).map(issue => <p className="notice" key={issue}>{issue}</p>)}
    {plan && plan.issues.length > 3 && <details className="more-issues"><summary>{plan.issues.length - 3} more items to review</summary>{plan.issues.slice(3).map(issue => <p className="notice" key={issue}>{issue}</p>)}</details>}
    {previewError && <p role="alert" className="notice">{previewError}</p>}
    <button className="secondary" disabled={!plan?.total_searches} onClick={() => previewDialog.current?.showModal()}>Preview searches</button>
    <p className="field-note">Save and activate applies this plan to scheduled monitoring.</p>
  </aside>;
  const activationIssue = activationPlan?.issues[0] ?? '';
  const activationBlocked = !activationPlan || activationPlan.total_searches === 0 || activationPlan.issues.length > 0;
  return <div className={`monitoring-workspace tenant-workspace-editor${embedded ? " embedded-workspace" : ""}`}>
    {!embedded && <div className="sandbox-banner"><strong>Local development</strong><span>Saved in your sandbox database · No monitoring jobs run</span></div>}
    <div className="shell">
      <Content className="workspace-content">
        <div className="page tenant-editor-page">
          {error && <div className="error-box" role="alert">{error}{conflict && <p>Your edits are still here. Copy any changes you want to keep, then <button className="text-button" disabled={busy} onClick={reload}>reload the saved draft</button>.</p>}</div>}
          <div className="page-heading"><div><div className="eyebrow">Tenant · {tenantName}</div><h1>Monitoring</h1><p>Choose a brand or product to configure its monitoring.</p></div><div className="actions">{(!embedded || tenantSwitcherLabel) && <button className="secondary" disabled={busy} onClick={() => dirty ? leaveDialog.current?.showModal() : onLeave()}>{tenantSwitcherLabel ?? 'Switch tenant'}</button>}<button className="secondary" disabled={busy} onClick={() => openAdd('brand')}>+ Add brand</button></div></div>
          <div className="scope-workspace">
            <ScopeNavigator brands={document.brands} tenantName={tenantName} brandId={brandId} productId={productId} disabled={busy} onSelect={selectScope} />
            <div className="scope-detail">
              <div className="scope-detail-heading"><div><div className="scope-breadcrumb">{brand ? <><button onClick={() => selectScope(null)}>Tenant</button><span>/</span>{productId ? <><button onClick={() => selectScope(brand.id)}>{brand.name}</button><span>/</span><span>Product</span></> : <span>Brand</span>}</> : 'Tenant overview'}</div><h2>{scope?.name ?? tenantName}</h2><p>{productId ? 'Product keywords · Coverage inherited from brand' : brand ? 'Brand keywords and shared coverage' : 'All brands and products in this tenant'}</p></div>{brand && <button className="secondary" disabled={busy} onClick={() => openAdd('product')}>+ Add product</button>}</div>
          {!brandId ? <div className="editor-grid company-overview"><section>
            <h3 className="tenant-overview-title">Coverage overview</h3><p className="field-note">A combined view of every brand and product’s searches. Set coverage once per brand. Each product has its own keywords and automatically uses its brand’s coverage.</p>
            <div className="company-totals"><span><strong>{document.brands.length}</strong> {document.brands.length === 1 ? 'brand' : 'brands'}</span><span><strong>{products.length}</strong> {products.length === 1 ? 'product' : 'products'}</span></div>
            {document.brands.map(item => <div className="brand-plan-row" key={item.id}><div><strong>{item.name}</strong><p>{item.keywords.filter(Boolean).length} brand keywords · {item.products.length} {item.products.length === 1 ? 'product' : 'products'} · {item.coverage.markets.length} {item.coverage.markets.length === 1 ? 'country' : 'countries'}</p></div><button className="secondary" onClick={() => selectScope(item.id)} aria-label={`Edit ${item.name}`}>Edit brand</button></div>)}
            {!document.brands.length && <div className="empty-state"><p>No brand has been confirmed for this tenant yet.</p><p>Start with the brand that owns the search terms and coverage. Add products only when they need their own search terms.</p><button className="primary" onClick={() => openAdd('brand')}>Set up a brand</button></div>}
          </section>{summary}</div> : brand && scope && coverage ? <fieldset disabled={busy} className="editor-grid"><legend className="visually-hidden">Monitoring draft editor</legend><div>
            <section className="panel"><label className="field-heading" htmlFor="scope-name">{productId ? 'Product name' : 'Brand name'}</label><input id="scope-name" className="full-width" maxLength={160} value={scope.name} onChange={event => updateScope({ name: event.target.value })} /></section>
            <section className="panel"><div className="section-heading"><div><h2>Search keywords</h2><p>{productId ? 'Phrases used to sell this product. Brand keywords are not added automatically.' : 'Optional phrases for brand-wide searches. Leave this empty to monitor only the brand’s products.'}</p></div></div><label className="visually-hidden" htmlFor="keywords">Search keywords, one per line</label><textarea id="keywords" rows={5} value={scope.keywords.join('\n')} onChange={event => updateScope({ keywords: event.target.value.split('\n') })} /><div className="field-note">One phrase per line. Each phrase is searched separately.</div></section>
            <section className="panel"><div className="section-heading"><div><h2>Reference materials</h2><p>Use visual or documentary references to review potential matches. They do not alter what is searched.</p></div><button className="secondary" type="button" disabled={busy} onClick={() => openAdd('reference')}>+ Add reference</button></div>
              {linkedLegacyImages.length > 0 && <div className="legacy-reference-grid" aria-label="Linked legacy reference images">{linkedLegacyImages.map(image => image.url ? <figure key={image.id}><img src={image.url} alt={`${image.ipName} reference`} loading="lazy" /><figcaption>{image.ipName}</figcaption></figure> : <div className="legacy-reference-unavailable" key={image.id}>Image unavailable</div>)}</div>}
              {scope.reference_materials.length ? <ul className="reference-material-list">{scope.reference_materials.map(material => <li key={material.id}><span className="reference-material-kind">{material.kind === 'image' ? 'Image' : 'Document'}</span><div><strong>{material.name}</strong>{material.note && <p>{material.note}</p>}</div><button type="button" className="text-button" disabled={busy} onClick={() => updateScope({ reference_materials: scope.reference_materials.filter(item => item.id !== material.id) })}>Remove</button></li>)}</ul> : linkedLegacyImages.length === 0 && <p className="field-note">No reference materials yet.</p>}
            </section>
            {loaded.legacy_ips.length > 0 && <section className="panel"><div className="section-heading"><div><h2>Existing IP records</h2><p>Link a previous IP record to this {productId ? 'product' : 'brand'} only after you confirm it belongs here. Its queries, coverage, images and monitoring history are preserved. Activation makes this {productId ? 'product' : 'brand'} its new monitoring configuration.</p></div></div><div className="legacy-ip-list">{loaded.legacy_ips.map(ip => <label key={ip.id} className="legacy-ip-row"><input type="checkbox" checked={scope.legacy_ip_ids.includes(ip.id)} onChange={event => toggleLegacyIp(ip.id, event.target.checked)} /><span><strong>{ip.name}</strong><small>{ip.keywords.length} keywords · {ip.monitored_domains.filter(domain => domain.enabled).length} active sites · {ip.image_count} reference images</small></span></label>)}</div></section>}
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
            </div>
          </div>
          <div className="savebar"><div><span>{dirty ? 'Unsaved changes' : active ? `Active · Revision ${saved.revision}` : activationBlocked ? 'Complete setup to activate' : `Ready to activate · Revision ${saved.revision}`}</span><p className="field-note">{activationIssue || (active ? 'This configuration runs scheduled searches.' : 'Activate this configuration to start scheduled searches.')}</p></div><div className="actions"><button className="secondary" disabled={!dirty || busy} onClick={() => { setDocument(structuredClone(saved.document)); selectScope(null); if (!conflict) setError(''); setMessage('Unsaved changes discarded.'); }}>Discard changes</button><button className="primary" disabled={busy || conflict || activationBlocked || (!dirty && active)} onClick={activate}>{busy ? 'Activating…' : 'Save and activate'}</button></div></div>
          <div className="status" role="status">{message}</div>
        </div>
      </Content>
    </div>
    <dialog ref={addDialog} aria-labelledby="add-heading"><h2 id="add-heading">Add {adding === 'brand' ? 'a brand' : adding === 'product' ? 'a product' : 'a reference material'}</h2><p>{adding === 'product' ? 'All products automatically use their brand’s countries, marketplaces and schedule. Add only the search phrases you want to run.' : adding === 'brand' ? 'Brands group products and provide shared monitoring coverage. Brand-wide search keywords are optional.' : 'Reference materials support review only. They never change search terms, coverage or categorization.'}</p><form onSubmit={add}><label htmlFor="new-name">{adding === 'brand' ? 'Brand' : adding === 'product' ? 'Product' : 'Reference'} name</label><input id="new-name" name="name" required maxLength={160} autoFocus />{adding === 'reference' ? <><label htmlFor="reference-kind">Type</label><select id="reference-kind" name="kind"><option value="image">Image</option><option value="document">Document</option></select><label htmlFor="reference-note">Note</label><textarea id="reference-note" name="note" rows={3} maxLength={500} /></> : <><label htmlFor="new-keywords">{adding === 'brand' ? 'Brand-wide search keywords · optional · one per line' : 'Search keywords · one per line'}</label><textarea id="new-keywords" name="keywords" rows={3} /></>}<div className="actions"><button type="button" className="secondary" onClick={() => addDialog.current?.close()}>Cancel</button><button type="submit" className="primary">Add {adding === 'brand' ? 'brand' : adding === 'product' ? 'product' : 'reference'}</button></div></form></dialog>
    <dialog ref={previewDialog} aria-labelledby="preview-heading"><div className="dialog-header"><h2 id="preview-heading">Requested searches · {plan?.total_searches ?? 0}</h2><button className="secondary" onClick={() => previewDialog.current?.close()}>Close</button></div><p>{plan?.coverage_notice}</p>{plan?.truncated && <p>Showing the first 500 searches.</p>}<div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Website</th><th>Country</th><th>Schedule</th><th>Scope</th></tr></thead><tbody>{plan?.searches.map((item, i) => <tr key={i}><td>{item.keyword}</td><td>{item.source_name}<span className="preview-domain">{item.storefront_domain}</span></td><td>{countryLabel(item.country)}</td><td>{item.frequency}</td><td>{item.origins.map(origin => origin.name).join(", ")}</td></tr>)}</tbody></table></div></dialog>
    <dialog ref={leaveDialog} aria-labelledby="leave-heading"><h2 id="leave-heading">Unsaved monitoring changes</h2><p>Return to the editor to activate these changes, or discard them and switch tenant.</p><div className="actions"><button className="secondary" onClick={() => leaveDialog.current?.close()}>Keep editing</button><button className="primary" onClick={onLeave}>Discard and switch</button></div></dialog>
  </div>;
}
