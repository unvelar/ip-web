import { expect, test } from "bun:test";
import { HOLDOUT_ROWS, VALIDATION_ROWS, qualityMetrics, reliabilityBins, routingSummary, summarize, type DemoPrediction } from "../src/features/evaluations/model";

const prediction = (id: string, changes: Partial<DemoPrediction> = {}): DemoPrediction => ({
  id, action: "takedown", predictedAgreement: 0.9, reviewerJudgment: "takedown", evidenceEligible: true, path: "Test evidence", ...changes,
});

test("unresolved judgments stay visible and do not become support or disagreement", () => {
  const rows = [prediction("supported"), prediction("disagreed", { reviewerJudgment: "clearance" }), prediction("unresolved", { predictedAgreement: 1, reviewerJudgment: "unclear" })];
  expect(summarize(rows)).toMatchObject({ n: 3, supported: 1, disagreed: 1, unresolved: 1, agreement: 0.5 });
  expect(qualityMetrics(rows, "takedown")).toMatchObject({ resolved: 2, unresolved: 1 });
  expect(qualityMetrics(rows, "takedown").brier).toBeCloseTo(0.41);
  const bins = reliabilityBins(rows, "takedown");
  expect(bins.reduce((sum, bin) => sum + bin.n, 0)).toBe(3);
  expect(bins.reduce((sum, bin) => sum + bin.resolved, 0)).toBe(2);
  expect(summarize([rows[2]]).agreement).toBeNull();
  expect(qualityMetrics([rows[2]], "takedown").ece).toBeNull();
});

test("review routing preserves evidence gates, missing calibration, and separate clearance policy", () => {
  const rows = [prediction("retain"), prediction("blocked", { predictedAgreement: 1, evidenceEligible: false }), prediction("uncovered", { predictedAgreement: null }), prediction("clearance", { action: "clearance", reviewerJudgment: "clearance", predictedAgreement: 1 })];
  const routing = routingSummary(rows, 0.9);
  expect(routing.total).toBe(3);
  expect(routing.retained.map((row) => row.id)).toEqual(["retain"]);
  expect(routing.review.map((row) => row.id)).toEqual(["blocked", "uncovered"]);
  expect(routing.blocked.map((row) => row.id)).toEqual(["blocked"]);
  expect(routingSummary(rows, 0.99).retained).toHaveLength(0);
});

test("demo holdout and validation use independent identities and routing totals reconcile", () => {
  expect(HOLDOUT_ROWS).toHaveLength(480);
  expect(HOLDOUT_ROWS.filter((row) => row.action === "unclear").every((row) => row.reviewerJudgment === "unclear")).toBe(true);
  const ids = new Set(HOLDOUT_ROWS.map((row) => row.id));
  expect(VALIDATION_ROWS.some((row) => ids.has(row.id))).toBe(false);
  for (const threshold of [0.6, 0.9, 0.99]) {
    const routing = routingSummary(VALIDATION_ROWS, threshold);
    expect(routing.retained.length + routing.review.length).toBe(240);
    expect(routing.retained.every((row) => row.evidenceEligible && row.predictedAgreement !== null && row.predictedAgreement >= threshold)).toBe(true);
  }
});
