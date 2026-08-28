import { describe, expect, test } from "bun:test";
import { dashboardContentState } from "../src/lib/dashboardState";

describe("dashboardContentState", () => {
  test("does not treat a configured IP without finding rows as unmonitored", () => {
    expect(dashboardContentState({ hasActiveIp: true, hasActivity: false }))
      .toBe("no_activity");
  });

  test("shows charts when the selected IP has activity", () => {
    expect(dashboardContentState({ hasActiveIp: true, hasActivity: true }))
      .toBe("activity");
  });

  test("reserves the no-IP state for tenants without a registered IP", () => {
    expect(dashboardContentState({ hasActiveIp: false, hasActivity: false }))
      .toBe("no_ip");
  });
});
