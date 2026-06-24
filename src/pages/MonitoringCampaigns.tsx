import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  Archive,
  ExternalLink,
  GitBranch,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  autoSendTakedown,
  dismissMonitoringCampaign,
  dismissIpFinding,
  discoverMonitoringCampaigns,
  getMonitoringCampaign,
  listTrademarks,
  listMonitoringCampaigns,
  markIpFindingEnforced,
  markIpFindingNeedsReview,
  markTakedownSentWithoutEmail,
  updateMonitoringCampaignMember,
  type CaseReviewStatus,
  type IpReviewFinding,
  type MonitoringCampaignDetail,
  type MonitoringCampaignMember,
  type MonitoringReviewOutcome,
  type MonitoringCampaignSummary,
  type Trademark,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { BatchConfirmModal } from "../components/monitoring/board/batch";
import { BatchOperationBar } from "../components/monitoring/board/BatchOperationBar";
import { type BatchAction, runPool, summarizeBatch } from "../components/monitoring/board/batchUtils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";
import {
  compactListingTitle,
  findingStatusBadge,
  formatAgo,
  formatMoney,
  selectedFindingSummary,
  tableImageUrls,
} from "../components/monitoring/board/utils";

function campaignTriggerLabel(trigger: string) {
  switch (trigger) {
    case "same_seller_prior_enforcement":
      return "Prior enforcement";
    case "same_seller_volume":
      return "Same seller volume";
    case "same_seller_high_confidence":
      return "High-confidence seller";
    case "same_product_image":
      return "Same product image";
    case "same_text_template":
      return "Repeated text";
    default:
      return trigger.replace(/_/g, " ");
  }
}

function isActionableMember(member: MonitoringCampaignMember) {
  const state = member.dismissed_at ? "dismissed" : (member.review_status ?? "pending");
  return (
    member.campaign_state === "included" &&
    (state === "pending" || state === "review") &&
    member.ready_for_review &&
    !member.licensed_seller
  );
}

function isDecisionState(state: CaseReviewStatus) {
  return state === "pending" || state === "review";
}

function isBatchSelectableFinding(finding: IpReviewFinding) {
  const state: CaseReviewStatus = finding.dismissed_at
    ? "dismissed"
    : (finding.review_status ?? "pending");
  return (
    (state === "pending" || state === "review") &&
    finding.ready_for_review &&
    !finding.licensed_seller
  );
}

function uniqueCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function CampaignListItem({
  campaign,
  active,
}: {
  campaign: MonitoringCampaignSummary;
  active: boolean;
}) {
  return (
    <Link
      to={`/monitoring/campaigns/${campaign.id}`}
      className={`block border-b border-stone-100 px-3 py-3 hover:bg-stone-50 ${
        active ? "bg-blue-50/70" : "bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        {campaign.sample_image_url ? (
          <img
            src={campaign.sample_image_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-md border border-stone-200 object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-md border border-dashed border-stone-200 bg-stone-50" />
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-stone-900">{campaign.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-stone-500">
            {campaign.ip_name ?? "Unknown IP"} - {campaignTriggerLabel(campaign.trigger)}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
              {uniqueCountLabel(campaign.included_count, "item")}
            </span>
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              {campaign.open_count} open
            </span>
            {campaign.platform_count > 0 && (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                {campaign.platform_count} platforms
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function CampaignMemberRow({
  campaignId,
  member,
  active,
  onUpdated,
  onOpen,
}: {
  campaignId: string;
  member: MonitoringCampaignMember;
  active: boolean;
  onUpdated: (member: MonitoringCampaignMember) => void;
  onOpen: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const status = findingStatusBadge(member);
  const actionable = isActionableMember(member);
  const thumbUrls = tableImageUrls(member);
  const thumbUrl = thumbUrls[0];

  async function setState(state: "included" | "excluded") {
    const reason =
      state === "excluded"
        ? window.prompt("Reason for excluding this finding?", member.exception_reason ?? "")?.trim() || null
        : null;
    if (state === "excluded" && reason === null) return;
    setSaving(true);
    try {
      const { member: updated } = await updateMonitoringCampaignMember(
        campaignId,
        member.result_id,
        { state, exception_reason: reason },
      );
      onUpdated(updated);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer ${
        active
          ? "bg-blue-50/70"
          : member.campaign_state === "excluded"
            ? "bg-stone-50/70 text-stone-500 hover:bg-stone-100/70"
            : "bg-white hover:bg-stone-50"
      }`}
    >
      <td className="w-16 px-2 py-2 align-middle">
        {thumbUrl ? (
          <a
            href={thumbUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="block h-12 w-12 min-w-12 overflow-hidden rounded-md border border-stone-200 bg-stone-100 hover:border-stone-400"
            title="Open listing image"
          >
            <img
              src={thumbUrl}
              alt={member.listing_title ? `${member.listing_title} listing image` : "Listing image"}
              className="block h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </a>
        ) : (
          <div className="h-12 w-12 rounded-md border border-dashed border-stone-200 bg-stone-50" />
        )}
      </td>
      <td className="min-w-[18rem] px-2 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="truncate text-sm font-bold text-stone-900 hover:underline"
          >
            {compactListingTitle(member)}
          </button>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${status.cls}`}>
            {status.label}
          </span>
          {actionable && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
              batch-ready
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-stone-500">
          {[member.seller_name, member.domain, member.found_at ? `found ${formatAgo(member.found_at)}` : null]
            .filter(Boolean)
            .join(" - ")}
        </div>
        {member.exception_reason && (
          <div className="mt-1 text-[11px] font-medium text-stone-500">
            Excluded: {member.exception_reason}
          </div>
        )}
      </td>
      <td className="hidden px-2 py-2 text-xs text-stone-500 md:table-cell">
        {member.seller_name || "-"}
      </td>
      <td className="hidden px-2 py-2 text-xs text-stone-500 lg:table-cell">
        {member.domain}
      </td>
      <td className="px-2 py-2 text-right">
        <div className="inline-flex items-center gap-1">
          <a
            href={member.page_url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            aria-label="Open listing"
            title="Open listing"
          >
            <ExternalLink size={14} />
          </a>
          {member.campaign_state === "included" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void setState("excluded");
              }}
              disabled={saving}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-stone-200 bg-white px-2 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
            >
              <X size={13} aria-hidden />
              Exclude
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void setState("included");
              }}
              disabled={saving}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              <Plus size={13} aria-hidden />
              Include
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function CampaignDetailPanel({
  campaign,
  onReload,
  onDismissed,
}: {
  campaign: MonitoringCampaignDetail;
  onReload: () => void;
  onDismissed: (campaignId: string) => void;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canMarkSentWithoutEmail = user?.role === "admin";
  const [current, setCurrent] = useState(campaign);
  const previousCampaignId = useRef(campaign.id);
  const [campaignBatchActive, setCampaignBatchActive] = useState(true);
  const [extraBatchFindings, setExtraBatchFindings] = useState<IpReviewFinding[]>([]);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [dismissingCampaign, setDismissingCampaign] = useState(false);
  const [confirmAction, setConfirmAction] = useState<BatchAction | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(campaign);
    if (previousCampaignId.current !== campaign.id) {
      setCampaignBatchActive(true);
      setExtraBatchFindings([]);
      setActiveMemberId(null);
      setDismissingIds(new Set());
      setBatchResult(null);
      setConfirmAction(null);
      previousCampaignId.current = campaign.id;
    }
  }, [campaign]);

  const includedMembers = current.members.filter((member) => member.campaign_state === "included");
  const actionableMembers = includedMembers.filter(isActionableMember);
  const excludedMembers = current.members.filter((member) => member.campaign_state === "excluded");
  const activeMember = activeMemberId
    ? current.members.find((member) => member.result_id === activeMemberId) ?? null
    : null;
  const platformText = current.platforms.slice(0, 4).join(", ");
  const sellerText = current.sellers.slice(0, 4).join(", ");

  useEffect(() => {
    if (!activeMember) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (target instanceof Element && target.closest("[data-finding-inspector]")) return;
      setActiveMemberId(null);
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [activeMember]);

  const groupedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const member of includedMembers) {
      counts.set(member.domain, (counts.get(member.domain) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [includedMembers]);

  const campaignBatchMembers = useMemo(() => {
    if (!campaignBatchActive) return [];
    const out: IpReviewFinding[] = [];
    const seen = new Set<string>();
    for (const member of actionableMembers) {
      if (seen.has(member.result_id)) continue;
      seen.add(member.result_id);
      out.push(member);
    }
    for (const finding of extraBatchFindings.filter(isBatchSelectableFinding)) {
      if (seen.has(finding.result_id)) continue;
      seen.add(finding.result_id);
      out.push(finding);
    }
    return out;
  }, [actionableMembers, campaignBatchActive, extraBatchFindings]);
  const selectedSummary = useMemo(
    () => selectedFindingSummary(campaignBatchMembers),
    [campaignBatchMembers],
  );

  function partitionCampaignSelection(action: BatchAction) {
    const eligible: IpReviewFinding[] = [];
    const skipped: Record<string, number> = {};
    const skip = (reason: string) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    for (const finding of campaignBatchMembers) {
      const state: CaseReviewStatus = finding.dismissed_at
        ? "dismissed"
        : (finding.review_status ?? "pending");
      if (action === "send") {
        if (!isDecisionState(state)) skip("already sent or closed");
        else if (!finding.case_id) skip("still preparing");
        else if (finding.signer_ready === false && !canMarkSentWithoutEmail) skip("missing signer information");
        else eligible.push(finding);
      } else if (action === "review") {
        if (state !== "pending") skip("not in triage");
        else if (!finding.case_id) skip("still preparing");
        else if (!finding.ip_id) skip("no associated IP");
        else eligible.push(finding);
      } else if (action === "false_positive" || action === "do_not_pursue" || action === "second_hand") {
        if (finding.dismissed_at) skip("already dismissed");
        else if (!finding.ip_id) skip("no associated IP");
        else eligible.push(finding);
      } else {
        if (state !== "takedown_sent") skip("not awaiting enforcement");
        else if (!finding.ip_id) skip("no associated IP");
        else eligible.push(finding);
      }
    }
    return { eligible, skipped };
  }

  async function runCampaignBatch(action: BatchAction) {
    const { eligible, skipped } = partitionCampaignSelection(action);
    const skipCounts: Record<string, number> = { ...skipped };
    let ok = 0;
    let failed = 0;
    if (eligible.length === 0) {
      setBatchResult(summarizeBatch(action, 0, skipCounts, 0));
      return;
    }
    setBatchProgress({ done: 0, total: eligible.length });
    const bump = (reason: string) => {
      skipCounts[reason] = (skipCounts[reason] ?? 0) + 1;
    };
    await runPool(
      eligible,
      async (finding) => {
        try {
          if (action === "send") {
            const r = await autoSendTakedown(finding.case_id as string);
            if (r.status === "sent") ok++;
            else if (canMarkSentWithoutEmail) {
              await markTakedownSentWithoutEmail(finding.case_id as string);
              ok++;
            } else if (r.status === "needs_compose") bump("needs manual compose");
            else bump("email not configured");
          } else if (action === "false_positive" || action === "do_not_pursue" || action === "second_hand") {
            await dismissIpFinding(finding.ip_id as string, finding.result_id, { reason: action });
            ok++;
          } else if (action === "review") {
            await markIpFindingNeedsReview(finding.ip_id as string, finding.result_id);
            ok++;
          } else {
            await markIpFindingEnforced(finding.ip_id as string, finding.result_id);
            ok++;
          }
        } catch {
          failed++;
        } finally {
          setBatchProgress((progress) => progress ? { ...progress, done: progress.done + 1 } : progress);
        }
      },
      4,
    );
    setBatchProgress(null);
    setCampaignBatchActive(false);
    setBatchResult(summarizeBatch(action, ok, skipCounts, failed));
    onReload();
  }

  async function handleInspectorDismiss(reason: MonitoringReviewOutcome) {
    if (!activeMember || !activeMember.ip_id) {
      alert("Cannot update finding: finding has no associated IP.");
      return;
    }
    setDismissingIds((prev) => new Set(prev).add(activeMember.result_id));
    try {
      await dismissIpFinding(activeMember.ip_id, activeMember.result_id, { reason });
      setBatchResult(`${compactListingTitle(activeMember)} dismissed.`);
      setActiveMemberId(null);
      onReload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to dismiss finding");
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(activeMember.result_id);
        return next;
      });
    }
  }

  function addRelatedToCampaignBatch(findings: IpReviewFinding[]) {
    const openFindings = findings.filter(isBatchSelectableFinding);
    if (openFindings.length === 0) {
      setBatchResult("No open related findings to add.");
      return;
    }
    setCampaignBatchActive(true);
    setExtraBatchFindings((prev) => {
      const next = new Map(prev.map((finding) => [finding.result_id, finding]));
      for (const finding of openFindings) next.set(finding.result_id, finding);
      return Array.from(next.values());
    });
    setBatchResult(`Added ${openFindings.length} related finding${openFindings.length === 1 ? "" : "s"} to the campaign batch.`);
  }

  useEffect(() => {
    function editableTarget(target: EventTarget | null) {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (editableTarget(e.target)) return;
      if (batchProgress || confirmAction || campaignBatchMembers.length === 0) return;

      const action: BatchAction | null =
        e.key === "1" ? "false_positive" :
        e.key === "2" ? "second_hand" :
        e.key === "3" ? "do_not_pursue" :
        e.key.toLowerCase() === "r" ? "review" :
        e.key.toLowerCase() === "t" ? "send" :
        null;
      if (!action) return;

      e.preventDefault();
      setConfirmAction(action);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [batchProgress, campaignBatchMembers.length, confirmAction]);

  function refreshAfterInspectorUpdate(opts?: { completed?: boolean }) {
    if (opts?.completed) setActiveMemberId(null);
    onReload();
  }

  function updateMember(updated: MonitoringCampaignMember) {
    setCurrent((prev) => {
      const members = prev.members.map((member) =>
        member.result_id === updated.result_id ? updated : member,
      );
      return {
        ...prev,
        members,
        included_count: members.filter((member) => member.campaign_state === "included").length,
        excluded_count: members.filter((member) => member.campaign_state === "excluded").length,
        open_count: members.filter(isActionableMember).length,
      };
    });
  }

  async function handleDismissCampaign() {
    const rawReason = window.prompt("Reason for dismissing this campaign?", "");
    if (rawReason === null) return;
    setDismissingCampaign(true);
    try {
      await dismissMonitoringCampaign(current.id, rawReason.trim() || null);
      onDismissed(current.id);
      navigate("/monitoring/campaigns");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to dismiss campaign");
    } finally {
      setDismissingCampaign(false);
    }
  }

  return (
    <div className="min-w-0 flex-1">
      <div className="rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-stone-400">
                <GitBranch size={13} aria-hidden />
                <span>{campaignTriggerLabel(current.trigger)}</span>
              </div>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-stone-900">
                {current.title}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-5 text-stone-500">
                {current.reason || "Confirmed monitoring campaign."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDismissCampaign()}
                disabled={dismissingCampaign}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Archive size={15} aria-hidden />
                {dismissingCampaign ? "Dismissing..." : "Dismiss"}
              </button>
              <button
                type="button"
                onClick={onReload}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-200 text-stone-500 hover:bg-stone-50"
                aria-label="Refresh campaign"
                title="Refresh"
              >
                <RefreshCw size={15} />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/monitoring/tasks?status=all&campaign_batch=${current.id}`)}
                disabled={actionableMembers.length === 0}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-stone-300"
              >
                <ListChecks size={15} aria-hidden />
                View {actionableMembers.length} as Tasks
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Included" value={String(current.included_count)} />
            <Metric label="Open" value={String(actionableMembers.length)} tone="amber" />
            <Metric label="Platforms" value={String(current.platform_count)} />
            <Metric label="Sellers" value={String(current.seller_count)} />
            <Metric
              label="Est. market"
              value={current.estimated_market_usd == null ? "-" : formatMoney(current.estimated_market_usd, "USD")}
            />
          </div>
        </div>

        <div className="grid gap-0 border-b border-stone-100 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-b border-stone-100 px-4 py-3 lg:border-b-0 lg:border-r">
            <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">Representative evidence</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <EvidenceChip label="IP" value={current.ip_name ?? "Unknown"} />
              <EvidenceChip label="Platforms" value={platformText || "-"} />
              <EvidenceChip label="Sellers" value={sellerText || "-"} />
              {groupedCounts.slice(0, 4).map(([domain, count]) => (
                <EvidenceChip key={domain} label={domain} value={`${count} findings`} />
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">Exceptions</h2>
            {excludedMembers.length === 0 ? (
              <p className="mt-2 text-xs text-stone-400">No excluded findings.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {excludedMembers.slice(0, 6).map((member) => (
                  <span
                    key={member.result_id}
                    className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600"
                    title={member.exception_reason ?? undefined}
                  >
                    {compactListingTitle(member)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          {batchResult && (
            <div className="mb-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              {batchResult}
            </div>
          )}
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-stone-500">Members</h2>
            <div className="flex items-center gap-1.5 text-[11px] text-stone-400">
              <AlertTriangle size={12} className="text-amber-500" aria-hidden />
              <span>Logo-only evidence should stay contextual unless another signal supports the campaign.</span>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border border-stone-200">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/70 text-[10px] uppercase tracking-wide text-stone-400">
                  <th className="px-2 py-1.5"><span className="sr-only">Image</span></th>
                  <th className="px-2 py-1.5">Listing</th>
                  <th className="hidden px-2 py-1.5 md:table-cell">Seller</th>
                  <th className="hidden px-2 py-1.5 lg:table-cell">Platform</th>
                  <th className="px-2 py-1.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {current.members.map((member) => (
                  <CampaignMemberRow
                    key={member.result_id}
                    campaignId={current.id}
                    member={member}
                    active={member.result_id === activeMemberId}
                    onUpdated={updateMember}
                    onOpen={() => setActiveMemberId(member.result_id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <BatchOperationBar
        selectedCount={campaignBatchMembers.length}
        selectedSummary={selectedSummary}
        batchProgress={batchProgress}
        onAction={setConfirmAction}
        onClear={() => {
          setCampaignBatchActive(false);
          setExtraBatchFindings([]);
        }}
        showResort={false}
      />
      {activeMember && (
        <FindingInspector
          f={activeMember}
          ipId={activeMember.ip_id}
          showIp
          isDismissed={!!activeMember.dismissed_at || dismissingIds.has(activeMember.result_id)}
          isDismissing={dismissingIds.has(activeMember.result_id) && !activeMember.dismissed_at}
          onClose={() => setActiveMemberId(null)}
          onDismiss={(reason) => void handleInspectorDismiss(reason)}
          onActionComplete={() => setActiveMemberId(null)}
          onNeedsReview={() => setBatchResult(`${compactListingTitle(activeMember)} moved to review.`)}
          onTakedownSent={() => setBatchResult(`Takedown sent for ${compactListingTitle(activeMember)}.`)}
          onEnforced={() => setBatchResult(`${compactListingTitle(activeMember)} marked enforced.`)}
          onLicensed={(dismissedCount) =>
            setBatchResult(`Licensed seller. ${dismissedCount} finding${dismissedCount === 1 ? "" : "s"} dismissed.`)
          }
          onUpdated={refreshAfterInspectorUpdate}
          onAddRelatedToBatch={addRelatedToCampaignBatch}
          showRelatedItems={false}
        />
      )}
      {confirmAction && (
        <BatchConfirmModal
          action={confirmAction}
          eligible={partitionCampaignSelection(confirmAction).eligible}
          skipped={partitionCampaignSelection(confirmAction).skipped}
          onConfirm={() => {
            const action = confirmAction;
            setConfirmAction(null);
            void runCampaignBatch(action);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "stone",
}: {
  label: string;
  value: string;
  tone?: "stone" | "amber";
}) {
  const cls = tone === "amber" ? "text-amber-700" : "text-stone-900";
  return (
    <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`mt-0.5 text-lg font-black ${cls}`}>{value}</div>
    </div>
  );
}

function EvidenceChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-stone-200 bg-white px-2 py-1 text-xs text-stone-600">
      <span className="font-bold text-stone-400">{label}</span>
      <span className="max-w-[18rem] truncate">{value}</span>
    </span>
  );
}

export default function MonitoringCampaigns() {
  const { campaignId } = useParams<{ campaignId?: string }>();
  const [campaigns, setCampaigns] = useState<MonitoringCampaignSummary[]>([]);
  const [campaign, setCampaign] = useState<MonitoringCampaignDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [ips, setIps] = useState<Trademark[]>([]);
  const [selectedIpId, setSelectedIpId] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeCampaignId = campaignId ?? campaigns[0]?.id ?? null;

  const loadCampaigns = useCallback(async () => {
    setLoadingList(true);
    setError("");
    try {
      const { campaigns } = await listMonitoringCampaigns({
        limit: 100,
        ip_id: selectedIpId || null,
        include_inactive: showInactive,
      });
      setCampaigns(campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns");
    } finally {
      setLoadingList(false);
    }
  }, [selectedIpId, showInactive]);

  async function handleDiscoverCampaigns() {
    setDiscovering(true);
    setError("");
    setNotice("");
    try {
      const { created } = await discoverMonitoringCampaigns({
        lookback_days: 30,
        limit: 20,
      });
      setNotice(
        created === 0
          ? "No new seller-risk campaigns found."
          : `Created ${created} seller-risk campaign${created === 1 ? "" : "s"}.`,
      );
      await loadCampaigns();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to discover campaigns");
    } finally {
      setDiscovering(false);
    }
  }

  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setError("");
    try {
      const { campaign } = await getMonitoringCampaign(id);
      setCampaign(campaign);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaign");
      setCampaign(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    let cancelled = false;
    listTrademarks()
      .then(({ trademarks }) => {
        if (!cancelled) {
          setIps([...trademarks].sort((a, b) => a.name.localeCompare(b.name)));
        }
      })
      .catch(() => {
        if (!cancelled) setIps([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeCampaignId) {
      setCampaign(null);
      return;
    }
    void loadDetail(activeCampaignId);
  }, [activeCampaignId, loadDetail]);

  const activeId = campaign?.id ?? activeCampaignId;

  return (
    <div className="mx-auto max-w-7xl px-6 py-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-stone-900">Campaigns</h1>
          <p className="mt-1 text-xs text-stone-500">
            {campaigns.length} {showInactive ? "" : "active "}campaign{campaigns.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleDiscoverCampaigns()}
            disabled={discovering}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-stone-900 px-3 text-xs font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            <Search size={14} aria-hidden />
            {discovering ? "Discovering..." : "Discover campaigns"}
          </button>
          <Link
            to="/monitoring/tasks"
            className="inline-flex h-9 items-center rounded-md border border-stone-200 bg-white px-3 text-xs font-bold text-stone-700 hover:bg-stone-50"
          >
            Triage queue
          </Link>
        </div>
      </div>

      {notice && (
        <div className="mb-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="rounded-lg border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-3 py-2">
            <div className="text-xs font-bold uppercase tracking-wide text-stone-500">
              {showInactive ? "Campaigns" : "Active"}
            </div>
            <button
              type="button"
              onClick={() => void loadCampaigns()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              aria-label="Refresh campaigns"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="space-y-2 border-b border-stone-100 px-3 py-3">
            <select
              value={selectedIpId}
              onChange={(e) => setSelectedIpId(e.target.value)}
              className="h-8 w-full rounded-md border border-stone-200 bg-white px-2 text-xs font-semibold text-stone-700 outline-none focus:border-blue-400"
              aria-label="Filter campaigns by IP"
            >
              <option value="">All IPs</option>
              {ips.map((ip) => (
                <option key={ip.id} value={ip.id}>
                  {ip.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-blue-600"
              />
              Show campaigns with no active cases
            </label>
          </div>
          {loadingList ? (
            <div className="px-3 py-8 text-center text-sm text-stone-400">Loading...</div>
          ) : campaigns.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-stone-400">No matching campaigns.</div>
          ) : (
            <div>
              {campaigns.map((item) => (
                <CampaignListItem
                  key={item.id}
                  campaign={item}
                  active={item.id === activeId}
                />
              ))}
            </div>
          )}
        </div>

        {loadingDetail && !campaign ? (
          <div className="rounded-lg border border-stone-200 bg-white px-5 py-12 text-center text-sm text-stone-400">
            Loading campaign...
          </div>
        ) : campaign ? (
          <CampaignDetailPanel
            campaign={campaign}
            onReload={() => {
              void loadCampaigns();
              void loadDetail(campaign.id);
            }}
            onDismissed={(dismissedId) => {
              setCampaigns((prev) => prev.filter((item) => item.id !== dismissedId));
              setCampaign(null);
              void loadCampaigns();
            }}
          />
        ) : (
          <div className="rounded-lg border border-stone-200 bg-white px-5 py-12 text-center text-sm text-stone-400">
            Select a campaign.
          </div>
        )}
      </div>
    </div>
  );
}
