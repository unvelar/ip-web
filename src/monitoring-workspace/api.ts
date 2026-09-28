// This client deliberately does not import production transport/auth. Local
// tokens live only in this page's memory and cannot replace a real user session.
export type Coverage = { markets: { country: string; sources: string[] }[]; frequency: 'daily' | 'weekly' | 'monthly' };
export type Product = { id: string; name: string; keywords: string[]; coverage: Coverage | null; catalog_product_id: string | null };
export type Brand = { id: string; name: string; keywords: string[]; coverage: Coverage; products: Product[] };
export type Workspace = { version: 2; brands: Brand[] };
export type Source = { key: string; name: string; kind: string; domain: string; logo_key: string | null;
  categories: { key: string; name: string }[];
  markets: { country: string; storefront_domain: string; evidence_url: string }[];
};
export type Draft = { document: Workspace; revision: number; updated_at: string | null };
export type WorkspaceResponse = Draft & { company: { id: string; name: string }; sources: Source[] };
export type Plan = {
  lifecycle: 'draft'; executable: false; inherited: boolean; effective_coverage: Coverage | null;
  total_searches: number; combined_searches: number; scope_count: number; countries: string[]; source_keys: string[]; truncated: boolean; affected_products: number; issues: string[]; coverage_notice: string;
  searches: { keyword: string; source_key: string; source_name: string; country: string; frequency: Coverage['frequency']; storefront_domain: string | null; coverage_status: 'unverified'; origins: { brand_id: string; product_id: string | null; name: string }[] }[];
};
export class DraftError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
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
    async signIn(email: string) {
      const ready = await request<{ sandbox: boolean }>('/ready');
      if (ready.sandbox !== true) throw new Error('This API is not the monitoring sandbox.');
      const session = await request<{ token: string }>('/api/auth/dev', { method: 'POST', body: JSON.stringify({ email }) });
      token = session.token;
    },
    load: () => request<WorkspaceResponse>('/api/monitoring-workspace'),
    save: (document: Workspace, revision: number) => request<Draft>('/api/monitoring-workspace', { method: 'PUT', body: JSON.stringify({ document, expected_revision: revision }) }),
    preview: (document: Workspace, brandId: string | null, productId: string | null, signal?: AbortSignal) => request<Plan>('/api/monitoring-workspace/preview', { method: 'POST', body: JSON.stringify({ document, brand_id: brandId, product_id: productId }), signal }),
  };
}
