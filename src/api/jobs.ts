import { request } from "./transport";
import { isRecord, requireResponse } from "./validation";

// --- Detection ---

export interface Detection {
  ip: string;
  score: number;
  semantic_score: number;
  structural_score: number;
  bbox: [number, number, number, number]; // x, y, w, h
  confidence: string;
  method?: "visual" | "text" | "template" | "sift";
  text_found?: string;
}

export interface Job {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  result: { detections?: Detection[] } | null;
  error: string | null;
}

export function parseJob(value: unknown, expectedId: string): Job {
  requireResponse(isRecord(value), "job response");
  requireResponse(value.id === expectedId && typeof value.type === "string" &&
    typeof value.status === "string" && value.status.length > 0 &&
    isRecord(value.payload) && (value.result === null || isRecord(value.result)) &&
    (value.error === null || typeof value.error === "string"), "job response");
  return value as unknown as Job;
}

export async function getJob(id: string, signal?: AbortSignal) {
  return parseJob(await request<unknown>(`/api/jobs/${encodeURIComponent(id)}`, { signal }), id);
}
