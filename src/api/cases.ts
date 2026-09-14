import type { TenantMember } from "./auth";
import { request } from "./transport";

// --- Rule graphs ---

export type PrimitiveName =
  | "identity_match"
  | "style_fidelity"
  | "palette"
  | "ocr_contains"
  | "manual_check"
  | "canonical_proximity"
  | "vlm_check"
  | "vlm_infringement_check";

export type RuleSeverity = "fail" | "fail_hard" | "note";

export interface Rule {
  id?: string;
  name: string;
  description?: string;
  primitive: PrimitiveName;
  config: Record<string, unknown>;
  on_fail: RuleSeverity;
}

// --- Submissions (licensee pre-flight checks) ---

export type Verdict = "pass" | "pass_w_note" | "fail" | "fail_hard";

/**
 * One reference image surfaced by canonical_proximity's evidence so the report
 * card can show "closest references" thumbnails. The API decorates each entry
 * with a presigned `image_url` before returning the submission payload.
 */
export interface CanonicalRefMatch {
  similarity: number;
  image_id: string | null;
  storage_path: string | null;
  image_url?: string;
}

export interface RuleResult {
  rule_id: string;
  rule_name: string;
  primitive: PrimitiveName;
  state: "pass" | "fail" | "uncertain";
  observed: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  on_fail: RuleSeverity;
}

export interface PrimitiveResultsBlob {
  rule_results: RuleResult[];
  verdict: Verdict;
}

// --- Cases (persistent scan-pipeline output) ---

export type CaseReviewStatus =
  | "pending"
  | "review"
  | "takedown_pending"
  | "takedown_sent"
  | "enforced"
  | "dismissed";

export type SaleType =
  | "fixed_price"
  | "auction"
  | "flash_sale"
  | "limited_stock"
  | "unknown";

export type SaleUrgencyBand =
  | "critical"
  | "urgent"
  | "soon"
  | "time_bound"
  | "limited_stock"
  | "expired"
  | "none";

export interface CaseComment {
  id: string;
  case_id: string;
  body: string;
  mentions: string[];
  mentioned_accounts: TenantMember[];
  created_at: string;
  author: {
    id: string;
    display_name: string | null;
    picture_url: string | null;
  };
}

export type LicenseStatus = "likely_licensed" | "likely_unlicensed" | "unclear";
export type InfringementType =
  | "full_copy"
  | "derivative"
  | "different_class"
  | "unclear";
export type CreatorType = "individual" | "company" | "unknown";

export interface CaseEnrichment {
  case_id: string;
  seller_name: string | null;
  seller_profile_url: string | null;
  listing_title: string | null;
  price: string | null;
  location: string | null;
  description_summary: string | null;
  platform: string | null;
  notes: string | null;
  match_explanation: string | null;
  license_status: LicenseStatus | string | null;
  license_confidence: number | null;
  license_reasoning: string | null;
  infringement_type: InfringementType | string | null;
  infringement_reasoning: string | null;
  creator_type: CreatorType | string | null;
  error: string | null;
  enriched_at: string;
}

// --- Case comments ---

export function listCaseComments(caseId: string) {
  return request<{ comments: CaseComment[] }>(`/api/cases/${caseId}/comments`);
}

export function postCaseComment(caseId: string, body: string, mentions: string[] = []) {
  return request<{ comment: CaseComment }>(`/api/cases/${caseId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, mentions }),
  });
}

export function getCaseSubscription(caseId: string) {
  return request<{ subscribed: boolean }>(`/api/cases/${caseId}/subscription`);
}

export function updateCaseSubscription(caseId: string, subscribed: boolean) {
  return request<{ subscribed: boolean }>(`/api/cases/${caseId}/subscription`, {
    method: "PATCH",
    body: JSON.stringify({ subscribed }),
  });
}

export type AccountNotificationType =
  | "task_assigned"
  | "comment_mention"
  | "task_comment"
  | "seller_returned";

export interface SellerReturnedNotificationPayload {
  seller_key?: string;
  seller_name?: string;
  domain?: string;
  current_result_id?: string;
  current_ip_id?: string;
  current_ip_name?: string | null;
  prior_case_id?: string;
  prior_ip_id?: string;
  prior_ip_name?: string | null;
  prior_takedown_at?: string;
  new_listing_count?: number;
}

export interface AccountNotification {
  id: string;
  type: AccountNotificationType;
  case_id: string;
  comment_id: string | null;
  payload: {
    comment_preview?: string;
    result_id?: string;
  } & SellerReturnedNotificationPayload;
  read_at: string | null;
  created_at: string;
  actor: TenantMember | null;
  task: {
    result_id: string | null;
    title: string | null;
    source_url: string | null;
  };
}

export function listAccountNotifications(limit = 60) {
  return request<{ notifications: AccountNotification[]; unread_count: number }>(
    `/api/notifications?limit=${encodeURIComponent(limit)}`,
  );
}

export function getAccountNotificationUnreadCount() {
  return request<{ count: number }>("/api/notifications/unread-count");
}

export function updateAccountNotificationRead(notificationId: string, read: boolean) {
  return request<{ notification: { id: string; read_at: string | null } }>(
    `/api/notifications/${encodeURIComponent(notificationId)}`,
    { method: "PATCH", body: JSON.stringify({ read }) },
  );
}

export function markAllAccountNotificationsRead() {
  return request<{ updated: number }>("/api/notifications/read-all", { method: "POST" });
}

export function deleteCaseComment(caseId: string, commentId: string) {
  return request<{ ok: boolean }>(`/api/cases/${caseId}/comments/${commentId}`, {
    method: "DELETE",
  });
}
