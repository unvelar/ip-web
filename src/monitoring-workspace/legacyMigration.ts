import type { Coverage, LegacyIp, Source } from './contracts';

function domain(value: string) {
  try { return new URL(value.includes('://') ? value : `https://${value}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return value.trim().replace(/^www\./, '').replace(/\/$/, '').toLowerCase(); }
}

export function coverageFromLegacy(ip: LegacyIp, sources: Source[]): Coverage {
  const markets = new Map<string, Set<string>>();
  for (const monitored of ip.monitored_domains) {
    if (!monitored.enabled) continue;
    const monitoredDomain = domain(monitored.domain);
    const source = sources.find(item => domain(item.domain) === monitoredDomain || item.markets.some(market => domain(market.storefront_domain) === monitoredDomain));
    if (!source) continue;
    const explicitCountry = monitored.country?.toUpperCase();
    const matchingCountries = source.markets.filter(market => domain(market.storefront_domain) === monitoredDomain).map(market => market.country);
    const country = explicitCountry?.match(/^[A-Z]{2}$/) ? explicitCountry : matchingCountries.length === 1 ? matchingCountries[0] : null;
    if (!country) continue;
    const selected = markets.get(country) ?? new Set<string>();
    selected.add(source.key);
    markets.set(country, selected);
  }
  return {
    frequency: ip.monitoring_frequency === 'off' ? 'weekly' : ip.monitoring_frequency,
    markets: [...markets].sort(([left], [right]) => left.localeCompare(right)).map(([country, selected]) => ({ country, sources: [...selected] })),
  };
}

export function mergeCoverage(current: Coverage, incoming: Coverage): Coverage {
  const markets = new Map(current.markets.map(market => [market.country, new Set(market.sources)]));
  for (const market of incoming.markets) {
    const selected = markets.get(market.country) ?? new Set<string>();
    market.sources.forEach(source => selected.add(source));
    markets.set(market.country, selected);
  }
  return {
    frequency: current.markets.length ? current.frequency : incoming.frequency,
    markets: [...markets].sort(([left], [right]) => left.localeCompare(right)).map(([country, selected]) => ({ country, sources: [...selected] })),
  };
}
