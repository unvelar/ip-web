import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  PackageOpen,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
} from "lucide-react";
import {
  dismissIpFinding,
  getMonitoringSellerProfile,
  isApiError,
  type IpReviewFinding,
  type MonitoringReviewOutcome,
  type MonitoringSellerAvailability,
  type MonitoringSellerProfilePage,
  type MonitoringSellerSort,
  type MonitoringSellerStatus,
} from "../api";
import {
  compactListingTitle,
  findingStatusBadge,
  formatAgo,
  formatMoney,
  tableImageUrls,
} from "../components/monitoring/board/utils";
import { FindingInspector } from "../components/monitoring/board/FindingInspector";

const STATUS_OPTIONS: Array<{ value: MonitoringSellerStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "enforced", label: "Enforced" },
  { value: "dismissed", label: "Closed" },
];

const SORT_OPTIONS: Array<{ value: MonitoringSellerSort; label: string }> = [
  { value: "found_desc", label: "Newest found" },
  { value: "risk_desc", label: "Highest risk" },
  { value: "price_desc", label: "Highest price" },
];

function sellerStatus(value: string | null): MonitoringSellerStatus {
  return value === "all" || value === "dismissed" || value === "enforced" ? value : "open";
}

function sellerSort(value: string | null): MonitoringSellerSort {
  return value === "price_desc" || value === "risk_desc" ? value : "found_desc";
}

function sellerAvailability(value: string | null): MonitoringSellerAvailability | null {
  return value === "available" || value === "blocked" || value === "unknown" || value === "unavailable" ? value : null;
}

