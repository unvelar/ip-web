import { describe, expect, test } from "bun:test";
import { sourceSetupPresentation } from "../src/components/monitoring/platformSetupStatus";

describe("sourceSetupPresentation", () => {
  test("describes limited coverage without asking the tenant to retry or promising recovery", () => {
    expect(sourceSetupPresentation("retry_needed")).toEqual({
      label: "Limited",
      detail: "Searches on this website have not completed. Your settings are saved.",
      tone: "limited",
    });
  });
});
