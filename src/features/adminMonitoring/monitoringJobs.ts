export const MONITORING_JOB_COPY = {
  monitor_scrape: { label: "Discovery", detail: "Search and page harvesting", recordsScrapeMethod: true },
  monitor_seller_expand: { label: "Seller expansion", detail: "Seller inventory and related listings", recordsScrapeMethod: true },
  monitor_score: { label: "Matching", detail: "Embedding and structure checks", recordsScrapeMethod: false },
  monitor_visual_check: { label: "Visual checks", detail: "Batched GPU comparisons", recordsScrapeMethod: false },
  finding_qualify: { label: "Page verification", detail: "Offer and seller evidence", recordsScrapeMethod: true },
} satisfies Record<string, { label: string; detail: string; recordsScrapeMethod: boolean }>;

export type MonitoringJobType = keyof typeof MONITORING_JOB_COPY;
export const MONITORING_JOB_TYPES = Object.keys(MONITORING_JOB_COPY) as MonitoringJobType[];

export function supportsScrapeMethod(type: string): boolean {
  return Object.hasOwn(MONITORING_JOB_COPY, type)
    && MONITORING_JOB_COPY[type as MonitoringJobType].recordsScrapeMethod;
}

export function monitoringRunJobTypes(sourceKind: string | null): MonitoringJobType[] {
  return [sourceKind === "seller_expansion" ? "monitor_seller_expand" : "monitor_scrape",
    "monitor_score", "monitor_visual_check", "finding_qualify"];
}

export const ADMIN_JOB_COPY: Record<string, { label: string; detail: string }> = {
  ...MONITORING_JOB_COPY,
  case_analyze: { label: "Case analysis", detail: "Assess listing evidence and infringement" },
  case_capture: { label: "Case capture", detail: "Capture listing pages and images" },
  monitor_recheck: { label: "Listing rechecks", detail: "Check previously discovered listings" },
  product_profile: { label: "Product fingerprints", detail: "Describe and encode each listing" },
  product_pair_rerank: { label: "Product comparisons", detail: "Compare listings for product grouping" },
  product_semantics: { label: "Product details", detail: "Extract product identity and attributes" },
  product_authenticity: { label: "Product authenticity", detail: "Assess product authenticity evidence" },
  review_playbook_consolidate: { label: "Review guidance", detail: "Update guidance from review decisions" },
  allow_product_image: { label: "Approved images", detail: "Process approved product images" },
  index: { label: "Reference indexing", detail: "Prepare reference images for matching" },
  lawyer_view_index_batch: { label: "Search indexing", detail: "Update searchable catalog records" },
  monitor_strategy_capture: { label: "Search setup capture", detail: "Inspect marketplace search pages" },
  monitor_strategy_infer: { label: "Search setup analysis", detail: "Build marketplace search strategies" },
  monitor_strategy_validate: { label: "Search setup checks", detail: "Validate marketplace search strategies" },
};
