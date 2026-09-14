import { describe, expect, test } from "bun:test";
import { createAuthSessionStore, type AuthStorage } from "../src/features/auth/authSession";

function memoryStorage(seed: Record<string, string> = {}): AuthStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe("auth session persistence", () => {
  test("keeps ordinary authentication shared across tabs", () => {
    const shared = memoryStorage({ auth_token: "admin-token", acting_tenant: "tenant-a" });
    const tab = memoryStorage();
    const session = createAuthSessionStore(shared, tab, "");

    expect(session.getToken()).toBe("admin-token");
    expect(session.getActingTenant()).toBe("tenant-a");
    session.setToken("next-admin-token");
    expect(shared.values.get("auth_token")).toBe("next-admin-token");
    expect(tab.values.size).toBe(0);
  });

  test("isolates a simulated user from the admin session", () => {
    const shared = memoryStorage({ auth_token: "admin-token", acting_tenant: "tenant-a" });
    const tab = memoryStorage();
    const session = createAuthSessionStore(shared, tab, "?simulated_login=1");

    session.enableSimulation("simulated-token");
    session.setActingTenant("tenant-b");

    expect(session.getToken()).toBe("simulated-token");
    expect(tab.values.get("simulated_login_token")).toBe("simulated-token");
    expect(tab.values.get("simulated_login_acting_tenant")).toBe("tenant-b");
    expect(shared.values.get("auth_token")).toBe("admin-token");
    expect(shared.values.get("acting_tenant")).toBe("tenant-a");
  });

  test("restores simulation mode after the launch query is removed", () => {
    const shared = memoryStorage({ auth_token: "admin-token" });
    const tab = memoryStorage({ simulated_login_mode: "1", simulated_login_token: "user-token" });
    const session = createAuthSessionStore(shared, tab, "");
    expect(session.isSimulated()).toBe(true);
    expect(session.getToken()).toBe("user-token");
  });
});

test("invalidates an open session when another tab changes identity or tenant", () => {
  const shared = memoryStorage({ auth_token: "old-token", acting_tenant: "tenant-a" });
  const first = createAuthSessionStore(shared, memoryStorage(), "");
  const second = createAuthSessionStore(shared, memoryStorage(), "");
  first.setToken(null);
  expect(second.synchronize()).toBe(true);
  expect(second.getToken()).toBe(null);
  expect(second.getExternalVersion()).toBe(1);
  first.setToken("new-token");
  first.setActingTenant("tenant-b");
  expect(second.synchronize()).toBe(true);
  expect(second.getToken()).toBe("new-token");
  expect(second.getActingTenant()).toBe("tenant-b");
  expect(second.getExternalVersion()).toBe(2);
  expect(second.synchronize()).toBe(false);
});

test("shared logout does not invalidate a simulated tab", () => {
  const shared = memoryStorage({ auth_token: "admin-token" });
  const simulation = createAuthSessionStore(shared, memoryStorage(), "?simulated_login=1");
  simulation.enableSimulation("simulation-token");
  shared.removeItem("auth_token");
  expect(simulation.synchronize()).toBe(false);
  expect(simulation.getToken()).toBe("simulation-token");
  expect(simulation.getExternalVersion()).toBe(0);
});
