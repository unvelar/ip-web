import type { MonitoringSourceRecovery } from "../../api";
import { recoveryLabel } from "./recoveryPresentation";
import { failureDetail } from "./failureDetail";
import { SourceAttemptDetails } from "./SourceAttemptDetails";

export function MonitoringRecoveryDetails({ sources, ipId }: { sources: MonitoringSourceRecovery[]; ipId?: string }) {
  const incomplete = sources.filter(source => source.state !== "ready");
  if (!incomplete.length) return null;
  return (
    <details className="mt-2 text-xs text-stone-700">
      <summary className="cursor-pointer font-semibold">Website setup details ({incomplete.length})</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {incomplete.map(source => (
          <li key={source.source_id} className="rounded-lg border border-black/5 bg-white/70 px-3 py-2">
            <span className="font-semibold">{source.label}</span>
            <p className="mt-0.5">{recoveryLabel(source)}</p>
            {failureDetail(source.reason) && <p className="mt-1 text-stone-500">{failureDetail(source.reason)}</p>}
            {ipId && <div className="mt-2"><SourceAttemptDetails ipId={ipId} sourceId={source.source_id} label="View setup attempts" /></div>}
          </li>
        ))}
      </ul>
    </details>
  );
}
