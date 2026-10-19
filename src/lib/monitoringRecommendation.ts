import type { IpReviewFinding } from "../api/reviews";

type RecommendationSource = Pick<IpReviewFinding,
  "actionability" | "licensed_seller" | "manual_candidate_outcome" |
  "suggested_review_outcome" | "suggested_review_reason">;

/** An investigation is assessment progress, so it has no suggested action yet. */
export function monitoringRecommendation(finding: RecommendationSource) {
  const action = finding.actionability;
  const reason = action?.reason ?? "An assessment has not reached a conclusion yet.";
  const outcome = finding.manual_candidate_outcome ?? finding.suggested_review_outcome;
  if (finding.licensed_seller || action?.key === "licensed_seller")
    return { label: "Authorized seller", reason };
  if (action?.key === "allowed_resale") return { label: "Second hand", reason };
  if ((!action || action.key === "investigate") && finding.manual_candidate_outcome !== "do_not_pursue")
    return { label: null, reason };
  if (outcome === "do_not_pursue")
    return { label: "Do not pursue", reason: finding.suggested_review_reason || reason };
  switch (action?.key) {
    case "send_takedown": return { label: "Takedown recommended", reason };
    case "false_positive": return { label: "Different product", reason };
    case "do_not_pursue": return { label: "Do not pursue", reason };
    case "needs_review": return { label: "Legal review", reason };
    case "needs_triage": return { label: "Staff triage", reason };
    default: return { label: null, reason };
  }
}

export const assessmentPendingLabel = "Assessment pending";
export const assessmentPendingExplanation = "No suggested action yet. The listing evidence and any saved rules must be checked before a recommendation is ready.";

export function suggestionFilterLabel(value: string) {
  return ({ investigate: "No suggestion yet", needs_triage: "Staff triage", needs_review: "Legal review" })[value]
    ?? value.replaceAll("_", " ");
}
