import { describe, expect, test } from "bun:test";
import type { IpFirstScanResultStage } from "../src/api";
import { summarizeFirstScanResults } from "../src/features/firstScan/resultTotals";

function stages(...values: IpFirstScanResultStage[]) {
  return values.map((stage) => ({ stage }));
}

describe("first scan result totals", () => {
  test("counts each pipeline stage from only the supplied source results", () => {
    expect(summarizeFirstScanResults(stages("discovered", "enriching", "ready", "filtered", "failed"))).toEqual({
      discovered: 5,
      processing: 2,
      ready: 1,
      filtered: 1,
      failed: 1,
    });
  });

  test("returns zero stage badges for a selected source with no results", () => {
    expect(summarizeFirstScanResults([])).toEqual({
      discovered: 0,
      processing: 0,
      ready: 0,
      filtered: 0,
      failed: 0,
    });
  });
});
