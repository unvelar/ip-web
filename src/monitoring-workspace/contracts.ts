export type Coverage = { markets: { country: string; sources: string[] }[]; frequency: 'daily' | 'weekly' | 'monthly' };
export type ReferenceMaterial = { id: string; name: string; kind: 'image' | 'document'; note: string };
export type ReferenceImage = { id: string; scope_id: string; original_filename: string; url: string };
export type MatchingReadiness = {
  scope_id: string; scope_kind: 'brand' | 'product'; name: string; monitoring_enabled: boolean;
  status: 'ready' | 'indexing' | 'references_needed'; own_reference_count: number;
  shared_reference_count: number; ready_reference_count: number; detail: string;
};
export type Product = { id: string; name: string; keywords: string[]; monitoring_enabled: boolean; reference_materials: ReferenceMaterial[]; coverage: null; catalog_product_id: string | null };
export type Brand = { id: string; name: string; keywords: string[]; monitoring_enabled: boolean; reference_materials: ReferenceMaterial[]; coverage: Coverage; products: Product[] };
export type Workspace = { version: 7; brands: Brand[] };
export type Source = { key: string; name: string; kind: string; domain: string; logo_key: string | null;
  categories: { key: string; name: string }[];
  markets: { country: string; storefront_domain: string; evidence_url: string }[];
};
export type AdminMarketplace = Source & { revision: number };
export type AdminCatalog = { marketplaces: AdminMarketplace[]; categories: { key: string; name: string }[]; countries: { code: string; name: string }[] };
export type MarketplaceEdit = { key: string | null; expected_revision: number; name: string; domain: string; logo_key: string | null; categories: string[]; markets: Source['markets'] };
export type Draft = { document: Workspace; revision: number; updated_at: string | null; active_revision: number | null; activated_at: string | null };
export type Activation = Draft & { lifecycle: 'active'; executable: true; execution: { scopes: number; sources: number }; matching_readiness?: MatchingReadiness[] };
export type WorkspaceResponse = Draft & { company: { id: string; name: string }; sources: Source[]; reference_images: ReferenceImage[]; matching_readiness?: MatchingReadiness[]; setup_state: 'required' | 'configured' };
export type Plan = {
  lifecycle: 'draft'; executable: false; inherited: boolean; effective_coverage: Coverage | null;
  total_searches: number; combined_searches: number; scope_count: number; countries: string[]; source_keys: string[]; truncated: boolean; affected_products: number; issues: string[]; coverage_notice: string;
  searches: { keyword: string; source_key: string; source_name: string; country: string; frequency: Coverage['frequency']; storefront_domain: string | null; coverage_status: 'unverified'; origins: { brand_id: string; product_id: string | null; name: string }[] }[];
  matching_readiness?: MatchingReadiness[];
};
export class DraftError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
export interface WorkspaceClient {
  load(): Promise<WorkspaceResponse>;
  uploadReferenceImages(scopeId: string, files: File[]): Promise<ReferenceImage[]>;
  activate(document: Workspace, revision: number): Promise<Activation>;
  preview(document: Workspace, brandId: string | null, productId: string | null, signal?: AbortSignal): Promise<Plan>;
}
export interface MarketplaceClient {
  catalog(): Promise<AdminCatalog>;
  saveMarketplace(value: MarketplaceEdit): Promise<{ key: string; revision: number }>;
  addSector(name: string): Promise<{ key: string; name: string }>;
}
