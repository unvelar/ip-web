import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  deleteIpReview,
  getIpReview,
  openIpReviewReport,
  setIpReviewMatchDecision,
  updateIpReviewDecision,
  type AnnotationShape,
  type IpReview,
  type IpReviewDecision,
  type IpReviewMatch,
  type IpReviewMatchDecision,
  type IpReviewMatchDecisionValue,
  type RightsType,
  type RiskBand,
} from "../api";
import { AnnotationCanvas, type Tool } from "../components/AnnotationCanvas";

/**
 * Result page for a single guided IP review. Mirrors the PDF layout 1:1
 * (header → verdict banner → verdict lines → matched references →
 * context → legal review → scope disclosure → evidence packet) so the
 * downloadable report reads as a faithful copy of what the lawyer just
 * approved on screen.
 *
 * Polls every 3s while `status === "processing"`.
 */
export default function IpReviewDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [review, setReview] = useState<IpReview | null>(null);
  const [error, setError] = useState("");
  // Decision modal: `null` = closed, otherwise the pending decision the
  // user clicked. Lets the modal prefill rationale + tailor the heading.
  const [pendingDecision, setPendingDecision] = useState<IpReviewDecision | null>(null);

  const reload = useCallback(async () => {
    try {
      const { review } = await getIpReview(id);
      setReview(review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load review");
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!review) return;
    // Clearance: poll only while the detection job is running.
    if (review.status !== "processing") return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [review, reload]);


  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-red-600">{error}</div>
    );
  }
  if (!review) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 text-sm text-stone-400">
        Loading review…
      </div>
    );
  }

  async function handleDelete() {
    if (!confirm("Delete this review?")) return;
    await deleteIpReview(id);
    navigate("/clearance");
  }

  // Clearance-only page. Monitoring now lives IP-scoped under /ips/:id.
  // The asset column reads activeMatchId from ClearanceContext, so the
  // provider must wrap both columns. We render the provider even when
  // there's no result yet — the sticky asset still shows the input.
  const matches = review.result?.matches ?? [];
  const decisions = review.match_decisions ?? [];
  const content = (
    <div className="max-w-screen-2xl mx-auto px-6 py-4 space-y-3">
      <Header
        review={review}
        onDecide={(d) => setPendingDecision(d)}
        onDelete={handleDelete}
        hideImage
        hideRiskStrip
      />
      {review.status === "processing" && <ProcessingNotice />}
      {review.status === "failed" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Review failed. The detection job hit an error — check the worker logs
          or rerun the wizard.
        </div>
      )}
      {review.status === "complete" && review.result && (
        <ClearanceComparison
          review={review}
          reload={reload}
        />
      )}
      {pendingDecision && (
        <DecisionModal
          review={review}
          pending={pendingDecision}
          onClose={() => setPendingDecision(null)}
          onUpdated={reload}
        />
      )}
    </div>
  );
  return review.status === "complete" && review.result ? (
    <ClearanceProvider
      matches={matches}
      decisions={decisions}
      reviewId={review.id}
      onUpdated={reload}
    >
      {content}
    </ClearanceProvider>
  ) : (
    content
  );
}

