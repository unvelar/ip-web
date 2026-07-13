import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ExternalLink, GitBranch, Info, Loader2, Plus } from "lucide-react";
import {
  createMonitoringCampaign,
  getMonitoringFindingRelated,
  type IpReviewFinding,
  type MonitoringCampaign,
  type MonitoringCampaignSuggestion,
  type MonitoringRelatedBucket,
  type MonitoringRelatedFinding,
  type MonitoringRelatedItems,
  type MonitoringRelatedReason,
} from "../../../api";
import { compactListingTitle, findingStatusBadge, formatAgo } from "./utils";

function reasonLabel(reason: MonitoringRelatedReason) {
  switch (reason) {
    case "same_seller":
      return "same seller";
    case "same_product_image":
      return "same product image";
    case "image_only_unverified":
      return "image overlap";
    case "prior_takedown":
      return "prior takedown";
    case "prior_enforced":
      return "enforced";
    case "prior_dismissal":
      return "dismissed";
    case "allowed_product":
      return "allowed product";
    case "cleared_listing":
      return "cleared";
    case "cross_site_reuse":
      return "cross-site reuse";
  }
}

function scoreLabel(score: number | null) {
  if (score == null || !Number.isFinite(score)) return null;
  return `${Math.round(score * 100)}%`;
}

function outcomeLabel(key: string) {
  switch (key) {
    case "open":
      return "open";
    case "takedown_sent":
      return "takedown sent";
    case "enforced":
      return "enforced";
    case "licensed":
      return "licensed";
    case "false_positive":
      return "false positive";
    case "do_not_pursue":
      return "do not pursue";
    case "second_hand":
      return "second hand";
    case "allowed_product":
      return "allowed product";
    case "dead":
      return "dead";
    default:
      return key.replace(/_/g, " ");
  }
}

function relatedPreviewText(f: MonitoringRelatedFinding) {
  const title = compactListingTitle(f).toLowerCase();
  const domain = f.domain && !title.includes(f.domain.toLowerCase()) ? f.domain : null;
  const foundAgo = f.found_at ? formatAgo(f.found_at) : null;
  return [f.seller_name, domain, foundAgo ? `found ${foundAgo}` : null]
    .filter(Boolean)
    .join(" · ");
}

function relatedOpenItems(bucket: MonitoringRelatedBucket) {
  return bucket.items.filter((item) => item.triageable);
}

