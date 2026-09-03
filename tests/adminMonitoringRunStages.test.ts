import { describe, expect, test } from "bun:test";
import type { AdminMonitoringRunJobStage } from "../src/api";
import { monitoringRunStageStatus } from "../src/features/adminMonitoring/runStageStatus";

const completedStage: AdminMonitoringRunJobStage = {
  type: "monitor_scrape",
  pending_jobs: 0,
  deferred_jobs: 0,
  in_progress_jobs: 0,
  completed_jobs: 1,
  failed_jobs: 0,
  pending_units: 0,
  in_progress_units: 0,
  oldest_queued_at: null,
  latest_error: null,
};

describe("monitoringRunStageStatus", () => {
  test("marks absent downstream stages as not needed after a successful run", () => {
    expect(monitoringRunStageStatus(undefined, "completed")).toBe("not_needed");
  });

  test("marks absent downstream stages as not reached after a failed run", () => {
    expect(monitoringRunStageStatus(undefined, "failed")).toBe("not_reached");
  });

  test("keeps absent stages waiting while a run can still progress", () => {
    expect(monitoringRunStageStatus(undefined, "processing")).toBe("waiting");
    expect(monitoringRunStageStatus(undefined, "queued")).toBe("waiting");
    expect(monitoringRunStageStatus(undefined, "stalled")).toBe("waiting");
  });

  test("uses recorded job state before the overall run state", () => {
    expect(monitoringRunStageStatus(completedStage, "completed")).toBe("done");
  });
});
