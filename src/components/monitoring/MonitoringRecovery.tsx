import type { MonitoringSourceRecovery } from "../../api";
import { recoveryLabel } from "./recoveryPresentation";

function failureDetail(reason: string | null): string | null {
  if (!reason) return null;
  if (["discovery_disabled", "discovery_key_missing", "collection_interpreter_unavailable"].includes(reason)) return "Discovery was unavailable on the worker.";
  if (reason === "authenticated_profile_not_supported") return "Discovery could not use this website's signed-in session.";
  if (reason === "marketplace_api_not_configured") return "The marketplace connection needs configuration.";
  if (reason === "no_search_control") return "A usable search control could not be found.";
  if (reason.startsWith("page_not_ready")) return "The website did not become ready for a search.";
  return "The last attempt could not verify usable search results.";
}

export function MonitoringRecoveryDetails({ sources }: { sources: MonitoringSourceRecovery[] }) {
  const incomplete = sources.filter(source => source.state !== "ready");
  if (!incomplete.length) return null;
  return (
    <details className="mt-2 text-xs text-stone-700">
      <summary className="cursor-pointer font-semibold">Website retry details ({incomplete.length})</summary>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {incomplete.map(source => (
          <li key={source.source_id} className="rounded-lg border border-black/5 bg-white/70 px-3 py-2">
            <span className="font-semibold">{source.label}</span>
            <p className="mt-0.5">{recoveryLabel(source)}</p>
            {failureDetail(source.reason) && <p className="mt-1 text-stone-500">{failureDetail(source.reason)}</p>}
          </li>
        ))}
      </ul>
    </details>
  );
}
