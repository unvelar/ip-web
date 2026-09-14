import { API, request, setToken } from "./transport";
import { isRecord, requireResponse } from "./validation";

// --- Auth ---

export interface AuthUser {
  id: string;
  email: string | null;
  display_name: string | null;
  picture_url: string | null;
  tenant_id: string;
  role?: "user" | "admin";
}

export interface TenantMember {
  id: string;
  email: string | null;
  display_name: string | null;
  picture_url: string | null;
}

/** URL the browser navigates to in order to start a WorkOS AuthKit sign-in.
 *  Optional `returnTo` is a same-origin path the backend will echo back to
 *  the SPA as `?next=…` after the OAuth round-trip succeeds. */
export function workosLoginUrl(
  returnTo?: string,
  options: { forceReauth?: boolean; localAdmin?: boolean } = {},
): string {
  // Include the deployed base path so authentication returns to the same app
  // build instead of dropping PR previews back onto the production root.
  const frontendUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();
  const params = new URLSearchParams({ origin: frontendUrl });
  if (returnTo) params.set("return_to", returnTo);
  if (options.forceReauth) params.set("prompt", "login");
  if (options.localAdmin) params.set("local_admin", "1");
  return `${API}/api/auth/workos/start?${params.toString()}`;
}

export function parseAuthResponse(value: unknown): { user: AuthUser | null } {
  requireResponse(isRecord(value), "session response");
  const user = value.user;
  if (user === null) return { user: null };
  requireResponse(isRecord(user) && typeof user.id === "string" && user.id.length > 0 &&
    typeof user.tenant_id === "string" && user.tenant_id.length > 0 &&
    (user.role === undefined || user.role === "user" || user.role === "admin") &&
    [user.email, user.display_name, user.picture_url].every((field) => field === null || typeof field === "string"),
  "session response");
  return { user: user as unknown as AuthUser };
}

export async function getMe() {
  return parseAuthResponse(await request<unknown>("/api/auth/me"));
}

export interface OnboardingBrandProfile {
  domain: string;
  name: string;
  /** Canonical name first, followed by validated AI-generated aliases. */
  brand_names?: string[];
  /** Validated goods/context terms used to compose monitoring searches. */
  product_terms?: string[];
  logo_url: string | null;
  summary: string;
  categories: string[];
  monitoring_keywords?: string[];
  suggestion_source?: "deterministic" | "azure_model" | "local_model";
  suggestion_model?: string | null;
  has_online_store: boolean;
  store_url: string;
  reference_image_url: string | null;
  confidence: "high" | "medium";
}

export function getOnboardingBrandProfile() {
  return request<{ profile: OnboardingBrandProfile | null }>(
    "/api/tenant/onboarding-profile",
  );
}

export function devLogin(email: string, options: { admin?: boolean } = {}) {
  return request<{ token: string; user: AuthUser }>("/api/auth/dev", {
    method: "POST",
    body: JSON.stringify({ email, admin: options.admin === true }),
  });
}

export function listTenantMembers() {
  return request<{ members: TenantMember[] }>("/api/tenant/members");
}

export async function logout() {
  try {
    return await request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}
