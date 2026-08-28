import { useRef, useState } from "react";
import {
  dismissIpFinding,
  getMonitoringFinding,
  type IpReviewFinding,
  type MonitoringDismissReasonCode,
  type MonitoringReviewOutcome,
  type ProductGroupCorrectionReason,
} from "../../../api";
import { FindingInspector } from "./FindingInspector";

export type ManagedFindingDecision =
  | { type: "dismissed" }
  | { type: "review" }
  | { type: "takedown_sent" }
  | { type: "enforced" }
  | { type: "licensed"; dismissedCount: number }
  | { type: "resolved" };

export function ManagedFindingInspector({
  finding,
  ipId,
  showIp,
  onClose,
  onResolved,
  onDecision,
  onFindingChange,
  onError,
  onAddRelatedToBatch = () => undefined,
  productGroupId,
  onCorrectProductGroup,
  showRelatedItems,
  taskHref,
  navigation,
}: {
  finding: IpReviewFinding;
  ipId?: string;
  showIp?: boolean;
  onClose: () => void;
  onResolved?: (decision: ManagedFindingDecision) => void;
  onDecision?: (decision: ManagedFindingDecision) => void;
  onFindingChange?: (finding: IpReviewFinding) => void;
  onError?: (message: string) => void;
  onAddRelatedToBatch?: (findings: IpReviewFinding[]) => void;
  productGroupId?: string;
  onCorrectProductGroup?: (reason: ProductGroupCorrectionReason) => Promise<void>;
  showRelatedItems?: boolean;
  taskHref?: string;
  navigation?: {
    position: number;
    total: number;
    onPrevious?: () => void;
    onNext?: () => void;
  };
}) {
  const [refreshedFinding, setRefreshedFinding] = useState<IpReviewFinding | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [error, setError] = useState("");
  const pendingDecisionRef = useRef<ManagedFindingDecision | null>(null);
  const currentFinding = refreshedFinding?.result_id === finding.result_id
    ? refreshedFinding
    : finding;
  const resolvedIpId = currentFinding.ip_id ?? ipId;

  function reportError(caught: unknown, fallback: string) {
    const message = caught instanceof Error ? caught.message : fallback;
    setError(message);
    onError?.(message);
  }

  function resolve(decision: ManagedFindingDecision) {
    onDecision?.(decision);
    if (onResolved) onResolved(decision);
    else onClose();
  }

  function rememberDecision(decision: ManagedFindingDecision) {
    pendingDecisionRef.current = decision;
  }

  async function dismiss(
    reason: MonitoringReviewOutcome,
    reasonCode?: MonitoringDismissReasonCode,
  ) {
    if (dismissing) return;
    if (!resolvedIpId) {
      reportError(null, "Cannot update this finding because it has no associated IP.");
      return;
    }
    setDismissing(true);
    setError("");
    try {
      await dismissIpFinding(resolvedIpId, currentFinding.result_id, {
        reason,
        ...(reasonCode ? { reason_code: reasonCode } : {}),
      });
      resolve({ type: "dismissed" });
    } catch (caught: unknown) {
      reportError(caught, "Unable to update this finding.");
    } finally {
      setDismissing(false);
    }
  }

  async function refresh() {
    setError("");
    try {
      const result = await getMonitoringFinding(currentFinding.result_id);
      setRefreshedFinding(result.finding);
      onFindingChange?.(result.finding);
    } catch (caught: unknown) {
      reportError(caught, "Unable to refresh this finding.");
    }
  }

  return (
    <FindingInspector
      f={currentFinding}
      ipId={resolvedIpId}
      showIp={showIp}
      isDismissed={Boolean(currentFinding.dismissed_at)}
      isDismissing={dismissing}
      onClose={onClose}
      onDismiss={(reason, reasonCode) => void dismiss(reason, reasonCode)}
      onActionComplete={() => {
        const decision = pendingDecisionRef.current ?? { type: "resolved" as const };
        pendingDecisionRef.current = null;
        resolve(decision);
      }}
      onNeedsReview={() => rememberDecision({ type: "review" })}
      onTakedownSent={() => rememberDecision({ type: "takedown_sent" })}
      onEnforced={() => rememberDecision({ type: "enforced" })}
      onLicensed={(dismissedCount) => rememberDecision({ type: "licensed", dismissedCount })}
      onUpdated={(options) => {
        if (!options?.completed) void refresh();
      }}
      onAddRelatedToBatch={onAddRelatedToBatch}
      productGroupId={productGroupId}
      onCorrectProductGroup={onCorrectProductGroup}
      showRelatedItems={showRelatedItems}
      taskHref={taskHref}
      navigation={navigation}
      error={error}
    />
  );
}
