import { describe, expect, test } from 'bun:test';
import { coverageFromLegacy, mergeCoverage } from '../src/monitoring-workspace/legacyMigration';
import type { LegacyIp, Source } from '../src/monitoring-workspace/contracts';

const sources: Source[] = [{
  key: 'amazon', name: 'Amazon', kind: 'marketplace', domain: 'amazon.com', logo_key: null, categories: [],
  markets: [{ country: 'IT', storefront_domain: 'amazon.it', evidence_url: '' }, { country: 'US', storefront_domain: 'amazon.com', evidence_url: '' }],
}];

function legacy(overrides: Partial<LegacyIp> = {}): LegacyIp {
  return { id: crypto.randomUUID(), name: 'Bianco Latte', keywords: [], monitoring_frequency: 'daily', image_count: 0, images: [], monitored_domains: [], ...overrides };
}

describe('legacy workspace conversion', () => {
  test('maps enabled legacy storefronts to explicit country coverage', () => {
    const result = coverageFromLegacy(legacy({ monitored_domains: [
      { id: '1', name: 'Amazon Italy', domain: 'https://www.amazon.it/', country: 'it', enabled: true },
      { id: '2', name: 'Disabled', domain: 'amazon.com', country: 'US', enabled: false },
    ] }), sources);
    expect(result).toEqual({ frequency: 'daily', markets: [{ country: 'IT', sources: ['amazon'] }] });
  });

  test('uses a unique storefront country and keeps an existing brand schedule when merging', () => {
    const imported = coverageFromLegacy(legacy({ monitored_domains: [
      { id: '1', name: 'Amazon Italy', domain: 'amazon.it', country: null, enabled: true },
    ] }), sources);
    expect(mergeCoverage({ frequency: 'monthly', markets: [{ country: 'US', sources: ['google'] }] }, imported)).toEqual({
      frequency: 'monthly', markets: [{ country: 'IT', sources: ['amazon'] }, { country: 'US', sources: ['google'] }],
    });
  });
});
