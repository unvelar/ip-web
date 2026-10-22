import { describe, expect, test } from "bun:test";
import { computeAutoscalingSettingsPatch, computeRuntimeSettingsPatchBody } from "../src/computeRuntimeSettings";

describe("RunPod minimum-capacity API contract", () => {
  test("sends autoscaling limits through the versioned settings patch", () => {
    expect(computeRuntimeSettingsPatchBody(30, {
      maxPods: 3,
      firstPodQueueThreshold: 100,
      jobsPerPodTarget: 100,
    })).toEqual({
      expectedVersion: 30,
      settings: { maxPods: 3, firstPodQueueThreshold: 100, jobsPerPodTarget: 100 },
    });
  });

  test("sends an allowlisted duration for a server-timed warm window", () => {
    expect(computeRuntimeSettingsPatchBody(7, { minimumPods: 2 }, 8)).toEqual({
      expectedVersion: 7,
      settings: { minimumPods: 2 },
      minimumPodsDurationHours: 8,
    });
  });

  test("clears the override without sending a duration", () => {
    expect(computeRuntimeSettingsPatchBody(8, {
      minimumPods: 0,
      minimumPodsUntil: null,
    })).toEqual({
      expectedVersion: 8,
      settings: { minimumPods: 0, minimumPodsUntil: null },
    });
  });
});


describe("RunPod disable and warm-capacity limits", () => {
  const now = Date.parse("2026-10-22T09:00:00Z");
  const limits = { maxPods: 0, firstPodQueueThreshold: 1000, jobsPerPodTarget: 1000 };
  test.each(["2026-10-13T23:36:00Z", "2026-10-23T09:00:00Z"])(
    "zero clears the minimum atomically for the window ending %s", (until) => {
      expect(computeAutoscalingSettingsPatch({ minimumPods: 1, minimumPodsUntil: until }, limits, now))
        .toEqual({ ...limits, minimumPods: 0, minimumPodsUntil: null });
    },
  );
  test("expired minimum does not prevent a lower positive maximum", () => {
    expect(computeAutoscalingSettingsPatch({ minimumPods: 3, minimumPodsUntil: "2026-10-21T09:00:00Z" },
      { ...limits, maxPods: 1 }, now)).toEqual({ ...limits, maxPods: 1, minimumPods: 0, minimumPodsUntil: null });
  });
  test("a positive maximum still respects an active warm minimum", () => {
    expect(() => computeAutoscalingSettingsPatch({ minimumPods: 3, minimumPodsUntil: "2026-10-23T09:00:00Z" },
      { ...limits, maxPods: 1 }, now)).toThrow("active minimum-pod setting");
  });
  test("compatible scaling preserves the active warm window", () => {
    expect(computeAutoscalingSettingsPatch({ minimumPods: 1, minimumPodsUntil: "2026-10-23T09:00:00Z" },
      { ...limits, maxPods: 2 }, now)).toEqual({ ...limits, maxPods: 2 });
  });
});
