import { expect, test } from "bun:test";
import { jobActivity, parseLiveJob, preview, type LiveJob } from "../src/features/llmActivity/model";
import type { AdminMonitoringWorker } from "../src/api/admin";

const job: LiveJob = { id: "job-1", type: "monitor_score", status: "completed", payload: {}, result: { relevant: 8 }, error: null, attempts: 2, max_attempts: 3, worker_instance_id: "coordinator-looking-name", tenant_id: null, created_at: "2026-10-14T12:00:00Z", started_at: "2026-10-14T12:00:02Z", completed_at: "2026-10-14T12:00:42Z", hold_reason: null, execution_class: "vlm_multimodal" };
const worker = { id: job.worker_instance_id, provider: "static", effective_status: "busy", pool: "cpu" } as AdminMonitoringWorker;

test("only completed claims expose saved output; retries cannot reuse earlier output", () => {
  expect(jobActivity(job, [worker]).raw).toEqual({ relevant: 8 });
  const retried = jobActivity({ ...job, result: { model: "previous-model" }, status: "in_progress", completed_at: null, attempts: 3 }, [worker]);
  expect(retried.state).toBe("running"); expect(retried.raw).toBeNull();
  expect(retried.completedUnits).toBeNull(); expect(retried.model).toBeNull();
});
test("execution identity comes from the recorded worker; unavailable claims stay unknown", () => {
  expect(jobActivity(job, [worker]).provider).toBe("Static");
  expect(jobActivity(job, []).provider).toBe("Unrecorded");
  expect(jobActivity({ ...job, status: "in_progress" }, [{ ...worker, effective_status: "offline" }]).state).toBe("unknown");
});
test("preview redacts nested credentials and signed URLs, and bounds model vectors", () => {
  const result = preview({ authorization: "Bearer private", nested: { api_key: "secret", link: "https://user:pass@example.com/photo?signature=private" }, embedding: Array(1000).fill(0), items: Array(100).fill("x"), note: "token=private" });
  const text = JSON.stringify(result);
  expect(text).not.toContain("private"); expect(text).not.toContain("user:pass");
  expect(result.embedding).toBe("[large binary / vector omitted]"); expect((result.items as unknown[]).length).toBe(21);
});
test("job detail rejects a different job and invalid claim timestamps", () => {
  expect(() => parseLiveJob(job, "other-job")).toThrow();
  expect(() => parseLiveJob({ ...job, started_at: "invalid" }, job.id)).toThrow();
  expect(parseLiveJob(job, job.id)).toEqual(job);
});
