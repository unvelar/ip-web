import { ApiError, request } from './transport';
import { requireResponse } from './validation';
import { DraftError, type ReferenceImage, type WorkspaceClient, type MarketplaceClient } from '../monitoring-workspace/contracts';

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

// Uses the website's WorkOS session and acting-company header. The isolated
// development client is deliberately a separate adapter with no shared login.
export const monitoringSetupClient: WorkspaceClient & MarketplaceClient = {
  load: () => setupRequest('/api/monitoring-workspace'),
  uploadReferenceImages: async (scopeId, files) => {
    const body = new FormData();
    body.append('scope_id', scopeId);
    for (const file of files) body.append('images', file);
    const result = await setupRequest<{ images: ReferenceImage[] }>('/api/monitoring-workspace/reference-images', { method: 'POST', body });
    return result.images;
  },
  activate: (document, revision) => setupRequest('/api/monitoring-workspace/activate', { method: 'POST', body: JSON.stringify({ document, expected_revision: revision }) }),
  preview: (document, brandId, productId, signal) => setupRequest('/api/monitoring-workspace/preview', { method: 'POST', body: JSON.stringify({ document, brand_id: brandId, product_id: productId }), signal }),
  catalog: () => setupRequest('/api/admin/monitoring-marketplaces'),
  saveMarketplace: value => setupRequest('/api/admin/monitoring-marketplaces', { method: 'PUT', body: JSON.stringify(value) }),
  addSector: name => setupRequest('/api/admin/monitoring-marketplaces/sectors', { method: 'POST', body: JSON.stringify({ name }) }),
};
