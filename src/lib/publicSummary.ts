import type { Trademark } from "../api";

type PublicSummaryIp = Pick<Trademark, "public_slug" | "tenant_public_slug">;

export function publicSummaryUrlForIp(ip: PublicSummaryIp): string | null {
  if (!ip.tenant_public_slug || !ip.public_slug) return null;
  return `${window.location.origin}/brand-sumups/${ip.tenant_public_slug}/${ip.public_slug}`;
}
