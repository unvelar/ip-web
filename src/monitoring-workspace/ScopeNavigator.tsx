import { useId, useState } from 'react';
import { Building2, ChevronRight, Package, Search, Store, Tag } from 'lucide-react';
import type { Brand } from './contracts';

export default function ScopeNavigator({ brands, tenantName, brandId, productId, disabled, onSelect, authorizationScope, onSelectAuthorizations, savedBrandIds }: {
  brands: Brand[]; tenantName: string; brandId: string | null; productId: string | null;
  authorizationScope?: string; onSelectAuthorizations?: (brandId: string | null) => void; savedBrandIds?: string[];
  disabled: boolean; onSelect: (brandId: string | null, productId?: string | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const id = useId();
  const term = query.trim().toLocaleLowerCase();
  const matches = brands.flatMap(brand => {
    const brandMatches = brand.name.toLocaleLowerCase().includes(term);
    const products = brand.products.filter(product => brandMatches || product.name.toLocaleLowerCase().includes(term));
    return brandMatches || products.length ? [{ brand, products }] : [];
  });
  return <aside className="scope-navigator" aria-label="Tenant hierarchy">
    <div className="scope-search"><Search size={14} aria-hidden /><input type="search" aria-label="Find a brand or product" placeholder="Find a brand or product…" value={query} onChange={event => setQuery(event.target.value)} /></div>
    <nav aria-label="Brands and products">
      <button className="scope-tenant" disabled={disabled} aria-current={!brandId && !authorizationScope ? 'page' : undefined} onClick={() => onSelect(null)}><Building2 size={16} aria-hidden /><span><strong>{tenantName}</strong><small>All brands &amp; products</small></span></button>
      {onSelectAuthorizations && <button className="scope-tenant-resellers" disabled={disabled} aria-current={authorizationScope === 'tenant' ? 'page' : undefined} onClick={() => onSelectAuthorizations(null)}><Store size={14} aria-hidden /><span>Authorized resellers</span></button>}
      <div className="scope-hierarchy-label">Brands</div>
      <ul>{matches.map(({ brand, products }) => {
        const open = !!term || (expanded[brand.id] ?? (brandId === brand.id || brands.length === 1));
        return <li key={brand.id}>
          <div className="scope-brand-row">
            <button className="scope-expand" disabled={(!brand.products.length && !onSelectAuthorizations) || !!term} aria-expanded={open} aria-controls={`${id}-${brand.id}`} aria-label={`${open ? 'Collapse' : 'Expand'} ${brand.name} sections`} onClick={() => setExpanded(value => ({ ...value, [brand.id]: !open }))}><ChevronRight size={13} aria-hidden /></button>
            <button className="scope-brand" disabled={disabled} aria-current={brandId === brand.id && !productId && !authorizationScope ? 'page' : undefined} onClick={() => { setExpanded(value => ({ ...value, [brand.id]: true })); onSelect(brand.id); }}><Tag size={14} aria-hidden /><span>{brand.name}</span><small className={`scope-state ${brand.monitoring_enabled ? 'is-on' : 'is-off'}`}>{brand.monitoring_enabled ? 'On' : 'Off'}</small></button>
          </div>
          {open && <ul id={`${id}-${brand.id}`} className="scope-products">{products.map(product => <li key={product.id}><button disabled={disabled} aria-current={productId === product.id && brandId === brand.id && !authorizationScope ? 'page' : undefined} onClick={() => onSelect(brand.id, product.id)}><Package size={14} aria-hidden /><span>{product.name}</span><small className={`scope-state ${product.monitoring_enabled ? 'is-on' : 'is-off'}`}>{product.monitoring_enabled ? 'On' : 'Off'}</small></button></li>)}{onSelectAuthorizations && <li><button disabled={disabled || (savedBrandIds !== undefined && !savedBrandIds.includes(brand.id))} title={savedBrandIds !== undefined && !savedBrandIds.includes(brand.id) ? 'Save this brand before managing authorizations' : undefined} aria-current={authorizationScope === brand.id ? 'page' : undefined} aria-label={`Authorized resellers for ${brand.name}`} onClick={() => onSelectAuthorizations(brand.id)}><Store size={14} aria-hidden /><span>Authorized resellers</span></button></li>}</ul>}
        </li>;
      })}</ul>
      {!matches.length && <p className="scope-no-results">{term ? 'No brands or products match.' : 'Add your first brand to get started.'}</p>}
    </nav>
  </aside>;
}
