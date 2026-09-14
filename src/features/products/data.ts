import { listMonitoringFindingRowsGlobal, listMonitoringFindingsGlobal } from "../../api/monitoring";
import { getPersistedProductGroups } from "../../api/products";
import type { IpReviewFinding } from "../../api/reviews";
import type { ProductLabView, RecentDecisionCursors } from "./labDomain";
import { mergeRecentDecisions, PAGE_SIZE, RECENT_DECISION_STATUSES } from "./labDomain";

export async function loadProductGroupPage(
  ipId: string,
  view: Exclude<ProductLabView, "history">,
  options: {
    cursor?: string | null;
    query?: string | null;
    allProducts?: boolean;
    signal?: AbortSignal;
  } = {},
) {
  const { allProducts = false, ...requestOptions } = options;
  return getPersistedProductGroups(
    ipId,
    "same",
    view === "attention" && !allProducts ? "triage" : "all",
    { limit: PAGE_SIZE, ...requestOptions },
  );
}

export async function loadCanonicalProductGroup(
  ipId: string,
  canonicalProductId: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const overview = await getPersistedProductGroups(
        ipId,
        "same",
        "all",
        {
          limit: 1,
          productId: canonicalProductId,
          catalogScope: "catalog",
        },
      );
      const group = overview.groups[0];
      if (group) return group;
    } catch (caught: unknown) {
      lastError = caught;
    }
    if (attempt < 2) {
      await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  if (lastError) throw lastError;
  throw new Error("The merged product is still being prepared. Refresh and try again.");
}

export async function loadProductGroupFindings(
  ipId: string,
  groupId: string,
  caseIds: string[] | null,
) {
  const findings: IpReviewFinding[] = [];
  const seenResultIds = new Set<string>();
  if (caseIds && caseIds.length === 0) return findings;

  const uniqueCaseIds = caseIds ? [...new Set(caseIds)] : null;
  const caseIdBatches = uniqueCaseIds
    ? Array.from(
        { length: Math.ceil(uniqueCaseIds.length / 100) },
        (_, index) => uniqueCaseIds.slice(index * 100, (index + 1) * 100),
      )
    : [null];

  for (const caseIdBatch of caseIdBatches) {
    const expectedCaseIds = caseIdBatch ? new Set(caseIdBatch) : null;
    const foundCaseIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    do {
      const page = await listMonitoringFindingRowsGlobal({
        status: "pending",
        ip_id: ipId,
        product_group_id: groupId,
        case_ids: caseIdBatch,
        limit: 200,
        cursor,
      });
      for (const finding of page.findings) {
        if (
          expectedCaseIds &&
          (finding.case_id == null || !expectedCaseIds.has(finding.case_id))
        ) continue;
        if (seenResultIds.has(finding.result_id)) continue;
        seenResultIds.add(finding.result_id);
        findings.push(finding);
        if (finding.case_id) foundCaseIds.add(finding.case_id);
      }
      if (
        expectedCaseIds &&
        [...expectedCaseIds].every((caseId) => foundCaseIds.has(caseId))
      ) break;
      cursor = page.next_cursor;
      if (cursor && seenCursors.has(cursor)) break;
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
  }

  return findings;
}

export async function loadRecentDecisionPages(
  ipId: string,
  cursors?: RecentDecisionCursors,
  signal?: AbortSignal,
) {
  const statuses = RECENT_DECISION_STATUSES.filter((status) =>
    cursors === undefined || Boolean(cursors[status])
  );
  const pages = await Promise.all(statuses.map((status) =>
    listMonitoringFindingsGlobal({
      ip_id: ipId,
      status,
      show_dismissed: status === "dismissed",
      sort: "updated_desc",
      limit: 50,
      cursor: cursors?.[status] ?? null,
      signal,
    })
  ));
  const nextCursors = Object.fromEntries(
    RECENT_DECISION_STATUSES.map((status) => [status, null]),
  ) as RecentDecisionCursors;
  if (cursors) Object.assign(nextCursors, cursors);
  statuses.forEach((status, index) => {
    nextCursors[status] = pages[index].next_cursor;
  });
  return {
    findings: mergeRecentDecisions([], pages.flatMap((page) => page.findings)),
    cursors: nextCursors,
  };
}
