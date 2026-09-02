import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Lightbulb,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import {
  getKeywordLearningReport,
  reviewKeywordLearningSuggestion,
  type KeywordLearningCandidate,
  type KeywordLearningPerformance,
  type KeywordLearningReport,
} from "../../api";

interface KeywordLearningPanelProps {
  ipId: string;
  onKeywordsChanged: (keywords: string[]) => void;
}

const STATE_COPY: Record<KeywordLearningReport["state"], { title: string; detail: string }> = {
  collecting_evidence: {
    title: "Learning from monitoring results",
    detail: "New suggestions appear after a product phrase repeats across independent findings.",
  },
  suggestions_ready: {
    title: "New keyword suggestions are ready",
    detail: "Review the evidence before adding any suggestion to monitoring.",
  },
  testing_keywords: {
    title: "Approved keywords are queued for testing",
    detail: "Their impact will appear here after monitoring has used them.",
  },
  no_results_yet: {
    title: "Testing is active",
    detail: "The approved keywords have run, but have not produced unique findings yet.",
  },
  producing_results: {
    title: "Learned keywords are producing findings",
    detail: "Use the reviewed outcomes below to judge result quality, not only volume.",
  },
};

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function formatDate(value: string | null) {
  if (!value) return "Not run yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function confidenceLabel(candidate: KeywordLearningCandidate) {
  if (candidate.confidence === "high") return "Strong evidence";
  if (candidate.confidence === "medium") return "Good evidence";
  return "Early signal";
}

function OutcomeBadge({ item }: { item: KeywordLearningPerformance }) {
  if (item.monitoring_runs === 0) {
    return <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-full">Waiting for a run</span>;
  }
  if (item.findings_found === 0) {
    return <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-1 rounded-full">No findings yet</span>;
  }
  if (item.reviewed_findings === 0) {
    return <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">Needs review</span>;
  }
  if (item.actionable_findings > 0) {
    return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Productive</span>;
  }
  return <span className="text-xs font-semibold text-stone-600 bg-stone-100 px-2 py-1 rounded-full">Low signal so far</span>;
}

