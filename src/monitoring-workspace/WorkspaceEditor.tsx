import { useEffect, useMemo, useRef, useState } from 'react';
import { countryLabel } from '../lib/countries';
import { DraftError, type Brand, type Draft, type Plan, type Product, type ReferenceImage, type Workspace, type WorkspaceResponse, type WorkspaceClient } from './contracts';
import ScopeNavigator from './ScopeNavigator';
import CoverageEditor from './CoverageEditor';
import './workspace.css';
import { useDraftNavigationGuard } from './useDraftNavigationGuard';
import { coverageFromLegacy, mergeCoverage } from './legacyMigration';
import { getTrademark } from '../api/registry';
import ImageUploader from '../components/ImageUploader';
import MatchingReadiness from './MatchingReadiness';

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
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>(loaded.reference_images ?? []);
  const [legacyImages, setLegacyImages] = useState(() => Object.fromEntries(
    loaded.legacy_ips.flatMap(ip => ip.images === undefined ? [] : [[ip.id, ip.images]]),
  ));
  const [legacyImageFallbacks, setLegacyImageFallbacks] = useState<Record<string, { id: string; url: string; status: string }[]>>({});
  const imageRefresh = useRef<Promise<void> | null>(null);
  const lastImageRefreshAt = useRef(0);
  const [adding, setAdding] = useState<'brand' | 'product'>('product');
  const coverageSection = useRef<HTMLElement>(null);
  const addDialog = useRef<HTMLDialogElement>(null);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const leaveDialog = useRef<HTMLDialogElement>(null);
  const brand = document.brands.find(item => item.id === brandId);
  const scope = productId ? brand?.products.find(item => item.id === productId) : brand;
  const coverage = brand?.coverage;
  const tenantName = loaded.company.name;
  const products = (brand ? [brand] : document.brands).flatMap(owner => owner.products.map(product => ({ ...product, brand: owner })));
  const legacyAssignments = useMemo(() => {
    const assignments = new Map<string, { scopeId: string; name: string; kind: 'brand' | 'product' }>();
    for (const owner of document.brands) {
      for (const ipId of owner.legacy_ip_ids) assignments.set(ipId, { scopeId: owner.id, name: owner.name, kind: 'brand' });
      for (const product of owner.products) {
        for (const ipId of product.legacy_ip_ids) assignments.set(ipId, { scopeId: product.id, name: product.name, kind: 'product' });
      }
    }
    return assignments;
  }, [document]);
  const linkedLegacyIps = useMemo(() => scope ? loaded.legacy_ips.filter(ip => scope.legacy_ip_ids.includes(ip.id)) : [], [loaded.legacy_ips, scope]);
  const linkedLegacyImages = linkedLegacyIps.flatMap(ip => (legacyImages[ip.id] ?? legacyImageFallbacks[ip.id] ?? []).map(image => ({ ...image, ipName: ip.name })));
  const referenceImageById = useMemo(() => new Map(referenceImages.map(image => [image.id, image])), [referenceImages]);
  const scopeReferenceImages = scope?.reference_materials.filter(material => material.kind === 'image')
    .map(material => ({ material, image: referenceImageById.get(material.id) })) ?? [];
  const displayedReferenceIds = new Set([...scopeReferenceImages.map(item => item.material.id), ...linkedLegacyImages.map(image => image.id)]);
  const ownedReferenceImages = referenceImages.filter(image => image.scope_id === scope?.id && !displayedReferenceIds.has(image.id));
  const dirty = JSON.stringify(document) !== JSON.stringify(saved.document);
  const matchingStates = plan?.matching_readiness ?? (!dirty ? loaded.matching_readiness : undefined);
  const matchingState = matchingStates?.find(item => item.scope_id === scope?.id);
  const productReferenceImages = brand && !productId ? [...new Map(brand.products.flatMap(product => [
    ...referenceImages.filter(image => image.scope_id === product.id && image.url).map(image => ({ ...image, product: product.name })),
    ...product.reference_materials.filter(material => material.kind === 'image').flatMap(material => {
      const image = referenceImageById.get(material.id);
      return image?.url ? [{ id: material.id, url: image.url, product: product.name }] : [];
    }),
    ...loaded.legacy_ips.filter(ip => product.legacy_ip_ids.includes(ip.id)).flatMap(ip =>
      (legacyImages[ip.id] ?? legacyImageFallbacks[ip.id] ?? []).filter(image => image.url).map(image => ({ id: image.id, url: image.url, product: product.name }))),
  ]).map(image => [image.id, image])).values()] : [];
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
    const missing = linkedLegacyIps.filter(ip => legacyImages[ip.id] === undefined && legacyImageFallbacks[ip.id] === undefined);
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(missing.map(async ip => ({ ip, detail: await getTrademark(ip.id, controller.signal) }))).then(results => {
      if (controller.signal.aborted) return;
      setLegacyImageFallbacks(current => ({ ...current, ...Object.fromEntries(results.map(({ ip, detail }) => [ip.id,
        detail.images.map(image => ({ id: image.id, url: image.url, status: image.status })),
      ])) }));
    }).catch(() => undefined);
    return () => controller.abort();
  }, [linkedLegacyIps, legacyImages, legacyImageFallbacks]);

  function refreshExpiredImageUrls() {
    if (imageRefresh.current || Date.now() - lastImageRefreshAt.current < 30_000) return;
    lastImageRefreshAt.current = Date.now();
    const refresh = client.load().then(result => {
      setReferenceImages(result.reference_images ?? []);
      setLegacyImages(Object.fromEntries(
        result.legacy_ips.flatMap(ip => ip.images === undefined ? [] : [[ip.id, ip.images]]),
      ));
    }).catch(() => undefined);
    imageRefresh.current = refresh;
    void refresh.finally(() => {
      if (imageRefresh.current === refresh) imageRefresh.current = null;
    });
  }

  function updateDocument(next: Workspace) { setDocument(next); setPlan(null); setMessage(''); }
  function updateScope(change: Partial<Pick<Product, 'name' | 'keywords' | 'monitoring_enabled' | 'reference_materials' | 'legacy_ip_ids'>>) {
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
        ...product, legacy_ip_ids: [ipId], keywords: product.keywords.length ? product.keywords : legacy.keywords,
      } : product) } : {
        legacy_ip_ids: [ipId], keywords: item.keywords.length ? item.keywords : legacy.keywords,
      }),
    }) });
  }
  async function activate() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await client.activate(document, saved.revision);
      setSaved(result); setDocument(result.document); setConflict(false);
      setMessage(result.execution.scopes > 0
        ? `Monitoring applied · Revision ${result.revision}. ${result.execution.scopes} scopes and ${result.execution.sources} sources are scheduled.`
        : `Monitoring paused · Revision ${result.revision}. Your brand and product setup has been kept.`);
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
      const item: Brand = { id, name, keywords, monitoring_enabled: keywords.length > 0, reference_materials: [], coverage: { markets: [], frequency: 'weekly' }, legacy_ip_ids: [], products: [] };
      updateDocument({ ...document, brands: [...document.brands, item] }); setBrandId(id); setProductId(null);
    } else if (brand) {
      const item: Product = { id, name, keywords, monitoring_enabled: keywords.length > 0, reference_materials: [], coverage: null, catalog_product_id: null, legacy_ip_ids: [] };
      updateDocument({ ...document, brands: document.brands.map(b => b.id === brandId ? { ...b, products: [...b.products, item] } : b) }); setProductId(id);
    }
    event.currentTarget.reset(); addDialog.current?.close();
  }
  async function uploadReferences(files: File[]) {
    if (!scope) return;
    if (files.length > 100 - scope.reference_materials.length) {
      setError('Each brand or product can have up to 100 reference images.');
      return;
    }
    const scopeId = scope.id;
    setBusy(true); setError(''); setMessage('');
    try {
      const uploaded = await client.uploadReferenceImages(scopeId, files);
      setReferenceImages(current => [...current.filter(image => !uploaded.some(item => item.id === image.id)), ...uploaded]);
      setDocument(current => ({ ...current, brands: current.brands.map(owner => owner.id === scopeId
        ? { ...owner, reference_materials: [...owner.reference_materials, ...uploaded.map(image => ({ id: image.id, name: image.original_filename, kind: 'image' as const, note: '' }))] }
        : { ...owner, products: owner.products.map(product => product.id === scopeId
          ? { ...product, reference_materials: [...product.reference_materials, ...uploaded.map(image => ({ id: image.id, name: image.original_filename, kind: 'image' as const, note: '' }))] }
          : product) }) }));
      setPlan(null);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  const summary = <aside className="summary" aria-label="Search preview">
    <div className="eyebrow">Search preview</div><h2>{scope?.name ?? tenantName}</h2>
    <p>{!brandId ? 'All brands and products' : !scope?.monitoring_enabled ? 'Monitoring is off' : productId ? 'Uses shared brand coverage' : 'Brand-wide searches'}</p>
    <div className="search-number"><strong>{plan?.total_searches ?? '—'}</strong><span>requested searches</span></div>
    <p>{plan ? `${plan.source_keys.length} websites · ${plan.countries.length} countries${plan.effective_coverage ? ` · ${plan.effective_coverage.frequency}` : ''}` : 'Updating preview…'}</p>
    {!!plan?.combined_searches && <p className="impact">{plan.combined_searches} duplicate {plan.combined_searches === 1 ? 'search combined' : 'searches combined'} across scopes with the same schedule.</p>}
    {!!plan?.affected_products && <p className="impact">Coverage changes also apply to {plan.affected_products} {plan.affected_products === 1 ? 'product' : 'products'} using brand coverage.</p>}
    {plan?.issues.slice(0, 3).map(issue => <p className="notice" key={issue}>{issue}</p>)}
    {plan && plan.issues.length > 3 && <details className="more-issues"><summary>{plan.issues.length - 3} more items to review</summary>{plan.issues.slice(3).map(issue => <p className="notice" key={issue}>{issue}</p>)}</details>}
    {previewError && <p role="alert" className="notice">{previewError}</p>}
    <button className="secondary" disabled={!plan?.total_searches} onClick={() => previewDialog.current?.showModal()}>Preview searches</button>
    <p className="field-note">Save and apply updates scheduled monitoring. If every scope is off, monitoring is paused.</p>
  </aside>;
  const activationIssue = activationPlan?.issues[0] ?? '';
  const activationBlocked = !activationPlan || activationPlan.issues.length > 0;
  const appliedState = activationPlan ? (activationPlan.scope_count > 0 ? 'active' : 'paused') : 'loading';
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
            {document.brands.map(item => <div className="brand-plan-row" key={item.id}><div><strong>{item.name}</strong><span className={`scope-state ${item.monitoring_enabled ? 'is-on' : 'is-off'}`}>{item.monitoring_enabled ? 'Brand on' : 'Brand off'}</span><p>{item.keywords.filter(Boolean).length} brand keywords · {item.products.filter(product => product.monitoring_enabled).length} of {item.products.length} products on · {item.coverage.markets.length} {item.coverage.markets.length === 1 ? 'country' : 'countries'}</p></div><button className="secondary" onClick={() => selectScope(item.id)} aria-label={`Edit ${item.name}`}>Edit brand</button></div>)}
            {!document.brands.length && <div className="empty-state"><p>No brand has been confirmed for this tenant yet.</p><p>Start with the brand that owns the search terms and coverage. Add products only when they need their own search terms.</p><button className="primary" onClick={() => openAdd('brand')}>Set up a brand</button></div>}
          </section>{summary}</div> : brand && scope && coverage ? <fieldset disabled={busy} className="editor-grid"><legend className="visually-hidden">Monitoring draft editor</legend><div>
            <section className={`panel monitoring-control ${scope.monitoring_enabled ? 'is-on' : 'is-off'}`}><div><h2>Monitor this {productId ? 'product' : 'brand'}</h2><p>{scope.monitoring_enabled
              ? `Searches for this ${productId ? 'product' : 'brand'} will run after you save and apply.`
              : productId ? 'No searches run for this product. Its settings and history are kept.' : 'No brand-wide searches run. Active products continue to use this brand’s shared coverage.'}</p></div><label className="monitoring-switch"><input type="checkbox" role="switch" checked={scope.monitoring_enabled} onChange={event => updateScope({ monitoring_enabled: event.target.checked })} /><span aria-hidden="true" /><strong>{scope.monitoring_enabled ? 'On' : 'Off'}</strong></label></section>
            <section className="panel"><label className="field-heading" htmlFor="scope-name">{productId ? 'Product name' : 'Brand name'}</label><input id="scope-name" className="full-width" maxLength={160} value={scope.name} onChange={event => updateScope({ name: event.target.value })} /></section>
            <section className="panel"><div className="section-heading"><div><h2>Search keywords</h2><p>{productId ? 'Phrases used to sell this product. Brand keywords are not added automatically.' : 'Optional phrases for brand-wide searches. Leave this empty to monitor only the brand’s products.'}</p></div></div><label className="visually-hidden" htmlFor="keywords">Search keywords, one per line</label><textarea id="keywords" rows={5} value={scope.keywords.join('\n')} onChange={event => updateScope({ keywords: event.target.value.split('\n') })} /><div className="field-note">One phrase per line. Each phrase is searched separately.</div></section>
            <section className="panel"><div className="section-heading"><div><h2>Reference images</h2><p>Add one or more pictures that show what this {productId ? 'product' : 'brand'} looks like.</p></div></div>
              <MatchingReadiness state={matchingState} />
              <ImageUploader compact accept="image/png,image/jpeg,image/webp" uploading={busy} onUpload={files => void uploadReferences(files)} label="Add reference images" help="PNG, JPG or WebP · up to 50MB total" />
              {(scopeReferenceImages.length > 0 || linkedLegacyImages.length > 0 || ownedReferenceImages.length > 0) && <div className="workspace-reference-grid" aria-label="Reference images">
                {scopeReferenceImages.map(({ material, image }) => <figure className="workspace-reference-image" key={material.id}>{image?.url
                  ? <RecoveringReferenceImage src={image.url} onExpired={refreshExpiredImageUrls} />
                  : <div className="legacy-reference-unavailable">Image unavailable</div>}
                  <button type="button" disabled={busy} aria-label="Remove reference image" onClick={() => updateScope({ reference_materials: scope.reference_materials.filter(item => item.id !== material.id) })}>Remove</button>
                </figure>)}
                {linkedLegacyImages.map(image => image.url ? <figure className="workspace-reference-image" key={image.id}><RecoveringReferenceImage src={image.url} onExpired={refreshExpiredImageUrls} /></figure> : <div className="legacy-reference-unavailable" key={image.id}>Image unavailable</div>)}
                {ownedReferenceImages.map(image => <figure className="workspace-reference-image" key={image.id}>{image.url
                  ? <RecoveringReferenceImage src={image.url} onExpired={refreshExpiredImageUrls} />
                  : <div className="legacy-reference-unavailable">Image unavailable</div>}</figure>)}
              </div>}
              {scopeReferenceImages.length === 0 && linkedLegacyImages.length === 0 && ownedReferenceImages.length === 0 && productReferenceImages.length === 0 && <p className="field-note">No reference images yet.</p>}
              {productReferenceImages.length > 0 && <div className="shared-product-references">
                <h3>Product references available to this brand</h3>
                <p className="field-note">Used to recognize this brand. A brand match does not confirm a specific product.</p>
                <div className="workspace-reference-grid">{productReferenceImages.map(image => <figure className="workspace-reference-image" key={image.id}>
                  <RecoveringReferenceImage src={image.url} onExpired={refreshExpiredImageUrls} />
                  <figcaption>{image.product}</figcaption>
                </figure>)}</div>
              </div>}
            </section>
            {loaded.legacy_ips.length > 0 && <section className="panel"><div className="section-heading"><div><h2>Existing IP record</h2><p>Choose at most one previous IP record for this {productId ? 'product' : 'brand'}. Choosing another replaces the current link while preserving that record’s searches, images and history.</p></div></div><div className="legacy-ip-list">{loaded.legacy_ips.map(ip => {
              const assignment = legacyAssignments.get(ip.id);
              const assignedElsewhere = !!assignment && assignment.scopeId !== scope.id;
              return <label key={ip.id} className={`legacy-ip-row${assignedElsewhere ? ' is-disabled' : ''}`}><input type="checkbox" disabled={assignedElsewhere} checked={scope.legacy_ip_ids.includes(ip.id)} onChange={event => toggleLegacyIp(ip.id, event.target.checked)} /><span><strong>{ip.name}</strong><small>{assignedElsewhere ? `Already linked to ${assignment.kind} ${assignment.name}` : `${ip.keywords.length} keywords · ${ip.monitored_domains.filter(domain => domain.enabled).length} active sites · ${ip.image_count} reference images`}</small></span></label>;
            })}</div></section>}
            <section ref={coverageSection} tabIndex={-1} aria-label="Shared coverage" className="panel coverage-panel"><h2>Shared coverage</h2>
              {productId ? <>
                <p className="field-note">This product uses {brand.name}’s countries, marketplaces and schedule whenever product monitoring is on.</p>
                <div className="inherited-coverage-summary">{coverage.markets.length ? coverage.markets.map(market => <div className="inherited-market" key={market.country}><strong>{countryLabel(market.country)}</strong><span>{market.sources.length ? market.sources.map(key => loaded.sources.find(source => source.key === key)?.name ?? key).join(', ') : 'No marketplaces selected'}</span></div>) : <p>No countries selected yet.</p>}<p className="inherited-schedule">Schedule: {coverage.frequency}</p></div>
                <button className="secondary" onClick={() => { selectScope(brand.id); requestAnimationFrame(() => { coverageSection.current?.focus(); coverageSection.current?.scrollIntoView({ block: 'start' }); }); }}>Edit shared coverage</button>
              </> : <>
                <p className="field-note">Used by every active product and by brand-wide searches when brand monitoring is on.</p>
                <CoverageEditor key={brandId} value={coverage} sources={loaded.sources} disabled={busy} onChange={value => updateDocument({ ...document, brands: document.brands.map(item => item.id === brand.id ? { ...item, coverage: value } : item) })} />
              </>}
            </section>
          </div>{summary}</fieldset> : null}
            </div>
          </div>
          <div className="savebar"><div><span>{dirty ? 'Unsaved changes' : active ? (appliedState === 'active' ? `Active · Revision ${saved.revision}` : appliedState === 'paused' ? `Applied · Monitoring paused · Revision ${saved.revision}` : `Applied · Revision ${saved.revision}`) : activationBlocked ? 'Complete setup to apply' : `Ready to apply · Revision ${saved.revision}`}</span><p className="field-note">{activationIssue || (active ? (appliedState === 'active' ? 'This configuration runs scheduled searches.' : appliedState === 'paused' ? 'All brand and product monitoring is off. Your setup is kept.' : 'Checking scheduled monitoring…') : 'Apply this configuration to update scheduled monitoring.')}</p></div><div className="actions"><button className="secondary" disabled={!dirty || busy} onClick={() => { setDocument(structuredClone(saved.document)); selectScope(null); if (!conflict) setError(''); setMessage('Unsaved changes discarded.'); }}>Discard changes</button><button className="primary" disabled={busy || conflict || activationBlocked || (!dirty && active)} onClick={activate}>{busy ? 'Applying…' : 'Save and apply'}</button></div></div>
          <div className="status" role="status">{message}</div>
        </div>
      </Content>
    </div>
    <dialog ref={addDialog} aria-labelledby="add-heading"><h2 id="add-heading">Add {adding === 'brand' ? 'a brand' : 'a product'}</h2><p>{adding === 'product' ? 'All products automatically use their brand’s countries, marketplaces and schedule. Add search phrases now to turn monitoring on, or leave them empty and configure the product later.' : 'Brands group products and provide shared monitoring coverage. Add brand-wide search phrases only when you want to monitor the brand itself.'}</p><form onSubmit={add}><label htmlFor="new-name">{adding === 'brand' ? 'Brand' : 'Product'} name</label><input id="new-name" name="name" required maxLength={160} autoFocus /><label htmlFor="new-keywords">{adding === 'brand' ? 'Brand-wide search keywords · optional · one per line' : 'Search keywords · optional · one per line'}</label><textarea id="new-keywords" name="keywords" rows={3} /><div className="actions"><button type="button" className="secondary" onClick={() => addDialog.current?.close()}>Cancel</button><button type="submit" className="primary">Add {adding === 'brand' ? 'brand' : 'product'}</button></div></form></dialog>
    <dialog ref={previewDialog} aria-labelledby="preview-heading"><div className="dialog-header"><h2 id="preview-heading">Requested searches · {plan?.total_searches ?? 0}</h2><button className="secondary" onClick={() => previewDialog.current?.close()}>Close</button></div><p>{plan?.coverage_notice}</p>{plan?.truncated && <p>Showing the first 500 searches.</p>}<div className="table-wrap"><table><thead><tr><th>Keyword</th><th>Website</th><th>Country</th><th>Schedule</th><th>Scope</th></tr></thead><tbody>{plan?.searches.map((item, i) => <tr key={i}><td>{item.keyword}</td><td>{item.source_name}<span className="preview-domain">{item.storefront_domain}</span></td><td>{countryLabel(item.country)}</td><td>{item.frequency}</td><td>{item.origins.map(origin => origin.name).join(", ")}</td></tr>)}</tbody></table></div></dialog>
    <dialog ref={leaveDialog} aria-labelledby="leave-heading"><h2 id="leave-heading">Unsaved monitoring changes</h2><p>Return to the editor to apply these changes, or discard them and switch tenant.</p><div className="actions"><button className="secondary" onClick={() => leaveDialog.current?.close()}>Keep editing</button><button className="primary" onClick={onLeave}>Discard and switch</button></div></dialog>
  </div>;
}

function RecoveringReferenceImage({ src, onExpired }: { src: string; onExpired: () => void }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (failedSrc === src) return <div className="legacy-reference-unavailable">Refreshing image…</div>;
  return <img src={src} alt="Reference" loading="lazy" onError={() => { setFailedSrc(src); onExpired(); }} />;
}
