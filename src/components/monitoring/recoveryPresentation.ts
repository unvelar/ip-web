import type { MonitoringSourceRecovery } from "../../api";

export function retryTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

export function recoveryLabel(source: MonitoringSourceRecovery): string {
  switch (source.state) {
    case "scheduled": return source.next_retry_at ? `Retry ${retryTime(source.next_retry_at)}` : "Retry scheduled";
    case "due": return "Retry due, waiting for scheduling";
    case "off": return "Monitoring off, automatic retries paused";
    case "processing": return "Setup queued or running";
    case "blocked": return "Configuration needs attention";
    case "needed": return "Retry needs attention";
    case "ready": return "Ready";
  }
}