export default function SellerProfile() {
  const { sellerKey = "" } = useParams<{ sellerKey: string }>();
  const [params, setParams] = useSearchParams();
  const status = sellerStatus(params.get("status"));
  const sort = sellerSort(params.get("sort"));
  const availability = sellerAvailability(params.get("availability"));
  const ipId = params.get("ip_id");
  const [profile, setProfile] = useState<MonitoringSellerProfilePage | null>(null);
  const [knownIps, setKnownIps] = useState<MonitoringSellerProfilePage["ips"]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [dismissing, setDismissing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const activeFindingId = params.get("finding");
  const activeFinding = profile?.findings.find((finding) => finding.result_id === activeFindingId) ?? null;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getMonitoringSellerProfile(sellerKey, {
      status,
      sort,
      availability,
      ip_id: ipId,
      signal: controller.signal,
    })
      .then((next) => {
        setProfile(next);
        if (!ipId || knownIps.length === 0) setKnownIps(next.ips);
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setProfile(null);
        setError(
          isApiError(caught, 404)
            ? "This seller profile could not be found."
            : caught instanceof Error ? caught.message : "Unable to load this seller.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // `knownIps` is deliberately retained across profile filters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerKey, status, sort, availability, ipId, reloadToken]);

  function updateParam(key: string, value: string | null, defaultValue?: string) {
    const next = new URLSearchParams(params);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setParams(next);
  }

  function setActiveFinding(resultId: string | null) {
    const next = new URLSearchParams(params);
    if (resultId) next.set("finding", resultId);
    else next.delete("finding");
    setParams(next);
  }

  async function dismissFinding(finding: IpReviewFinding, reason: MonitoringReviewOutcome) {
    if (dismissing || !finding.ip_id) return;
    setDismissing(true);
    try {
      await dismissIpFinding(finding.ip_id, finding.result_id, { reason });
      setActiveFinding(null);
      setReloadToken((current) => current + 1);
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : "Unable to update this finding.");
    } finally {
      setDismissing(false);
    }
  }

  async function loadMore() {
    if (!profile?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await getMonitoringSellerProfile(sellerKey, {
        status,
        sort,
        availability,
        ip_id: ipId,
        cursor: profile.next_cursor,
      });
      setProfile((current) => current ? {
        ...next,
        findings: [...current.findings, ...next.findings],
      } : next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load more listings.");
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading && !profile) return <SellerProfileSkeleton />;

  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link to="/monitoring/tasks" className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-500 hover:text-stone-900">
          <ArrowLeft size={15} /> Back to monitoring
        </Link>
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {error || "Unable to load this seller."}
        </div>
      </div>
    );
  }

  const { seller, summary } = profile;
  const notVerified = (summary.blocked_listings ?? 0) + summary.unknown_availability;

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-6">
      <div>
        <Link to="/monitoring/tasks" className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900">
          <ArrowLeft size={14} /> Monitoring tasks
        </Link>
      </div>

      <header className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 bg-gradient-to-br from-stone-50 to-white px-5 py-5 sm:px-7">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-700 shadow-sm">
              <Store size={23} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black tracking-tight text-stone-950">{seller.name}</h1>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600">
                  {seller.domain}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                {seller.rating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <strong className="text-stone-700">{seller.rating.toFixed(1)}</strong>
                    {seller.rating_count != null && ` (${seller.rating_count.toLocaleString()})`}
                  </span>
                )}
                {seller.sales != null && <span>{seller.sales.toLocaleString()} marketplace sales</span>}
                {seller.years_active != null && <span>{seller.years_active} years active</span>}
                {seller.location && <span className="inline-flex items-center gap-1"><MapPin size={13} />{seller.location}</span>}
              </div>
            </div>
            {seller.profile_url && (
              <a
                href={seller.profile_url}
                target="_blank"
                rel="noreferrer"
                className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 hover:border-stone-400 hover:bg-stone-50 sm:inline-flex"
              >
                Marketplace shop <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-stone-100 sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Metric label="Open findings" value={summary.monitored_listings.toLocaleString()} icon={<ShoppingBag size={15} />} />
          <Metric label="Available" value={summary.available_listings.toLocaleString()} icon={<PackageOpen size={15} />} />
          <Metric label="Not verified" value={notVerified.toLocaleString()} />
          <Metric label="Market value" value={formatMoney(summary.monitored_market_usd, "USD")} />
          <Metric label="Affected IPs" value={summary.affected_ip_count.toLocaleString()} />
          <Metric label="Prior enforcement" value={summary.prior_enforcement_count.toLocaleString()} icon={<ShieldCheck size={15} />} alert={summary.prior_enforcement_count > 0} />
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg bg-stone-100 p-1">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateParam("status", option.value, "open")}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  status === option.value ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={availability ?? ""}
              onChange={(event) => updateParam("availability", event.target.value || null)}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
              aria-label="Filter availability"
            >
              <option value="">Any availability</option>
              <option value="available">Available</option>
              <option value="blocked">Couldn’t verify</option>
              <option value="unknown">Not yet verified</option>
              <option value="unavailable">Unavailable</option>
            </select>
            <select
              value={sort}
              onChange={(event) => updateParam("sort", event.target.value, "found_desc")}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700"
              aria-label="Sort listings"
            >
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {knownIps.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">IP</span>
            <FilterChip active={!ipId} label="All IPs" onClick={() => updateParam("ip_id", null)} />
            {knownIps.map((ip) => (
              <FilterChip
                key={ip.ip_id}
                active={ipId === ip.ip_id}
                label={`${ip.ip_name} · ${ip.findings}`}
                onClick={() => updateParam("ip_id", ip.ip_id)}
              />
            ))}
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {profile.findings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center">
            <ShoppingBag className="mx-auto text-stone-300" size={28} />
            <h2 className="mt-3 text-sm font-bold text-stone-800">No listings in this view</h2>
            <p className="mt-1 text-xs text-stone-500">Try a different status, IP, or availability filter.</p>
          </div>
        ) : (
          <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${loading ? "opacity-60" : ""}`}>
            {profile.findings.map((finding) => (
              <SellerListingCard
                key={finding.result_id}
                finding={finding}
                active={finding.result_id === activeFindingId}
                onOpen={() => setActiveFinding(finding.result_id)}
              />
            ))}
          </div>
        )}

        {profile.next_cursor && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more listings"}
            </button>
          </div>
        )}
      </section>

      {activeFinding && (
        <FindingInspector
          f={activeFinding}
          ipId={activeFinding.ip_id}
          showIp
          isDismissed={!!activeFinding.dismissed_at}
          isDismissing={dismissing}
          onClose={() => setActiveFinding(null)}
          onDismiss={(reason) => void dismissFinding(activeFinding, reason)}
          onActionComplete={() => setActiveFinding(null)}
          onNeedsReview={() => undefined}
          onTakedownSent={() => undefined}
          onEnforced={() => undefined}
          onLicensed={() => undefined}
          onUpdated={() => setReloadToken((current) => current + 1)}
          onAddRelatedToBatch={() => undefined}
          showRelatedItems={false}
          taskHref={`/monitoring/tasks/${activeFinding.result_id}`}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon, alert = false }: { label: string; value: string; icon?: React.ReactNode; alert?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-400">{icon}{label}</div>
      <div className={`mt-1 truncate text-lg font-black tabular-nums ${alert ? "text-red-700" : "text-stone-900"}`}>{value}</div>
    </div>
  );
}

function FilterChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
        active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
      }`}
    >
      {label}
    </button>
  );
}

function SellerListingCard({
  finding,
  active,
  onOpen,
}: {
  finding: IpReviewFinding;
  active: boolean;
  onOpen: () => void;
}) {
  const image = tableImageUrls(finding)[0];
  const status = findingStatusBadge(finding);
  const price = finding.price_value_usd != null
    ? formatMoney(Number(finding.price_value_usd), "USD")
    : finding.price;
  const availability = availabilityLabel(finding.availability);

  return (
    <article
      onClick={onOpen}
      className={`cursor-pointer overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        active ? "border-blue-500 ring-2 ring-blue-100" : "border-stone-200"
      }`}
    >
      <div className="aspect-[16/10] overflow-hidden bg-stone-100">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full items-center justify-center text-stone-300"><ShoppingBag size={28} /></div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              className="line-clamp-2 text-left text-sm font-bold leading-5 text-stone-900 hover:text-blue-700 hover:underline"
            >
              {compactListingTitle(finding)}
            </button>
            <div className="mt-1 text-[11px] text-stone-500">Found {formatAgo(finding.found_at) ?? "recently"}</div>
          </div>
          {price && <span className="shrink-0 text-sm font-black tabular-nums text-stone-900">{price}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${status.cls}`}>{status.label}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${availability.cls}`}
            title={availability.title}
          >
            {availability.label}
          </span>
          {finding.ip_name && <span className="max-w-[11rem] truncate rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">{finding.ip_name}</span>}
          <a
            href={finding.page_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-blue-700"
          >
            Listing <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </article>
  );
}

function availabilityLabel(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "live") {
    return {
      label: "Available",
      cls: "bg-emerald-50 text-emerald-700",
      title: "The latest check confirmed that this listing is available.",
    };
  }
  if (normalized === "blocked") {
    return {
      label: "Couldn't verify",
      cls: "bg-amber-50 text-amber-700",
      title: "The website blocked our latest automated check. This finding remains open and will be checked again.",
    };
  }
  if (!normalized || normalized === "unknown" || normalized === "unchecked" || normalized === "error") {
    return {
      label: "Not yet verified",
      cls: "bg-amber-50 text-amber-700",
      title: "We do not have a reliable availability result yet. This finding remains open.",
    };
  }
  return {
    label: "Unavailable",
    cls: "bg-stone-100 text-stone-500",
    title: "The latest check found that this listing is no longer available.",
  };
}

function SellerProfileSkeleton() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse space-y-6 px-6 py-6">
      <div className="h-4 w-36 rounded bg-stone-200" />
      <div className="h-52 rounded-2xl bg-stone-100" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-72 rounded-xl bg-stone-100" />)}
      </div>
    </div>
  );
}