function CampaignSuggestionRow({
  suggestion,
  sourceResultId,
  findingsById,
  onAddToBatch,
}: {
  suggestion: MonitoringCampaignSuggestion;
  sourceResultId: string;
  findingsById: Map<string, IpReviewFinding>;
  onAddToBatch: (findings: IpReviewFinding[]) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [confirmed, setConfirmed] = useState<MonitoringCampaign | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const findings = suggestion.result_ids
    .map((id) => findingsById.get(id))
    .filter((f): f is IpReviewFinding => !!f);
  if (findings.length === 0) return null;

  async function confirmCampaign() {
    setSaving(true);
    setConfirmError("");
    try {
      const { campaign } = await createMonitoringCampaign({
        source_result_id: sourceResultId,
        title: suggestion.title,
        trigger: suggestion.trigger,
        reason: suggestion.reason,
        result_ids: suggestion.result_ids,
      });
      setConfirmed(campaign);
    } catch (e) {
      setConfirmError(e instanceof Error ? e.message : "Failed to confirm campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <GitBranch size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold text-amber-900">{suggestion.title}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-amber-800">{suggestion.reason}</div>
          {confirmed && (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <Check size={12} aria-hidden />
              Confirmed {confirmed.member_count}
              <Link
                to={`/monitoring/campaigns/${confirmed.id}`}
                className="ml-1 text-emerald-800 underline-offset-2 hover:underline"
              >
                View
              </Link>
            </div>
          )}
          {confirmError && <div className="mt-1 text-[11px] font-medium text-red-700">{confirmError}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onAddToBatch(findings)}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            <Plus size={12} aria-hidden />
            Select {findings.length}
          </button>
          <button
            type="button"
            onClick={confirmCampaign}
            disabled={saving || !!confirmed}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-amber-700 px-2 text-[11px] font-semibold text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:bg-amber-300 whitespace-nowrap"
          >
            {saving ? (
              <Loader2 size={12} className="animate-spin" aria-hidden />
            ) : confirmed ? (
              <Check size={12} aria-hidden />
            ) : (
              <GitBranch size={12} aria-hidden />
            )}
            {confirmed ? "Done" : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RelatedFindingRow({ item }: { item: MonitoringRelatedFinding }) {
  const status = findingStatusBadge(item);
  const score = scoreLabel(item.relation_score);
  const preview = relatedPreviewText(item);
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50/30 px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        {item.image_url ? (
          <img
            src={item.image_url}
            alt=""
            className="h-11 w-11 shrink-0 rounded-md border border-stone-200 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md border border-dashed border-stone-200 bg-stone-50" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold text-stone-900">
              {compactListingTitle(item)}
            </span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>
              {status.label}
            </span>
          </div>
          {preview && <div className="mt-0.5 truncate text-[11px] text-stone-500">{preview}</div>}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {item.relation_reasons.map((reason, index) => (
              <span
                key={reason}
                className={
                  reason === "image_only_unverified"
                    ? "rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600"
                    : "rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700"
                }
              >
                {reasonLabel(reason)}
                {index === 0 && score && ` · ${score}`}
              </span>
            ))}
            {item.relation_reasons.length === 0 && score && (
              <span className="text-[10px] text-stone-400">{score}</span>
            )}
          </div>
        </div>
        <a
          href={item.page_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          title="Open listing"
          aria-label="Open listing"
        >
          <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}

function RelatedBucketSection({
  bucket,
  onAddToBatch,
}: {
  bucket: MonitoringRelatedBucket;
  onAddToBatch: (findings: IpReviewFinding[]) => void;
}) {
  const openItems = relatedOpenItems(bucket);
  const hasContent =
    bucket.items.length > 0 ||
    (bucket.decisions?.length ?? 0) > 0 ||
    (bucket.external_matches?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <h4 className="shrink-0 text-xs font-semibold text-stone-700">{bucket.label}</h4>
          <span className="truncate text-[11px] text-stone-400">· {bucket.summary}</span>
        </div>
        {openItems.length > 0 && (
          <button
            type="button"
            onClick={() => onAddToBatch(openItems)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
          >
            <Plus size={12} aria-hidden />
            Select {openItems.length}
          </button>
        )}
      </div>

      {bucket.outcome_counts && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(bucket.outcome_counts)
            .filter(([, n]) => n > 0)
            .map(([key, n]) => (
              <span key={key} className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                {outcomeLabel(key)} {n}
              </span>
            ))}
        </div>
      )}

      <div className="grid gap-2">
        {bucket.items.slice(0, 5).map((item) => (
          <RelatedFindingRow key={item.result_id} item={item} />
        ))}
      </div>

      {bucket.decisions && bucket.decisions.length > 0 && (
        <div className="grid gap-1.5">
          {bucket.decisions.slice(0, 4).map((decision) => (
            <div key={`${decision.kind}-${decision.id}`} className="rounded-md border border-emerald-100 bg-emerald-50 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-emerald-900">
                    {decision.kind === "allowed_product" ? "Allowed product" : "Cleared listing"}
                    {decision.similarity != null && (
                      <span className="ml-1 font-normal text-emerald-700">
                        {scoreLabel(decision.similarity)}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-emerald-800">
                    {decision.listing_title || decision.reason || decision.page_url || "Prior decision"}
                  </div>
                </div>
                {decision.page_url && (
                  <a
                    href={decision.page_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-100"
                    title="Open listing"
                    aria-label="Open listing"
                  >
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {bucket.external_matches && bucket.external_matches.length > 0 && (
        <div className="grid gap-1.5">
          {bucket.external_matches.slice(0, 4).map((match) => (
            <div key={match.id} className="rounded-md border border-stone-200 bg-white px-2.5 py-2">
              <div className="flex items-center gap-2">
                {match.image_url && (
                  <img src={match.image_url} alt="" className="h-10 w-10 rounded-md object-cover" loading="lazy" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-stone-900">
                    {match.title || match.page_url}
                  </div>
                  <div className="text-[11px] text-stone-500">
                    {match.source} - {scoreLabel(match.similarity_score)}
                  </div>
                </div>
                <a
                  href={match.page_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  title="Open match"
                  aria-label="Open match"
                >
                  <ExternalLink size={13} />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function RelatedItemsPanel({
  finding,
  onAddToBatch,
}: {
  finding: IpReviewFinding;
  onAddToBatch: (findings: IpReviewFinding[]) => void;
}) {
  const [related, setRelated] = useState<MonitoringRelatedItems | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    setRelated(null);
    getMonitoringFindingRelated(finding.result_id)
      .then(({ related }) => {
        if (!cancelled) setRelated(related);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load related items");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [finding.result_id]);

  const findingsById = useMemo(() => {
    const map = new Map<string, IpReviewFinding>();
    if (!related) return map;
    map.set(related.anchor.result_id, related.anchor);
    for (const bucket of related.buckets) {
      for (const item of bucket.items) map.set(item.result_id, item);
    }
    return map;
  }, [related]);

  if (loading) {
    return (
      <div className="text-sm text-stone-400">
        Loading related items...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!related) return null;

  const visibleBuckets = related.buckets.filter(
    (bucket) =>
      bucket.items.length > 0 ||
      (bucket.decisions?.length ?? 0) > 0 ||
      (bucket.external_matches?.length ?? 0) > 0,
  );

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-stone-900">Related items</h3>
          <div className="mt-0.5 flex items-start gap-1.5 text-[11px] leading-4 text-stone-500">
            <Info size={12} className="mt-0.5 shrink-0 text-stone-400" aria-hidden />
            <span title={related.logo_only_notice}>
              Logo-only matches are evidence, but aren&apos;t grouped into campaigns.
            </span>
          </div>
        </div>
      </div>

      {related.campaign_suggestions.length > 0 && (
        <div className="mb-3 grid gap-1.5">
          {related.campaign_suggestions.map((suggestion) => (
            <CampaignSuggestionRow
              key={suggestion.trigger}
              suggestion={suggestion}
              sourceResultId={related.anchor.result_id}
              findingsById={findingsById}
              onAddToBatch={onAddToBatch}
            />
          ))}
        </div>
      )}

      {visibleBuckets.length === 0 ? (
        <p className="text-sm text-stone-400">No related items yet.</p>
      ) : (
        <div className="grid gap-3">
          {visibleBuckets.map((bucket) => (
            <RelatedBucketSection
              key={bucket.key}
              bucket={bucket}
              onAddToBatch={onAddToBatch}
            />
          ))}
        </div>
      )}
    </div>
  );
}
