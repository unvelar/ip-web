export interface AuthStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const SHARED_TOKEN_KEY = "auth_token";
const SHARED_ACTING_TENANT_KEY = "acting_tenant";
const SIMULATED_MODE_KEY = "simulated_login_mode";
const SIMULATED_TOKEN_KEY = "simulated_login_token";
const SIMULATED_ACTING_TENANT_KEY = "simulated_login_acting_tenant";

/**
 * Owns the only persistence rule for authentication. Normal sessions are
 * shared across tabs; an admin simulation is isolated to the launched tab.
 */
export function createAuthSessionStore(
  sharedStorage: AuthStorage,
  tabStorage: AuthStorage,
  search: string,
) {
  let simulated = new URLSearchParams(search).get("simulated_login") === "1"
    || tabStorage.getItem(SIMULATED_MODE_KEY) === "1";
  if (simulated) tabStorage.setItem(SIMULATED_MODE_KEY, "1");

  let token = simulated ? tabStorage.getItem(SIMULATED_TOKEN_KEY) : sharedStorage.getItem(SHARED_TOKEN_KEY);
  let actingTenant = simulated
    ? tabStorage.getItem(SIMULATED_ACTING_TENANT_KEY)
    : sharedStorage.getItem(SHARED_ACTING_TENANT_KEY);

  function activeStorage() {
    return simulated ? tabStorage : sharedStorage;
  }

  function tokenKey() {
    return simulated ? SIMULATED_TOKEN_KEY : SHARED_TOKEN_KEY;
  }

  function actingTenantKey() {
    return simulated ? SIMULATED_ACTING_TENANT_KEY : SHARED_ACTING_TENANT_KEY;
  }

  return {
    getToken: () => token,
    setToken(value: string | null) {
      token = value;
      if (value) activeStorage().setItem(tokenKey(), value);
      else activeStorage().removeItem(tokenKey());
    },
    enableSimulation(value: string) {
      simulated = true;
      tabStorage.setItem(SIMULATED_MODE_KEY, "1");
      token = value;
      tabStorage.setItem(SIMULATED_TOKEN_KEY, value);
      actingTenant = tabStorage.getItem(SIMULATED_ACTING_TENANT_KEY);
    },
    getActingTenant: () => actingTenant,
    setActingTenant(value: string | null) {
      actingTenant = value;
      if (value) activeStorage().setItem(actingTenantKey(), value);
      else activeStorage().removeItem(actingTenantKey());
    },
    isSimulated: () => simulated,
  };
}

const emptyStorage: AuthStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const browserAuthSession = typeof window === "undefined"
  ? createAuthSessionStore(emptyStorage, emptyStorage, "")
  : createAuthSessionStore(window.localStorage, window.sessionStorage, window.location.search);
