import type { ProtectedTermAssessment } from "../../../api/reviews";

export default function ProtectedTermEvidence({ assessment }: { assessment?: ProtectedTermAssessment | null }) {
  if (assessment?.outcome !== "matched") return null;
  return <section aria-label="Protected term evidence" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
    <div><h3 className="text-sm font-semibold text-stone-900">Protected term evidence</h3><p className="mt-1 text-xs text-stone-600">The listing describes a product using a protected name or design. Check authorization and applicable exceptions before taking action.</p></div>
    {assessment.decisions.filter((decision) => decision.use === "reproduction_offer").map((decision) => <div key={decision.term_id} className="space-y-2">
      <p className="text-sm font-semibold text-stone-900">{decision.term}</p>
      <p className="text-xs text-stone-600">Item for sale: {decision.item_for_sale}</p>
      {decision.evidence.map((evidence, index) => <div key={index}><p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{evidence.field}</p><blockquote className="mt-1 border-l-2 border-amber-300 pl-3 text-sm leading-relaxed text-stone-800 whitespace-pre-wrap break-words">{evidence.quote}</blockquote></div>)}
      <p className="text-sm leading-relaxed text-stone-700">{decision.explanation}</p>
      <p className="text-xs text-stone-500">Resale considered: {decision.resale_considered}</p>
      {decision.visual_explanation && <p className="text-xs text-stone-500">Photo context: {decision.visual_explanation}</p>}
    </div>)}
    <p className="text-[10px] text-stone-500">Captured {new Date(assessment.listing.captured_at).toLocaleString()}</p>
  </section>;
}
