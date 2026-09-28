// This client deliberately does not import production transport/auth. Local
// tokens live only in this page's memory and cannot replace a real user session.
import { DraftError, type AdminCatalog, type MarketplaceEdit, type WorkspaceResponse, type Workspace, type Draft, type Plan } from './contracts';
export * from './contracts';
export function assertLocalWorkspace(hostname: string, development: boolean, mode: string) {
  if (!development || mode !== 'monitoring-workspace' || !['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('Run bun run dev:monitoring-workspace on localhost to open this development workspace.');
  }
}
export function workspaceClient(hostname: string) {
  // There is no configurable remote URL or production fallback.
  if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error('Local development host required.');
  const origin = `http://${hostname}:53000`;
  let token = '';
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(origin + path, {
      ...init, credentials: 'omit', signal: init?.signal ?? AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new DraftError(body.error || `Request failed (${response.status})`, response.status);
    return body as T;
  }
  return {
    async signIn(email: string, admin = false) {
      const ready = await request<{ sandbox: boolean }>('/ready');
      if (ready.sandbox !== true) throw new Error('This API is not the monitoring sandbox.');
      const session = await request<{ token: string }>('/api/auth/dev', { method: 'POST', body: JSON.stringify({ email, ...(admin ? { admin: true } : {}) }) });
      token = session.token;
    },
    catalog: () => request<AdminCatalog>('/api/admin/monitoring-marketplaces'),
    saveMarketplace: (value: MarketplaceEdit) => request<{ key: string; revision: number }>('/api/admin/monitoring-marketplaces', { method: 'PUT', body: JSON.stringify(value) }),
    addSector: (name: string) => request<{ key: string; name: string }>('/api/admin/monitoring-marketplaces/sectors', { method: 'POST', body: JSON.stringify({ name }) }),
    load: () => request<WorkspaceResponse>('/api/monitoring-workspace'),
    save: (document: Workspace, revision: number) => request<Draft>('/api/monitoring-workspace', { method: 'PUT', body: JSON.stringify({ document, expected_revision: revision }) }),
    preview: (document: Workspace, brandId: string | null, productId: string | null, signal?: AbortSignal) => request<Plan>('/api/monitoring-workspace/preview', { method: 'POST', body: JSON.stringify({ document, brand_id: brandId, product_id: productId }), signal }),
  };
}
