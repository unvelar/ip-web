import type { MonitoringSourceSetupStatus } from "../../api";

export type { MonitoringSourceSetupStatus } from "../../api";

export type SourceSetupTone = "ready" | "processing" | "limited";

export function sourceSetupPresentation(status: MonitoringSourceSetupStatus): {
  label: string;
  detail: string;
  tone: SourceSetupTone;
} {
  if (status === "retry_needed") {
    return {
      label: "Limited",
      detail: "Searches on this website have not completed. Your settings are saved.",
      tone: "limited",
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
