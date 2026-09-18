import { allowIpFindingProductImage, dismissIpFinding, markIpFindingEnforced, markIpFindingNeedsReview } from "../../api/findingActions";
import { approveTakedownBatch, markTakedownsSubmitted, type TakedownFeedbackAssociationScope } from "../../api/takedowns";
import type { IpReviewFinding } from "../../api/reviews";
import { preferredAllowedProductImage } from "../../components/monitoring/board/allowedProduct";
import { dismissalOptionsForBatchAction, runPool, summarizeBatch, summarizeTakedownBatch, type BatchAction, type BatchResult } from "../../components/monitoring/board/batchUtils";

export function partitionSellerListings(findings: IpReviewFinding[], action: BatchAction, ipId: string | null) {
  const eligible: IpReviewFinding[] = [];
  const skipped: Record<string, number> = {};
  for (const finding of findings) {
    const state = finding.dismissed_at ? "dismissed" : finding.review_status ?? "pending";
    let reason: string | null = null;
    if (state === "dismissed" || state === "enforced") reason = "already closed";
    else if (action === "send" && state !== "pending" && state !== "review") reason = "already sent or awaiting legal action";
    else if (action === "submit" && state !== "takedown_pending") reason = "not awaiting legal action";
    else if (action === "enforce" && state !== "takedown_sent") reason = "not awaiting enforcement";
    else if (action === "review" && state !== "pending") reason = "not in triage";
    else if (["send", "submit", "enforce", "review"].includes(action) && !finding.case_id) reason = "still preparing";
    else if (action !== "send" && action !== "submit" && !(finding.ip_id ?? ipId)) reason = "no associated IP";
    else if (action === "allow_product" && !preferredAllowedProductImage(finding)) reason = "no eligible product image";
    else if (action === "packaging_only" && finding.offer_subject !== "packaging_only") reason = "not packaging-only";
    if (reason) skipped[reason] = (skipped[reason] ?? 0) + 1;
    else eligible.push(finding);
  }
  return { eligible, skipped };
}

/** Returns only acknowledged successes; callers keep failed/skipped rows selected. */
export async function runSellerListingBatch({ action, findings, ipId, decisionReason, associationScopes, isActive, onProgress }: {
  action: BatchAction;
  findings: IpReviewFinding[];
  ipId: string | null;
  decisionReason?: string;
  associationScopes?: TakedownFeedbackAssociationScope[];
  isActive: () => boolean;
  onProgress: (progress: { done: number; total: number }) => void;
}): Promise<{ processed: Set<string>; result: BatchResult }> {
  const { eligible, skipped } = partitionSellerListings(findings, action, ipId);
  const processed = new Set<string>();
  let failed = 0;
  let done = 0;
  if (!isActive() || eligible.length === 0) return { processed, result: summarizeBatch(action, 0, skipped, 0) };
  onProgress({ done, total: eligible.length });
  if (action === "send" || action === "submit") {
    const caseIds = [...new Set(eligible.map((finding) => finding.case_id!))];
    if (action === "send") {
      const response = await approveTakedownBatch(caseIds, decisionReason ?? "", associationScopes ?? []);
      const legal = response.legal_queue ?? [];
      const handled = new Set([...response.queued_case_ids, ...legal.map((item) => item.case_id)]);
      eligible.filter((finding) => handled.has(finding.case_id!)).forEach((finding) => processed.add(finding.result_id));
      const legalReasons: Record<string, number> = {};
      for (const item of legal) legalReasons[item.reason] = (legalReasons[item.reason] ?? 0) + 1;
      for (const item of response.skipped) skipped[item.reason] = (skipped[item.reason] ?? 0) + 1;
      return { processed, result: summarizeTakedownBatch(response.queued_case_ids.length, response.email_count, legalReasons, skipped, response.failed.length) };
    }
    const response = await markTakedownsSubmitted(caseIds);
    const handled = new Set(response.submitted_case_ids);
    eligible.filter((finding) => handled.has(finding.case_id!)).forEach((finding) => processed.add(finding.result_id));
    for (const item of response.skipped) skipped[item.reason] = (skipped[item.reason] ?? 0) + 1;
  } else {
    await runPool(eligible, async (finding) => {
      // A closed seller or changed tenant must not start any further writes.
      if (!isActive()) return;
      try {
        const findingIpId = (finding.ip_id ?? ipId)!;
        if (action === "review") await markIpFindingNeedsReview(findingIpId, finding.result_id);
        else if (action === "enforce") await markIpFindingEnforced(findingIpId, finding.result_id);
        else if (action === "allow_product") await allowIpFindingProductImage(findingIpId, finding.result_id, { image_url: preferredAllowedProductImage(finding) });
        else await dismissIpFinding(findingIpId, finding.result_id, dismissalOptionsForBatchAction(action));
        processed.add(finding.result_id);
      } catch {
        failed += 1;
      } finally {
        done += 1;
        if (isActive()) onProgress({ done, total: eligible.length });
      }
    }, 4);
  }
  return { processed, result: summarizeBatch(action, processed.size, skipped, failed) };
}
