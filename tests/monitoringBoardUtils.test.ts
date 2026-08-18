import { describe, expect, test } from "bun:test";
import {
  dismissalBadge,
  findingPlatformLabel,
  suggestionMeta,
} from "../src/components/monitoring/board/utils";
import { BATCH_META } from "../src/components/monitoring/board/batchUtils";
import {
  CANDIDATE_OUTCOME_LABELS,
  DISMISSAL_REASON_LABELS,
} from "../src/components/monitoring/board/constants";

describe("findingPlatformLabel", () => {
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

describe("mark as OK language", () => {
  test("uses an action label before the decision and a completed label afterward", () => {
    expect(suggestionMeta("do_not_pursue")?.label).toBe("Mark as OK");
    expect(BATCH_META.do_not_pursue.label).toBe("Mark as OK");
    expect(CANDIDATE_OUTCOME_LABELS.do_not_pursue).toBe("Mark as OK");
    expect(dismissalBadge("do_not_pursue").label).toBe("marked OK");
    expect(DISMISSAL_REASON_LABELS.do_not_pursue).toBe("Marked OK");
  });
});
