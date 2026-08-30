import { describe, expect, test } from "bun:test";
import { suggestOnboardingIp } from "../src/lib/onboarding";

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
