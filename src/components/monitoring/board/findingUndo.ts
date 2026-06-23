import {
  reopenIpFinding,
  undismissIpFinding,
} from "../../../api";

export type MonitoringFindingUndoAction = {
  kind: "undismiss" | "reopen";
  ipId: string;
  resultId: string;
};

export function undoMonitoringFindingAction(action: MonitoringFindingUndoAction) {
  if (action.kind === "undismiss") {
    return undismissIpFinding(action.ipId, action.resultId);
  }
  return reopenIpFinding(action.ipId, action.resultId);
}
