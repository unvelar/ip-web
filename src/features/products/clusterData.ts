import { listMonitoringFindingsGlobal } from "../../api/monitoring";
import type { IpReviewFinding } from "../../api/reviews";

export async function loadProductGroupBatch(ipId: string, groupId: string) {
  const findings: IpReviewFinding[] = [];
  const seenResultIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const page = await listMonitoringFindingsGlobal({
      status: "pending",
      ip_id: ipId,
      product_group_id: groupId,
      limit: 200,
      cursor,
    });
    for (const finding of page.findings) {
      if (seenResultIds.has(finding.result_id)) continue;
      seenResultIds.add(finding.result_id);
      findings.push(finding);
    }
    cursor = page.next_cursor;
    if (cursor && seenCursors.has(cursor)) break;
    if (cursor) seenCursors.add(cursor);
  } while (cursor);

  return findings;
}
