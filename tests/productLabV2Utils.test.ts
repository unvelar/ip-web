import { describe, expect, test } from "bun:test";
import {
  adjacentFinding,
  removeProcessedFindings,
  resetOptimisticProductStateAfterUndo,
  productNeedsAttention,
  recentDecisionCanUndo,
  recentDecisionKind,
  recentDecisionTimestamp,
  sortRecentDecisions,
  productShouldStayInAttention,
  recommendedBatchActionForSelection,
  reconcileProductAttentionOverview,
  takedownDecisionReasonRequiredForSelection,
} from "../src/pages/productLabV2Utils";

const decisionFinding = (overrides: Record<string, unknown> = {}) => ({
  dismissed_at: null,
  dismissal_reason: null,
  review_status: "pending",
  updated_at: "2026-08-18T10:00:00.000Z",
  takedown_pending_at: null,
  takedown_sent_at: null,
  enforced_at: null,
  ...overrides,
});

describe("recent decision history", () => {
  test("recognizes human decisions and excludes automatic dead-listing cleanup", () => {
    expect(recentDecisionKind(decisionFinding({
      dismissed_at: "2026-08-18T11:00:00.000Z",
      dismissal_reason: "second_hand",
    }))).toBe("dismissed");
    expect(recentDecisionKind(decisionFinding({
      dismissed_at: "2026-08-18T11:00:00.000Z",
      dismissal_reason: "dead",
    }))).toBeNull();
    expect(recentDecisionKind(decisionFinding({ review_status: "review" }))).toBe("review");
  });

  test("sorts decisions by their actual decision timestamp", () => {
    const review = decisionFinding({
      id: "review",
      review_status: "review",
      updated_at: "2026-08-18T11:00:00.000Z",
    });
    const takedown = decisionFinding({
      id: "takedown",
      review_status: "takedown_pending",
      takedown_pending_at: "2026-08-18T12:00:00.000Z",
    });

    expect(recentDecisionTimestamp(takedown)).toBe("2026-08-18T12:00:00.000Z");
    expect(sortRecentDecisions([review, takedown]).map((item) => item.id)).toEqual([
      "takedown",
      "review",
    ]);
  });

  test("does not offer a false undo for decisions with durable side effects", () => {
    expect(recentDecisionCanUndo(decisionFinding({
      dismissed_at: "2026-08-18T11:00:00.000Z",
      dismissal_reason: "licensed",
    }))).toBe(false);
    expect(recentDecisionCanUndo(decisionFinding({
      dismissed_at: "2026-08-18T11:00:00.000Z",
      dismissal_reason: "allowed_product",
    }))).toBe(false);
    expect(recentDecisionCanUndo(decisionFinding({
      dismissed_at: "2026-08-18T11:00:00.000Z",
      dismissal_reason: "second_hand",
    }))).toBe(true);
    expect(recentDecisionCanUndo(decisionFinding())).toBe(false);
  });
});

describe("adjacentFinding", () => {
  const findings = [
    { result_id: "first" },
    { result_id: "second" },
    { result_id: "third" },
  ];

  test("moves to the previous and next listing in the current order", () => {
    expect(adjacentFinding(findings, "second", -1)?.result_id).toBe("first");
    expect(adjacentFinding(findings, "second", 1)?.result_id).toBe("third");
  });

  test("stops at the batch boundaries", () => {
    expect(adjacentFinding(findings, "first", -1)).toBeNull();
    expect(adjacentFinding(findings, "third", 1)).toBeNull();
  });
});

describe("productNeedsAttention", () => {
  test("includes confirmed products with listings to review", () => {
    expect(productNeedsAttention({
      confirmation_status: "confirmed",
      triage_member_count: 1,
    })).toBe(true);
  });

  test("excludes confirmed products with no listings to review", () => {
    expect(productNeedsAttention({
      confirmation_status: "confirmed",
      triage_member_count: 0,
    })).toBe(false);
  });

  test("includes unconfirmed groups only when comparison evidence exists", () => {
    expect(productNeedsAttention({
      confirmation_status: "candidate",
      triage_member_count: 2,
    })).toBe(true);
    expect(productNeedsAttention({
      confirmation_status: "candidate",
      triage_member_count: 1,
    })).toBe(false);
  });

  test("treats a missing triage count as zero", () => {
    expect(productNeedsAttention({
      confirmation_status: "confirmed",
      triage_member_count: null,
    })).toBe(false);
  });
});

