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
