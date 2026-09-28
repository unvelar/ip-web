import { afterEach, expect, test } from 'bun:test';
import { assertLocalWorkspace, DraftError, workspaceClient, type Workspace } from '../src/monitoring-workspace/api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
test('development client refuses remote hosts and production build modes', () => {
  expect(() => assertLocalWorkspace('unvelar.com', true, 'monitoring-workspace')).toThrow();
  expect(() => assertLocalWorkspace('localhost', false, 'monitoring-workspace')).toThrow();
  expect(() => assertLocalWorkspace('localhost', true, 'development')).toThrow();
  expect(() => workspaceClient('api.unvelar.com')).toThrow();
  expect(() => assertLocalWorkspace('127.0.0.1', true, 'monitoring-workspace')).not.toThrow();
});
test('client verifies the sandbox before login and cannot send production credentials', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(String(url).endsWith('/ready') ? { sandbox: true } : { token: 'local-only' });
  }) as typeof fetch;
  const client = workspaceClient('localhost');
  await client.signIn('editor@company.example');
  await client.load();
  expect(calls.map(call => call.url)).toEqual(['http://localhost:53000/ready', 'http://localhost:53000/api/auth/dev', 'http://localhost:53000/api/monitoring-workspace']);
  expect(calls[0].init?.credentials).toBe('omit');
  expect(new Headers(calls[0].init?.headers).has('Authorization')).toBe(false);
  expect(new Headers(calls[2].init?.headers).get('Authorization')).toBe('Bearer local-only');
});
test('an API without the sandbox marker cannot receive a login', async () => {
  let count = 0;
  globalThis.fetch = (async () => { count++; return Response.json({}); }) as typeof fetch;
  await expect(workspaceClient('localhost').signIn('editor@company.example')).rejects.toThrow('not the monitoring sandbox');
  expect(count).toBe(1);
});
test('saving sends the expected revision and surfaces conflicts without retrying', async () => {
  let count = 0;
  const document: Workspace = { version: 2, brands: [] };
  globalThis.fetch = (async (_url, init) => {
    count++;
    expect(JSON.parse(init?.body as string)).toEqual({ document, expected_revision: 4 });
    return Response.json({ error: 'Draft changed' }, { status: 409 });
  }) as typeof fetch;
  try { await workspaceClient('localhost').save(document, 4); throw new Error('Expected a conflict'); }
  catch (err) { expect(err).toBeInstanceOf(DraftError); expect((err as DraftError).status).toBe(409); }
  expect(count).toBe(1);
});

test('country-first selection isolates edits and preserves uncataloged saved choices', async () => {
  const { countrySources, sourcesForCountry } = await import('../src/monitoring-workspace/coverage');
  const value = { frequency: 'weekly' as const, markets: [{ country: 'IT', sources: ['ebay'] }, { country: 'ES', sources: ['ebay'] }] };
  const edited = countrySources(value, 'IT', 'ebay');
  expect(edited.markets).toEqual([{ country: 'IT', sources: [] }, { country: 'ES', sources: ['ebay'] }]);
  expect(value.markets[0].sources).toEqual(['ebay']);
  const base = { name: 'Example', domain: 'example.test', logo_key: null, categories: [] };
  const sources = [{ ...base, key: 'italy', kind: 'marketplace', markets: [{ country: 'IT', storefront_domain: 'example.it', evidence_url: 'https://example.test' }] }, { ...base, key: 'search', kind: 'search', markets: [] }];
  expect(sourcesForCountry(sources, 'ES', []).map(source => source.key)).toEqual(['search']);
  expect(sourcesForCountry(sources, 'ES', ['italy', 'retired']).map(source => source.key)).toEqual(['italy', 'search', 'retired']);
});

test('company preview sends an explicit company scope', async () => {
  globalThis.fetch = (async (_url, init) => {
    expect(JSON.parse(init?.body as string)).toEqual({ document: { version: 2, brands: [] }, brand_id: null, product_id: null });
    return Response.json({});
  }) as typeof fetch;
  await workspaceClient('localhost').preview({ version: 2, brands: [] }, null, null);
});
