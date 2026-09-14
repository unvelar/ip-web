import type { IpFirstScanResultStage } from "../../api";
import { FIRST_SCAN_ACTIVE_RESULT_STAGES } from "../../lib/firstScanProgress";

export interface FirstScanResultTotals {
  discovered: number;
  processing: number;
  ready: number;
  filtered: number;
  failed: number;
}

export function summarizeFirstScanResults(
  results: ReadonlyArray<{ stage: IpFirstScanResultStage }>,
): FirstScanResultTotals {
  return {
    discovered: results.length,
    processing: results.filter((result) => FIRST_SCAN_ACTIVE_RESULT_STAGES.has(result.stage)).length,
    ready: results.filter((result) => result.stage === "ready").length,
    filtered: results.filter((result) => result.stage === "filtered").length,
    failed: results.filter((result) => result.stage === "failed").length,
  };
}
