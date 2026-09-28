import { afterEach, expect, test } from 'bun:test';
import { isLocalMonitoringPreview, localPreviewAvailable } from '../src/monitoring-workspace/localPreviewAvailability';
import { openLocalCompany } from '../src/monitoring-workspace/localSessions';
import { exampleCompanies } from '../src/monitoring-workspace/fixtures';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('query parameters cannot enable sample data on hosted sites or production builds', () => {
  expect(localPreviewAvailable('localhost', true)).toBe(true);
  expect(localPreviewAvailable('127.0.0.1', true)).toBe(true);
  expect(isLocalMonitoringPreview('/monitoring/setup', '?preview=local', 'localhost', true)).toBe(true);
  expect(isLocalMonitoringPreview('/admin/marketplaces', '?preview=local', 'localhost', true)).toBe(true);
  expect(isLocalMonitoringPreview('/monitoring/setup', '?preview=local', 'unvelar.com', true)).toBe(false);
  expect(isLocalMonitoringPreview('/monitoring/setup', '?preview=local', 'localhost', false)).toBe(false);
  expect(isLocalMonitoringPreview('/monitoring/setup', '', 'localhost', true)).toBe(false);
  expect(isLocalMonitoringPreview('/ips', '?preview=local', 'localhost', true)).toBe(false);
});

test('opening a sample preserves existing edits and only uses isolated local credentials', async () => {
  const calls: {url: string; init?: RequestInit}[] = [];
  const saved = { company: { id: 'sample-id', name: 'sample-domain' }, document: { version: 3, brands: [] }, revision: 5, updated_at: null, sources: [] };
  globalThis.fetch = (async (input, init) => {
    const url = String(input); calls.push({ url, init });
    expect(url.startsWith('http://localhost:53000/')).toBe(true);
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).has('X-Acting-Tenant')).toBe(false);
    return Response.json(url.endsWith('/ready') ? { sandbox: true } : url.endsWith('/auth/dev') ? { token: 'sample-token' } : saved);
  }) as typeof fetch;
  const opened = await openLocalCompany(exampleCompanies[0], 'localhost');
  expect(opened.data.document).toEqual(saved.document);
  expect(opened.data.revision).toBe(5);
  expect(opened.data.company.name).toBe('Giardini di Toscana');
  expect(calls.length).toBe(3);
  expect(calls.some(call => call.init?.method === 'PUT')).toBe(false);
  expect(new Headers(calls[2].init?.headers).get('Authorization')).toBe('Bearer sample-token');
});
