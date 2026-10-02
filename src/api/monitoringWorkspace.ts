import { ApiError, request } from './transport';
import { isRecord, requireResponse } from './validation';
import { DraftError, type Activation, type Brand, type Coverage, type MarketplaceClient, type MatchingReadiness, type Product,
  type ReferenceImage, type ReferenceMaterial, type Source, type Workspace, type WorkspaceClient,
  type WorkspaceResponse } from '../monitoring-workspace/contracts';

export type MonitoringSetupCapabilities = { workspace: boolean; marketplace_admin: boolean };

export async function getMonitoringSetupCapabilities(): Promise<MonitoringSetupCapabilities> {
  try {
    const value = await request<MonitoringSetupCapabilities>('/api/monitoring-workspace/capabilities');
    requireResponse(typeof value?.workspace === 'boolean' && typeof value?.marketplace_admin === 'boolean', 'monitoring setup availability');
    return value;
  } catch (error) {
    // Older API deployments do not advertise this feature yet.
    if (error instanceof ApiError && error.status === 404) return { workspace: false, marketplace_admin: false };
    throw error;
  }
}

async function setupRequest<T>(path: string, init?: RequestInit): Promise<T> {
  try { return await request<T>(path, init); }
  catch (error) {
    if (error instanceof ApiError) throw new DraftError(error.message, error.status);
    throw error;
  }
}

function stringArray(value: unknown, context: string) {
  requireResponse(Array.isArray(value) && value.every(item => typeof item === 'string'), context);
  return value as string[];
}

function normalizeReferences(value: unknown): ReferenceMaterial[] {
  requireResponse(Array.isArray(value), 'monitoring reference list');
  return value.map(item => {
    requireResponse(isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string'
      && (item.kind === 'image' || item.kind === 'document') && typeof item.note === 'string', 'monitoring reference');
    return { id: item.id, name: item.name, kind: item.kind, note: item.note };
  });
}

function normalizeCoverage(value: unknown): Coverage {
  requireResponse(isRecord(value) && Array.isArray(value.markets)
    && ['daily', 'weekly', 'monthly'].includes(String(value.frequency)), 'monitoring coverage');
  return {
    frequency: value.frequency as Coverage['frequency'],
    markets: value.markets.map(market => {
      requireResponse(isRecord(market) && typeof market.country === 'string', 'monitoring market');
      return { country: market.country, sources: stringArray(market.sources, 'monitoring market sources') };
    }),
  };
}

function normalizeProduct(value: unknown): Product {
  requireResponse(isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.monitoring_enabled === 'boolean'
    && (value.catalog_product_id === null || typeof value.catalog_product_id === 'string'), 'monitoring product');
  return { id: value.id, name: value.name, keywords: stringArray(value.keywords, 'monitoring product keywords'),
    monitoring_enabled: value.monitoring_enabled, reference_materials: normalizeReferences(value.reference_materials),
    coverage: null, catalog_product_id: value.catalog_product_id };
}

function normalizeBrand(value: unknown): Brand {
  requireResponse(isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.monitoring_enabled === 'boolean' && Array.isArray(value.products), 'monitoring brand');
  return { id: value.id, name: value.name, keywords: stringArray(value.keywords, 'monitoring brand keywords'),
    monitoring_enabled: value.monitoring_enabled, reference_materials: normalizeReferences(value.reference_materials),
    coverage: normalizeCoverage(value.coverage), products: value.products.map(normalizeProduct) };
}

function normalizeWorkspace(value: unknown): Workspace {
  requireResponse(isRecord(value) && (value.version === 6 || value.version === 7) && Array.isArray(value.brands), 'monitoring workspace');
  return { version: 7, brands: value.brands.map(normalizeBrand) };
}

function normalizeMatchingReadiness(value: unknown): MatchingReadiness[] | undefined {
  if (value === undefined) return undefined;
  requireResponse(Array.isArray(value), 'monitoring matching readiness');
  return value.map(item => {
    requireResponse(isRecord(item) && typeof item.scope_id === 'string'
      && (item.scope_kind === 'brand' || item.scope_kind === 'product') && typeof item.name === 'string'
      && typeof item.monitoring_enabled === 'boolean'
      && ['ready', 'indexing', 'references_needed'].includes(String(item.status))
      && typeof item.own_reference_count === 'number' && typeof item.shared_reference_count === 'number'
      && typeof item.ready_reference_count === 'number' && typeof item.detail === 'string',
    'monitoring matching readiness item');
    return item as MatchingReadiness;
  });
}

function normalizeDraft(value: unknown) {
  requireResponse(isRecord(value) && typeof value.revision === 'number'
    && (value.updated_at === null || typeof value.updated_at === 'string')
    && (value.active_revision === null || typeof value.active_revision === 'number')
    && (value.activated_at === null || typeof value.activated_at === 'string'), 'monitoring draft');
  return { document: normalizeWorkspace(value.document), revision: value.revision, updated_at: value.updated_at,
    active_revision: value.active_revision, activated_at: value.activated_at };
}

function normalizeLoadResponse(value: unknown): WorkspaceResponse {
  const draft = normalizeDraft(value);
  requireResponse(isRecord(value) && isRecord(value.company) && typeof value.company.id === 'string'
    && typeof value.company.name === 'string' && Array.isArray(value.sources) && Array.isArray(value.reference_images)
    && (value.setup_state === 'required' || value.setup_state === 'configured'), 'monitoring setup');
  return { ...draft, company: { id: value.company.id, name: value.company.name }, sources: value.sources as Source[],
    reference_images: value.reference_images as ReferenceImage[], matching_readiness: normalizeMatchingReadiness(value.matching_readiness),
    setup_state: value.setup_state };
}

function normalizeActivation(value: unknown): Activation {
  const draft = normalizeDraft(value);
  requireResponse(isRecord(value) && isRecord(value.execution) && typeof value.execution.scopes === 'number'
    && typeof value.execution.sources === 'number', 'monitoring activation');
  return { ...draft, lifecycle: 'active', executable: true,
    execution: { scopes: value.execution.scopes, sources: value.execution.sources },
    matching_readiness: normalizeMatchingReadiness(value.matching_readiness) };
}

// Uses the website's WorkOS session and acting-company header. The isolated
// development client is deliberately a separate adapter with no shared login.
export const monitoringSetupClient: WorkspaceClient & MarketplaceClient = {
  load: async () => normalizeLoadResponse(await setupRequest<unknown>('/api/monitoring-workspace')),
  uploadReferenceImages: async (scopeId, files) => {
    const body = new FormData();
    body.append('scope_id', scopeId);
    for (const file of files) body.append('images', file);
    const result = await setupRequest<{ images: ReferenceImage[] }>('/api/monitoring-workspace/reference-images', { method: 'POST', body });
    return result.images;
  },
  activate: async (document, revision) => normalizeActivation(await setupRequest<unknown>('/api/monitoring-workspace/activate', { method: 'POST', body: JSON.stringify({ document, expected_revision: revision }) })),
  preview: (document, brandId, productId, signal) => setupRequest('/api/monitoring-workspace/preview', { method: 'POST', body: JSON.stringify({ document, brand_id: brandId, product_id: productId }), signal }),
  catalog: () => setupRequest('/api/admin/monitoring-marketplaces'),
  saveMarketplace: value => setupRequest('/api/admin/monitoring-marketplaces', { method: 'PUT', body: JSON.stringify(value) }),
  addSector: name => setupRequest('/api/admin/monitoring-marketplaces/sectors', { method: 'POST', body: JSON.stringify({ name }) }),
};
