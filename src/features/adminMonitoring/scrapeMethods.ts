// Keep every job-level placement on the same scope, including rolling API deploys.
export function supportsScrapeMethod(type: string): boolean {
  return type === "monitor_scrape" || type === "finding_qualify";
}
