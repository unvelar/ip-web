import type { Coverage, Source } from './contracts';

export function countrySources(value: Coverage, country: string | null, source: string): Coverage {
  if (!value.markets.some(market => market.country === country)) throw new Error('Choose the country before its marketplaces.');
  return { ...value, markets: value.markets.map(market => market.country !== country ? market : {
    ...market, sources: market.sources.includes(source) ? market.sources.filter(key => key !== source) : [...market.sources, source],
  }) };
}

export function sourcesForCountry(sources: Source[], country: string | null, selected: string[]): Source[] {
  const available = sources.filter(source => selected.includes(source.key) || (country === null ? source.markets.length === 0
    : source.kind === 'search' || source.kind === 'pattern' || source.markets.some(market => market.country === country)));
  for (const key of selected) if (!sources.some(source => source.key === key)) {
    available.push({ key, name: key, domain: '', kind: 'unavailable', logo_key: null, categories: [], markets: [] });
  }
  return available;
}
