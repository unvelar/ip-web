import type {
  MonitoringCandidateOutcome,
  MonitoringDismissalReasonFilter,
} from "../../../api";

// Shared clean style for the filter-bar dropdowns (IP / platform).
export const FILTER_SELECT =
  "px-2.5 py-1.5 rounded-lg border border-stone-200 text-[11px] bg-white text-stone-700 " +
  "max-w-[14rem] focus:outline-none focus:ring-1 focus:ring-stone-300";

export const DISMISSAL_REASON_LABELS: Record<MonitoringDismissalReasonFilter, string> = {
  false_positive: "False positive",
  do_not_pursue: "Don't pursue",
  second_hand: "Resale / second hand",
  licensed: "Licensed",
  allowed_product: "Allowed product",
  dead: "Dead link",
  manual_cleared: "Manual clear",
};

export const CANDIDATE_OUTCOME_LABELS: Record<MonitoringCandidateOutcome, string> = {
  second_hand: "Resale / second hand",
  takedown: "Review for takedown",
  do_not_pursue: "Don't pursue",
  false_positive: "False positive",
  none: "Unsorted",
};

export const CANDIDATE_OUTCOME_ORDER: MonitoringCandidateOutcome[] = [
  "second_hand",
  "takedown",
  "do_not_pursue",
  "false_positive",
  "none",
];

export type ResortTarget = MonitoringCandidateOutcome;
