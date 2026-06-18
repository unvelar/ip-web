import { CANDIDATE_OUTCOME_LABELS, type ResortTarget } from "./constants";

export type BatchAction =
  | "send"
  | "false_positive"
  | "do_not_pursue"
  | "second_hand"
  | "enforce";

export const BATCH_META: Record<
  BatchAction,
  { label: string; verb: string; gerund: string }
> = {
  send: { label: "Send takedowns", verb: "Sent", gerund: "Send takedowns for" },
  false_positive: { label: "False positive", verb: "Cleared", gerund: "Mark false positive for" },
  do_not_pursue: { label: "Don't pursue", verb: "Cleared", gerund: "Don't pursue" },
  second_hand: { label: "Resale / second hand", verb: "Marked resale", gerund: "Mark resale / second hand for" },
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
