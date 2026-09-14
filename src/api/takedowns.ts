import { request } from "./transport";

// --- Takedown email ---
// Sends the takedown to the platform's intake address (e.g. Etsy's legal@) and
// tracks the reply thread. Replaces the old PDF-download + mark-sent flow.

export type TakedownRequestStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "replied"
  | "closed";

export interface TakedownRequiredField {
  key: string;
  label: string;
}

/** A user-selectable intake route (only `ip_owner` routes are returned). */
export interface TakedownRouteOption {
  id: string;
  label: string;
  to_email: string;
  is_default: boolean;
  required_fields: TakedownRequiredField[];
}

export interface TakedownDraft {
  subject: string;
  body: string;
  /** Required-field labels the signer profile still has to fill in. */
  missing_fields: string[];
}

/** Per-IP signer details that populate every notice for that IP. */
export interface TakedownProfile {
  legal_name: string | null;
  organization: string | null;
  address: string | null;
  phone: string | null;
  contact_email: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
}

export interface TakedownDraftResponse {
  /** False when Postmark env isn't set — the UI disables sending. */
  configured: boolean;
  routes: TakedownRouteOption[];
  suggested_target_id: string | null;
  profile: TakedownProfile | null;
  draft: TakedownDraft | null;
}

export interface TakedownRequest {
  id: string;
  case_id: string;
  target_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: TakedownRequestStatus;
  provider_message_id: string | null;
  error: string | null;
  reply_to: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface TakedownMessage {
  id: string;
  request_id: string;
  case_id: string;
  direction: "outbound" | "inbound";
  from_email: string | null;
  to_email: string | null;
  subject: string | null;
  body: string;
  created_at: string;
}

export interface TakedownThread {
  request: TakedownRequest;
  messages: TakedownMessage[];
}

export function getTakedownThread(caseId: string) {
  return request<{ takedown: TakedownThread | null }>(
    `/api/cases/${caseId}/takedown`,
  );
}

export function getTakedownDraft(caseId: string) {
  return request<TakedownDraftResponse>(`/api/cases/${caseId}/takedown/draft`);
}

export type TakedownFeedbackAssociationScope =
  | "visual_similarity"
  | "product_category";

export const DEFAULT_TAKEDOWN_FEEDBACK_SCOPES: TakedownFeedbackAssociationScope[] = [
  "visual_similarity",
];

export function sendTakedown(
  caseId: string,
  payload: {
    target_id: string;
    subject: string;
    body: string;
    decision_reason: string;
    association_scopes: TakedownFeedbackAssociationScope[];
  },
) {
  return request<{ request: TakedownRequest }>(
    `/api/cases/${caseId}/takedown/send`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export interface BatchTakedownCaseResult {
  case_id: string;
  reason: string;
}

export type TakedownLegalQueueReason =
  | "legacy_unfulfilled_decision"
  | "manual_submission_required"
  | "missing_required_information"
  | "email_not_configured"
  | "missing_listing_url"
  | "automatic_queue_failed"
  | "automatic_delivery_failed";

export interface TakedownLegalQueueResult {
  case_id: string;
  reason: TakedownLegalQueueReason;
}

export interface BatchTakedownSendResponse {
  queued_case_ids: string[];
  email_count: number;
  requests: TakedownRequest[];
  legal_queue?: TakedownLegalQueueResult[];
  skipped: BatchTakedownCaseResult[];
  failed: BatchTakedownCaseResult[];
}

export interface BatchTakedownPreflightResponse {
  automatic_case_ids: string[];
  legal_queue: TakedownLegalQueueResult[];
  skipped: BatchTakedownCaseResult[];
  route_groups: Array<{ label: string; domain: string; case_count: number }>;
}

export function preflightTakedownBatch(caseIds: string[]) {
  return request<BatchTakedownPreflightResponse>("/api/takedowns/batch/preflight", {
    method: "POST",
    body: JSON.stringify({ case_ids: Array.from(new Set(caseIds)) }),
  });
}

/** Resolve and queue a selection as one API request. Compatible cases (same
 *  IP and intake route) share one notice containing all listing links. */
export function approveTakedownBatch(
  caseIds: string[],
  decisionReason: string,
  associationScopes: TakedownFeedbackAssociationScope[] = [],
) {
  return request<BatchTakedownSendResponse>("/api/takedowns/batch/send", {
    method: "POST",
    body: JSON.stringify({
      case_ids: Array.from(new Set(caseIds)),
      decision_reason: decisionReason.trim(),
      association_scopes: associationScopes,
    }),
  });
}

/** Backward-compatible name for older callers while the UI moves from a
 * send-only action to approval + automatic/manual routing. */
export const autoSendTakedownBatch = approveTakedownBatch;

export async function approveTakedown(
  caseId: string,
  decisionReason: string,
  associationScopes: TakedownFeedbackAssociationScope[] = [],
) {
  const result = await approveTakedownBatch([caseId], decisionReason, associationScopes);
  if (result.queued_case_ids.includes(caseId)) {
    return {
      status: "automatic" as const,
      request: result.requests.find((request) => request.case_id === caseId) ?? result.requests[0] ?? null,
    };
  }
  const legalQueueItem = (result.legal_queue ?? []).find((item) => item.case_id === caseId);
  if (legalQueueItem) {
    return { status: "legal_queue" as const, reason: legalQueueItem.reason };
  }
  const failure = [...result.failed, ...result.skipped].find((item) => item.case_id === caseId);
  throw new Error(failure?.reason ?? "The takedown could not be processed.");
}

export function markTakedownsSubmitted(caseIds: string[]) {
  return request<{
    submitted_case_ids: string[];
    skipped: BatchTakedownCaseResult[];
  }>("/api/takedowns/batch/mark-submitted", {
    method: "POST",
    body: JSON.stringify({ case_ids: Array.from(new Set(caseIds)) }),
  });
}

export function markTakedownSentWithoutEmail(
  caseId: string,
  decisionReason: string,
  associationScopes: TakedownFeedbackAssociationScope[] = [],
) {
  return request<{ ok: boolean; emailed: false }>(
    `/api/cases/${caseId}/takedown/mark-sent`,
    {
      method: "POST",
      body: JSON.stringify({
        decision_reason: decisionReason.trim(),
        association_scopes: associationScopes,
      }),
    },
  );
}

/** Send the suggested-route takedown draft for a case without opening the
 *  editor — the single-listing quick path. Returns a discriminated status so
 *  callers can fall back to manual compose (no route/draft) or surface
 *  "email not configured". */
export async function autoSendTakedown(
  caseId: string,
  decisionReason: string,
  associationScopes: TakedownFeedbackAssociationScope[] = [],
): Promise<
  | { status: "sent"; request: TakedownRequest }
  | { status: "needs_compose" }
  | { status: "unconfigured" }
> {
  const d = await getTakedownDraft(caseId);
  if (!d.configured) return { status: "unconfigured" };
  const target_id = d.suggested_target_id ?? d.routes[0]?.id ?? "";
  if (!target_id || !d.draft) return { status: "needs_compose" };
  const { request } = await sendTakedown(caseId, {
    target_id,
    subject: d.draft.subject,
    body: d.draft.body,
    decision_reason: decisionReason.trim(),
    association_scopes: associationScopes,
  });
  return { status: "sent", request };
}

export function replyTakedown(caseId: string, body: string) {
  return request<{ message: TakedownMessage }>(
    `/api/cases/${caseId}/takedown/reply`,
    { method: "POST", body: JSON.stringify({ body }) },
  );
}

export function getIpTakedownProfile(ipId: string) {
  return request<{ profile: TakedownProfile | null }>(
    `/api/ip/${ipId}/takedown/profile`,
  );
}

export function updateIpTakedownProfile(
  ipId: string,
  patch: Partial<TakedownProfile>,
) {
  return request<{ profile: TakedownProfile }>(
    `/api/ip/${ipId}/takedown/profile`,
    { method: "PUT", body: JSON.stringify(patch) },
  );
}
