import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

export interface SourceAttemptHistory {
  source: { id: string; label: string; domain: string; enabled: boolean };
  as_of: string;
  attempts: SourceSetupAttempt[];
}
export interface SourceSetupAttempt {
  id: string; number: number; state: string; keyword: string;
  created_at: string; completed_at: string | null; reason: string | null; error: string | null;
  failure_streak: number; retries_stopped: boolean; next_retry_at: string | null;
  steps: Array<{ phase: "capture" | "infer" | "validate"; status: string; error: string | null;
    started_at: string | null; completed_at: string | null;
    attempts: Array<{ id: string; number: number; status: string; error: string | null;
      started_at: string; completed_at: string | null }> }>;
  captures: Array<{ id: string; at: string; label: string | null; url: string | null;
    state: string; image_url: string | null; attempt_id: string | null; failure: boolean }>;
  events: Array<{ at: string; phase: string; kind: string; label: string | null; url: string | null;
    attempt_id: string | null; diagnostics: {
      http_status: number | null; title: string | null; final_url: string | null;
      readiness?: { reason: string | null; panel: { label: string | null; text: string | null;
        sensitive_fields: boolean; controls: Array<{ id: string; kind: string; label: string | null }> } | null;
        judgments: Array<{ question: string; choice: string; probability: number; probabilities: Record<string, number> }> } | null;
    } | null }>;
}

const text = (value: unknown): value is string => typeof value === "string";
const nullableText = (value: unknown) => value === null || text(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const webUrl = (value: unknown) => {
  if (value === null) return true;
  if (!text(value)) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};
function validAttempt(value: unknown): value is SourceSetupAttempt {
  if (!isRecord(value) || !text(value.id) || !number(value.number) || !text(value.keyword) || !text(value.state)
    || !text(value.created_at) || !nullableText(value.completed_at) || !nullableText(value.reason)
    || !nullableText(value.error) || !number(value.failure_streak) || typeof value.retries_stopped !== "boolean"
    || !nullableText(value.next_retry_at)) return false;
  if (!Array.isArray(value.steps) || value.steps.length > 3 || !value.steps.every(s => isRecord(s)
    && ["capture", "infer", "validate"].includes(String(s.phase)) && text(s.status) && nullableText(s.error)
    && nullableText(s.started_at) && nullableText(s.completed_at) && Array.isArray(s.attempts) && s.attempts.length <= 50
    && s.attempts.every(a => isRecord(a) && text(a.id) && number(a.number) && text(a.status)
      && nullableText(a.error) && text(a.started_at) && nullableText(a.completed_at)))) return false;
  if (!Array.isArray(value.captures) || value.captures.length > 7 || !value.captures.every(c => isRecord(c)
    && text(c.id) && text(c.at) && nullableText(c.label) && webUrl(c.url) && webUrl(c.image_url)
    && text(c.state) && nullableText(c.attempt_id) && typeof c.failure === "boolean")) return false;
  return Array.isArray(value.events) && value.events.length <= 20 && value.events.every(e => {
    if (!isRecord(e) || !text(e.at) || !text(e.phase) || !text(e.kind) || !nullableText(e.label)
      || !webUrl(e.url) || !nullableText(e.attempt_id)) return false;
    if (e.diagnostics === null) return true;
    const d = e.diagnostics;
    if (!isRecord(d) || !(d.http_status === null || number(d.http_status)) || !nullableText(d.title) || !webUrl(d.final_url)) return false;
    const r = d.readiness;
    if (r == null) return true;
    if (!isRecord(r) || !nullableText(r.reason) || !Array.isArray(r.judgments) || r.judgments.length > 7
      || !r.judgments.every(j => isRecord(j) && text(j.question) && text(j.choice) && number(j.probability)
        && j.probability >= 0 && j.probability <= 1 && isRecord(j.probabilities)
        && Object.values(j.probabilities).every(p => number(p) && p >= 0 && p <= 1))) return false;
    return r.panel === null || isRecord(r.panel) && nullableText(r.panel.label) && nullableText(r.panel.text)
      && typeof r.panel.sensitive_fields === "boolean" && Array.isArray(r.panel.controls) && r.panel.controls.length <= 48
      && r.panel.controls.every(c => isRecord(c) && text(c.id) && text(c.kind) && nullableText(c.label));
  });
}

export async function getMonitoringSourceAttempts(ipId: string, sourceId: string, signal?: AbortSignal): Promise<SourceAttemptHistory> {
  const value = await request<unknown>(`/api/ip/${encodeURIComponent(ipId)}/monitoring/sources/${encodeURIComponent(sourceId)}/attempts`, { signal });
  requireResponse(isRecord(value) && isRecord(value.source) && value.source.id === sourceId
    && typeof value.source.label === "string" && typeof value.source.domain === "string"
    && typeof value.source.enabled === "boolean" && text(value.as_of)
    && Array.isArray(value.attempts) && value.attempts.length <= 10 && value.attempts.every(validAttempt), "monitoring attempt history");
  return value as unknown as SourceAttemptHistory;
}
