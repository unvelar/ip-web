import { afterEach, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../src/context/AuthContext";
import AdminTenants from "../src/pages/AdminTenants";
import type { Tenant } from "../src/api/admin";

const originalFetch = globalThis.fetch;
let root: Root | undefined;
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  globalThis.fetch = originalFetch;
});

const tenant: Tenant = {
  id: "tenant-a", name: "Example tenant", public_slug: "example", email_domain: null,
  owner_workos_user_id: null, created_at: "2026-10-01T00:00:00Z", job_priority: 0,
};

async function mount(row: Tenant, patch: (body: unknown) => Promise<Response>) {
  let monitoringRequests = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://localhost:5173").pathname;
    if (init?.method === "PATCH") {
      expect(path).toBe("/api/admin/tenants/tenant-a/job-priority");
      return patch(JSON.parse(String(init.body)));
    }
    if (path === "/api/admin/tenants") return Response.json({ tenants: [row] });
    if (path === "/api/admin/tenants/monitoring") {
      monitoringRequests++;
      return Response.json({ summaries: [{ tenant_id: row.id, task_count: 0, pending_task_count: 0, last_monitored_at: null }] });
    }
    if (path === "/api/auth/me") return Response.json({ user: null });
    throw new Error(`Unexpected request ${path}`);
  }) as typeof fetch;
  const container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root?.render(<MemoryRouter><AuthProvider><AdminTenants /></AuthProvider></MemoryRouter>));
  return { container, monitoringRequests: () => monitoringRequests };
}

test("priority saves use the server response and failed changes retain the saved value", async () => {
  const bodies: unknown[] = [];
  let finishSave!: (response: Response) => void;
  const { container, monitoringRequests } = await mount(tenant, (body) => {
    bodies.push(body);
    return new Promise((resolve) => { finishSave = resolve; });
  });
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Job priority for Example tenant"]')!;
  expect(select.value).toBe("0");
  expect(select.disabled).toBe(false);
  expect(Array.from(select.options).map((option) => option.text)).toEqual(["Normal", "High", "Urgent"]);
  await act(async () => {
    select.value = "1";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(select.disabled).toBe(true);
  expect(container.querySelector('[aria-label="Saving priority"]')).not.toBeNull();
  expect(bodies).toEqual([{ job_priority: 1 }]);
  await act(async () => finishSave(Response.json({ tenant: { ...tenant, job_priority: 1 } })));
  expect(select.value).toBe("1");
  expect(select.disabled).toBe(false);
  expect(container.querySelector('[role="status"]')?.textContent).toContain("job priority set to High");
  expect(monitoringRequests()).toBe(1);

  await act(async () => {
    select.value = "2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => finishSave(Response.json({ error: "Priority could not be saved" }, { status: 503 })));
  expect(select.value).toBe("1");
  expect(select.disabled).toBe(false);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("Priority could not be saved");
  expect(bodies).toEqual([{ job_priority: 1 }, { job_priority: 2 }]);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Refresh tenants"]')?.click());
  expect(monitoringRequests()).toBe(2);
});

test("an older API cannot make an unknown priority look like Normal", async () => {
  const { container } = await mount({ ...tenant, job_priority: undefined }, async () => {
    throw new Error("Unavailable priorities must not be editable");
  });
  const select = container.querySelector("select")!;
  expect(select.disabled).toBe(true);
  expect(select.value).toBe("unavailable");
  expect(container.textContent).toContain("Priority settings will be available after the server update.");
});
