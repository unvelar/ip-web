import type { CaseReviewStatus, IpReviewFinding } from "../../../api";

export function hasReviewAnalysis(f: IpReviewFinding) {
  return Boolean(
    f.listing_title?.trim() ||
    f.seller_name?.trim() ||
    f.match_explanation?.trim() ||
    f.description_summary?.trim() ||
    f.license_status?.trim() ||
    f.infringement_type?.trim(),
  );
}

function findingSimilarity(f: IpReviewFinding) {
  return f.similarity_score ?? f.enforcement_priority;
}

function formatSimilarity(score: number) {
  return `${Math.round(score * 100)}%`;
}

function uniqueDefined(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

export function selectedFindingSummary(findings: IpReviewFinding[]) {
  if (findings.length === 0) return [];
  const parts: string[] = [];
  const takedownCount = findings.filter((f) => f.actionability?.key === "send_takedown").length;
  if (takedownCount === findings.length) parts.push("Takedown");
  else if (takedownCount > 0) parts.push(`${takedownCount} AI takedown recs`);

  const similarities = findings
    .map(findingSimilarity)
    .filter((score) => Number.isFinite(score));
  if (similarities.length > 0) {
    const min = Math.min(...similarities);
    const max = Math.max(...similarities);
    parts.push(
      min === max
        ? `Similarity ${formatSimilarity(min)}`
        : `Similarity ${formatSimilarity(min)}-${formatSimilarity(max)}`,
    );
  }

  const ips = uniqueDefined(findings.map((f) => f.ip_name));
  if (ips.length === 1) parts.push(ips[0]);
  else if (ips.length > 1) parts.push(`${ips.length} IPs`);

  const platforms = uniqueDefined(findings.map((f) => f.domain));
  if (platforms.length === 1) parts.push(platforms[0]);
  else if (platforms.length > 1) parts.push(`${platforms.length} platforms`);

  return parts.slice(0, 4);
}

/** Compact relative-time formatter for "last checked"/"found" meta lines.
 *  Falls back to null when the input is missing/invalid. */
export function formatAgo(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
}

export function statusBadge(s: CaseReviewStatus | null | undefined) {
  const status = (s ?? "pending") as CaseReviewStatus | "pending";
  switch (status) {
    case "review":
      return { label: "Review", cls: "bg-sky-100 text-sky-700" };
    case "takedown_sent":
      return { label: "Takedown sent", cls: "bg-amber-100 text-amber-700" };
    case "enforced":
      return { label: "Enforced", cls: "bg-emerald-100 text-emerald-700" };
    case "dismissed":
      return { label: "Dismissed", cls: "bg-stone-200 text-stone-600" };
    case "pending":
    default:
      return { label: "To triage", cls: "bg-stone-100 text-stone-700" };
  }
}

export function findingStatusBadge(f: IpReviewFinding) {
  if (f.dismissed_at) return dismissalBadge(f.dismissal_reason);
  if (f.licensed_seller) return dismissalBadge("licensed");
  if ((!f.ready_for_review || !hasReviewAnalysis(f)) && (f.review_status ?? "pending") === "pending") {
    return { label: "Preparing", cls: "bg-stone-100 text-stone-500" };
  }
  return statusBadge(f.review_status);
}

export function dismissalBadge(reason: string | null) {
  switch (reason) {
    case "false_positive":
      return { label: "false positive", cls: "bg-stone-200 text-stone-600" };
    case "do_not_pursue":
      return { label: "don't pursue", cls: "bg-sky-100 text-sky-700" };
    case "second_hand":
    case "resale":
      return { label: "resale", cls: "bg-purple-100 text-purple-700" };
    case "licensed":
      return { label: "licensed", cls: "bg-emerald-100 text-emerald-700" };
    case "allowed_product":
      return { label: "allowed product", cls: "bg-teal-100 text-teal-700" };
    default:
      return reason?.startsWith("dead")
        ? {
            label: reason === "dead_listing_inactive" ? "inactive" : "dead link",
            cls: "bg-orange-100 text-orange-700",
          }
        : { label: "dismissed", cls: "bg-stone-200 text-stone-600" };
  }
}

// Short, highlighted label for the scrape method that surfaced a finding.
export function methodChip(method: string): { label: string; cls: string } {
  switch (method) {
    case "nodriver_direct":
      return { label: "direct", cls: "bg-violet-100 text-violet-700" };
    case "serper_google":
      return { label: "google", cls: "bg-blue-100 text-blue-700" };
    case "brave_sidestep":
      return { label: "brave", cls: "bg-teal-100 text-teal-700" };
    case "scrapfly_direct":
      return { label: "scrapfly", cls: "bg-orange-100 text-orange-700" };
    default:
      return { label: method, cls: "bg-stone-100 text-stone-600" };
  }
}

// Why this finding fired: visual similarity, IP-name mention in the
// listing title, or both. Different dimension from `methodChip` (which
// scrape strategy surfaced the page).
export function matchMethodChip(
  method: string,
): { label: string; cls: string; title: string } {
  switch (method) {
    case "visual":
      return {
        label: "visual",
        cls: "bg-sky-100 text-sky-700",
        title: "Image embedding matched a protected IP",
      };
    case "name":
      return {
        label: "name",
        cls: "bg-amber-100 text-amber-800",
        title: "IP name found in the listing title",
      };
    case "both":
      return {
        label: "name + visual",
        cls: "bg-emerald-100 text-emerald-700",
        title: "IP name in the title AND image visually similar",
      };
    default:
      return {
        label: method,
        cls: "bg-stone-100 text-stone-600",
        title: method,
      };
  }
}

export function tableImageUrls(f: IpReviewFinding): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (u: string | null | undefined) => {
    if (u && !seen.has(u)) {
      out.push(u);
      seen.add(u);
    }
  };
  add(f.image_url);
  add(f.gallery_scores?.[0]?.url);
  for (const s of f.gallery_scores ?? []) add(s.url);
  for (const u of f.image_urls ?? []) add(u);
  return out;
}