function SuggestionCard({
  candidate,
  busy,
  onReview,
}: {
  candidate: KeywordLearningCandidate;
  busy: "approve" | "reject" | null;
  onReview: (action: "approve" | "reject") => void;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-stone-900">{candidate.keyword}</p>
            <span className="text-[11px] font-semibold text-violet-700 bg-violet-50 px-2 py-0.5 rounded-full">
              {confidenceLabel(candidate)} · {candidate.score}/100
            </span>
          </div>
          <p className="mt-1.5 text-xs text-stone-500">
            Seen in {candidate.evidence.finding_count} unique findings across{" "}
            {candidate.evidence.seller_count} seller{candidate.evidence.seller_count === 1 ? "" : "s"} and{" "}
            {candidate.evidence.source_count} site{candidate.evidence.source_count === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onReview("reject")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            {busy === "reject" ? "Ignoring…" : "Ignore"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => onReview("approve")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {busy === "approve" ? "Adding…" : "Add to monitoring"}
          </button>
        </div>
      </div>

      <details className="group mt-3 rounded-lg bg-stone-50 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-stone-600">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          Why this was suggested
        </summary>
        <div className="mt-2 border-t border-stone-200 pt-2 space-y-1.5">
          {candidate.evidence.sample_titles.map((title) => (
            <p key={title} className="text-xs leading-5 text-stone-600">“{title}”</p>
          ))}
        </div>
      </details>
    </div>
  );
}

export function KeywordLearningPanel({ ipId, onKeywordsChanged }: KeywordLearningPanelProps) {
  const [report, setReport] = useState<KeywordLearningReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<{ keyword: string; action: "approve" | "reject" } | null>(null);
  const [error, setError] = useState("");
  const [showRejected, setShowRejected] = useState(false);
  const loadSequence = useRef(0);

  const load = useCallback(async (signal?: AbortSignal, background = false) => {
    const sequence = ++loadSequence.current;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await getKeywordLearningReport(ipId, signal);
      if (sequence === loadSequence.current) setReport(response.report);
    } catch (requestError) {
      if (
        sequence === loadSequence.current &&
        !(requestError instanceof DOMException && requestError.name === "AbortError")
      ) {
        setError(message(requestError));
      }
    } finally {
      if (sequence === loadSequence.current) {
        if (background) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [ipId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function review(candidate: KeywordLearningCandidate, action: "approve" | "reject") {
    setBusy({ keyword: candidate.normalized_keyword, action });
    setError("");
    try {
      const response = await reviewKeywordLearningSuggestion(ipId, candidate.keyword, action);
      setReport(response.report);
      onKeywordsChanged(response.keywords);
    } catch (requestError) {
      setError(message(requestError));
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="h-4 w-40 animate-pulse rounded bg-stone-100" />
        <div className="mt-3 h-14 animate-pulse rounded-lg bg-stone-50" />
      </div>
    );
  }

  const stateCopy = report ? STATE_COPY[report.state] : null;
  const reviewedQuality = report && report.metrics.reviewed_findings > 0
    ? Math.round((report.metrics.actionable_findings / report.metrics.reviewed_findings) * 100)
    : null;

  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50/60">
      <div className="border-b border-stone-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-stone-900">Keyword learning</h2>
              <p className="mt-0.5 text-xs leading-5 text-stone-500">
                Finds recurring product language in your monitoring results. Nothing is added without your approval.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load(undefined, true)}
            disabled={refreshing}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-500 hover:text-stone-900 disabled:opacity-50"
            aria-label="Refresh keyword learning report"
            title="Check for new suggestions"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
        </div>

        {stateCopy && (
          <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-violet-50/70 px-3 py-2.5">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-violet-950">{stateCopy.title}</p>
              <p className="mt-0.5 text-xs leading-5 text-violet-800">{stateCopy.detail}</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-5 mt-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {report && (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Findings analysed", report.evidence.findings_analyzed],
              ["New suggestions", report.metrics.new_suggestions],
              ["Approved", report.metrics.approved_keywords],
              ["Attributed findings", report.metrics.findings_from_learned_keywords],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                <p className="text-lg font-black tabular-nums text-stone-900">{value}</p>
                <p className="text-[11px] text-stone-500">{label}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">New suggestions</h3>
              <p className="text-[11px] text-stone-400">Last {report.evidence.lookback_days} days</p>
            </div>
            {report.suggestions.length > 0 ? (
              <div className="space-y-2">
                {report.suggestions.map((candidate) => (
                  <SuggestionCard
                    key={candidate.normalized_keyword}
                    candidate={candidate}
                    busy={busy?.keyword === candidate.normalized_keyword ? busy.action : null}
                    onReview={(action) => void review(candidate, action)}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
                <p className="text-sm font-semibold text-stone-700">No new suggestion passes the evidence threshold yet</p>
                <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-stone-500">
                  A phrase needs at least two independent findings and seller or site diversity. This avoids adding one-off listing noise.
                </p>
              </div>
            )}
          </div>

          {report.approved_keywords.length > 0 && (
            <div>
              <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">Is it working?</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Yield shows what each keyword found; the same listing can be attributed to more than one keyword. Quality becomes meaningful after review.
                  </p>
                </div>
                {reviewedQuality !== null && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                    {reviewedQuality}% actionable among reviewed
                  </div>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                {report.approved_keywords.map((item, index) => (
                  <div
                    key={item.decision_id}
                    className={`p-4 ${index > 0 ? "border-t border-stone-100" : ""}`}
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-bold text-stone-900">{item.keyword}</p>
                      <OutcomeBadge item={item} />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
                      <div><span className="font-bold text-stone-900">{item.monitoring_runs}</span><span className="ml-1 text-stone-500">runs</span></div>
                      <div><span className="font-bold text-stone-900">{item.findings_found}</span><span className="ml-1 text-stone-500">findings</span></div>
                      <div><span className="font-bold text-stone-900">{item.reviewed_findings}</span><span className="ml-1 text-stone-500">reviewed</span></div>
                      <div><span className="font-bold text-emerald-700">{item.actionable_findings}</span><span className="ml-1 text-stone-500">actionable</span></div>
                      <div><span className="font-bold text-stone-900">{item.dismissed_findings}</span><span className="ml-1 text-stone-500">dismissed</span></div>
                    </div>
                    <p className="mt-2 text-[11px] text-stone-400">Last monitoring run: {formatDate(item.last_run_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.rejected_keywords.length > 0 && (
            <div className="border-t border-stone-200 pt-3">
              <button
                type="button"
                onClick={() => setShowRejected((value) => !value)}
                className="flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-800"
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showRejected ? "rotate-180" : ""}`} aria-hidden="true" />
                {report.rejected_keywords.length} ignored suggestion{report.rejected_keywords.length === 1 ? "" : "s"}
              </button>
              {showRejected && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {report.rejected_keywords.map((item) => (
                    <span key={item.keyword} className="rounded-full bg-stone-200/70 px-2.5 py-1 text-xs text-stone-600">
                      {item.keyword}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
