import { CANDIDATE_OUTCOME_LABELS, type ResortTarget } from "./constants";
import type { MonitoringDismissOptions } from "../../../api";

export type BatchAction =
  | "send"
  | "submit"
  | "false_positive"
  | "do_not_pursue"
  | "allow_product"
  | "second_hand"
  | "packaging_only"
  | "review"
  | "enforce";

export const BATCH_META: Record<
  BatchAction,
  { label: string; verb: string; gerund: string }
> = {
  send: { label: "Takedown", verb: "Processed", gerund: "Process takedown for" },
  submit: { label: "Mark submitted", verb: "Marked submitted", gerund: "Mark submitted" },
  false_positive: { label: "Different product", verb: "Cleared", gerund: "Mark as a different product for" },
  do_not_pursue: { label: "Do not pursue", verb: "Not pursued", gerund: "Do not pursue" },
  allow_product: { label: "Allow product", verb: "Allowed product", gerund: "Allow product images for" },
  second_hand: { label: "Second hand", verb: "Marked second hand", gerund: "Mark second hand for" },
  packaging_only: { label: "Packaging only", verb: "Marked packaging only", gerund: "Mark packaging only for" },
  review: { label: "Review", verb: "Moved to Review", gerund: "Move to Review" },
  enforce: { label: "Mark enforced", verb: "Marked enforced", gerund: "Mark enforced" },
};

export function dismissalOptionsForBatchAction(
  action: Extract<BatchAction, "false_positive" | "do_not_pursue" | "second_hand" | "packaging_only">,
): MonitoringDismissOptions {
  if (action === "false_positive") {
    return { reason: "false_positive", reason_code: "different_product" };
  }
  if (action === "second_hand") {
    return { reason: "second_hand", reason_code: "genuine_second_hand" };
  }
  if (action === "packaging_only") {
    return { reason: "second_hand", reason_code: "original_packaging_only" };
  }
  return { reason: "do_not_pursue" };
}

/** Run `worker` over `items` with at most `concurrency` in flight. */
export async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
) {
  let cursor = 0;
  const pull = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, pull),
  );
}

