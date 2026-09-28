import { describe, expect, test } from 'bun:test';
import { makeFixtures, scopeFor, searchPlan, effectiveCoverage, normalizeKeywords, validateScope } from './model.js';
import { createSandboxServer } from './server.mjs';

describe('Monitoring scope behavior', () => {
  test('product searches never acquire broad brand keywords implicitly', () => {
    const brand = makeFixtures()[1].brands[0];
    const scope = brand.products[0];
    const plan = searchPlan(brand, scope);
    expect(plan.searches).toHaveLength(10);
    expect(new Set(plan.searches.map(row => row.keyword))).toEqual(new Set(scope.keywords));
    expect(plan.searches.some(row => brand.keywords.includes(row.keyword))).toBe(false);
  });
  test('changing brand defaults flows to inherited products but preserves exceptions', () => {
    const brand = makeFixtures()[1].brands[0];
    brand.coverage.countries = ['ES'];
    expect(effectiveCoverage(brand, brand.products[0]).countries).toEqual(['ES']);
    expect(effectiveCoverage(brand, brand.products[2]).countries).toEqual(['US']);
  });
  test('unsupported countries are excluded and disclosed, not counted as monitored', () => {
    const brand = makeFixtures()[1].brands[0];
    const plan = searchPlan(brand, brand);
    expect(plan.searches).toHaveLength(15);
    expect(plan.unsupported).toEqual([{ website: 'Poshmark', country: 'United Kingdom' }]);
    expect(plan.searches.some(row => row.website === 'Poshmark' && row.country === 'United Kingdom')).toBe(false);
  });
  test('duplicate terms and selections do not multiply searches', () => {
    const brand = makeFixtures()[0].brands[0];
    brand.keywords = ['Bianco Latte', ' bianco   latte ', '宝拉珍选', '宝拉珍选', ''];
    brand.coverage.websites = ['ebay', 'ebay'];
    brand.coverage.countries = ['IT', 'IT'];
    expect(searchPlan(brand, brand).searches).toHaveLength(2);
    expect(normalizeKeywords(brand.keywords)).toEqual(['Bianco Latte', '宝拉珍选']);
  });
  test('a foreign product cannot fall back to a brand scope', () => {
    expect(() => scopeFor(makeFixtures()[0].brands[0], 'fluid')).toThrow('does not belong');
  });
  test('empty or wholly unsupported coverage cannot be saved as valid', () => {
    const brand = makeFixtures()[0].brands[0];
    brand.coverage = { websites: ['poshmark'], countries: ['IT'], frequency: 'weekly' };
    expect(validateScope(brand, brand)).toContain('supported');
    brand.coverage.websites = [];
    expect(validateScope(brand, brand)).toContain('website');
  });
});

async function requestResource(url, method = 'GET') {
  const server = createSandboxServer();
  const headers = new Map();
  return new Promise(resolve => {
    let status;
    const response = {
      setHeader(name, value) { headers.set(name.toLowerCase(), value); },
      writeHead(code, extra = {}) { status = code; Object.entries(extra).forEach(([name, value]) => headers.set(name.toLowerCase(), value)); return this; },
      end(body) { resolve({ status, headers, body: body?.toString() }); },
    };
    server.emit('request', { url, method }, response);
  });
}

describe('Offline sandbox boundary', () => {
  test('the HTML blocks connections, forms and framing', async () => {
    const result = await requestResource('/');
    expect(result.status).toBe(200);
    expect(result.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(result.headers.get('content-security-policy')).toContain("form-action 'none'");
    expect(result.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  });
  test('API, secrets, traversal and mutation requests cannot reach a proxy or files', async () => {
    for (const url of ['/api/ip', '/api/monitoring/runs', '/.env', '/../.env', '/%2e%2e/.env', 'https://api.unvelar.com/api/ip']) {
      expect((await requestResource(url)).status).toBe(404);
    }
    expect((await requestResource('/', 'POST')).status).toBe(404);
  });
});
