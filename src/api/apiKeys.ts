import { request } from "./transport";

// --- API keys ---

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function listApiKeys() {
  return request<{ keys: ApiKey[] }>("/api/api-keys");
}

export function createApiKey(name: string) {
  return request<{ key: ApiKey; token: string }>("/api/api-keys", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function revokeApiKey(id: string) {
  return request<{ ok: boolean }>(`/api/api-keys/${id}`, {
    method: "DELETE",
  });
}
