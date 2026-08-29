import type { MonitoringSourceSetupStatus } from "../../api";

export type { MonitoringSourceSetupStatus } from "../../api";

export type SourceSetupTone = "ready" | "processing" | "attention";

export function sourceSetupPresentation(status: MonitoringSourceSetupStatus): {
  label: string;
  detail: string;
  tone: SourceSetupTone;
} {
  if (status === "retry_needed") {
    return {
      label: "Retry needed",
      detail: "Setup couldn't finish. We'll retry automatically.",
      tone: "attention",
    };
  }
  if (status === "processing") {
    return {
      label: "Preparing",
      detail: "We're preparing this source. No action is needed.",
      tone: "processing",
    };
  }
  return {
    label: "Ready",
    detail: "Setup complete.",
    tone: "ready",
  };
}
