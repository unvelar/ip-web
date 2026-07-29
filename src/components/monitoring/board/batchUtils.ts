import { CANDIDATE_OUTCOME_LABELS, type ResortTarget } from "./constants";

export type BatchAction =
  | "send"
  | "false_positive"
  | "do_not_pursue"
  | "second_hand"
  | "review"
  | "enforce";

export const BATCH_META: Record<
  BatchAction,
  { label: string; verb: string; gerund: string }
> = {
  send: { label: "Send takedowns", verb: "Sent", gerund: "Send takedowns for" },
  false_positive: { label: "False positive", verb: "Cleared", gerund: "Mark false positive for" },
  do_not_pursue: { label: "Don't pursue", verb: "Cleared", gerund: "Don't pursue" },
  second_hand: { label: "Second hand / allowed", verb: "Marked second hand", gerund: "Mark second hand / allowed for" },
  review: { label: "Review", verb: "Moved to Review", gerund: "Move to Review" },
  enforce: { label: "Mark enforced", verb: "Marked enforced", gerund: "Mark enforced" },
};

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
}

export type BatchResult = string | TakedownBatchSummary;

function listingCount(count: number) {
  return `${count} listing${count === 1 ? "" : "s"}`;
}

export function summarizeTakedownBatch(
  queued: number,
  emailCount: number,
  skipped: Record<string, number>,
  failed: number,
): TakedownBatchSummary {
  const skipTotal = Object.values(skipped).reduce((a, b) => a + b, 0);
  const unqueued = skipTotal + failed;
  const missingProfile =
    (skipped["missing required information"] ?? 0) +
    (skipped["missing signer information"] ?? 0);
  const manualCompose = skipped["needs manual compose"] ?? 0;
  const missingEmail = skipped["email not configured"] ?? 0;
  const missingUrl = skipped["missing listing URL"] ?? 0;
  const alreadyHandled = skipped["already sent or closed"] ?? 0;
  const stillPreparing = skipped["still preparing"] ?? 0;
  const describedReasons = new Set([
    "missing required information",
    "missing signer information",
    "needs manual compose",
    "email not configured",
    "missing listing URL",
    "already sent or closed",
    "still preparing",
  ]);
  const details: string[] = [];

  if (queued > 0 && emailCount > 0) {
    details.push(
      `${emailCount} consolidated email${emailCount === 1 ? " is" : "s are"} queued for background delivery.`,
    );
  }
  if (missingProfile > 0) {
    details.push(
      `${listingCount(missingProfile)} ${missingProfile === 1 ? "is" : "are"} missing required notice information. Complete the IP’s takedown profile, then retry.`,
    );
  }
  if (manualCompose > 0) {
    details.push(
      `${listingCount(manualCompose)} ${manualCompose === 1 ? "needs a manually composed takedown because its marketplace has" : "need manually composed takedowns because their marketplaces have"} no automatic email route.`,
    );
  }
  if (missingEmail > 0) {
    details.push(
      `${listingCount(missingEmail)} ${missingEmail === 1 ? "has" : "have"} no takedown email destination configured.`,
    );
  }
  if (missingUrl > 0) {
    details.push(
      `${listingCount(missingUrl)} ${missingUrl === 1 ? "has" : "have"} no usable listing URL.`,
    );
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
  for (const [reason, count] of Object.entries(skipped)) {
    if (count <= 0 || describedReasons.has(reason)) continue;
    details.push(`${listingCount(count)} skipped: ${reason}.`);
  }
  if (failed > 0) {
    details.push(
      `${listingCount(failed)} could not be queued because the request failed.`,
    );
  }
  if (unqueued > 0) {
    details.push(
      queued === 0
        ? unqueued === 1
          ? "The listing kept its current status because no takedown request was created, so it remains in this view."
          : `All ${listingCount(unqueued)} kept their current status because no takedown request was created, so they remain in this view.`
        : `${listingCount(unqueued)} ${unqueued === 1 ? "was" : "were"} not queued and kept ${unqueued === 1 ? "its" : "their"} current status so the issues can be fixed and retried.`,
    );
  }

  return {
    kind: "takedown_batch",
    tone: unqueued > 0 ? "warning" : "success",
    title: queued === 0
      ? "No takedown emails were queued"
      : `Queued takedowns for ${listingCount(queued)}`,
    details,
    needsProfile: missingProfile > 0,
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
