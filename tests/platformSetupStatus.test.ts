import { describe, expect, test } from "bun:test";
import { sourceSetupPresentation } from "../src/components/monitoring/platformSetupStatus";

describe("sourceSetupPresentation", () => {
  test("makes a source-level system retry unmistakable", () => {
    expect(sourceSetupPresentation("retry_needed")).toEqual({
      label: "Retry needed",
      detail: "Setup couldn't finish. We'll retry automatically.",
      tone: "attention",
    });
  });
});
