import { useMemo, useState } from "react";
import { JobScrapeMethodBadge } from "./ScrapeMethodBadge";
import { supportsScrapeMethod } from "./scrapeMethods";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  Search,
} from "lucide-react";
import type {
  AdminMonitoringCandidate,
  AdminMonitoringJob,
  AdminMonitoringRunDetail,
} from "../../api";

type CandidateFilter = "all" | "pending" | "confirmed" | "rejected" | "screened_out" | "attention";

const DECISION_STYLES: Record<AdminMonitoringCandidate["debug"]["decision"]["state"], string> = {
  pending: "border-blue-200 bg-blue-50 text-blue-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
  screened_out: "border-stone-200 bg-stone-100 text-stone-600",
  suppressed: "border-violet-200 bg-violet-50 text-violet-700",
  not_evaluated: "border-amber-300 bg-amber-50 text-amber-800",
  failed: "border-red-300 bg-red-50 text-red-700",
};

const PIPELINE_STYLES: Record<string, string> = {
  waiting: "text-stone-600",
  score_queued: "text-blue-700",
  scoring: "text-blue-700",
  visual_queued: "text-violet-700",
  visual_checking: "text-violet-700",
  qualification_queued: "text-sky-700",
  qualifying: "text-sky-700",
  complete: "text-emerald-700",
  failed: "text-red-700",
};

const JOB_LABELS: Record<string, string> = {
  monitor_scrape: "Discovery",
  monitor_score: "Matching",
  monitor_visual_check: "Visual check",
  finding_qualify: "Page check",
};