/** "Sent 9 · skipped 3: 2 missing signer, 1 already sent · 1 failed" */
export function summarizeBatch(
  action: BatchAction,
  ok: number,
  skipped: Record<string, number>,
  failed: number,
): string {
  const parts = [`${BATCH_META[action].verb} ${ok}`];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (skipTotal > 0) {
    const detail = Object.entries(skipped)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(", ");
    parts.push(`skipped ${skipTotal}: ${detail}`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}

export interface TakedownBatchSummary {
  kind: "takedown_batch";
  tone: "success" | "warning";
  title: string;
  details: string[];
  needsProfile: boolean;
  showLegalQueueLink: boolean;
}

export type BatchResult = string | TakedownBatchSummary;

function listingCount(count: number) {
  return `${count} listing${count === 1 ? "" : "s"}`;
}

export function summarizeTakedownBatch(
  queued: number,
  emailCount: number,
  legalQueue: Record<string, number>,
  skipped: Record<string, number>,
  failed: number,
): TakedownBatchSummary {
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  const legalQueueTotal = Object.values(legalQueue).reduce((a, b) => a + b, 0);
  const handled = queued + legalQueueTotal;
  const unhandled = skipTotal + failed;
  const recoveredLegacy = legalQueue.legacy_unfulfilled_decision ?? 0;
  const missingProfile = legalQueue.missing_required_information ?? 0;
  const manualSubmission = legalQueue.manual_submission_required ?? 0;
  const missingEmail = legalQueue.email_not_configured ?? 0;
  const missingUrl = legalQueue.missing_listing_url ?? 0;
  const automaticQueueFailed = legalQueue.automatic_queue_failed ?? 0;
  const automaticDeliveryFailed = legalQueue.automatic_delivery_failed ?? 0;
  const legacyManualCompose = skipped["needs manual compose"] ?? 0;
  const alreadyHandled = skipped["already sent or closed"] ?? 0;
  const stillPreparing = skipped["still preparing"] ?? 0;
  const describedReasons = new Set([
    "needs manual compose",
    "already sent or closed",
    "still preparing",
  ]);
  const details: string[] = [];

  if (queued > 0 && emailCount > 0) {
    details.push(
      `${emailCount} consolidated email${emailCount === 1 ? " is" : "s are"} queued for background delivery.`,
    );
  }
  if (legalQueueTotal > 0) {
    details.push(
      `${listingCount(legalQueueTotal)} ${legalQueueTotal === 1 ? "was" : "were"} added to the legal queue for manual review and submission.`,
    );
  }
  if (recoveredLegacy > 0) {
    details.push(
      `${listingCount(recoveredLegacy)} came from an earlier approved takedown that had no completed delivery route.`,
    );
  }
  if (missingProfile > 0) {
    details.push(
      `${listingCount(missingProfile)} ${missingProfile === 1 ? "is" : "are"} missing required notice information.`,
    );
  }
  if (manualSubmission > 0) {
    details.push(
      `${listingCount(manualSubmission)} ${manualSubmission === 1 ? "requires" : "require"} a marketplace form or another manual submission route.`,
    );
  }
  if (missingEmail > 0) {
    details.push(
      `${listingCount(missingEmail)} could not be sent automatically because email delivery is not configured.`,
    );
  }
  if (missingUrl > 0) {
    details.push(
      `${listingCount(missingUrl)} ${missingUrl === 1 ? "has" : "have"} no usable listing URL and needs legal follow-up.`,
    );
  }
  if (automaticQueueFailed > 0) {
    details.push(
      `${listingCount(automaticQueueFailed)} could not enter automatic delivery and was preserved in the legal queue.`,
    );
  }
  if (automaticDeliveryFailed > 0) {
    details.push(
      `${listingCount(automaticDeliveryFailed)} failed during automatic delivery and was preserved in the legal queue.`,
    );
  }
  for (const [reason, count] of Object.entries(legalQueue)) {
    if (
      count <= 0 ||
      [
        "legacy_unfulfilled_decision",
        "missing_required_information",
        "manual_submission_required",
        "email_not_configured",
        "missing_listing_url",
        "automatic_queue_failed",
        "automatic_delivery_failed",
      ].includes(reason)
    ) continue;
    details.push(`${listingCount(count)} entered the legal queue: ${reason}.`);
  }
  if (alreadyHandled > 0) {
    details.push(
      `${listingCount(alreadyHandled)} ${alreadyHandled === 1 ? "was already sent or is" : "were already sent or are"} no longer open.`,
    );
  }
  if (stillPreparing > 0) {
    details.push(
      `${listingCount(stillPreparing)} ${stillPreparing === 1 ? "is" : "are"} still being prepared. Try again when processing finishes.`,
    );
  }
  if (legacyManualCompose > 0) {
    details.push(
      `${listingCount(legacyManualCompose)} requires a manual marketplace route and kept its current status.`,
    );
  }
  for (const [reason, count] of Object.entries(skipped)) {
    if (count <= 0 || describedReasons.has(reason)) continue;
    details.push(`${listingCount(count)} skipped: ${reason}.`);
  }
  if (failed > 0) {
    details.push(
      `${listingCount(failed)} could not be queued because the request failed.`,
    );
  }
  if (unhandled > 0) {
    details.push(
      handled === 0
        ? `${listingCount(unhandled)} kept ${unhandled === 1 ? "its" : "their"} current status because the takedown could not be processed.`
        : `${listingCount(unhandled)} ${unhandled === 1 ? "was" : "were"} not processed and kept ${unhandled === 1 ? "its" : "their"} current status.`,
    );
  }

  return {
    kind: "takedown_batch",
    tone: unhandled > 0 ? "warning" : "success",
    title: handled === 0
      ? "No takedowns were processed"
      : queued > 0 && legalQueueTotal > 0
        ? `Processed takedown for ${listingCount(handled)}`
        : legalQueueTotal > 0
          ? `Added ${listingCount(legalQueueTotal)} to the legal queue`
          : `Queued takedown for ${listingCount(queued)}`,
    details,
    needsProfile: missingProfile > 0,
    // The legacy manual-compose response is kept for compatibility with an API
    // during a staggered rollout. Those decisions are recovered into the legal
    // queue by the current backend migration, so the same navigation remains
    // useful for both response shapes.
    showLegalQueueLink: legalQueueTotal > 0 || legacyManualCompose > 0,
  };
}

export function summarizeResort(
  target: ResortTarget,
  ok: number,
  skipped: Record<string, number>,
  failed: number,
): string {
  const label = CANDIDATE_OUTCOME_LABELS[target];
  const parts = [`Moved ${ok} to ${label}`];
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  if (skipTotal > 0) {
    const detail = Object.entries(skipped)
      .map(([reason, n]) => `${n} ${reason}`)
      .join(", ");
    parts.push(`skipped ${skipTotal}: ${detail}`);
  }
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.join(" · ");
}
