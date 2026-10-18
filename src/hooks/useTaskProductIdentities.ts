import { useEffect, useRef, useState } from "react";
import {
  listMonitoringFindingRowsGlobal,
  getMonitoringFindingForCase,
  isApiError,
} from "../api";
import { taskDetails, type TaskSummary } from "../api/taskQueue";

type ProductIdentity = TaskSummary["product_identity"];
type Projection = {
  key: string;
  identities: Record<string, ProductIdentity>;
  error?: string;
};

type TaskIdentityRef = Pick<TaskSummary, "result_id" | "case_id" | "ip_id">;

/** Read identities for this page's cases in the exact brand scope. Never scan the catalogue. */
export async function loadTaskProductIdentities(
  ipId: string,
  refs: TaskIdentityRef[],
  signal: AbortSignal,
) {
  // Queue summaries may omit the case/IP context; hydrate only those rows
  // through the existing, read-only details batch before resolving identities.
  const missingScope = refs.filter((row) => !row.case_id || !row.ip_id);
  const details = new Map<string, TaskIdentityRef>();
  for (let offset = 0; offset < missingScope.length; offset += 50) {
    signal.throwIfAborted();
    const batch = missingScope.slice(offset, offset + 50);
    const page = await taskDetails(
      batch.map((row) => row.result_id),
      signal,
    );
    signal.throwIfAborted();
    for (const finding of page.findings) {
      if (!batch.some((row) => row.result_id === finding.result_id))
        throw new Error(
          "The product details do not belong to the requested tasks.",
        );
      details.set(finding.result_id, finding);
    }
  }
  refs = refs.map((row) => {
    const detail = details.get(row.result_id);
    return detail
      ? {
          ...row,
          case_id: row.case_id ?? detail.case_id,
          ip_id: row.ip_id ?? detail.ip_id,
        }
      : row;
  });
  const caseIds = [
    ...new Set(refs.flatMap((row) => (row.case_id ? [row.case_id] : []))),
  ];
  const byCase = new Map<string, ProductIdentity>();
  const identityKey = (caseId: string, taskIpId: string) =>
    `${taskIpId}:${caseId}`;
  const expectedScopes = new Set(
    refs.flatMap((row) =>
      row.case_id && row.ip_id ? [identityKey(row.case_id, row.ip_id)] : [],
    ),
  );
  for (let offset = 0; offset < caseIds.length; offset += 100) {
    const batch = caseIds.slice(offset, offset + 100);
    let cursor: string | null = null;
    const cursors = new Set<string>();
    do {
      signal.throwIfAborted();
      const page = await listMonitoringFindingRowsGlobal({
        ip_id: ipId,
        case_ids: batch,
        include_product_identity: true,
        status: "all",
        show_dismissed: true,
        limit: 100,
        cursor,
        signal,
      });
      signal.throwIfAborted();
      for (const finding of page.findings) {
        if (
          !finding.ip_id ||
          !finding.case_id ||
          !batch.includes(finding.case_id) ||
          !expectedScopes.has(identityKey(finding.case_id, finding.ip_id))
        )
          throw new Error(
            "The product identity does not belong to this task and brand.",
          );
        const caseKey = identityKey(finding.case_id, finding.ip_id);
        if (
          byCase.has(caseKey) &&
          JSON.stringify(byCase.get(caseKey)) !==
            JSON.stringify(finding.product_identity)
        )
          throw new Error("This task returned conflicting product identities.");
        byCase.set(caseKey, finding.product_identity);
      }
      if (
        refs
          .filter((row) => row.case_id && batch.includes(row.case_id))
          .every(
            (row) =>
              row.case_id &&
              row.ip_id &&
              byCase.has(identityKey(row.case_id, row.ip_id)),
          )
      )
        break;
      cursor = page.next_cursor;
      if (cursor && cursors.has(cursor))
        throw new Error("The product lookup could not complete. Try again.");
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  // The ordinary feed can omit inactive or archived tasks still present in the
  // indexed queue. Resolve only those remaining cases through their read endpoint.
  const unresolved = refs.filter(
    (row) =>
      row.case_id &&
      row.ip_id &&
      !byCase.has(identityKey(row.case_id, row.ip_id)),
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, unresolved.length) }, async () => {
      while (next < unresolved.length) {
        signal.throwIfAborted();
        const row = unresolved[next++];
        try {
          const { finding } = await getMonitoringFindingForCase(row.case_id!, {
            includeProductIdentity: true,
            signal,
          });
          signal.throwIfAborted();
          if (finding.case_id !== row.case_id || finding.ip_id !== row.ip_id)
            throw new Error(
              "The product identity does not belong to this task and brand.",
            );
          byCase.set(
            identityKey(row.case_id!, row.ip_id!),
            finding.product_identity,
          );
        } catch (error) {
          if (!isApiError(error, 404)) throw error;
        }
      }
    }),
  );
  return Object.fromEntries(
    refs.map((row) => [
      row.result_id,
      row.case_id && row.ip_id
        ? byCase.get(identityKey(row.case_id, row.ip_id))
        : undefined,
    ]),
  ) as Record<string, ProductIdentity>;
}

export function useTaskProductIdentities(
  enabled: boolean,
  ipId: string,
  rows: TaskSummary[],
) {
  const missing = rows.filter((row) => row.product_identity === undefined);
  const key = JSON.stringify({
    ipId,
    refs: missing.map(({ result_id, case_id, ip_id }) => ({
      result_id,
      case_id,
      ip_id,
    })),
    versions: missing.map((row) => row.updated_at),
  });
  const cached = useRef<Projection | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const { ipId, refs } = JSON.parse(key) as {
      ipId: string;
      refs: TaskIdentityRef[];
    };
    if (!refs.length) return;
    if (cached.current?.key === key) {
      setProjection(cached.current);
      return;
    }
    const controller = new AbortController();
    setProjection(null);
    void loadTaskProductIdentities(ipId, refs, controller.signal)
      .then((identities) => {
        if (controller.signal.aborted) return;
        const result = { key, identities };
        cached.current = result;
        setProjection(result);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setProjection({
          key,
          identities: {},
          error: error instanceof Error ? error.message : String(error),
        });
        controller.abort();
      });
    return () => controller.abort();
  }, [enabled, key, retry]);
  const current = projection?.key === key ? projection : null;
  return {
    unavailable: Boolean(
      current &&
      !current.error &&
      rows.some(
        (row) =>
          row.product_identity === undefined &&
          current.identities[row.result_id] === undefined,
      ),
    ),
    rows:
      current && !current.error
        ? rows.map((row) =>
            row.product_identity === undefined
              ? { ...row, product_identity: current.identities[row.result_id] }
              : row,
          )
        : rows,
    loading: enabled && missing.length > 0 && !current,
    error: enabled ? current?.error : undefined,
    retry: () => {
      cached.current = null;
      setProjection(null);
      setRetry((value) => value + 1);
    },
  };
}
