import { browserAuthSession } from "../features/auth/authSession";
import { withRequestTimeout } from "../lib/requestTimeout";

export const API = import.meta.env.VITE_API_URL || "";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export function isApiError(error: unknown, status?: number): error is ApiError {
  return error instanceof ApiError && (status == null || error.status === status);
}

export function getToken() {
  return browserAuthSession.getToken();
}

export function setToken(t: string | null) {
  browserAuthSession.setToken(t);
}

/** Keep an admin-launched simulated identity isolated to its new browser tab.
 * Unlike normal auth, this never replaces the admin's shared localStorage token. */
export function setSimulatedLoginToken(t: string) {
  browserAuthSession.enableSimulation(t);
}

// --- Acting tenant (admin "operate as any tenant") ---
// When an admin selects a tenant in the switcher we persist its id and send it
// as `X-Acting-Tenant` on every request. The API honors it only for admins and
// scopes the whole request to that tenant. Non-admins never set this.
export function getActingTenant() {
  return browserAuthSession.getActingTenant();
}

export function setActingTenant(t: string | null) {
  browserAuthSession.setActingTenant(t);
}

/** Attach the Bearer token and (when set) the acting-tenant override. */
export function authHeaders(headers: Record<string, string>) {
  const token = browserAuthSession.getToken();
  const actingTenant = browserAuthSession.getActingTenant();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (actingTenant) headers["X-Acting-Tenant"] = actingTenant;
}

/** Read requests have a deadline; mutations are never retried automatically. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const credentials: Record<string, string> = {};
  authHeaders(credentials);
  for (const [name, value] of Object.entries(credentials)) headers.set(name, value);
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const send = async (signal?: AbortSignal): Promise<T> => {
    const res = await fetch(`${API}${path}`, { ...init, headers, signal });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error : res.statusText || `Request failed (${res.status})`;
      throw new ApiError(res.status, message, body);
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  };
  const method = (init?.method ?? "GET").toUpperCase();
  return method === "GET" || method === "HEAD"
    ? withRequestTimeout(send, { signal: init?.signal ?? undefined, timeoutMs: 15_000 })
    : send(init?.signal ?? undefined);
}
