import type { IpFirstScanResultStage } from "../../api";
import type { FirstScanSourceState } from "../../lib/firstScanProgress";

export const SOURCE_STATE_COPY: Record<FirstScanSourceState, { label: string; detail: string }> = {
  connecting: { label: "Connecting", detail: "Preparing this website" },
  waiting: { label: "Queued", detail: "Waiting for its first search" },
  scanning: { label: "Scanning", detail: "Looking for listings now" },
  preparing: { label: "Processing", detail: "Filling listing metadata" },
  ready: { label: "Ready", detail: "Latest results processed" },
  failed: { label: "Needs attention", detail: "A real job error was reported" },
};

export const RESULT_STATE_COPY: Record<IpFirstScanResultStage, { label: string; detail: string }> = {
  discovered: { label: "Found", detail: "Waiting for image matching" },
  matching: { label: "Comparing", detail: "Checking against reference images" },
  qualifying: { label: "Checking page", detail: "Verifying the listing page" },
  enriching: { label: "Adding details", detail: "Reading seller, price, and location" },
  ready: { label: "Ready for triage", detail: "All required review data is available" },
  filtered: { label: "Not a match", detail: "Screened out by automated checks" },
  failed: { label: "Needs retry", detail: "Processing stopped with an error" },
};

export function readableDomain(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function readableMethod(value: string | null): string {
  return value ? value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()) : "";
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
