import type { IpFirstScanResult, IpFirstScanResultStage } from "../../api";
import type { FirstScanSourceState } from "../../lib/firstScanProgress";

export const SOURCE_STATE_COPY: Record<FirstScanSourceState, { label: string; detail: string }> = {
  connecting: { label: "Connecting", detail: "Preparing this website" },
  setup_processing: { label: "Preparing", detail: "Website setup is still running" },
  waiting: { label: "Queued", detail: "Waiting for its first search" },
  scanning: { label: "Scanning", detail: "Looking for listings now" },
  preparing: { label: "Pending", detail: "Waiting for listing checks to finish" },
  ready: { label: "Ready", detail: "Latest results processed" },
  retry_needed: { label: "Retry needed", detail: "Website setup could not finish" },
  failed: { label: "Needs attention", detail: "A real job error was reported" },
};

export const RESULT_STATE_COPY: Record<IpFirstScanResultStage, { label: string; detail: string }> = {
  discovered: { label: "Found", detail: "Waiting for image matching" },
  matching: { label: "Comparing", detail: "Checking against reference images" },
  qualifying: { label: "Checking page", detail: "Verifying the listing page" },
  enriching: { label: "Adding details", detail: "Reading seller, price, and location" },
  ready: { label: "Ready for triage", detail: "All required review data is available" },
  filtered: { label: "Not a match", detail: "Screened out by automated checks" },
  cancelled: { label: "Cancelled", detail: "This scan was cancelled" },
  failed: { label: "Needs retry", detail: "Processing stopped with an error" },
};

export const ACCESS_BLOCKED_RESULT_COPY = {
  label: "Page check blocked",
  detail: "The marketplace prevented us from verifying this listing",
};

export interface ResultPresentation {
  label: string;
  detail: string;
  activity: "running" | "queued" | "paused" | "scheduled" | "blocked" | "finished";
}

/** A pipeline phase does not mean a worker has claimed its next job. */
export function resultPresentation(result: IpFirstScanResult): ResultPresentation {
  if (result.qualification_access_blocked) return { ...ACCESS_BLOCKED_RESULT_COPY, activity: "blocked" };
  if (result.stage === "filtered" && result.vlm_verdict === "unclear") {
    return { label: "Match unclear", detail: "The available evidence could not establish a match", activity: "finished" };
  }
  if (result.stage === "matching") {
    switch (result.score_job_queue_state) {
      case "paused":
        return { label: "Paused", detail: "Waiting for matching to be resumed", activity: "paused" };
      case "blocked":
        return { label: "References needed", detail: "Matching will start when reference images are ready", activity: "blocked" };
      case "scheduled":
        return { label: "Scheduled", detail: "Waiting for the scheduled matching check", activity: "scheduled" };
      case "ready":
        return { label: "Queued", detail: "Waiting for a matching worker", activity: "queued" };
    }
    // Pending remains waiting when talking to an older API during rollout.
    if (result.score_job_status === "pending") return { label: "Queued", detail: "Waiting for a matching worker", activity: "queued" };
  }
  return {
    ...RESULT_STATE_COPY[result.stage],
    activity: result.stage === "discovered" ? "queued"
      : ["matching", "qualifying", "enriching"].includes(result.stage) ? "running" : "finished",
  };
}

export function readableDomain(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function readableMethod(value: string | null): string {
  if (!value) return "";
  if (value.endsWith("_api")) {
    const provider = value.slice(0, -4).replace(/[_-]+/g, " ");
    return `${provider.replace(/\b\w/g, (character) => character.toUpperCase())} API snapshot`;
  }
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function readableListingUrl(value: string): string {
  try {
    const url = new URL(value);
    const part = url.pathname.split("/").filter(Boolean).pop();
    return part ? decodeURIComponent(part).replace(/[-_]+/g, " ") : readableDomain(url.hostname);
  } catch {
    return value;
  }
}

export function compactUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname}`;
  } catch {
    return value;
  }
}

export function formatSimilarity(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function formatUpdateTime(value: Date): string {
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatRelativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 10) return "just now";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric" });
}
