import type { IpReviewFinding } from "../api/reviews";

type RecommendationSource = Pick<IpReviewFinding,
  "actionability" | "licensed_seller" | "manual_candidate_outcome" |
  "suggested_review_outcome" | "suggested_review_reason">;

export const assessmentPendingLabel = "Assessment pending";
export const assessmentPendingExplanation = "The listing evidence and any saved rules are being checked before a recommendation is ready.";

function assessmentPresentation(action: RecommendationSource['actionability']) {
  // Legacy APIs already distinguish terminal assessments by their domain label.
  const status=action?.assessment_status ?? (action?.label==='No infringement evidence'?'complete'
    : ['Evidence unavailable','Assessment incomplete'].includes(action?.label??'')?'inconclusive':action?.label==='Saved rules unavailable'?'failed':'pending');
  return status==='complete'?{assessmentLabel:'No supported action',assessmentExplanation:'Assessment complete. The available evidence does not support a recommended action.'}
    :status==='inconclusive'?{assessmentLabel:'Evidence inconclusive',assessmentExplanation:'The completed assessment could not resolve the evidence. New evidence is needed before recommending an action.'}
    :status==='failed'?{assessmentLabel:'Assessment unavailable',assessmentExplanation:'The assessment could not produce an accepted result. See the failure reason.'}
    :{assessmentLabel:assessmentPendingLabel,assessmentExplanation:assessmentPendingExplanation};
}

/** Recommendations and assessment progress are separate product states. */
export function monitoringRecommendation(finding: RecommendationSource) {
  const action = finding.actionability;
  const assessment=assessmentPresentation(action);
  const reason = action?.reason ?? "An assessment has not reached a conclusion yet.";
  const outcome = finding.manual_candidate_outcome ?? finding.suggested_review_outcome;
  if (finding.licensed_seller || action?.key === "licensed_seller")
    return { ...assessment,label: "Authorized seller", reason };
  if (action?.key === "allowed_resale") return { ...assessment,label: "Second hand", reason };
  if ((!action || action.key === "investigate") && finding.manual_candidate_outcome !== "do_not_pursue")
    return { ...assessment,label: null, reason };
  if (outcome === "do_not_pursue")
    return { ...assessment,label: "Do not pursue", reason: finding.suggested_review_reason || reason };
  switch (action?.key) {
    case "send_takedown": return { ...assessment,label: "Takedown recommended", reason };
    case "false_positive": return { ...assessment,label: "Different product", reason };
    case "do_not_pursue": return { ...assessment,label: "Do not pursue", reason };
    case "needs_review": return { ...assessment,label: "Legal review", reason };
    case "needs_triage": return { ...assessment,label: "Staff triage", reason };
    default: return { ...assessment,label: null, reason };
  }
}

export function suggestionFilterLabel(value: string) {
  return ({ investigate: "No suggestion yet", needs_triage: "Staff triage", needs_review: "Legal review" })[value]
    ?? value.replaceAll("_", " ");
}
