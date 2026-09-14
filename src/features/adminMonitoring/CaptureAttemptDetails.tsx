import { useState } from "react";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import { getAdminCaptureAttempts, type AdminCaptureAttempt, type AdminMonitoringJob, type CaptureDiagnostics } from "../../api";

const STATUS_COPY: Record<string, string> = {
  running: "Execution in progress",
  completed: "Execution completed",
  retry: "Returned to the queue for retry",
  failed: "Execution failed. No automatic retry was scheduled",
  deferred: "Deferred for access recovery",
  resource_incompatible: "Returned to the queue for a compatible worker",
};
const METHOD_COPY: Record<string, string> = { nodriver: "Browser", scrapfly: "Scrapfly", marketplace_specific: "Marketplace API", web_search: "Web search" };
const time = (value: string) => new Date(value).toLocaleString();

export function CaptureAttemptDetails({ job }: { job: AdminMonitoringJob }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<AdminCaptureAttempt[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const failures = job.scrape?.steps.filter(step => ["failed", "blocked"].includes(step.outcome ?? "") && step.diagnostics) ?? [];

  async function load(before?: string | null) {
    setLoading(true); setError(null);
    try {
      const result = await getAdminCaptureAttempts(job.id, before);
      setAttempts(previous => before ? [...previous, ...result.attempts] : result.attempts);
      setCursor(result.next_cursor);
    } catch {
      setError("Could not load execution history. Try again.");
    } finally { setLoading(false); }
  }

  return <div className="mt-2 text-xs">
    {failures.map(step => <p key={`${step.method}-${step.role}`} className="mb-2 rounded-md bg-amber-50 px-3 py-2 leading-5 text-amber-900">
      <span className="font-semibold">{METHOD_COPY[step.method]} attempt: </span>{step.diagnostics!.message}
    </p>)}
    <button type="button" aria-expanded={open} onClick={() => {
      setOpen(!open);
      if (!open) void load();
    }} className="inline-flex items-center gap-1 py-1 font-medium text-stone-600 hover:text-stone-900">
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      Diagnostics &amp; execution history
    </button>
    {open && <div className="mt-2 space-y-3 rounded-lg border border-stone-200 bg-stone-50/70 p-3">
      {attempts.map(attempt => <section key={attempt.id} className="rounded-md border border-stone-200 bg-white p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <p className="font-semibold text-stone-800">{(attempt.scrapfly_overflow || attempt.worker_instance_id?.startsWith("api-scrapfly-")) ? "Scrapfly task" : "Browser worker"} · attempt {attempt.attempt_number}</p>
          <time className="text-[11px] text-stone-500">{time(attempt.started_at)}</time>
        </div>
        <p className="mt-1 text-stone-600">{STATUS_COPY[attempt.status] ?? attempt.status}</p>
        <p className="mt-1 break-all font-mono text-[10px] text-stone-500">Execution {attempt.id}{attempt.worker_image_sha ? ` · version ${attempt.worker_image_sha.slice(0, 12)}` : " · version not recorded"}</p>
        {attempt.worker_instance_id && <p className="mt-1 break-all font-mono text-[10px] text-stone-400">{attempt.worker_instance_id}</p>}
        {attempt.completed_at && <p className="mt-1 text-[11px] text-stone-500">Finished {time(attempt.completed_at)}</p>}
        {attempt.scrape.steps.map(step => <div key={`${step.method}-${step.role}-${step.provider}`} className="mt-3 border-t border-stone-100 pt-2">
          <p className="font-medium text-stone-700">{METHOD_COPY[step.method]}{step.role === "fallback" ? " fallback" : ""} · {step.outcome ?? "outcome not recorded"}</p>
          {step.diagnostics ? <DiagnosticEvidence diagnostic={step.diagnostics} /> : <p className="mt-1 leading-5 text-stone-500">{step.reason || "Detailed diagnostics were not recorded for this route."}</p>}
        </div>)}
        {!attempt.scrape.steps.some(step => step.diagnostics) && <p className="mt-2 leading-5 text-stone-500">Detailed diagnostics were not recorded for this execution.{attempt.error ? ` ${attempt.error}` : ""}</p>}
      </section>)}
      {loading && <p role="status" className="flex items-center gap-2 text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading execution history...</p>}
      {error && <p role="alert" className="text-red-700">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
      {!loading && !error && attempts.length === 0 && <p className="text-stone-500">No execution has claimed this job yet.</p>}
      {!loading && cursor && <button type="button" onClick={() => void load(cursor)} className="font-medium text-sky-700 hover:underline">Load earlier executions</button>}
    </div>}
  </div>;
}

function DiagnosticEvidence({ diagnostic: d }: { diagnostic: CaptureDiagnostics }) {
  const facts: Array<[string, string | number | null]> = [
    ["Requested URL", d.requested_url], ["Final URL", d.final_url], ["Source URL", d.source_url],
    ["HTTP status", d.http_status ?? "No response recorded"], ["Provider status", d.provider_status],
    ["Page title", d.title], ["HTML characters", d.html_length], ["Page type", d.page_kind],
    ["Content check", d.content_contract_passed === null ? "Not established" : d.content_contract_passed ? "Passed" : "Rejected"],
    ["Check result", d.contract_code], ["Evidence signals", d.signals.join(", ")],
    ["Parser errors", d.parser_errors.join(", ")], ["Exception type", d.exception_type],
    ["Challenge", d.challenge ? [d.challenge.family, d.challenge.provider, d.challenge.variant].filter(Boolean).join(" / ") : null],
    ["Challenge signals", d.challenge?.signals.join(", ") ?? null], ["Document SHA-256", d.document_sha256],
  ];
  return <div className="mt-1">
    <p className="leading-5 text-stone-700">{d.message}</p>
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] font-medium text-sky-700">Evidence · {d.code}</summary>
      <dl className="mt-2 space-y-2">
        {facts.filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}>
          <dt className="text-[10px] font-semibold text-stone-500">{label}</dt>
          <dd className="mt-0.5 break-all text-[11px] leading-4 text-stone-700">{value}</dd>
        </div>)}
        {d.page_url_hints.map((url, index) => <div key={`${index}-${url}`}><dt className="text-[10px] font-semibold text-stone-500">Canonical / social URL {index + 1}</dt><dd className="mt-0.5 break-all text-[11px] leading-4 text-stone-700">{url}</dd></div>)}
      </dl>
      <p className="mt-3 text-[10px] leading-4 text-stone-400">URL credentials, query values and fragments are removed. Response bodies, headers and screenshots are not retained here.</p>
    </details>
  </div>;
}
