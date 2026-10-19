import { afterEach, expect, spyOn, test } from "bun:test";
import { createActivityReader } from "../src/features/llmActivity/api";
import * as adminApi from "../src/api/admin";

const restore: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const mock of restore.splice(0)) mock.mockRestore(); });

test("a worker releasing a completed job does not remove its output from session history", async () => {
  const now = new Date().toISOString(); let finished = false;
  restore.push(spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.includes("/compute/workers")) return Response.json({ workers: [{ id: "worker-1", pool: "primary", provider: "hivenet", status: finished ? "idle" : "busy", job_types: ["monitor_score"], current_job_id: finished ? null : "job-1", current_job_started_at: now, last_heartbeat_at: now, registered_at: now, execution_class: "vlm_multimodal", metadata: {} }] });
    if (url.includes("/jobs/job-1")) return Response.json({ id: "job-1", type: "monitor_score", status: finished ? "completed" : "in_progress", payload: { run_id: "run-1" }, result: finished ? { relevant: 4 } : null, error: null, attempts: 1, max_attempts: 3, worker_instance_id: "worker-1", tenant_id: null, created_at: now, started_at: now, completed_at: finished ? now : null, hold_reason: null, execution_class: "vlm_multimodal" });
    throw new Error(`Unexpected test URL: ${url}`);
  }));
  const reader = createActivityReader(), signal = new AbortController().signal;
  const active = await reader(signal);
  expect(active.jobs[0].state).toBe("running"); expect(active.jobs[0].raw).toBeNull();
  finished = true;
  const completed = await reader(signal);
  expect(completed.workers[0].current_job_id).toBeNull();
  expect(completed.jobs[0].state).toBe("succeeded"); expect(completed.jobs[0].raw).toEqual({ relevant: 4 });
  expect(completed.jobs[0].provider).toBe("Hivenet");
});

test("slow or failed monitoring history cannot prevent the live compute snapshot", async () => {
  restore.push(spyOn(adminApi, "getAdminMonitoringOverview").mockRejectedValue(new Error("database report deadline")));
  restore.push(spyOn(globalThis, "fetch").mockImplementation(async input => {
    if (!String(input).includes("/compute/workers")) throw new Error("Unexpected request");
    return Response.json({ workers: [] });
  }));
  const reader = createActivityReader(), signal = new AbortController().signal;
  await reader.loadHistory(signal);
  const snapshot = await reader(signal);
  expect(snapshot.workers).toEqual([]); expect(snapshot.jobs).toEqual([]);
  expect(snapshot.warning).toContain("current worker activity is still shown");
});

test("an unauthorized fleet response fails closed with no demo data", async () => {
  restore.push(spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "Admin role required" }, { status: 403 })));
  await expect(createActivityReader()(new AbortController().signal)).rejects.toThrow("Admin role required");
});
