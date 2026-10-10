import {request} from './transport';
import {isRecord, requireResponse} from './validation';
import type {MonitoringSourceHealth} from './monitoringSettings';

export interface CoverageRecoverySource extends MonitoringSourceHealth {
  ip_id: string; ip_name: string; tenant_name: string; domain: string;
  expected_keywords: number; checked_keywords: number;
  recovery_state: 'active' | 'scheduled' | 'blocked' | 'needed' | 'idle';
  next_retry_at: string | null;
  issues: Array<{run_id: string | null; job_id: string; keyword: string; reason: string;
    job_status: string; repair_attempt: number; retry_at: string | null}>;
}
interface CoverageRecovery {as_of: string; sources: CoverageRecoverySource[]}
const text = (value: unknown) => typeof value === 'string';
const date = (value: unknown) => text(value) && Number.isFinite(Date.parse(value as string));
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function isRecovery(value: unknown): value is CoverageRecovery {
  return isRecord(value) && date(value.as_of) && Array.isArray(value.sources) && value.sources.every(source =>
    isRecord(source) && ['source_id','label','ip_id','ip_name','tenant_name','domain'].every(key => text(source[key]))
    && (source.country === null || text(source.country))
    && ['monitoring','updating','delayed','paused'].includes(String(source.state))
    && ['active','scheduled','blocked','needed','idle'].includes(String(source.recovery_state))
    && (source.last_checked_at === null || date(source.last_checked_at))
    && (source.next_retry_at === null || date(source.next_retry_at))
    && count(source.expected_keywords) && count(source.checked_keywords)
    && Array.isArray(source.issues) && source.issues.every(issue => isRecord(issue)
      && ['job_id','keyword','reason','job_status'].every(key => text(issue[key]))
      && (issue.run_id === null || text(issue.run_id))
      && count(issue.repair_attempt) && (issue.retry_at === null || date(issue.retry_at))));
}
export async function getCoverageRecovery(signal: AbortSignal) {
  const value = await request<unknown>('/api/admin/monitoring/coverage-recovery', {signal});
  requireResponse(isRecovery(value), 'Monitoring recovery');
  return value as CoverageRecovery;
}
export function retryCoverageRecovery(id: string, source = false, keyword?: string) {
  return request<{job_id: string; created: boolean}>(`/api/admin/monitoring/coverage-recovery/${source ? 'sources/' : ''}${encodeURIComponent(id)}/retry${source && keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`, {method: 'POST'});
}
