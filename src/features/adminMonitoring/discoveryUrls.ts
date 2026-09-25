import type { DiscoveryEvidence } from "../../api/websiteDiscovery";

export function usableSearchUrl(value: string | null | undefined): value is string {
  if (!value || value.includes("[redacted]") || /%5bredacted%5d/i.test(value)) return false;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function recordedSearchUrl(evidence: DiscoveryEvidence | undefined): string | null {
  return [evidence?.coverage?.search_url, evidence?.pages[0]?.url,
    evidence?.coverage?.last_page?.url, evidence?.coverage?.last_visited_url,
    evidence?.coverage?.last_requested_url].find(usableSearchUrl) ?? null;
}

export function recordedSearchLinks(evidence: DiscoveryEvidence | undefined, pageUrls: string[] = []) {
  const coverage = evidence?.coverage;
  const links = new Map<string, { url: string; label: string; visited: boolean }>();
  const add = (url: string | null | undefined, label: string, visited: boolean) => {
    if (!usableSearchUrl(url)) return;
    const previous = links.get(url);
    links.set(url, { url, label: previous?.label ?? label, visited: visited || !!previous?.visited });
  };
  add(coverage?.search_url, "Search URL", false);
  add(coverage?.last_requested_url, "Last requested page", false);
  add(evidence?.pages[0]?.url, "First recorded results page", true);
  // Legacy page audits can include failed requests without a loaded document.
  for (const url of pageUrls) add(url, "Recorded discovery URL", false);
  add(coverage?.last_page?.url, "Last observed results page", true);
  add(coverage?.last_visited_url, "Last visited page", true);
  return [...links.values()];
}
