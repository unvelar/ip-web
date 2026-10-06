import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, LoaderCircle, X } from "lucide-react";
import { getMonitoringSourceAttempts, type SourceAttemptHistory, type SourceSetupAttempt } from "../../api/monitoringAttempts";
import { failureDetail } from "./failureDetail";
import { retryTime } from "./recoveryPresentation";

const phaseLabel = { capture: "Open website and find search", infer: "Prepare search instructions", validate: "Verify search results" };
const stateLabel = (state: string) => state === "succeeded" ? "Succeeded"
  : state === "failed" || state === "no_recipe" ? "Failed" : state === "superseded" ? "Replaced"
    : state === "cancelled" ? "Cancelled" : "In progress";
const workerAttemptLabel: Record<string, string> = { completed: "Completed", retry: "Failed, retried",
  failed: "Failed", deferred: "Deferred", resource_incompatible: "Worker unavailable", running: "Running",
  abandoned: "Interrupted", cancelled: "Cancelled" };

export function SourceAttemptDetails({ ipId, sourceId, label = "View failed attempt" }: { ipId: string; sourceId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950">{label}</button>
    {open && <AttemptDialog ipId={ipId} sourceId={sourceId} onClose={() => { setOpen(false); trigger.current?.focus(); }} />}
  </>;
}

function AttemptDialog({ ipId, sourceId, onClose }: { ipId: string; sourceId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  const [data, setData] = useState<SourceAttemptHistory | null>(null), [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null), [reload, setReload] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    getMonitoringSourceAttempts(ipId, sourceId, controller.signal).then(value => {
      if (!controller.signal.aborted) { setData(value); setError(""); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Attempt history could not be loaded.");
    });
    return () => controller.abort();
  }, [ipId, sourceId, reload]);
  const attempt = data?.attempts.find(item => item.id === selected) ?? data?.attempts[0];
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} aria-labelledby={heading} onCancel={e => { e.preventDefault(); close(); }} onClick={e => { if (e.target === e.currentTarget) close(); }}
    className="m-auto w-[calc(100%_-_2rem)] max-w-5xl overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-0 text-stone-900 shadow-2xl backdrop:bg-black/45">
    <div className="flex max-h-[85dvh] flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
        <div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Monitoring search setup</p>
          <h2 id={heading} className="mt-1 text-lg font-bold">{data?.source.label ?? "Website"} attempt history</h2>
          <p className="mt-1 text-xs text-stone-500">What the browser saw and where each attempt stopped.</p></div>
        <button type="button" onClick={close} aria-label="Close attempt history" className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-950"><X className="h-5 w-5" /></button>
      </header>
      <div className="overflow-y-auto">
        {error ? <div role="alert" className="p-6 text-sm text-rose-800"><p>{error}</p><button type="button" className="mt-3 font-semibold underline" onClick={() => setReload(value => value + 1)}>Try again</button></div>
          : !data ? <div role="status" className="flex items-center gap-2 p-8 text-sm text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading attempt history…</div>
          : !attempt ? <p className="p-8 text-sm text-stone-500">No search setup attempts have been recorded for this website.</p>
          : <div className="grid md:grid-cols-[17rem_minmax(0,1fr)]">
            <nav aria-label="Search setup attempts" className="min-w-0 border-b border-stone-200 p-3 md:border-r md:border-b-0">
              <p className="px-2 py-2 text-xs font-semibold text-stone-500">Recent attempts</p>
              <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-x-visible">
                {data.attempts.map((item, i) => <button key={item.id} type="button" aria-pressed={item.id === attempt.id} onClick={() => setSelected(item.id)}
                  className={`min-w-48 shrink-0 rounded-lg border px-3 py-2.5 text-left text-xs md:min-w-0 ${item.id === attempt.id ? "border-stone-300 bg-white shadow-sm" : "border-transparent hover:bg-stone-100"}`}>
                  <span className="flex justify-between gap-2 font-semibold"><span>{i === 0 ? "Latest attempt" : `Setup attempt ${item.number}`}</span><span className={`shrink-0 ${item.state === "succeeded" ? "text-emerald-700" : ["failed", "no_recipe"].includes(item.state) ? "text-rose-700" : "text-amber-700"}`}>{stateLabel(item.state)}</span></span>
                  <span className="mt-1 block text-[11px] text-stone-500">{retryTime(item.created_at)}</span><span className="mt-1 block truncate text-stone-600">{item.keyword}</span>
                </button>)}
              </div>
            </nav>
            <AttemptEvidence attempt={attempt} isLatest={attempt.id === data.attempts[0].id} />
          </div>}
      </div>
    </div>
  </dialog>;
}

