import type { Tenant } from "./admin";
import type { Trademark } from "./registry";
import { API, request } from "./transport";

// --- Public IP monitoring intake ---

async function publicJsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (init?.body && typeof init.body === "string") headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export interface PublicIntakeEmailStart {
  verification_id: string;
  email: string;
  email_domain: string;
  expires_at: string;
  debug_code?: string;
}

export function startPublicIntakeEmail(email: string) {
  return publicJsonRequest<PublicIntakeEmailStart>("/api/public-intakes/email/start", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export interface PublicIntakeEmailVerify {
  verification_token: string;
  expires_at: string;
}

export function verifyPublicIntakeEmail(verificationId: string, code: string) {
  return publicJsonRequest<PublicIntakeEmailVerify>("/api/public-intakes/email/verify", {
    method: "POST",
    body: JSON.stringify({ verification_id: verificationId, code }),
  });
}

export async function submitPublicIpIntake(input: {
  verification_id: string;
  verification_token: string;
  product_name: string;
  images: File[];
}) {
  const form = new FormData();
  form.append("verification_id", input.verification_id);
  form.append("verification_token", input.verification_token);
  form.append("product_name", input.product_name);
  for (const file of input.images) form.append("images", file);

  const res = await fetch(`${API}/api/public-intakes`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<{ intake_id: string; status: "pending" | "converted" | "rejected" }>;
}

// --- Public brand sum-up pages ---

export interface PublicBrandSumup {
  tenant: { name: string; slug: string };
  ip: { name: string; slug: string };
  generated_at: string;
  totals: {
    analyzed_count: number;
    triaged_count: number;
    to_takedown_count: number;
    potential_count?: number;
    infringement_percentage: number;
    potential_infringement_percentage?: number;
    estimated_value_usd: number;
    confirmed_value_usd?: number;
    potential_value_usd?: number;
    monitored_value_usd?: number;
  };
  websites: Array<{
    domain: string;
    analyzed_count: number;
    triaged_count: number;
    to_takedown_count: number;
    potential_count?: number;
    infringement_percentage: number;
    potential_infringement_percentage?: number;
    estimated_value_usd: number;
    confirmed_value_usd?: number;
    potential_value_usd?: number;
  }>;
}

export async function getPublicBrandSumup(tenantName: string, ipName: string) {
  const res = await fetch(
    `${API}/api/brand-sumups/${encodeURIComponent(tenantName)}/${encodeURIComponent(ipName)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<PublicBrandSumup>;
}

export type PublicIpIntakeStatus = "pending" | "converted" | "rejected";

export interface PublicIpIntakeAdminSummary {
  id: string;
  email: string;
  email_domain: string;
  product_name: string;
  status: PublicIpIntakeStatus;
  image_count: number;
  converted_tenant_id: string | null;
  converted_ip_catalog_id: string | null;
  converted_by: string | null;
  converted_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  converted_ip_name: string | null;
  converted_tenant_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicIpIntakeImage {
  id: string;
  intake_id: string;
  storage_path: string;
  original_filename: string | null;
  content_type: string | null;
  byte_size: number;
  created_at: string;
  url: string | null;
}

export function listPublicIpIntakes(opts: {
  status?: PublicIpIntakeStatus | "";
  limit?: number;
  offset?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (opts.status) qs.set("status", opts.status);
  if (opts.limit != null) qs.set("limit", String(opts.limit));
  if (opts.offset != null) qs.set("offset", String(opts.offset));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request<{
    intakes: PublicIpIntakeAdminSummary[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/admin/public-intakes${suffix}`);
}

export function getPublicIpIntake(id: string) {
  return request<{
    intake: PublicIpIntakeAdminSummary;
    images: PublicIpIntakeImage[];
  }>(`/api/admin/public-intakes/${encodeURIComponent(id)}`);
}

export function rejectPublicIpIntake(id: string, reason?: string) {
  return request<{ intake: PublicIpIntakeAdminSummary }>(
    `/api/admin/public-intakes/${encodeURIComponent(id)}/reject`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function convertPublicIpIntake(id: string, input: {
  tenant_id?: string;
  create_tenant_name?: string;
  ip_name?: string;
  description?: string;
  keywords?: string[];
}) {
  return request<{
    intake: PublicIpIntakeAdminSummary;
    tenant: Tenant;
    trademark: Trademark;
    index_job_id: string | null;
  }>(`/api/admin/public-intakes/${encodeURIComponent(id)}/convert`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
