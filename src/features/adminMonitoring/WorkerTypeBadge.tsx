import type { AdminMonitoringWorkerKind } from "../../api";
import { WORKER_KIND_COPY } from "./workerKinds";

export function WorkerTypeBadge({ kind, compact = false }: { kind: AdminMonitoringWorkerKind; compact?: boolean }) {
  const copy = WORKER_KIND_COPY[kind];
  const Icon = copy.icon;
  return (
    <span title={copy.detail} aria-label={`Worker type: ${copy.label}`} className={`inline-flex shrink-0 items-center gap-1 rounded border ${compact ? "px-1" : "px-1.5"} py-0.5 text-[9px] font-semibold ${copy.style}`}>
      {!compact && <Icon className="h-3 w-3" />}{copy.label}
    </span>
  );
}
