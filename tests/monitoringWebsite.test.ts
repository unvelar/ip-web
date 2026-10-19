import { afterEach, expect, test } from 'bun:test';
import { getMonitoringSetupCapabilities, monitoringSetupClient } from '../src/api/monitoringWorkspace';
import { getToken, getActingTenant, setToken, setActingTenant } from '../src/api/transport';
import { DraftError } from '../src/monitoring-workspace/contracts';

const originalFetch = globalThis.fetch;
const originalToken = getToken();
const originalTenant = getActingTenant();
afterEach(() => { globalThis.fetch = originalFetch; setToken(originalToken); setActingTenant(originalTenant); });

test('website setup uses the signed-in session and selected company without a development login', async () => {
  setToken('website-session'); setActingTenant('selected-company');
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    calls.push(String(input));
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer website-session');
    expect(new Headers(init?.headers).get('X-Acting-Tenant')).toBe('selected-company');
    const path = new URL(String(input), 'https://api.example').pathname;
    return Response.json(path === '/api/monitoring-workspace' ? {
      document: { version: 7, brands: [] }, revision: 3, updated_at: null,
      active_revision: null, activated_at: null, company: { id: 'selected-company', name: 'Selected company' },
      sources: [], countries: [{code: 'GG', name: 'Guernsey'}], reference_images: [], setup_state: 'configured',
    } : {marketplaces: [], categories: [], countries: [{code: 'GG', name: 'Guernsey'}]});
  }) as typeof fetch;
  const workspace = await monitoringSetupClient.load();
  await monitoringSetupClient.catalog();
  expect(workspace.countries).toEqual([{code: 'GG', name: 'Guernsey'}]);
  expect(workspace.document).toEqual({ version: 7, brands: [] });
  expect(calls.map(url => new URL(url, 'https://api.example').pathname)).toEqual(['/api/monitoring-workspace', '/api/admin/monitoring-marketplaces']);
  expect(calls.some(url => url.includes(':53000') || url.endsWith('/auth/dev'))).toBe(false);
});

test('website activation conflicts preserve their status and are never retried', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ error: 'Another editor saved this draft' }, { status: 409 }); }) as typeof fetch;
  try { await monitoringSetupClient.activate({ version: 7, brands: [] }, 5); throw new Error('Expected conflict'); }
  catch (error) { expect(error).toBeInstanceOf(DraftError); expect((error as DraftError).status).toBe(409); }
  expect(calls).toBe(1);
});

test('reference upload sends multiple images for the selected scope without descriptive fields', async () => {
  const scopeId = '11111111-1111-4111-8111-111111111111';
  const files = [
    new File(['front'], 'front.jpg', { type: 'image/jpeg' }),
    new File(['side'], 'side.png', { type: 'image/png' }),
  ];
  globalThis.fetch = (async (input, init) => {
    expect(new URL(String(input), 'https://api.example').pathname).toBe('/api/monitoring-workspace/reference-images');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
    const body = init?.body as FormData;
    expect(body.get('scope_id')).toBe(scopeId);
    expect((body.getAll('images') as File[]).map(file => file.name)).toEqual(['front.jpg', 'side.png']);
    expect([...body.keys()].sort()).toEqual(['images', 'images', 'scope_id']);
    return Response.json({ images: files.map((file, index) => ({
      id: `${index + 1}1111111-1111-4111-8111-111111111111`, scope_id: scopeId,
      original_filename: file.name, url: `https://images.example/${file.name}`,
    })) });
  }) as typeof fetch;
  const uploaded = await monitoringSetupClient.uploadReferenceImages(scopeId, files);
  expect(uploaded.map(image => image.original_filename)).toEqual(['front.jpg', 'side.png']);
});

test('rolling deployment reports unavailable setup but does not hide authentication or server failures', async () => {
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
  expect(await getMonitoringSetupCapabilities()).toEqual({ workspace: false, marketplace_admin: false });
  globalThis.fetch = (async () => Response.json({ error: 'Sign in again' }, { status: 401 })) as typeof fetch;
  await expect(getMonitoringSetupCapabilities()).rejects.toThrow('Sign in again');
  globalThis.fetch = (async () => Response.json({ workspace: 'true', marketplace_admin: true })) as typeof fetch;
  await expect(getMonitoringSetupCapabilities()).rejects.toThrow('invalid monitoring setup availability');
});

test('saved rule identities, actions and replacements survive load and activation', async () => {
  const rule = { id: '11111111-1111-4111-8111-111111111111', condition: 'The offer is an empty product box', action: 'do_not_pursue', explanation: 'Packaging is outside scope', overrides_rule_id: null };
  const productRule = { ...rule, id: '22222222-2222-4222-8222-222222222222', action: 'review', overrides_rule_id: rule.id };
  const document = { version: 7, brands: [{ id: 'brand', name: 'Brand', keywords: [], reference_materials: [], monitoring_enabled: false,
    enforcement_rules: [rule], coverage: { markets: [], frequency: 'weekly' }, products: [{ id: 'product', name: 'Product', keywords: [], reference_materials: [], monitoring_enabled: false,
      enforcement_rules: [productRule], coverage: null, catalog_product_id: null }] }] };
  globalThis.fetch = (async (input, init) => {
    const path = new URL(String(input), 'https://api.example').pathname;
    if (path.endsWith('/activate')) expect(JSON.parse(String(init?.body)).document).toEqual(document);
    return Response.json({ document, revision: 5, updated_at: null, active_revision: 5, activated_at: null,
      company: { id: 'tenant', name: 'Company' }, sources: [], countries: [{code: 'GG', name: 'Guernsey'}], reference_images: [], setup_state: 'configured', enforcement_rules_supported: true,
      execution: { scopes: 0, sources: 0, enforcement_checks_queued: 8 } });
  }) as typeof fetch;
  const loaded = await monitoringSetupClient.load();
  expect(loaded.enforcement_rules_supported).toBe(true);
  const activated = await monitoringSetupClient.activate(loaded.document, loaded.revision);
  expect(activated.document.brands[0].products[0].enforcement_rules).toEqual([productRule]);
  expect(activated.execution.enforcement_checks_queued).toBe(8);
});
