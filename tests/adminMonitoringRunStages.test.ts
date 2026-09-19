import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RunStageExecutionBadges } from "../src/features/adminMonitoring/WorkerTypeBadge";
import type { AdminMonitoringRunJobStage } from "../src/api";
import { monitoringRunStageStatus } from "../src/features/adminMonitoring/runStageStatus";
import { monitoringRunJobTypes } from "../src/features/adminMonitoring/monitoringJobs";

const completedStage: AdminMonitoringRunJobStage = {
  worker_kind: "browser",
  type: "monitor_scrape",
  pending_jobs: 0,
  deferred_jobs: 0,
  paused_jobs: 0,
  scheduled_jobs: 0,
  in_progress_jobs: 0,
  completed_jobs: 1,
  failed_jobs: 0,
  pending_units: 0,
  in_progress_units: 0,
  oldest_queued_at: null,
  latest_error: null,
};

describe("monitoringRunStageStatus", () => {
  test("cancelled work and unreached stages never appear as waiting", () => {
    const cancelled = { ...completedStage, completed_jobs: 0, cancelled_jobs: 1 };
    expect(monitoringRunStageStatus(cancelled, "cancelled")).toBe("cancelled");
    expect(monitoringRunStageStatus(undefined, "cancelled")).toBe("not_reached");
    expect(monitoringRunStageStatus(completedStage, "cancelled")).toBe("done");
    expect(monitoringRunStageStatus({...cancelled,pending_jobs:1}, "queued")).toBe("queued");
  });
  test("keeps deliberate pauses distinct from ready work and scheduled retries", () => {
    const paused = { ...completedStage, completed_jobs: 0, deferred_jobs: 1, paused_jobs: 1 };
    expect(monitoringRunStageStatus(paused, "paused")).toBe("paused");
    expect(monitoringRunStageStatus({ ...paused, paused_jobs: 0, scheduled_jobs: 1 }, "scheduled")).toBe("scheduled");
    expect(monitoringRunStageStatus({ ...paused, pending_jobs: 1 }, "queued")).toBe("queued");
    expect(monitoringRunStageStatus({ ...paused, in_progress_jobs: 1 }, "processing")).toBe("running");
  });
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

  test("seller expansion uses its completed fetch stage instead of absent keyword discovery", () => {
    const sellerStage = { ...completedStage, type: "monitor_seller_expand" };
    const types = monitoringRunJobTypes("seller_expansion");
    expect(types).toEqual(["monitor_seller_expand", "monitor_score", "monitor_visual_check", "finding_qualify"]);
    expect(monitoringRunStageStatus([sellerStage].find((stage) => stage.type === types[0]), "completed")).toBe("done");
    expect(monitoringRunJobTypes(null)[0]).toBe("monitor_scrape");
  });
});

test("summary cards retain recorded executors and handle mixed or older responses", () => {
  const render = (execution_kinds?: AdminMonitoringRunJobStage["execution_kinds"]) =>
    renderToStaticMarkup(createElement(RunStageExecutionBadges, {
      stage: { ...completedStage, execution_kinds },
    }));
  expect(render(["scrapfly"])).toContain('aria-label="Execution: Scrapfly task"');
  expect(render(["scrapfly"])).not.toContain('Worker type: Browser');
  expect(render(["scrapedo"])).toContain('aria-label="Execution: Scrape.do task"');
  expect(render(["scrapedo"])).not.toContain('Worker type: Browser');
  const mixed = render(["browser", "scrapfly", "scrapedo"]);
  expect(mixed).toContain('Worker type: Browser');
  expect(mixed).toContain('Execution: Scrapfly task');
  expect(mixed).toContain('Execution: Scrape.do task');
  expect(render()).toContain('Worker type: Browser');
});