function Header({
  review,
  onDecide,
  onDelete,
  hideImage = false,
  hideRiskStrip = false,
}: {
  review: IpReview;
  onDecide: (d: IpReviewDecision) => void;
  onDelete: () => void;
  hideImage?: boolean;
  hideRiskStrip?: boolean;
}) {
  const showRiskStrip =
    !hideRiskStrip && review.status === "complete" && !!review.result;
  const showDecisionCtas = review.status === "complete";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-5">
        {!hideImage && review.asset_image_url && (
          <img
            src={review.asset_image_url}
            alt=""
            className="w-40 h-40 lg:w-56 lg:h-56 rounded-xl object-cover border border-stone-200 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight truncate">{review.title}</h1>
              <div className="text-xs text-stone-400 mt-0.5">
                Clearance review
                {" · "}created {new Date(review.created_at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {!showDecisionCtas && <StatusPill status={review.status} />}
              {showDecisionCtas && (
                <DecisionCta review={review} onDecide={onDecide} />
              )}
              {review.status === "complete" && (
                <ExportPdfButton reviewId={review.id} />
              )}
              <button
                type="button"
                onClick={onDelete}
                title="Delete review"
                className="px-2 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-xs font-semibold"
              >
                Delete
              </button>
            </div>
          </div>
          {showRiskStrip && review.result && (
            <RiskStrip segments={review.result.segments} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Header CTA for the binary clearance decision. Before a decision is
 * locked, shows two primary buttons (Clear asset / Do not clear). After,
 * collapses into a colored verdict pill with an inline Edit affordance
 * so the reviewer can revise.
 */
function DecisionCta({
  review,
  onDecide,
}: {
  review: IpReview;
  onDecide: (d: IpReviewDecision) => void;
}) {
  if (review.decision === "cleared") {
    return (
      <button
        type="button"
        onClick={() => onDecide("cleared")}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
      >
        Cleared · Edit
      </button>
    );
  }
  if (review.decision === "not_cleared") {
    return (
      <button
        type="button"
        onClick={() => onDecide("not_cleared")}
        className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
      >
        Not cleared · Edit
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => onDecide("cleared")}
        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
      >
        Clear asset
      </button>
      <button
        type="button"
        onClick={() => onDecide("not_cleared")}
        className="px-3 py-1.5 rounded-lg border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50"
      >
        Do not clear
      </button>
    </>
  );
}

function StatusPill({ status }: { status: IpReview["status"] }) {
  const cls =
    status === "complete"
      ? "bg-emerald-100 text-emerald-700"
      : status === "failed"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-700";
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function ProcessingNotice() {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-800">
      Detection running. The page refreshes every few seconds.
    </div>
  );
}

const RIGHTS_LABEL: Record<RightsType, string> = {
  copyright: "Copyright",
  trademark: "Trademark",
  design: "Design right",
  publicity: "Publicity / likeness",
};

// One-line plain-English subtitle, shown directly under the label so a
// non-lawyer can decode each rights type without hovering. Tooltip below
// has the full explanation.
const RIGHTS_SUBTITLE: Record<RightsType, string> = {
  copyright: "Creative works (art, characters)",
  trademark: "Brand names & logos",
  design: "Product shape & appearance",
  publicity: "A real person's image or name",
};

// Tooltip copy — long-form explanation on hover. A single match can fire
// multiple rights (e.g. a character match fires both copyright and
// publicity), so identical scores across two segments mean the same
// match contributed to both, not that they're separately scored.
const RIGHTS_TOOLTIP: Record<RightsType, string> = {
  copyright:
    "Original creative works (illustrations, characters, designs). Protection arises on creation; no registration needed.",
  trademark:
    "Registered brand identifiers (names, logos, slogans) — scoped to a class of goods or services.",
  design:
    "Registered design protecting a product's appearance or ornamental aspects (shape, pattern, packaging).",
  publicity:
    "Controls commercial use of a real person's likeness — name, face, voice. For fictional characters tied to a real performer, it can fire alongside copyright.",
};

const RISK_COLOR: Record<RiskBand, { box: string; chip: string; text: string }> = {
  high:   { box: "border-red-200 bg-red-50/60",   chip: "bg-red-100 text-red-700",     text: "text-red-700" },
  medium: { box: "border-amber-200 bg-amber-50/60", chip: "bg-amber-100 text-amber-700", text: "text-amber-700" },
  low:    { box: "border-yellow-200 bg-yellow-50/60", chip: "bg-yellow-100 text-yellow-700", text: "text-yellow-700" },
  clear:  { box: "border-emerald-200 bg-emerald-50/40", chip: "bg-emerald-100 text-emerald-700", text: "text-emerald-700" },
};

/**
 * Risk-by-IP-type grid. Each match routes to one *or more* rights types
 * (e.g. a "character" match fires both copyright and publicity from the
 * same evidence), so the segments aren't independently scored — two
 * segments with identical scores almost always reflect the *same match*
 * counted twice. We merge rights that share a match set into a single
 * card to make that explicit, instead of showing the same number twice
 * and confusing the reader.
 */
function RiskStrip({
  segments,
  compact = false,
}: {
  segments: Record<RightsType, { risk_band: RiskBand; top_score: number; match_ids: string[] }>;
  compact?: boolean;
}) {
  const groups = useMemo(() => groupSegmentsByMatches(segments), [segments]);
  return (
    <div>
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">
        Risk by IP type
      </h2>
      <div className={compact ? "grid grid-cols-2 gap-1.5" : "grid grid-cols-2 gap-2"}>
        {groups.map((g) => {
          const c = RISK_COLOR[g.risk_band];
          const n = g.match_ids.length;
          const tooltip = g.rights.map((r) => `${RIGHTS_LABEL[r]} — ${RIGHTS_TOOLTIP[r]}`).join("\n\n");
          if (compact) {
            return (
              <div
                key={g.rights.join("+")}
                title={tooltip}
                className={`rounded-md border px-2 py-1.5 ${c.box} cursor-help`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold text-stone-700 truncate leading-tight">
                      {g.rights.map((r) => RIGHTS_LABEL[r]).join(" + ")}
                    </div>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className={`text-sm font-bold leading-none ${c.text}`}>
                        {Math.round(g.top_score * 100)}%
                      </span>
                      <span className="text-[9px] text-stone-500">
                        {n} match{n === 1 ? "" : "es"}
                      </span>
                    </div>
                  </div>
                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase shrink-0 ${c.chip}`}>
                    {g.risk_band}
                  </span>
                </div>
              </div>
            );
          }
          return (
            <div
              key={g.rights.join("+")}
              title={tooltip}
              className={`rounded-lg border px-3 py-2 ${c.box} cursor-help`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-stone-700 truncate">
                    {g.rights.map((r) => RIGHTS_LABEL[r]).join(" + ")}
                  </div>
                  <div className="text-[10px] text-stone-500 truncate">
                    {g.rights.map((r) => RIGHTS_SUBTITLE[r]).join(" · ")}
                  </div>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 ${c.chip}`}>
                  {g.risk_band}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                <span className={`text-lg font-bold leading-none ${c.text}`}>
                  {Math.round(g.top_score * 100)}%
                </span>
                <span className="text-[10px] text-stone-500">
                  {n} match{n === 1 ? "" : "es"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RiskGroup {
  rights: RightsType[];
  risk_band: RiskBand;
  top_score: number;
  match_ids: string[];
}

/**
 * Group rights segments that share an identical match set. Segments with
 * matches are merged on the *sorted match_ids signature*; empty segments
 * (no matches, score 0, band "clear") stay as individual cards so the
 * reader still sees the 4 IP categories. Order is preserved per
 * ALL_RIGHTS so the strip reads left→right consistently.
 */
function groupSegmentsByMatches(
  segments: Record<RightsType, { risk_band: RiskBand; top_score: number; match_ids: string[] }>,
): RiskGroup[] {
  const order: RightsType[] = ["copyright", "trademark", "design", "publicity"];
  const groups: RiskGroup[] = [];
  const seenKeys = new Map<string, RiskGroup>();
  for (const r of order) {
    const s = segments[r];
    if (!s) continue;
    if (s.match_ids.length === 0) {
      groups.push({ rights: [r], risk_band: s.risk_band, top_score: s.top_score, match_ids: [] });
      continue;
    }
    const key = [...s.match_ids].sort().join("|");
    const existing = seenKeys.get(key);
    if (existing) {
      existing.rights.push(r);
    } else {
      const g: RiskGroup = {
        rights: [r],
        risk_band: s.risk_band,
        top_score: s.top_score,
        match_ids: s.match_ids,
      };
      seenKeys.set(key, g);
      groups.push(g);
    }
  }
  return groups;
}

const SOURCE_LABEL: Record<string, string> = {
  euipo_trademark: "EUIPO registered trademark",
  wipo_design: "WIPO Hague registered design",
  giantbomb: "Internal copyright reference (pop-culture)",
  tenant_trademark: "Tenant-registered IP",
};

function sourceLabel(s: string) {
  return SOURCE_LABEL[s] ?? s;
}

/**
 * Unified sort/badge score. Exact-IP matches rank by the calibrated combined
 * score; look-alikes (distinct IP, no calibrator signal) rank by raw visual
 * similarity. Both render in one strip sorted by this value.
 */
function displayScore(m: IpReviewMatch): number {
  return m.relationship === "lookalike"
    ? m.scores.visual_similarity ?? 0
    : m.scores.calibrator_combined ?? 0;
}

/**
 * Helpers for clearance match state. Both columns (sticky asset + matches
 * list) read the same `activeMatchId` so the asset panel always knows which
 * match's annotations it's editing. The state lives on the page-level
 * `IpReviewDetail` and is threaded through via a small context.
 */
type ClearanceCtx = {
  activeMatchId: string | null;
  setActiveMatchId: (id: string) => void;
  sortedMatches: IpReviewMatch[];
  decisionByMatch: Map<string, IpReviewMatchDecision>;
  reviewId: string;
  onUpdated: () => void;
};

const ClearanceContext = createContext<ClearanceCtx | null>(null);

function useClearance() {
  const v = useContext(ClearanceContext);
  if (!v) throw new Error("useClearance must be used inside ClearanceProvider");
  return v;
}

function ClearanceProvider({
  matches,
  decisions,
  reviewId,
  onUpdated,
  children,
}: {
  matches: IpReviewMatch[];
  decisions: IpReviewMatchDecision[];
  reviewId: string;
  onUpdated: () => void;
  children: React.ReactNode;
}) {
  const sorted = useMemo(() => {
    const seen = new Set<string>();
    const unique: IpReviewMatch[] = [];
    for (const m of matches) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      unique.push(m);
    }
    return unique.sort((a, b) => displayScore(b) - displayScore(a));
  }, [matches]);

  const decisionByMatch = useMemo(() => {
    const map = new Map<string, IpReviewMatchDecision>();
    for (const d of decisions) map.set(d.match_id, d);
    return map;
  }, [decisions]);

  const [explicit, setExplicit] = useState<string | null>(null);
  const activeMatchId =
    (explicit && sorted.some((m) => m.id === explicit) ? explicit : sorted[0]?.id) ?? null;

  return (
    <ClearanceContext.Provider
      value={{
        activeMatchId,
        setActiveMatchId: setExplicit,
        sortedMatches: sorted,
        decisionByMatch,
        reviewId,
        onUpdated,
      }}
    >
      {children}
    </ClearanceContext.Provider>
  );
}

/**
 * Square frame used for BOTH the input image and the active reference. By
 * using the same wrapper on both sides, the two images render at identical
 * size and Y position when placed in a grid of equal-width columns. The
 * `max-h-[70vh]` keeps the pair from overflowing the viewport on shorter
 * monitors — the column width still wins on wide monitors.
 */
function ImageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[70vh] mx-auto aspect-square bg-stone-50 border border-stone-200 rounded-lg overflow-hidden">
      {children}
    </div>
  );
}

/**
 * Left column for the comparison: input image + annotation toolbar. Drawing
 * on the image implicitly flags the currently-active match (the drawing is
 * itself the signal of concern).
 */
function InputComparisonColumn({
  assetImageUrl,
  onUpdated,
}: {
  assetImageUrl: string;
  onUpdated: () => void;
}) {
  const { activeMatchId, sortedMatches, decisionByMatch, reviewId } = useClearance();
  const activeMatch = sortedMatches.find((m) => m.id === activeMatchId) ?? null;
  const activeDecision = activeMatchId ? decisionByMatch.get(activeMatchId) ?? null : null;

  const [tool, setTool] = useState<Tool>("pen");
  const [localByMatch, setLocalByMatch] = useState<Record<string, AnnotationShape[]>>({});

  const display: AnnotationShape[] = activeMatchId
    ? localByMatch[activeMatchId] ?? activeDecision?.annotations ?? []
    : [];

  const canDraw = activeMatch !== null;

  async function persist(next: AnnotationShape[]) {
    if (!activeMatch) return;
    try {
      await setIpReviewMatchDecision(reviewId, activeMatch.id, {
        decision: "flag",
        note: activeDecision?.note ?? null,
        annotations: next.length > 0 ? next : null,
      });
      onUpdated();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save annotations");
    }
  }

  function handleChange(next: AnnotationShape[]) {
    if (!activeMatchId) return;
    setLocalByMatch((prev) => ({ ...prev, [activeMatchId]: next }));
    void persist(next);
  }

  return (
    <div className="space-y-2">
      <ImageFrame>
        {assetImageUrl ? (
          <AnnotationCanvas
            key={activeMatchId ?? "none"}
            src={assetImageUrl}
            value={display}
            onChange={canDraw ? handleChange : undefined}
            tool={canDraw ? tool : undefined}
            readOnly={!canDraw}
          />
        ) : (
          <div className="w-full h-full bg-stone-100" />
        )}
      </ImageFrame>
      <div className="flex items-center gap-1 flex-wrap">
        {(["pen", "ellipse", "arrow", "text"] as Tool[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={!canDraw}
            onClick={() => setTool(t)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border ${
              tool === t && canDraw
                ? "bg-stone-900 text-white border-stone-900"
                : "border-stone-300 text-stone-700 hover:bg-stone-50"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {t === "pen" ? "Pen" : t === "ellipse" ? "Circle" : t === "arrow" ? "Arrow" : "Text"}
          </button>
        ))}
        <button
          type="button"
          disabled={!canDraw || display.length === 0}
          onClick={() => handleChange([])}
          className="ml-auto px-2 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/**
 * Top-level layout for the clearance comparison view. Renders a compact
 * metadata bar + thumbnail strip across the full page width, then a 2-col
 * grid with input on the left and the active reference on the right. Both
 * images use ImageFrame so they're guaranteed equal-sized and aligned.
 */
function ClearanceComparison({
  review,
  reload,
}: {
  review: IpReview;
  reload: () => void;
}) {
  // Fold look-alikes into the same list as exact-IP matches so the strip is one
  // queue sorted by score. Tagged here so display/sort treats them distinctly
  // regardless of whether the backend set `relationship`.
  const lookalikes = (review.result?.lookalikes ?? []).map(
    (m) => ({ ...m, relationship: "lookalike" as const }),
  );
  const matches = [...(review.result?.matches ?? []), ...lookalikes];
  const decisions = review.match_decisions ?? [];
  return (
    <ClearanceProvider
      matches={matches}
      decisions={decisions}
      reviewId={review.id}
      onUpdated={reload}
    >
      <ClearanceComparisonInner review={review} onUpdated={reload} />
    </ClearanceProvider>
  );
}

function ClearanceComparisonInner({
  review,
  onUpdated,
}: {
  review: IpReview;
  onUpdated: () => void;
}) {
  const {
    sortedMatches,
    decisionByMatch,
    activeMatchId,
    setActiveMatchId,
    reviewId,
  } = useClearance();
  const active = sortedMatches.find((m) => m.id === activeMatchId) ?? null;
  const activeDecision = active ? decisionByMatch.get(active.id) ?? null : null;

  return (
    <div className="space-y-3">
      <MetadataBar review={review} />
      {sortedMatches.length === 0 ? (
        <div className="text-xs text-stone-400">No matches above threshold.</div>
      ) : (
        // Two-row grid: top row holds the thumbnail strip (left) and the
        // active-match details (right). Bottom row holds the two images.
        // grid-rows-[auto_auto] keeps the top row the same height in both
        // columns, so the input + reference images always start at the
        // same Y position even when one top cell is taller than the other.
        <div className="grid grid-cols-2 grid-rows-[auto_auto] gap-x-4 gap-y-2 items-start">
          <ThumbnailStrip
            matches={sortedMatches}
            decisionByMatch={decisionByMatch}
            activeId={activeMatchId}
            onPick={setActiveMatchId}
          />
          {active ? (
            <ReferenceDetailsPanel
              m={active}
              reviewId={reviewId}
              decision={activeDecision}
              onUpdated={onUpdated}
            />
          ) : (
            <div />
          )}
          <InputComparisonColumn
            assetImageUrl={review.asset_image_url ?? ""}
            onUpdated={onUpdated}
          />
          <ImageFrame>
            {active?.reference_images?.[0]?.image_url ? (
              <img
                src={active.reference_images[0].image_url}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full bg-stone-100" />
            )}
          </ImageFrame>
        </div>
      )}
    </div>
  );
}

/**
 * Compact horizontal bar that consolidates the previously stacked Risk,
 * Context, and Findings sections into a single row above the comparison.
 * Findings + scope collapse into a <details> so the bar stays short.
 */
function MetadataBar({ review }: { review: IpReview }) {
  if (!review.result) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 flex items-stretch gap-4 flex-wrap text-[11px]">
      <RiskPills segments={review.result.segments} />
      <div className="h-auto w-px bg-stone-200" />
      <ContextChips review={review} />
      <div className="h-auto w-px bg-stone-200" />
      <FindingsExpander
        verdictLines={review.result.verdict_lines}
        scopeLines={review.result.scope_disclosure}
      />
    </div>
  );
}

function RiskPills({
  segments,
}: {
  segments: Record<RightsType, { risk_band: RiskBand; top_score: number; match_ids: string[] }>;
}) {
  const groups = useMemo(() => groupSegmentsByMatches(segments), [segments]);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {groups.map((g) => {
        const c = RISK_COLOR[g.risk_band];
        const n = g.match_ids.length;
        return (
          <div
            key={g.rights.join("+")}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 ${c.box}`}
            title={g.rights.map((r) => `${RIGHTS_LABEL[r]} — ${RIGHTS_TOOLTIP[r]}`).join("\n\n")}
          >
            <span className={`text-sm font-bold ${c.text}`}>
              {Math.round(g.top_score * 100)}%
            </span>
            <span className="text-[10px] font-semibold text-stone-700">
              {g.rights.map((r) => RIGHTS_LABEL[r]).join(" + ")}
            </span>
            <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase ${c.chip}`}>
              {g.risk_band}
            </span>
            <span className="text-[9px] text-stone-500">
              {n} match{n === 1 ? "" : "es"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ContextChips({ review }: { review: IpReview }) {
  const items: Array<[string, string]> = [
    ["Type", review.asset_type || "—"],
    ["Use", review.intended_use || "—"],
    ["Placement", review.asset_placement || "—"],
    ["Territories", review.territories.length ? review.territories.join(", ") : "All"],
    ["Categories", review.product_categories.length ? review.product_categories.join(", ") : "—"],
  ];
  return (
    <div className="flex items-center gap-3 flex-wrap min-w-0">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-1 min-w-0">
          <span className="text-[9px] uppercase tracking-wider text-stone-500 shrink-0">{k}</span>
          <span className="text-stone-800 truncate" title={v}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function FindingsExpander({
  verdictLines,
  scopeLines,
}: {
  verdictLines: string[];
  scopeLines: string[];
}) {
  if (verdictLines.length === 0 && scopeLines.length === 0) return null;
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[10px] uppercase tracking-wider text-stone-500 hover:text-stone-700 list-none flex items-center gap-1">
        <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
        Findings
      </summary>
      <div className="mt-2 space-y-2">
        {verdictLines.length > 0 && (
          <ul className="space-y-1 text-[11px] text-stone-700 list-disc pl-4 leading-snug">
            {verdictLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {scopeLines.length > 0 && (
          <details>
            <summary className="text-[9px] uppercase tracking-wider text-stone-500 cursor-pointer">
              Search scope
            </summary>
            <ul className="mt-1 space-y-1 text-[10px] text-stone-500 list-disc pl-4 leading-snug">
              {scopeLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </details>
  );
}

/**
 * Clickable horizontal row of small reference thumbs. Each thumb shows the
 * IP name, combined-score badge, and a flagged/dismissed indicator so the
 * lawyer can scan the queue at a glance. Active thumb is outlined.
 */
function ThumbnailStrip({
  matches,
  decisionByMatch,
  activeId,
  onPick,
}: {
  matches: IpReviewMatch[];
  decisionByMatch: Map<string, IpReviewMatchDecision>;
  activeId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {matches.map((m) => {
        const decision = decisionByMatch.get(m.id);
        const isActive = m.id === activeId;
        const ref = m.reference_images?.[0]?.image_url;
        const score = Math.round(displayScore(m) * 100);
        const isLookalike = m.relationship === "lookalike";
        const ringClass = isActive
          ? "ring-2 ring-stone-900 border-stone-900"
          : decision?.decision === "flag"
            ? "border-red-300"
            : decision?.decision === "dismiss"
              ? "border-stone-200 opacity-60"
              : "border-stone-200";
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onPick(m.id)}
            className={`shrink-0 w-28 rounded-lg border bg-white p-1.5 text-left hover:border-stone-400 transition-colors ${ringClass}`}
            title={m.ip_name || ""}
          >
            <div className="w-full aspect-square rounded-md bg-stone-50 border border-stone-200 overflow-hidden">
              {ref ? (
                <img src={ref} alt="" className="w-full h-full object-contain" />
              ) : null}
            </div>
            <div className="mt-1 flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-stone-800 truncate">
                {m.ip_name || "—"}
              </span>
              <span className="text-[9px] text-stone-500 shrink-0">{score}%</span>
            </div>
            {isLookalike && (
              <div className="mt-0.5 text-[8px] uppercase tracking-wider font-bold text-amber-600">
                Look-alike
              </div>
            )}
            {decision && (
              <div className="mt-0.5 text-[8px] uppercase tracking-wider font-bold">
                <span
                  className={
                    decision.decision === "flag"
                      ? "text-red-600"
                      : "text-stone-400"
                  }
                >
                  {decision.decision === "flag" ? "Flagged" : "Dismissed"}
                </span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

const DECISION_CHIP: Record<IpReviewMatchDecisionValue, string> = {
  flag: "bg-red-100 text-red-700 border-red-200",
  dismiss: "bg-stone-100 text-stone-600 border-stone-200",
};

const DECISION_LABEL: Record<IpReviewMatchDecisionValue, string> = {
  flag: "Flagged",
  dismiss: "Dismissed",
};

function ReferenceDetailsPanel({
  m,
  reviewId,
  decision,
  onUpdated,
}: {
  m: IpReviewMatch;
  reviewId: string;
  decision: IpReviewMatchDecision | null;
  onUpdated: () => void;
}) {
  const [showJustification, setShowJustification] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(decision?.note ?? "");
  const [saving, setSaving] = useState(false);

  async function commit(next: IpReviewMatchDecisionValue | null, note: string | null) {
    setSaving(true);
    try {
      const annotations = next === "flag" ? decision?.annotations ?? null : null;
      await setIpReviewMatchDecision(reviewId, m.id, { decision: next, note, annotations });
      onUpdated();
      setNoteOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save decision");
    } finally {
      setSaving(false);
    }
  }

  const current = decision?.decision ?? null;

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="flex flex-col gap-2">
        <div className="min-w-0 w-full">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="font-semibold text-sm text-stone-900 truncate">
                {m.ip_name || "—"}
              </div>
              <div className="text-[11px] text-stone-500 mt-0.5">
                {sourceLabel(m.catalog_source)}
              </div>
              {m.relationship === "lookalike" && (
                <div className="text-[11px] text-amber-600 mt-0.5">
                  Look-alike — distinct IP per automated check, resemblance may warrant review
                </div>
              )}
            </div>
            {current && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${DECISION_CHIP[current]}`}
              >
                {DECISION_LABEL[current]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Score label="visual" value={m.scores.visual_similarity} />
            <Score label="structural" value={Math.min(1, m.scores.structural_inliers / 30)} />
            {m.scores.ocr_match > 0 && (
              <Score label="OCR" value={m.scores.ocr_match} />
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {m.rights_types.map((r) => (
              <span
                key={r}
                title={RIGHTS_TOOLTIP[r]}
                className="px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-700 cursor-help"
              >
                <span className="font-semibold">{RIGHTS_LABEL[r]}</span>
                <span className="text-stone-500"> · {RIGHTS_SUBTITLE[r]}</span>
              </span>
            ))}
            {m.in_scope_territories.slice(0, 4).map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-600">
                {t}
              </span>
            ))}
            {m.in_scope_territories.length > 4 && (
              <span className="text-[10px] text-stone-400">+{m.in_scope_territories.length - 4}</span>
            )}
            {m.category_overlap && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                category overlap
              </span>
            )}
          </div>

          {m.justification && (
            <button
              onClick={() => setShowJustification((v) => !v)}
              className="mt-2 text-[11px] text-stone-500 hover:text-stone-700"
            >
              {showJustification ? "Hide reasoning" : "Show reasoning"}
            </button>
          )}
          {showJustification && m.justification && (
            <p className="mt-1.5 text-xs text-stone-600 leading-relaxed">
              {m.justification}
            </p>
          )}

          {decision?.note && !noteOpen && (
            <p className="mt-2 text-[11px] text-stone-600 leading-relaxed border-l-2 border-stone-200 pl-2">
              <span className="text-stone-400">Note: </span>
              {decision.note}
            </p>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                if (current === "flag") {
                  void commit(null, null);
                } else {
                  setNoteDraft(decision?.note ?? "");
                  setNoteOpen(true);
                }
              }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                current === "flag"
                  ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                  : "border-red-300 text-red-700 hover:bg-red-50"
              } disabled:opacity-50`}
            >
              {current === "flag" ? "Unflag" : "Flag as infringement"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() =>
                commit(current === "dismiss" ? null : "dismiss", decision?.note ?? null)
              }
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                current === "dismiss"
                  ? "bg-stone-700 text-white border-stone-700 hover:bg-stone-800"
                  : "border-stone-300 text-stone-700 hover:bg-stone-50"
              } disabled:opacity-50`}
            >
              {current === "dismiss" ? "Undismiss" : "Dismiss"}
            </button>
            {current === "flag" && !noteOpen && (
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setNoteDraft(decision?.note ?? "");
                  setNoteOpen(true);
                }}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold border border-stone-300 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {decision?.note ? "Edit note" : "Add note"}
              </button>
            )}
          </div>

          {noteOpen && (
            <div className="mt-3 space-y-2">
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Why is this risky? (optional)"
                rows={3}
                className="w-full text-xs rounded-md border border-stone-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => commit("flag", noteDraft.trim() || null)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save as flagged"}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setNoteOpen(false)}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold text-stone-600 hover:bg-stone-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-stone-700">
      <span className="text-stone-400">{label}</span>
      <span className="font-semibold">{Math.round(value * 100)}%</span>
    </span>
  );
}

/**
 * Confirmation modal for the binary clearance decision. Rationale is
 * required when marking *Not cleared* — that's the path that blocks the
 * asset, so the reviewer must say why. Optional when clearing.
 */
function DecisionModal({
  review,
  pending,
  onClose,
  onUpdated,
}: {
  review: IpReview;
  pending: IpReviewDecision;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const prefill = review.decision === pending ? review.decision_rationale ?? "" : "";
  const [rationale, setRationale] = useState(prefill);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCleared = pending === "cleared";
  const rationaleRequired = !isCleared;
  const trimmed = rationale.trim();
  const canSave = !saving && (!rationaleRequired || trimmed.length > 0);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await updateIpReviewDecision(review.id, {
        decision: pending,
        decision_rationale: trimmed || null,
      });
      onUpdated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const heading = isCleared ? "Clear this asset" : "Do not clear this asset";
  const subtitle = isCleared
    ? "Marks the review as cleared. Rationale optional."
    : "Marks the review as not cleared. Rationale required.";
  const confirmCls = isCleared
    ? "bg-emerald-600 hover:bg-emerald-700"
    : "bg-red-600 hover:bg-red-700";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl border border-stone-200 max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-stone-900">{heading}</h3>
            <div className="text-[11px] text-stone-500 mt-0.5">{subtitle}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-stone-400 hover:text-stone-700 text-lg font-bold leading-none px-2"
          >
            ×
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          <label className="block text-[11px] uppercase tracking-wider text-stone-500 mb-1.5">
            Rationale{rationaleRequired && <span className="text-red-600"> *</span>}
          </label>
          <textarea
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            rows={5}
            placeholder={
              isCleared
                ? "Optional — visible on the report."
                : "Required — explain why the asset is not cleared. Visible on the report."
            }
            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
          />
          {err && <div className="text-xs text-red-600 mt-2">{err}</div>}
          {review.decided_at && (
            <div className="text-[11px] text-stone-500 mt-2">
              Last decision {new Date(review.decided_at).toLocaleString()}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-stone-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50 ${confirmCls}`}
          >
            {saving ? "Saving…" : isCleared ? "Confirm: Clear asset" : "Confirm: Do not clear"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExportPdfButton({ reviewId }: { reviewId: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await openIpReviewReport(reviewId);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed to open report");
        } finally {
          setLoading(false);
        }
      }}
      className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 disabled:opacity-50"
    >
      {loading ? "Preparing…" : "Export PDF"}
    </button>
  );
}
