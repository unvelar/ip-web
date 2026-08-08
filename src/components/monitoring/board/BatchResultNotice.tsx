import { AlertTriangle, ArrowRight, CheckCircle2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { BatchResult, TakedownBatchSummary } from "./batchUtils";

function isTakedownSummary(result: BatchResult): result is TakedownBatchSummary {
  return typeof result !== "string" && result.kind === "takedown_batch";
}

export function BatchResultNotice({
  result,
  onDismiss,
  profileIpId,
  className = "",
}: {
  result: BatchResult;
  onDismiss: () => void;
  profileIpId?: string | null;
  className?: string;
}) {
  const summary = isTakedownSummary(result) ? result : null;
  const warning = summary?.tone === "warning" || (
    typeof result === "string" && result.startsWith("Nothing")
  );
  const legalQueueHref = `/monitoring/tasks?status=takedown_pending${
    profileIpId ? `&ip_id=${encodeURIComponent(profileIpId)}` : ""
  }`;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
        warning
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-stone-200 bg-stone-50 text-stone-700"
      } ${className}`}
    >
      {warning ? (
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      ) : (
        <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {summary ? (
          <>
            <p className="text-sm font-bold">{summary.title}</p>
            {summary.details.length > 0 && (
              <ul className="mt-1.5 space-y-1 text-xs leading-relaxed">
                {summary.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            )}
            {(summary.showLegalQueueLink || (summary.needsProfile && profileIpId)) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {summary.showLegalQueueLink && (
                  <Link
                    to={legalQueueHref}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-700 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
                  >
                    Escalate
                    <ArrowRight size={13} aria-hidden />
                  </Link>
                )}
                {summary.needsProfile && profileIpId && (
                  <Link
                    to={`/ips/${encodeURIComponent(profileIpId)}#takedown-signer`}
                    className="inline-flex text-xs font-bold text-amber-900 underline decoration-amber-400 underline-offset-2 hover:text-amber-700"
                  >
                    Complete the IP takedown profile
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs leading-relaxed">
            {typeof result === "string" ? result : result.title}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${
          warning
            ? "text-amber-600 hover:bg-amber-100 hover:text-amber-900"
            : "text-stone-400 hover:bg-stone-200 hover:text-stone-700"
        }`}
        aria-label="Dismiss batch result"
      >
        <X size={14} />
      </button>
    </div>
  );
}
