import type { AdminMonitoringQueueStage } from "../../api";

export function QueueTiming({ stage }: { stage: AdminMonitoringQueueStage | undefined }) {
  const timing = stage?.timing;
  const average = timing && timing.sample_size > 0 ? timing.average_seconds : null;
  const hasAverage = typeof average === "number" && Number.isFinite(average) && average >= 0;
  const ready = stage?.pending_jobs ?? 0;
  const readySeconds = ready === 0 ? 0 : hasAverage ? average * ready : null;
  const windowLabel = timing ? `${timing.window_hours}h` : null;

  return (
    <div className="mt-auto pt-3">
      <div className="border-t border-stone-100 pt-2.5">
        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-[10px] text-stone-500">Average per job</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-stone-800">
              {hasAverage ? formatJobDuration(average) : "No data yet"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] text-stone-500">Ready work · 1 worker</dt>
            <dd className="mt-0.5 text-sm font-bold tabular-nums text-stone-800">
              {readySeconds === null ? "No estimate yet" : `${ready > 0 ? "≈ " : ""}${formatJobDuration(readySeconds)}`}
            </dd>
          </div>
        </dl>
        <p className="mt-1.5 text-[10px] leading-4 text-stone-400">
          {!timing ? "Timing data unavailable"
            : hasAverage ? `${timing.sample_size.toLocaleString()} completed ${timing.sample_size === 1 ? "job" : "jobs"} in ${windowLabel}${timing.sample_size < 5 ? " · small sample" : ""}`
              : `No completed jobs in ${windowLabel}`}
        </p>
      </div>
    </div>
  );
}

function formatJobDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  if (seconds < 1) return "<1s";
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3_600) {
    const remainder = rounded % 60;
    return `${Math.floor(rounded / 60)}m${remainder ? ` ${remainder}s` : ""}`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 1_440) {
    const remainder = minutes % 60;
    return `${Math.floor(minutes / 60)}h${remainder ? ` ${remainder}m` : ""}`;
  }
  const hours = Math.round(seconds / 3_600);
  const remainder = hours % 24;
  return `${Math.floor(hours / 24)}d${remainder ? ` ${remainder}h` : ""}`;
}