export function AdminMonitoringRunDetailPanel({
  detail,
  loading,
  refreshing,
  error,
}: {
  detail: AdminMonitoringRunDetail | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
}) {
  const [filter, setFilter] = useState<CandidateFilter>("all");
  const [query, setQuery] = useState("");
  const [openCandidateId, setOpenCandidateId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const candidates = detail?.candidates ?? [];
    return {
      all: candidates.length,
      pending: candidates.filter((candidate) => candidate.debug.decision.state === "pending").length,
      confirmed: candidates.filter((candidate) => candidate.debug.decision.state === "confirmed").length,
      rejected: candidates.filter((candidate) => candidate.debug.decision.state === "rejected").length,
      screened_out: candidates.filter((candidate) => (
        candidate.debug.decision.state === "screened_out" || candidate.debug.decision.state === "suppressed"
      )).length,
      attention: candidates.filter((candidate) => (
        candidate.debug.decision.state === "not_evaluated"
        || candidate.debug.decision.state === "failed"
        || candidate.debug.decision.integrity !== "consistent"
      )).length,
    };
  }, [detail?.candidates]);

  const visibleCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (detail?.candidates ?? []).filter((candidate) => {
      const state = candidate.debug.decision.state;
      const matchesFilter = filter === "all"
        || (filter === "screened_out" && (state === "screened_out" || state === "suppressed"))
        || (filter === "attention" && (
          state === "not_evaluated" || state === "failed" || candidate.debug.decision.integrity !== "consistent"
        ))
        || state === filter;
      if (!matchesFilter) return false;
      if (!needle) return true;
      return [
        candidate.title,
        candidate.page_url,
        candidate.domain,
        candidate.debug.decision.label,
        candidate.debug.decision.code,
        candidate.debug.decision.explanation,
        ...candidate.audits.map((audit) => audit.top_ip),
      ].some((value) => value?.toLowerCase().includes(needle));
    });
  }, [detail?.candidates, filter, query]);

  if (loading && !detail) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 border-t border-stone-200 bg-stone-50/60 text-sm text-stone-500">
        <LoaderCircle className="h-4 w-4 animate-spin" /> Loading candidate evidence
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="border-t border-stone-200 bg-red-50 px-5 py-6 text-sm text-red-700">
        {error || "Run details are unavailable."}
      </div>
    );
  }

  return (
    <div className="border-t border-stone-200 bg-stone-50/70">
      {error && (
        <div className="m-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Latest detail refresh failed. Showing the last known evidence: {error}
        </div>
      )}

      <div className="grid gap-px border-b border-stone-200 bg-stone-200 sm:grid-cols-4">
        <RunFact label="Run ID" value={detail.run.run_id} copy />
        <RunFact label="Started" value={formatTimestamp(detail.run.started_at || detail.run.created_at)} />
        <RunFact label="Candidate decisions" value={`${detail.candidates.length} linked, ${detail.unmatched_candidate_audits.length} unlinked`} />
        <RunFact label="Live detail" value={refreshing ? "Refreshing now" : `Updated ${formatRelative(detail.generated_at)}`} live />
      </div>

      {detail.jobs.some((job) => supportsScrapeMethod(job.type)) && (
        <section className="border-b border-stone-200 px-4 py-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Fetch executions</h3>
          <p className="mt-0.5 text-xs text-stone-400">Discovery and page verification, with each job's own methods.</p>
          <div className="mt-3 grid max-h-80 gap-3 overflow-y-auto sm:grid-cols-2">
            {[...new Map(detail.jobs.filter((job) => supportsScrapeMethod(job.type)).map((job) => [job.id, job])).values()].map((job) => (
              <JobTimelineRow key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {detail.pages.length > 0 && (
        <section className="border-b border-stone-200 px-4 py-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Discovery evidence</h3>
              <p className="mt-0.5 text-xs text-stone-400">Pages loaded before the candidates were saved.</p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {detail.pages.map((page) => (
              <article key={page.id} className="w-64 shrink-0 overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="h-32 bg-stone-100">
                  {page.screenshot_url
                    ? <DebugImage src={page.screenshot_url} className="h-full w-full object-cover object-top" />
                    : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon className="h-5 w-5" /></div>}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                    <span className="truncate text-stone-600">{humanize(page.source_method) || "Unknown transport"}</span>
                    <span className={page.blocked ? "text-red-700" : "text-stone-500"}>HTTP {page.http_status ?? "?"}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {page.blocked ? `Blocked: ${humanize(page.disposition) || "unknown challenge"}` : `${page.harvested_count ?? 0} candidates harvested`}
                  </p>
                  {page.url && <ExternalUrl href={page.url} label={compactUrl(page.url)} className="mt-2" />}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="p-4">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            {([
              ["all", "All"],
              ["pending", "Pending"],
              ["confirmed", "Confirmed"],
              ["rejected", "Rejected"],
              ["screened_out", "Screened"],
              ["attention", "Investigate"],
            ] as Array<[CandidateFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                  filter === value ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-white hover:text-stone-800"
                }`}
              >
                {label} <span className={filter === value ? "text-white/60" : "text-stone-400"}>{totals[value]}</span>
              </button>
            ))}
          </div>
          <label className="relative block w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search this run"
              className="h-9 w-full rounded-lg border border-stone-200 bg-white pl-8 pr-3 text-xs text-stone-800 outline-none focus:border-stone-400"
            />
          </label>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] table-fixed text-left">
              <colgroup>
                <col className="w-[26%]" /><col className="w-[19%]" /><col className="w-[18%]" />
                <col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[3%]" />
              </colgroup>
              <thead className="border-b border-stone-200 bg-stone-50 text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
                <tr>
                  <th className="px-3 py-2.5">Listing</th>
                  <th className="px-3 py-2.5">Decision</th>
                  <th className="px-3 py-2.5">Evidence</th>
                  <th className="px-3 py-2.5">Pipeline</th>
                  <th className="px-3 py-2.5">Worker job</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Expand</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {visibleCandidates.map((candidate) => (
                  <CandidateRows
                    key={candidate.id}
                    candidate={candidate}
                    open={openCandidateId === candidate.id}
                    onToggle={() => setOpenCandidateId((current) => current === candidate.id ? null : candidate.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {visibleCandidates.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-stone-500">No candidates match this filter.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function CandidateRows({ candidate, open, onToggle }: {
  candidate: AdminMonitoringCandidate;
  open: boolean;
  onToggle: () => void;
}) {
  const decision = candidate.debug.decision;
  const pipeline = candidate.debug.pipeline;
  const pipelineInProgress = ["scoring", "visual_checking", "qualifying"].includes(pipeline.state);
  const pipelineQueued = ["score_queued", "visual_queued", "qualification_queued", "waiting"].includes(pipeline.state);
  const activeJob = newestJob([
    ...candidate.jobs.visual,
    ...candidate.jobs.qualification,
    ...candidate.jobs.score,
  ]);
  const title = candidate.title || listingName(candidate.page_url);
  return (
    <>
      <tr className={`h-[88px] align-middle transition hover:bg-stone-50 ${open ? "bg-stone-50" : ""}`}>
        <td className="px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
              {candidate.image_url
                ? <DebugImage src={candidate.image_url} className="h-full w-full object-cover" />
                : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon className="h-4 w-4" /></div>}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-stone-900" title={title}>{title}</p>
              <ExternalUrl href={candidate.page_url} label={compactUrl(candidate.page_url)} className="mt-1" />
              <p className="mt-1 text-[10px] text-stone-400">Found {formatRelative(candidate.created_at)}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold ${DECISION_STYLES[decision.state]}`}>
            {decision.label}
          </span>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-stone-500">{decision.explanation}</p>
          {decision.integrity !== "consistent" && (
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              {decision.integrity === "conflict" ? "Evidence conflict" : "Missing evidence"}
            </p>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-black tabular-nums text-stone-800">{formatPercent(decision.similarity_score)}</span>
            {decision.inliers != null && <span className="text-[10px] text-stone-400">{decision.inliers} inliers</span>}
          </div>
          <p className="mt-1 text-[11px] text-stone-500">
            {decision.vlm_verdict ? `VLM ${decision.vlm_verdict}` : humanize(decision.match_method) || "No model verdict"}
            {decision.vlm_confidence != null && ` at ${formatPercent(decision.vlm_confidence)}`}
          </p>
          <p className="mt-1 truncate font-mono text-[9px] text-stone-400" title={decision.code ?? undefined}>{decision.code || "pending"}</p>
        </td>
        <td className="px-3 py-2.5">
          <div className={`flex items-center gap-1.5 text-xs font-bold ${PIPELINE_STYLES[pipeline.state] ?? "text-stone-700"}`}>
            {pipelineInProgress || pipelineQueued
              ? <LoaderCircle className={`h-3.5 w-3.5 ${pipelineInProgress ? "animate-spin" : ""}`} />
              : <Check className="h-3.5 w-3.5" />}
            {pipeline.label}
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-400">{pipeline.detail}</p>
        </td>
        <td className="px-3 py-2.5">
          {activeJob ? (
            <>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-700">
                <JobStatusDot status={activeJob.status} /> {JOB_LABELS[activeJob.type] ?? humanize(activeJob.type)}
              </div>
              <JobScrapeMethodBadge job={activeJob} />
              <p className="mt-1 text-[10px] text-stone-400">
                {activeJob.status === "pending" ? `Queued ${formatRelative(activeJob.queued_at)}` : humanize(activeJob.status)}
                {activeJob.batch_index && `, batch ${activeJob.batch_index}/${activeJob.batch_count}`}
              </p>
              {activeJob.worker_instance_id && <p className="mt-1 truncate font-mono text-[9px] text-stone-400">{activeJob.worker_instance_id}</p>}
            </>
          ) : <span className="text-[11px] text-stone-400">No linked job</span>}
        </td>
        <td className="px-2 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? "Collapse candidate details" : "Expand candidate details"}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className="border-t border-stone-200 bg-stone-50 px-4 py-4">
            <CandidateEvidence candidate={candidate} />
          </td>
        </tr>
      )}
    </>
  );
}

function CandidateEvidence({ candidate }: { candidate: AdminMonitoringCandidate }) {
  const decision = candidate.debug.decision;
  const allJobs = [
    ...candidate.jobs.score,
    ...candidate.jobs.visual,
    ...candidate.jobs.qualification,
  ].sort((left, right) => Date.parse(left.queued_at) - Date.parse(right.queued_at));
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <div className="space-y-4">
        <div className={`rounded-xl border p-4 ${decision.integrity === "consistent" ? "border-stone-200 bg-white" : "border-amber-300 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {decision.integrity === "consistent"
              ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />}
            <div>
              <h4 className="text-xs font-bold text-stone-900">Why this decision</h4>
              <p className="mt-1 text-sm leading-6 text-stone-700">{decision.explanation}</p>
              {decision.integrity === "conflict" && (
                <p className="mt-2 text-xs leading-5 text-amber-800">An audit record contains conflicting evidence. It has not been used to override a saved finding.</p>
              )}
              {decision.vlm_reasoning && decision.vlm_reasoning !== decision.explanation && (
                <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">VLM reasoning</p>
                  <p className="mt-1 text-xs leading-5 text-stone-600">{decision.vlm_reasoning}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {!!candidate.comparisons?.length && (
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <h4 className="text-xs font-bold text-stone-900">Comparisons by protected IP</h4>
            <div className="mt-3 divide-y divide-stone-100">
              {candidate.comparisons.map((comparison, index) => {
                const reference = candidate.references.find((row) => row.id === comparison.reference_image_id);
                return (
                  <div key={`${comparison.reference_image_id ?? comparison.top_ip}-${index}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    {reference?.url && <DebugImage src={reference.url} className="h-14 w-14 shrink-0 rounded-lg border border-stone-200 bg-stone-50 object-contain" />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-900">{comparison.top_ip || "Unidentified IP"}</p>
                      <p className={`mt-0.5 text-xs font-medium ${comparison.decision.state === "confirmed" ? "text-emerald-700" : "text-stone-600"}`}>{comparison.decision.label}</p>
                      <p className="mt-1 text-[11px] leading-4 text-stone-500">{comparison.decision.explanation}</p>
                      {!comparison.reference_image_id && <p className="mt-1 text-[10px] text-stone-400">Historical reference not retained</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <EvidenceImage label="Candidate" url={candidate.image_url} />
          <div className="rounded-xl border border-stone-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">Comparison references</p>
            {candidate.references.length > 0 ? (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {candidate.references.map((reference) => (
                  <div key={reference.id} className="w-32 shrink-0">
                    <div className="h-28 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
                      {reference.url
                        ? <DebugImage src={reference.url} className="h-full w-full object-contain" />
                        : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon className="h-5 w-5" /></div>}
                    </div>
                    <p className="mt-1 truncate font-mono text-[9px] text-stone-400" title={reference.id}>{shortId(reference.id)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 flex h-28 items-center justify-center rounded-lg border border-dashed border-stone-200 bg-stone-50 px-4 text-center text-[11px] leading-4 text-stone-400">
                The exact reference was not retained for this historical event.
              </div>
            )}
          </div>
        </div>

        {candidate.audits.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <h4 className="text-xs font-bold text-stone-900">Decision evidence timeline</h4>
            <div className="mt-3 space-y-3">
              {candidate.audits.map((audit) => (
                <div key={audit.id} className="grid gap-1 border-l-2 border-stone-200 pl-3 text-[11px] sm:grid-cols-[9rem_1fr]">
                  <div className="text-stone-400">{formatTimestamp(audit.created_at)}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-stone-700">{audit.disposition || "no disposition"}</span>
                      {audit.vlm_verdict && <span className="rounded bg-stone-100 px-1.5 py-0.5 font-semibold text-stone-600">VLM {audit.vlm_verdict}</span>}
                      {audit.top_ip && <span className="text-stone-500">target {audit.top_ip}</span>}
                    </div>
                    {audit.vlm_reasoning && <p className="mt-1 leading-4 text-stone-500">{audit.vlm_reasoning}</p>}
                    {audit.repair && (
                      <details className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                        <summary className="cursor-pointer font-semibold">Corrected audit record</summary>
                        <p className="mt-1 leading-4">{audit.repair.reason}</p>
                        <p className="mt-1 text-[10px]">Corrected {formatTimestamp(audit.repair.created_at)}. Original evidence retained below.</p>
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[10px]">{JSON.stringify(audit.repair.original_row, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h4 className="text-xs font-bold text-stone-900">Job timeline</h4>
          {allJobs.length > 0 ? (
            <div className="mt-3 space-y-3">
              {allJobs.map((job) => <JobTimelineRow key={`${job.id}:${job.type}`} job={job} />)}
            </div>
          ) : <p className="mt-2 text-xs text-stone-400">No linked job records.</p>}
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <h4 className="text-xs font-bold text-stone-900">Raw identifiers</h4>
          <div className="mt-3 space-y-2">
            <Identifier label="Candidate" value={candidate.id} />
            <Identifier label="Run" value={candidate.run_id} />
            {decision.audit_id && <Identifier label="Audit" value={decision.audit_id} />}
            {decision.reference_image_id && <Identifier label="Reference" value={decision.reference_image_id} />}
            {candidate.marketplace_snapshot_id && <Identifier label="Snapshot" value={candidate.marketplace_snapshot_id} />}
          </div>
        </div>

        {candidate.qualification_evidence != null && (
          <details className="rounded-xl border border-stone-200 bg-white p-4">
            <summary className="cursor-pointer text-xs font-bold text-stone-900">Qualification evidence JSON</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-stone-950 p-3 text-[10px] leading-4 text-stone-200">
              {JSON.stringify(candidate.qualification_evidence, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}

function JobTimelineRow({ job }: { job: AdminMonitoringJob }) {
  return (
    <div className="flex items-start gap-2.5">
      <JobStatusDot status={job.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold text-stone-700">{JOB_LABELS[job.type] ?? humanize(job.type)}</p>
          <p className="text-[10px] text-stone-400">{humanize(job.status)}</p>
        </div>
        <JobScrapeMethodBadge job={job} />
        <p className="mt-0.5 text-[10px] text-stone-400">
          attempt {job.attempts}/{job.max_attempts}
          {job.batch_index && `, batch ${job.batch_index}/${job.batch_count}`}
          {job.capacity_units > 1 && `, ${job.capacity_units} comparisons`}
        </p>
        {job.worker_instance_id && (
          <p className="mt-1 truncate font-mono text-[9px] text-stone-400" title={job.worker_instance_id}>
            {job.worker_instance_id}{job.worker_image_sha ? `, image ${shortId(job.worker_image_sha)}` : ""}
          </p>
        )}
        {job.error && <p className="mt-1 rounded bg-red-50 px-2 py-1 text-[10px] leading-4 text-red-700">{job.error}</p>}
      </div>
    </div>
  );
}

function RunFact({ label, value, copy = false, live = false }: { label: string; value: string; copy?: boolean; live?: boolean }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
        <p className={`truncate text-xs font-semibold text-stone-700 ${copy ? "font-mono" : ""}`} title={value}>{value}</p>
        {copy && <CopyValue value={value} />}
      </div>
    </div>
  );
}

function Identifier({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_minmax(0,1fr)_1.5rem] items-center gap-2 text-[10px]">
      <span className="font-semibold text-stone-400">{label}</span>
      <span className="truncate font-mono text-stone-600" title={value}>{value}</span>
      <CopyValue value={value} />
    </div>
  );
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy value"
      title={copied ? "Copied" : "Copy"}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1_200);
        });
      }}
      className="text-stone-300 hover:text-stone-600"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function EvidenceImage({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</p>
      <div className="mt-2 h-44 overflow-hidden rounded-lg border border-stone-200 bg-stone-100">
        {url
          ? <DebugImage src={url} className="h-full w-full object-contain" />
          : <div className="flex h-full items-center justify-center text-stone-300"><ImageIcon className="h-5 w-5" /></div>}
      </div>
    </div>
  );
}

function DebugImage({ src, className }: { src: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className="flex h-full w-full items-center justify-center text-stone-300"><ImageIcon className="h-5 w-5" /></div>;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
}

function ExternalUrl({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title={href} className={`flex min-w-0 items-center gap-1 text-[10px] text-stone-400 hover:text-blue-700 ${className}`}>
      <span className="truncate">{label}</span><ExternalLink className="h-2.5 w-2.5 shrink-0" />
    </a>
  );
}

function JobStatusDot({ status }: { status: string }) {
  const color = status === "completed" ? "bg-emerald-500"
    : status === "in_progress" ? "bg-blue-500"
      : status === "failed" ? "bg-red-500"
        : "bg-amber-400";
  return <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function newestJob(jobs: AdminMonitoringJob[]) {
  const active = jobs.filter((job) => job.status === "in_progress" || job.status === "pending");
  const rows = active.length > 0 ? active : jobs;
  return [...rows].sort((left, right) => Date.parse(right.queued_at) - Date.parse(left.queued_at))[0] ?? null;
}

function formatPercent(value: number | null) {
  return value == null ? "Not scored" : `${Math.round(value * 100)}%`;
}

function formatTimestamp(value: string | null) {
  return value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" }) : "Not started";
}

function formatRelative(value: string) {
  const milliseconds = Date.now() - Date.parse(value);
  if (!Number.isFinite(milliseconds)) return "unknown";
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanize(value: string | null | undefined) {
  return value?.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) ?? "";
}

function compactUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return value;
  }
}

function listingName(value: string) {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || url.hostname).replace(/[-_]+/g, " ");
  } catch {
    return value;
  }
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
