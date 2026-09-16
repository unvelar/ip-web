export type IpSettingsSection = "overview" | "monitoring" | "protection";

export function ipSettingsSection(hash: string): IpSettingsSection {
  if (["#protection", "#takedown-signer", "#allowed-product-images"].includes(hash)) return "protection";
  if (["#search", "#monitoring", "#keywords", "#matching-names", "#keyword-learning"].includes(hash) || hash.startsWith("#monitoring-source-")) return "monitoring";
  return "overview";
}