function AttemptEvidence({ attempt, isLatest }: { attempt: SourceSetupAttempt; isLatest: boolean }) {
  const failed = ["failed", "no_recipe"].includes(attempt.state);
  const inactive = ["superseded", "cancelled"].includes(attempt.state);
  const step = attempt.steps.find(item => item.status === "failed") ?? attempt.steps.at(-1);
  const observed = attempt.events.find(event => event.diagnostics?.readiness?.panel);
  const panel = observed?.diagnostics?.readiness?.panel;
  const page = attempt.events.find(event => event.diagnostics?.http_status != null);
  const pageUrl = observed?.url ?? page?.diagnostics?.final_url ?? attempt.events.find(event => event.url)?.url;
  const captures = attempt.captures.filter(capture => capture.image_url);
  return <div className="min-w-0 space-y-5 p-5">
    <section className={`rounded-xl border p-4 ${failed ? "border-rose-200 bg-rose-50" : inactive ? "border-stone-200 bg-stone-100" : attempt.state === "succeeded" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center gap-2 font-bold text-sm">{failed ? <AlertCircle className="h-4 w-4 text-rose-700" /> : inactive ? <X className="h-4 w-4 text-stone-500" /> : <CheckCircle2 className="h-4 w-4" />}
        {failed ? "Search setup failed" : attempt.state === "superseded" ? "Search setup replaced" : inactive ? "Search setup cancelled" : attempt.state === "succeeded" ? "Search setup succeeded" : "Search setup is in progress"}</div>
      <p className="mt-2 text-xs leading-5 text-stone-700">{failed ? failureDetail(attempt.reason) : attempt.state === "superseded" ? "This attempt was replaced by a newer setup. Select the latest attempt to see its outcome." : inactive ? "This setup attempt was cancelled." : attempt.state === "succeeded" ? "The search was verified and monitoring can use it." : "The browser is preparing and checking this website's search."}</p>
      {attempt.retries_stopped && <p className="mt-2 text-xs font-semibold text-rose-800">Automatic retries stopped after three consecutive failures with the same cause.</p>}
      {isLatest && !attempt.retries_stopped && attempt.next_retry_at && <p className="mt-2 text-xs font-semibold">Next retry: {retryTime(attempt.next_retry_at)}</p>}
    </section>
    <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
      <div><dt className="text-stone-500">Search term</dt><dd className="mt-1 font-semibold">{attempt.keyword}</dd></div>
      <div><dt className="text-stone-500">{failed ? "Stopped at" : "Last step"}</dt><dd className="mt-1 font-semibold">{step ? phaseLabel[step.phase] : "Waiting for a worker"}</dd></div>
      <div><dt className="text-stone-500">Attempt started</dt><dd className="mt-1">{retryTime(attempt.created_at)}</dd></div>
      <div><dt className="text-stone-500">Page response</dt><dd className="mt-1">{page?.diagnostics?.http_status ? `HTTP ${page.diagnostics.http_status}` : "Not recorded"}</dd></div>
      {pageUrl && <div className="col-span-2 min-w-0"><dt className="text-stone-500">Page visited</dt><dd className="mt-1 break-all"><a href={pageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">{pageUrl}<ExternalLink className="h-3 w-3 shrink-0" /></a></dd></div>}
    </dl>
    {panel && <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="text-xs font-bold">Page dialog observed</h3><p className="mt-2 text-xs font-semibold">{panel.label}</p>
      <p className="mt-1 text-xs leading-5 text-stone-600">{panel.sensitive_fields ? "Sensitive form content is omitted." : panel.text}</p>
      {panel.controls.length > 0 && <p className="mt-2 text-xs text-stone-500">Available controls: {panel.controls.map(control => control.label || control.kind).join(", ")}</p>}
    </section>}
    <section>
      <h3 className="text-xs font-bold">Screenshots</h3>
      {captures.length ? <div className="mt-2 grid gap-3 sm:grid-cols-2">{captures.map(capture => <a key={capture.id} href={capture.image_url!} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <img src={capture.image_url!} alt={capture.label || "Page observed during search setup"} loading="lazy" className="aspect-[4/3] w-full object-contain" />
        <div className="border-t border-stone-100 px-3 py-2 text-[11px]"><span className="font-semibold">{capture.label || "Page capture"}</span><span className="mt-0.5 block text-stone-500">{retryTime(capture.at)}</span></div>
      </a>)}</div> : <p className="mt-2 rounded-lg border border-stone-200 bg-white p-3 text-xs leading-5 text-stone-500">{attempt.captures.some(capture => capture.state === "expired") ? "The screenshots for this attempt have expired." : attempt.captures.some(capture => capture.state === "uploading") ? "A screenshot is still being uploaded." : "No screenshot was saved for this attempt."} The recorded steps and errors are still available below.</p>}
    </section>
    <section><h3 className="text-xs font-bold">Worker attempts</h3><ol className="mt-2 space-y-2">{attempt.steps.flatMap(item => item.attempts.map(run => <li key={`${item.phase}-${run.id}`} className="flex flex-wrap justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
      <span>{phaseLabel[item.phase]} · attempt {run.number}</span><span className="text-stone-500">{retryTime(run.started_at)} · {workerAttemptLabel[run.status] ?? "Status not recorded"}</span>
    </li>))}</ol>{attempt.steps.every(item => item.attempts.length === 0) && <p className="mt-2 text-xs text-stone-500">No worker attempt has started.</p>}</section>
    <details className="rounded-xl border border-stone-200 bg-white p-4 text-xs">
      <summary className="cursor-pointer font-semibold">Technical details</summary>
      {attempt.reason && <p className="mt-3 break-words text-stone-600">Reason: <code>{attempt.reason}</code></p>}
      {(attempt.error || step?.error) && <p className="mt-2 break-words leading-5 text-stone-600">{attempt.error || step?.error}</p>}
      {observed?.diagnostics?.readiness?.judgments.map(judgment => <div key={judgment.question} className="mt-3"><p className="font-semibold">{judgment.question}: {judgment.choice} · {(judgment.probability * 100).toFixed(0)}%</p><p className="mt-1 text-stone-500">{Object.entries(judgment.probabilities).filter(([, value]) => value > 0).map(([choice, probability]) => `${choice} ${(probability * 100).toFixed(0)}%`).join(", ")}</p></div>)}
      {attempt.events.length > 0 && <ol className="mt-3 space-y-2 border-t border-stone-100 pt-3">{attempt.events.map((event, i) => <li key={i} className="break-words text-stone-500">{retryTime(event.at)} · {event.label || event.kind}</li>)}</ol>}
    </details>
  </div>;
}