describe("productShouldStayInAttention", () => {
  test("keeps an active candidate batch visible until its final listing is processed", () => {
    const activeCandidate = {
      confirmation_status: "candidate",
      triage_member_count: 1,
    };

    expect(productShouldStayInAttention(activeCandidate, true)).toBe(true);
    expect(productShouldStayInAttention(activeCandidate, false)).toBe(false);
    expect(productShouldStayInAttention({
      ...activeCandidate,
      triage_member_count: 0,
    }, true)).toBe(false);
  });
});

describe("reconcileProductAttentionOverview", () => {
  test("removes a recently cleared candidate batch from the attention count", () => {
    const overview = {
      groups: [{
        id: "group-1",
        confirmation_status: "candidate",
        triage_member_count: 3,
      }],
      triage_group_count: 146,
      triage_profile_count: 212,
    };

    const reconciled = reconcileProductAttentionOverview(overview, "group-1", 0);

    expect(reconciled.groups[0].triage_member_count).toBe(0);
    expect(productNeedsAttention(reconciled.groups[0])).toBe(false);
    expect(reconciled.triage_group_count).toBe(145);
    expect(reconciled.triage_profile_count).toBe(209);
  });

  test("does not change overview totals when the exact count keeps a group eligible", () => {
    const overview = {
      groups: [{
        id: "group-1",
        confirmation_status: "confirmed",
        triage_member_count: 3,
      }],
      triage_group_count: 12,
      triage_profile_count: 30,
    };

    const reconciled = reconcileProductAttentionOverview(overview, "group-1", 2);

    expect(reconciled.triage_group_count).toBe(12);
    expect(reconciled.triage_profile_count).toBe(29);
  });
});

describe("recommendedBatchActionForSelection", () => {
  test("highlights second hand when the selected listing recommends resale", () => {
    expect(recommendedBatchActionForSelection([{
      suggested_review_outcome: "second_hand",
      offer_subject: "product",
    }])).toBe("second_hand");
  });

  test("does not highlight a misleading action for mixed recommendations", () => {
    expect(recommendedBatchActionForSelection([
      { suggested_review_outcome: "second_hand", offer_subject: "product" },
      { suggested_review_outcome: "none", offer_subject: "product" },
    ])).toBeNull();
  });

  test("does not map packaging-only resale to the second-hand action", () => {
    expect(recommendedBatchActionForSelection([{
      suggested_review_outcome: "second_hand",
      offer_subject: "packaging_only",
    }])).toBeNull();
  });

  test("uses the persisted suggestion when actionability disagrees", () => {
    expect(recommendedBatchActionForSelection([{
      actionability: { key: "send_takedown" },
      suggested_review_outcome: "none",
      offer_subject: "product",
    }])).toBeNull();
    expect(recommendedBatchActionForSelection([{
      actionability: { key: "needs_review" },
      suggested_review_outcome: "takedown",
      offer_subject: "product",
    }])).toBe("send");
  });
});

describe("takedownDecisionReasonRequiredForSelection", () => {
  test("does not require a reason when takedown matches every persisted suggestion", () => {
    expect(takedownDecisionReasonRequiredForSelection([
      { suggested_review_outcome: "takedown" },
      { suggested_review_outcome: "takedown" },
    ])).toBe(false);
  });

  test("requires a reason when any persisted suggestion differs from takedown", () => {
    expect(takedownDecisionReasonRequiredForSelection([
      { suggested_review_outcome: "takedown" },
      {
        actionability: { key: "send_takedown" },
        suggested_review_outcome: "none",
      },
    ])).toBe(true);
  });
});

describe("removeProcessedFindings", () => {
  test("removes successful listings while preserving failed or skipped listings", () => {
    const findings = [
      { result_id: "processed", title: "Done" },
      { result_id: "failed", title: "Keep" },
      { result_id: "skipped", title: "Keep too" },
    ];

    expect(removeProcessedFindings(findings, new Set(["processed"]))).toEqual([
      { result_id: "failed", title: "Keep" },
      { result_id: "skipped", title: "Keep too" },
    ]);
  });

  test("preserves the existing array when nothing was processed", () => {
    const findings = [{ result_id: "failed" }];
    expect(removeProcessedFindings(findings, new Set())).toBe(findings);
  });
});

describe("resetOptimisticProductStateAfterUndo", () => {
  test("drops stale batch counts and lets the restored listing return", () => {
    const reset = resetOptimisticProductStateAfterUndo(
      new Set(["restored", "another-processed-listing"]),
      "restored",
    );

    expect(reset.exactPendingCounts).toEqual({});
    expect([...reset.processedResultIds]).toEqual(["another-processed-listing"]);
  });
});
