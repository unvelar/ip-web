import { useState } from 'react';
import { COUNTRIES, flagEmoji } from '../lib/countries';
import type { Coverage, Source } from './contracts';
import { countrySources, sourcesForCountry } from './coverage';

export function MarketplaceMark({ source }: { source: Source }) {
  const [failedDomain, setFailedDomain] = useState<string | null>(null);
  const domain = source.domain.trim();
  if (!domain || failedDomain === domain) return <span className="marketplace-monogram" aria-hidden="true">{source.name.slice(0, 2)}</span>;
  return <span className="marketplace-logo" aria-hidden="true"><img key={domain} src={`https://${domain}/favicon.ico`} alt="" width={24} height={24} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedDomain(domain)} /></span>;
}

export default function CoverageEditor({ value, sources, disabled, onChange }: {
  value: Coverage; sources: Source[]; disabled: boolean; onChange: (value: Coverage) => void;
}) {
  const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
  const countries = [...new Map([...COUNTRIES, ...sources.flatMap(source => source.markets.map(market => ({ code: market.country, name: regionNames.of(market.country) ?? market.country })))].map(item => [item.code, item])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const [focusedCountry, setFocusedCountry] = useState<string | null | undefined>(value.markets[0]?.country);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const country = value.markets.some(market => market.country === focusedCountry) ? focusedCountry : value.markets[0]?.country;
  const selected = value.markets.find(market => market.country === country)?.sources ?? [];
  const available = country === undefined ? [] : sourcesForCountry(sources, country, selected);
  const categories = [...new Map(available.flatMap(source => source.categories.map(category => [category.key, category] as const))).values()].sort((a, b) => a.name.localeCompare(b.name));
  const matching = available.filter(source => (!genre || source.categories.some(category => category.key === genre))
    && (!selectedOnly || selected.includes(source.key))
    && `${source.name} ${source.domain} ${source.markets.find(market => market.country === country)?.storefront_domain ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  function focus(code: string | null) { setFocusedCountry(code); setQuery(''); setGenre(''); setSelectedOnly(false); }

  function rows(items: Source[]) {
    return items.map(source => {
      const displayedCategories = [...source.categories].sort((a, b) => Number(b.key === genre) - Number(a.key === genre));
      const market = source.markets.find(item => item.country === country);
      const missing = country === null ? source.markets.length > 0
        : !market && source.kind !== 'search' && source.kind !== 'pattern';
      return <label className={`marketplace-row${selected.includes(source.key) ? ' is-selected' : ''}`} key={source.key}>
        <input type="checkbox" aria-label={`${source.name} in ${country === null ? 'Anywhere' : countries.find(item => item.code === country)?.name ?? country}`} checked={selected.includes(source.key)} disabled={disabled} onChange={() => onChange(countrySources(value, country ?? null, source.key))} />
        <MarketplaceMark source={source} />
        <span className="marketplace-identity"><strong>{source.name}</strong><span>{market?.storefront_domain ?? source.domain}{missing && <em>Country mapping needs review</em>}</span></span>
        <span className="marketplace-genres">{displayedCategories.slice(0, 3).map(category => <span className="genre-tag" key={category.key}>{category.name}</span>)}{source.categories.length > 3 && <span className="genre-tag" title={displayedCategories.slice(3).map(category => category.name).join(", ")}>+{source.categories.length - 3}</span>}</span>
      </label>;
    });
  }

  return <div className="country-coverage">
    <div className="country-toolbar"><span className="field-heading">Search countries</span><label className="visually-hidden" htmlFor="add-country">Add country</label><select id="add-country" disabled={disabled} value="" onChange={event => {
      const raw = event.target.value;
      const code = raw === 'anywhere' ? null : raw;
      if (!raw || value.markets.some(market => market.country === code)) return;
      onChange({ ...value, markets: [...value.markets, { country: code, sources: [] }] }); focus(code);
    }}><option value="">+ Add country</option>{!value.markets.some(market => market.country === null) && <option value="anywhere">Anywhere</option>}{countries.filter(item => !value.markets.some(market => market.country === item.code)).map(item => <option key={item.code} value={item.code}>{flagEmoji(item.code)} {item.name}</option>)}</select></div>
    <div className="country-tabs" aria-label="Selected countries">{value.markets.map(market => <div className={`country-tab${country === market.country ? ' active' : ''}`} key={market.country ?? 'anywhere'}>
      <button type="button" aria-label={`Marketplaces in ${market.country === null ? 'Anywhere' : countries.find(item => item.code === market.country)?.name ?? market.country}`} aria-pressed={country === market.country} onClick={() => focus(market.country)}><span aria-hidden="true">{market.country ? flagEmoji(market.country) : ''}</span> {market.country ?? 'Anywhere'}<span className="country-count">{market.sources.length}</span></button>
      <button type="button" className="remove-country" aria-label={`Remove ${market.country === null ? 'Anywhere' : countries.find(item => item.code === market.country)?.name ?? market.country}`} disabled={disabled} onClick={() => onChange({ ...value, markets: value.markets.filter(item => item.country !== market.country) })}>×</button>
    </div>)}</div>
    {country === undefined ? <div className="coverage-empty">Choose a country to see its marketplaces.</div> : <>
      <div className="marketplace-heading"><h3>{country ? flagEmoji(country) : ''} {country === null ? 'Anywhere' : countries.find(item => item.code === country)?.name ?? country}</h3><span>{selected.length} selected</span></div>
      <div className="marketplace-filters"><input type="search" aria-label="Find a marketplace" placeholder="Find a marketplace…" value={query} onChange={event => setQuery(event.target.value)} /><label className="visually-hidden" htmlFor="marketplace-genre">Marketplace sector</label><select id="marketplace-genre" value={genre} onChange={event => setGenre(event.target.value)}><option value="">All sectors</option>{categories.map(category => <option key={category.key} value={category.key}>{category.name}</option>)}</select><label className="selected-only"><input type="checkbox" checked={selectedOnly} onChange={event => setSelectedOnly(event.target.checked)} />Selected</label></div>
      <div className="marketplace-table" role="group" aria-label={`Marketplaces for ${country ?? 'Anywhere'}`}>
        <div className="marketplace-table-head"><span>Marketplace</span><span>Sectors</span></div>
        {rows(matching.filter(source => source.kind !== 'search'))}
        {!matching.some(source => source.kind !== 'search') && <p className="marketplace-empty">{genre || query || selectedOnly ? 'No marketplaces match these filters.' : 'No marketplace entries for this country yet.'}</p>}
        {matching.some(source => source.kind === 'search') && <><div className="marketplace-group-heading">Web search</div>{rows(matching.filter(source => source.kind === 'search'))}</>}
      </div>
      <p className="field-note">{country === null ? 'These marketplaces have no assigned country and can be visited from any country.' : `Visits require ${countries.find(item => item.code === country)?.name ?? country}. This is the search market, not seller location.`} Sectors help browse the catalog; monitoring support still needs verification.</p>
    </>}
    <div className="frequency-row"><label htmlFor="frequency">Repeat</label><select id="frequency" disabled={disabled} value={value.frequency} onChange={event => onChange({ ...value, frequency: event.target.value as Coverage['frequency'] })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></div>
  </div>;
}
