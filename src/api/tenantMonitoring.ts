import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

export interface TenantMonitoringSummary {
  tenant_id: string;
  /** Monitoring tasks across all IPs in the tenant. */
  task_count: number;
  /** Ready-to-triage tasks, excluding preparing and handled tasks. */
  pending_task_count: number;
  /** Latest successful run completion, never its enqueue timestamp. */
  last_monitored_at: string | null;
}

export function parseTenantMonitoringSummaries(value: unknown): TenantMonitoringSummary[] {
  requireResponse(isRecord(value) && Array.isArray(value.summaries), "tenant monitoring summary");
  const seen = new Set<string>();
  return value.summaries.map((row: unknown) => {
    requireResponse(isRecord(row)
      && typeof row.tenant_id === "string" && row.tenant_id.length > 0
      && typeof row.task_count === "number" && Number.isSafeInteger(row.task_count) && row.task_count >= 0
      && typeof row.pending_task_count === "number" && Number.isSafeInteger(row.pending_task_count)
      && row.pending_task_count >= 0 && row.pending_task_count <= row.task_count
      && (row.last_monitored_at === null || (typeof row.last_monitored_at === "string" && Number.isFinite(Date.parse(row.last_monitored_at))))
      && !seen.has(row.tenant_id), "tenant monitoring summary");
    seen.add(row.tenant_id);
    return {
      tenant_id: row.tenant_id,
      task_count: row.task_count as number,
      pending_task_count: row.pending_task_count as number,
      last_monitored_at: row.last_monitored_at as string | null,
    };
  });
}

export async function listTenantMonitoringSummaries(signal?: AbortSignal) {
  return parseTenantMonitoringSummaries(await request<unknown>("/api/admin/tenants/monitoring", { signal }));
}
