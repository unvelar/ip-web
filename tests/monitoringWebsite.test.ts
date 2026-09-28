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
    return Response.json({});
  }) as typeof fetch;
  await monitoringSetupClient.load();
  await monitoringSetupClient.catalog();
  expect(calls.map(url => new URL(url, 'https://api.example').pathname)).toEqual(['/api/monitoring-workspace', '/api/admin/monitoring-marketplaces']);
  expect(calls.some(url => url.includes(':53000') || url.endsWith('/auth/dev'))).toBe(false);
});

test('website draft conflicts preserve their status and are never retried', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ error: 'Another editor saved this draft' }, { status: 409 }); }) as typeof fetch;
  try { await monitoringSetupClient.save({ version: 3, brands: [] }, 5); throw new Error('Expected conflict'); }
  catch (error) { expect(error).toBeInstanceOf(DraftError); expect((error as DraftError).status).toBe(409); }
  expect(calls).toBe(1);
});

test('rolling deployment reports unavailable setup but does not hide authentication or server failures', async () => {
  globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
  expect(await getMonitoringSetupCapabilities()).toEqual({ workspace: false, marketplace_admin: false });
  globalThis.fetch = (async () => Response.json({ error: 'Sign in again' }, { status: 401 })) as typeof fetch;
  await expect(getMonitoringSetupCapabilities()).rejects.toThrow('Sign in again');
  globalThis.fetch = (async () => Response.json({ workspace: 'true', marketplace_admin: true })) as typeof fetch;
  await expect(getMonitoringSetupCapabilities()).rejects.toThrow('invalid monitoring setup availability');
});
