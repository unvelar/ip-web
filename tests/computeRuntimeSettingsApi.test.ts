import { describe, expect, test } from "bun:test";
import { computeRuntimeSettingsPatchBody } from "../src/computeRuntimeSettings";

describe("RunPod minimum-capacity API contract", () => {
  test("sends autoscaling limits through the versioned settings patch", () => {
    expect(computeRuntimeSettingsPatchBody(30, {
      maxPods: 3,
      jobsPerPodTarget: 100,
    })).toEqual({
      expectedVersion: 30,
      settings: { maxPods: 3, jobsPerPodTarget: 100 },
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