// Fallback quantity when the listing didn't expose stock — most marketplaces
// hide it, so a flat 150 keeps the KPI honest as a rough market estimate rather
// than the per-listing `1` that systematically under-counts.
export const QTY_FALLBACK = 150;

// Per-row "Estimated unlicensed market" = USD unit price × quantity. Uses the
// server-converted `price_value_usd` so every row reads in one currency (USD),
// regardless of the listing's native currency. Returns null when no price.
export function estimatedMarket(
  f: IpReviewFinding,
): { value: number; currency: string } | null {
  // Coerce: Postgres NUMERIC arrives as a string when not cast to float8.
  const price = f.price_value_usd == null ? null : Number(f.price_value_usd);
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  const qty = f.quantity_available && f.quantity_available > 0
    ? f.quantity_available
    : QTY_FALLBACK;
  return { value: price * qty, currency: "USD" };
}

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

export function detailValue(details: Record<string, unknown> | null, names: string[]) {
  if (!details) return null;
  const wanted = new Set(names.map((n) => n.toLowerCase()));
  for (const [key, value] of Object.entries(details)) {
    if (wanted.has(key.toLowerCase()) && value != null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
}

export function readableEnum(value: string) {
  return value.replace(/_/g, " ");
}

export function infringementTypeMeta(type: string | null) {
  switch (type) {
    case "full_copy":
      return {
        label: "IP use: direct copy",
        title: "The listing appears to use the protected IP directly, rather than as a loose reference.",
      };
    case "derivative":
      return {
        label: "IP use: derivative",
        title: "Reinterprets the IP in a new medium, style, or composition.",
      };
    case "different_class":
      return {
        label: "IP use: different category",
        title: "Uses the IP on goods or services outside the expected registration class.",
      };
    case "unclear":
      return {
        label: "IP use: needs review",
        title: "The analysis saw a possible IP signal, but could not classify the type of use.",
      };
    default:
      return type ? { label: `IP use: ${readableEnum(type)}`, title: undefined } : null;
  }
}

export function licenseStatusMeta(
  status: string | null,
  opts: { licensedSeller?: boolean } = {},
) {
  if (opts.licensedSeller) {
    return {
      label: "License: authorized seller",
      cls: "bg-emerald-100 text-emerald-700",
      title: "This seller matches a saved license rule for this IP and platform.",
    };
  }
  switch (status) {
    case "likely_licensed":
      return {
        label: "License: likely authorized",
        cls: "bg-emerald-100 text-emerald-700",
        title: "The listing includes signals that it may be licensed or otherwise authorized.",
      };
    case "likely_unlicensed":
      return {
        label: "License: likely unauthorized",
        cls: "bg-red-100 text-red-700",
        title: "The listing has no clear authorization signal and appears likely unlicensed.",
      };
    case "unclear":
      return {
        label: "License: unknown",
        cls: "bg-stone-100 text-stone-600",
        title: "The enrichment did not find enough information to determine licensing.",
      };
    default:
      return status
        ? {
            label: `License: ${readableEnum(status)}`,
            cls: "bg-stone-100 text-stone-600",
            title: undefined,
          }
        : null;
  }
}

export function inferCondition(f: IpReviewFinding): "new" | "second hand" | null {
  if (f.marketplace_condition === "new") return "new";
  if (f.marketplace_condition === "second_hand") return "second hand";
  if (f.dismissal_reason === "second_hand" || f.dismissal_reason === "resale") return "second hand";
  const detail = detailValue(f.item_details, ["condition", "item condition"]);
  const lowerTerms = f.description_risk_breakdown?.lower_terms;
  const riskTermValues =
    lowerTerms && typeof lowerTerms === "object" && !Array.isArray(lowerTerms)
      ? Object.values(lowerTerms)
          .flatMap((terms) => Array.isArray(terms) ? terms : [])
          .filter((term): term is string => typeof term === "string")
      : [];
  const haystack = [
    detail,
    f.license_status,
    riskTermValues.join(" "),
    f.description_summary,
    f.description_full,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(pre[-\s]?owned|pre[-\s]?loved|used|second[-\s]?hand|vintage|resale)\b/.test(haystack)) {
    return "second hand";
  }
  if (/\b(new|brand new|unused|made to order)\b/.test(haystack)) return "new";
  return null;
}

export function suggestionMeta(outcome: IpReviewFinding["suggested_review_outcome"]) {
  switch (outcome) {
    case "false_positive":
      return { label: "False positive", shortcut: "0", cls: "bg-stone-800 text-white" };
    case "do_not_pursue":
      return { label: "Don't pursue", shortcut: "1", cls: "bg-sky-700 text-white" };
    case "takedown":
      return { label: "Takedown", shortcut: "2", cls: "bg-blue-700 text-white" };
    case "second_hand":
      return { label: "Second hand", shortcut: "3", cls: "bg-purple-700 text-white" };
    default:
      return null;
  }
}

export function suggestionTitle(f: IpReviewFinding, shortcut: string) {
  return [
    f.suggested_review_reason,
    `Shortcut ${shortcut}`,
  ].filter(Boolean).join(" · ");
}

export function actionabilityMeta(actionability: IpReviewFinding["actionability"] | null | undefined) {
  const value = actionability ?? {
    key: "needs_review" as const,
    label: "Needs review",
    reason: "Evidence is not decisive enough for an automatic recommendation.",
  };
  switch (value.key) {
    case "send_takedown":
      return { ...value, cls: "bg-blue-700 text-white", subtleCls: "border-blue-300 bg-blue-50 text-blue-900" };
    case "allowed_resale":
      return { ...value, cls: "bg-purple-700 text-white", subtleCls: "border-purple-300 bg-purple-50 text-purple-900" };
    case "licensed_seller":
      return { ...value, cls: "bg-emerald-700 text-white", subtleCls: "border-emerald-300 bg-emerald-50 text-emerald-900" };
    case "false_positive":
      return { ...value, cls: "bg-stone-800 text-white", subtleCls: "border-stone-300 bg-stone-50 text-stone-800" };
    case "needs_review":
    default:
      return { ...value, cls: "bg-amber-600 text-white", subtleCls: "border-amber-300 bg-amber-50 text-amber-900" };
  }
}

export function findingFlaggedReason(
  f: Pick<IpReviewFinding, "match_explanation" | "infringement_reasoning" | "vlm_reasoning">,
) {
  const seen = new Set<string>();
  return [
    f.match_explanation,
    f.infringement_reasoning,
    f.vlm_reasoning,
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => {
      if (!v || seen.has(v)) return false;
      seen.add(v);
      return true;
    })
    .join(" ");
}

export function compactListingTitle(f: IpReviewFinding) {
  if (f.listing_title?.trim()) return f.listing_title.trim();
  try {
    const u = new URL(f.page_url);
    return `${u.hostname.replace(/^www\./, "")} listing`;
  } catch {
    return "Marketplace listing";
  }
}

export function findingChips(f: IpReviewFinding, showIp?: boolean) {
  const priceUsd =
    f.price_value_usd != null ? formatMoney(Number(f.price_value_usd), "USD") : null;
  const priceText = priceUsd ?? f.price ?? null;
  const category =
    detailValue(f.item_details, ["category", "type", "department"]) ||
    null;
  return [
    showIp && f.ip_name ? f.ip_name : null,
    category,
    priceText,
    f.domain,
  ].filter(Boolean) as string[];
}
