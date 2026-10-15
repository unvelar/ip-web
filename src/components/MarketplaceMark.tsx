import { useState } from "react";

/** Shared marketplace favicon with the existing initial-letter fallback. */
export function MarketplaceMark({ source }: { source: { domain: string; name: string } }) {
  const [failedDomain, setFailedDomain] = useState<string | null>(null);
  const domain = source.domain.trim();
  if (!domain || failedDomain === domain) return <span className="marketplace-monogram" aria-hidden="true">{source.name.slice(0, 2)}</span>;
  return <span className="marketplace-logo" aria-hidden="true"><img key={domain} src={`https://${domain}/favicon.ico`} alt="" width={24} height={24} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedDomain(domain)} /></span>;
}
