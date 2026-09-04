import { ArrowRight } from "lucide-react";
import type { AdminMonitoringJob, AdminMonitoringScrapeEvidence } from "../../api";
import { supportsScrapeMethod } from "./scrapeMethods";

const METHOD_COPY = {
  marketplace_specific: { label: "Marketplace specific", style: "bg-sky-50 text-sky-700 border-sky-100" },
  nodriver: { label: "Nodriver", style: "bg-violet-50 text-violet-700 border-violet-100" },
  scrapfly: { label: "Scrapfly", style: "bg-orange-50 text-orange-700 border-orange-100" },
  web_search: { label: "Web search", style: "bg-blue-50 text-blue-700 border-blue-100" },
};

export function JobScrapeMethodBadge({ job }: { job: Pick<AdminMonitoringJob, "type" | "scrape" | "status"> }) {
  if (!supportsScrapeMethod(job.type)) return null;
  return <div className="mt-1"><ScrapeMethodBadge scrape={job.scrape} status={job.status} /></div>;
}

export function ScrapeMethodBadge({ scrape, status }: {
  scrape?: AdminMonitoringScrapeEvidence | null;
  status?: string;
}) {
  if (!scrape?.steps.length) {
    const label = status === "pending" ? "Method selected on start"
      : status === "in_progress" || status === "running" ? "Method not reported yet"
        : "Method not recorded";
    return <span className="inline-flex rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[9px] text-stone-500" title="No historical scraper-method evidence is available. The current website recipe is not used to infer past executions.">{label}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1" aria-label={`Scrape method: ${scrape.steps.map((step) => METHOD_COPY[step.method].label).join(", ")}`}>
      {status === "pending" && <span className="text-[9px] text-stone-500">Previous attempt:</span>}
      {scrape.steps.map((step, index) => {
        const copy = METHOD_COPY[step.method];
        const suffix = step.role === "shadow" ? " shadow" : step.role === "reused" ? " reused" : "";
        const outcome = step.outcome === "started"
          ? status === "in_progress" || status === "running" ? "running" : "attempted"
          : step.outcome === "ready" ? "captured"
            : step.outcome === "unavailable" ? "listing unavailable" : step.outcome;
        const title = [
          copy.label,
          step.provider ? `Provider: ${step.provider.replace(/_/g, " ")}` : null,
          scrape.source === "worker" ? `${step.role} method recorded by the worker` : "Observed in stored results; the full attempt sequence was not recorded",
          outcome,
          step.reason,
          step.recorded_at ? new Date(step.recorded_at).toLocaleString() : null,
        ].filter(Boolean).join(". ");
        return (
          <span key={`${step.method}-${step.role}-${step.provider}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && (scrape.source === "worker"
              ? <ArrowRight className="h-2.5 w-2.5 text-stone-400" aria-hidden="true" />
              : <span className="text-[9px] text-stone-400">+</span>)}
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${copy.style}`} title={title}>
              {copy.label}{suffix}{outcome && <span className="font-normal"> · {outcome}</span>}
            </span>
          </span>
        );
      })}
    </span>
  );
}
