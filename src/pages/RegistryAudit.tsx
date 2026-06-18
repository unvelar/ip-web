import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getIpMonitoringAudit,
  type MonitorAuditRun,
  type MonitorAuditCandidate,
} from "../api";

// Similarity auto-open bar (mirrors worker MONITOR_SIM_THRESHOLD) — shown as a
// reference line so it's obvious which candidates cleared it.
const SIM_THRESHOLD = 0.72;

// Friendly name for an anti-bot marker string (from _detect_captcha/_challenge).
export function antibotLabel(marker: string): string {
  const m = marker.toLowerCase();
  if (m.includes("recaptcha") || m.includes("i'm not a robot")) return "reCAPTCHA";
  if (m.includes("hcaptcha")) return "hCaptcha";
  if (m.includes("captcha-delivery")) return "DataDome";
  if (m.includes("nc_1_n1z") || m.includes("punish") || m.includes("x5secdata")) return "AliExpress NoCaptcha";
  if (m.includes("cf-") || m.includes("challenge-platform") || m.includes("cloudflare")) return "Cloudflare";
  return marker;
}

function dispositionStyle(d: string | null): string {
  switch (d) {
    case "verified":
    case "vlm_confirmed":
      return "bg-emerald-100 text-emerald-800";
    case "vlm_rejected":
      return "bg-amber-100 text-amber-800";
    case "below_threshold":
    case "verify_dropped":
    case "no_match":
      return "bg-stone-100 text-stone-600";
    case "blocked":
    case "error":
      return "bg-red-100 text-red-700";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

function methodStyle(m: string | null): string {
  switch (m) {
    case "nodriver_direct":
      return "bg-violet-100 text-violet-700";
    case "serper_google":
      return "bg-blue-100 text-blue-700";
    case "brave_sidestep":
      return "bg-teal-100 text-teal-700";
    case "scrapfly_direct":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-stone-100 text-stone-600";
  }
}

function fmtTime(s: string | null): string {
  return s ? new Date(s).toLocaleString() : "—";
}

function CandidateRow({ c }: { c: MonitorAuditCandidate }) {
  const sim = c.similarity_score ?? 0;
  const cleared = sim >= SIM_THRESHOLD;
  return (
    <tr className="border-t border-stone-100 align-top">
      <td className="py-2 pr-2">
        {c.image_url ? (
          <a href={c.url ?? c.image_url} target="_blank" rel="noreferrer">
            <img
              src={c.image_url}
              alt=""
              className="w-14 h-14 rounded object-cover border border-stone-200"
            />
          </a>
        ) : (
          <div className="w-14 h-14 rounded bg-stone-100" />
        )}
      </td>
      <td className="py-2 pr-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${methodStyle(c.source_method)}`}>
          {c.source_method ?? "?"}
        </span>
      </td>
      <td className="py-2 pr-2 text-stone-700">{c.top_ip ?? "—"}</td>
      <td className="py-2 pr-2 tabular-nums">
        <span className={cleared ? "text-emerald-700 font-semibold" : "text-stone-600"}>
          {(sim * 100).toFixed(0)}%
        </span>
        {c.inliers != null && <span className="text-stone-400"> · {c.inliers} inl</span>}
      </td>
      <td className="py-2 pr-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${dispositionStyle(c.disposition)}`}>
          {c.disposition ?? "—"}
        </span>
        {c.vlm_verdict && (
          <div className="text-[10px] text-stone-500 mt-1">
            vlm: {c.vlm_verdict}
            {c.vlm_confidence != null && ` @${Math.round(c.vlm_confidence * 100)}%`}
          </div>
        )}
      </td>
      <td className="py-2 text-[11px] text-stone-500 max-w-[28rem]">
        {c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">
            {c.url}
          </a>
        )}
        {c.vlm_reasoning && (
          <div className="text-stone-500 mt-1 leading-snug line-clamp-3">{c.vlm_reasoning}</div>
        )}
      </td>
    </tr>
  );
}

function RunCard({ run }: { run: MonitorAuditRun }) {
  const [open, setOpen] = useState(false);
  // Per-disposition tally for the collapsed summary.
  const tally: Record<string, number> = {};
  for (const c of run.candidates) {
    const k = c.disposition ?? "?";
    tally[k] = (tally[k] ?? 0) + 1;
  }
  return (
    <div className="rounded-2xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-5 py-3 flex items-center justify-between gap-3 flex-wrap"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm text-stone-900">{run.domain}</span>
          <span className="text-stone-400">·</span>
          <span className="text-sm text-stone-700">“{run.keyword ?? "—"}”</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
              run.status === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : run.status === "failed"
                  ? "bg-red-100 text-red-700"
                  : "bg-stone-100 text-stone-600"
            }`}
          >
            {run.status}
          </span>
          {run.cases_created != null && run.cases_created > 0 && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 text-white">
              {run.cases_created} case{run.cases_created === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-stone-500">
          <span>{run.candidates.length} scored</span>
          {Object.entries(tally).map(([k, n]) => (
            <span key={k} className={`px-1.5 py-0.5 rounded ${dispositionStyle(k)}`}>
              {k} {n}
            </span>
          ))}
          <span>{fmtTime(run.started_at)}</span>
          <span className="text-stone-400">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-stone-100">
          {run.error && (
            <div className="mt-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {run.error}
            </div>
          )}

          {run.pages.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide mb-2">
                Pages visited (nodriver)
              </div>
              <div className="flex gap-4 flex-wrap">
                {run.pages.map((p) => (
                  <div key={p.id} className="w-64">
                    {p.screenshot_url ? (
                      <a href={p.screenshot_url} target="_blank" rel="noreferrer">
                        <img
                          src={p.screenshot_url}
                          alt=""
                          className="w-64 rounded-lg border border-stone-200"
                        />
                      </a>
                    ) : (
                      <div className="w-64 h-40 rounded-lg bg-stone-100 flex items-center justify-center text-[11px] text-stone-400">
                        no screenshot
                      </div>
                    )}
                    <div className="text-[11px] text-stone-500 mt-1">
                      <span className={`px-1.5 py-0.5 rounded font-semibold ${methodStyle(p.source_method)}`}>
                        {p.source_method ?? "?"}
                      </span>{" "}
                      HTTP {p.http_status ?? "—"}
                      {p.blocked && (
                        <span className="text-red-600 font-semibold">
                          {" · blocked"}
                          {p.disposition ? ` (${antibotLabel(p.disposition)})` : ""}
                        </span>
                      )}
                      <span> · {p.harvested_count ?? 0} found</span>
                    </div>
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] text-blue-700 hover:underline break-all mt-0.5"
                      >
                        {p.url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {run.candidates.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wide text-stone-400">
                    <th className="pb-1 pr-2">Image</th>
                    <th className="pb-1 pr-2">Method</th>
                    <th className="pb-1 pr-2">Top IP</th>
                    <th className="pb-1 pr-2">Sim</th>
                    <th className="pb-1 pr-2">Disposition</th>
                    <th className="pb-1">Page / reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {run.candidates.map((c) => (
                    <CandidateRow key={c.id} c={c} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 text-xs text-stone-400">No candidates scored in this run.</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RegistryAudit() {
  const { id } = useParams<{ id: string }>();
  const [runs, setRuns] = useState<MonitorAuditRun[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    getIpMonitoringAudit(id)
      .then((r) => !cancelled && setRuns(r.runs))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load audit"));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Monitoring audit</h1>
          <p className="text-xs text-stone-500">
            Every search, newest first — which method found which pages, and why each candidate did or
            didn’t become a match.
          </p>
        </div>
        <Link to={`/ips/${id}`} className="text-sm text-blue-700 hover:underline">
          ← Back to IP
        </Link>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">{error}</div>
      )}
      {!error && runs === null && <div className="text-sm text-stone-400">Loading…</div>}
      {runs !== null && runs.length === 0 && (
        <div className="text-sm text-stone-400">No monitoring runs recorded yet.</div>
      )}
      {runs && runs.length > 0 && (
        <div className="space-y-3">
          {runs.map((run) => (
            <RunCard key={run.run_id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
