import { describe, expect, test } from "bun:test";
import {
  dismissalBadge,
  findingPlatformLabel,
  suggestionMeta,
  selectedFindingSummary,
} from "../src/components/monitoring/board/utils";
import type { IpReviewFinding } from "../src/api";
import { BATCH_META } from "../src/components/monitoring/board/batchUtils";
import {
  CANDIDATE_OUTCOME_LABELS,
  DISMISSAL_REASON_LABELS,
} from "../src/components/monitoring/board/constants";

describe("findingPlatformLabel", () => {
  test("text-only findings never turn enforcement priority into image similarity", () => {
    const summary = selectedFindingSummary([{ similarity_score: null, enforcement_priority: 0.75 } as IpReviewFinding]);
    expect(summary.some((part) => part.includes('Similarity'))).toBe(false);
  });

  test("uses the finding domain shown elsewhere in the inspector", () => {
    expect(findingPlatformLabel({
      domain: "ebay.com",
      seller_url: "https://www.ebay.com/usr/fandomfigs",
      page_url: "https://www.ebay.com/itm/123",
    })).toBe("ebay.com");
  });

  test("derives the website from the seller URL when the domain is missing", () => {
    expect(findingPlatformLabel({
      domain: null,
      seller_url: "https://www.etsy.com/shop/example",
      page_url: "https://example.invalid/listing",
    })).toBe("etsy.com");
  });
});

describe("do not pursue language", () => {
  test("does not describe a tolerated but potentially illegal product as OK", () => {
    expect(suggestionMeta("do_not_pursue")?.label).toBe("Do not pursue");
    expect(BATCH_META.do_not_pursue.label).toBe("Do not pursue");
    expect(CANDIDATE_OUTCOME_LABELS.do_not_pursue).toBe("Do not pursue");
    expect(dismissalBadge("do_not_pursue").label).toBe("not pursued");
    expect(DISMISSAL_REASON_LABELS.do_not_pursue).toBe("Not pursued");
  });
});
