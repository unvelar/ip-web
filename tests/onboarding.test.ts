import { describe, expect, test } from "bun:test";
import { buildMonitoringKeywords, suggestOnboardingIp } from "../src/lib/onboarding";

describe("suggestOnboardingIp", () => {
  test("suggests an editable IP name from a corporate email domain", () => {
    expect(suggestOnboardingIp("new.user@puma.com")).toEqual({
      domain: "puma.com",
      name: "Puma",
    });
  });

  test("handles country-code suffixes and hyphenated organization names", () => {
    expect(suggestOnboardingIp("owner@bbc.co.uk")?.name).toBe("BBC");
    expect(suggestOnboardingIp("owner@coca-cola.com")?.name).toBe("Coca Cola");
  });

  test("does not suggest consumer email providers or malformed addresses", () => {
    expect(suggestOnboardingIp("owner@gmail.com")).toBeNull();
    expect(suggestOnboardingIp("not-an-email")).toBeNull();
  });
});

describe("buildMonitoringKeywords", () => {
  test("pairs each validated name with product context", () => {
    expect(buildMonitoringKeywords(
      ["Liverpool FC", "Liverpool", "LFC"],
      ["jerseys", "football kits"],
    )).toEqual([
      "Liverpool FC jerseys",
      "Liverpool FC football kits",
      "Liverpool jerseys",
      "Liverpool football kits",
      "LFC jerseys",
      "LFC football kits",
    ]);
  });
});
