import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Clock3,
  ExternalLink,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";
import {
  listMonitoringSellers,
  type MonitoringSellerListStatus,
  type MonitoringSellerSummary,
  type MonitoringSellersPage,
} from "../api";
import { useAuth } from "../context/AuthContext";
import { useActiveIp } from "../context/ActiveIpContext";
import { monitoringPlatformLabel } from "../lib/platforms";
import { sellerProfilePath } from "../lib/sellers";
import { formatAgo, formatMoney } from "../components/monitoring/board/utils";

const STATUS_OPTIONS: Array<{
  value: MonitoringSellerListStatus;
  label: string;
}> = [
  { value: "open", label: "Open sellers" },
  { value: "returned", label: "Returned sellers" },
  { value: "all", label: "All history" },
];

function sellerListStatus(value: string | null): MonitoringSellerListStatus {
  return value === "returned" || value === "all" ? value : "open";
}

function withQuery(path: string, params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export default function Sellers() {
  const { actingTenantId } = useAuth();
  const { ips, activeIpId, activeIp, selectIp, loading: loadingIps } = useActiveIp();
  const [params, setParams] = useSearchParams();
  const status = sellerListStatus(params.get("status"));
  const query = params.get("q") ?? "";
  const platform = params.get("platform") ?? "";
  const allIps = params.get("scope") === "all";
  const effectiveIpId = allIps ? null : activeIpId;
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [page, setPage] = useState<MonitoringSellersPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (loadingIps) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void listMonitoringSellers({
      status,
      ip_id: effectiveIpId,
      platform: platform.trim() || null,
      query: debouncedQuery || null,
      signal: controller.signal,
    })
      .then(setPage)
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPage(null);
        setError(caught instanceof Error ? caught.message : "Unable to load sellers.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [actingTenantId, allIps, debouncedQuery, effectiveIpId, loadingIps, platform, status]);

  const platformOptions = useMemo(() => Array.from(new Set([
    ...(platform ? [platform] : []),
    ...(page?.platforms ?? []),
  ])).sort(), [page?.platforms, platform]);
  const returnedSellers = page?.sellers.filter((seller) => seller.returned_listing_count > 0) ?? [];
  const otherSellers = page?.sellers.filter((seller) => seller.returned_listing_count === 0) ?? [];
  const returnedSellerCount = page?.returned_seller_count ?? 0;

  function updateParam(key: string, value: string | null, defaultValue?: string) {
    const next = new URLSearchParams(params);
    if (!value || value === defaultValue) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: key === "q" });
  }

  function updateIp(value: string) {
    if (value === "all") {
      updateParam("scope", "all");
      return;
    }
    selectIp(value);
    updateParam("scope", null);
  }

  async function loadMore() {
    if (!page?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await listMonitoringSellers({
        status,
        ip_id: effectiveIpId,
        platform: platform.trim() || null,
        query: debouncedQuery || null,
        cursor: page.next_cursor,
      });
      setPage((current) => current ? {
        ...next,
        sellers: [...current.sellers, ...next.sellers],
      } : next);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to load more sellers.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2 text-red-700">
            <Store size={17} aria-hidden />
            <span className="text-xs font-bold uppercase tracking-[0.14em]">Seller monitoring</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-stone-950">Sellers</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            Review sellers across their listings. Sellers with listings first discovered after a previous takedown appear first.
          </p>
        </div>
        {page && (
          <div className="flex items-center gap-4 text-right">
            <HeaderMetric label="Sellers" value={page.total_sellers} />
            <HeaderMetric label="Returned" value={page.returned_seller_count} alert={page.returned_seller_count > 0} />
          </div>
        )}
      </header>

      {returnedSellerCount > 0 && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-950">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
              <ShieldAlert size={18} aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-black">Previous sellers have new listings</h2>
              <p className="mt-0.5 text-xs leading-relaxed text-red-800">
                {returnedSellerCount === 1
                  ? "One seller has an open listing found after an earlier takedown."
                  : `${returnedSellerCount} sellers have open listings found after earlier takedowns.`}
              </p>
            </div>
          </div>
          {status !== "returned" && (
            <button
              type="button"
              onClick={() => updateParam("status", "returned")}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-700 px-3 text-xs font-bold text-white shadow-sm hover:bg-red-800"
            >
              Review returned sellers <ArrowRight size={13} aria-hidden />
            </button>
          )}
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3">
            <Search size={15} className="shrink-0 text-stone-400" aria-hidden />
            <input
              value={query}
              onChange={(event) => updateParam("q", event.target.value)}
              placeholder="Search seller or marketplace"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-stone-800 outline-none placeholder:text-stone-400"
              aria-label="Search sellers"
            />
          </div>
          <select
            value={allIps || !activeIpId ? "all" : activeIpId}
            onChange={(event) => updateIp(event.target.value)}
            disabled={loadingIps}
            className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700"
            aria-label="Filter sellers by IP"
          >
            <option value="all">All IPs</option>
            {ips.map((ip) => <option key={ip.id} value={ip.id}>{ip.name}</option>)}
          </select>
          <div className="relative">
            <select
              value={platform}
              onChange={(event) => updateParam("platform", event.target.value)}
              className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 lg:w-48"
              aria-label="Filter sellers by marketplace"
            >
              <option value="">All marketplaces</option>
              {platformOptions.map((domain) => (
                <option key={domain} value={domain}>{monitoringPlatformLabel(domain)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-stone-100 p-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateParam("status", option.value, "open")}
              className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                status === option.value
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {option.label}
            </button>
          ))}
          {!allIps && activeIp && (
            <span className="ml-auto hidden px-2 text-[11px] font-semibold text-stone-400 sm:inline">
              {activeIp.name}
            </span>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading && !page ? (
        <SellerGridSkeleton />
      ) : !page || page.sellers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center">
          <Store className="mx-auto text-stone-300" size={30} aria-hidden />
          <h2 className="mt-3 text-sm font-bold text-stone-800">No sellers in this view</h2>
          <p className="mt-1 text-xs text-stone-500">Try another status, IP, marketplace, or search.</p>
        </div>
      ) : (
        <div className={`space-y-7 transition-opacity ${loading ? "opacity-60" : "opacity-100"}`}>
          {returnedSellers.length > 0 && (
            <SellerSection
              title="Returned sellers"
              description="Different listings found after an earlier takedown."
              sellers={returnedSellers}
            />
          )}
          {otherSellers.length > 0 && (
            <SellerSection
              title={returnedSellers.length > 0 ? "Other sellers" : "Sellers with current listings"}
              description="Grouped by marketplace account, with the most active sellers first."
              sellers={otherSellers}
            />
          )}
          {page.next_cursor && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more sellers"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeaderMetric({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-stone-400">{label}</div>
      <div className={`text-xl font-black tabular-nums ${alert ? "text-red-700" : "text-stone-900"}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function SellerSection({
  title,
  description,
  sellers,
}: {
  title: string;
  description: string;
  sellers: MonitoringSellerSummary[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-black text-stone-900">{title}</h2>
        <p className="mt-0.5 text-xs text-stone-500">{description}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sellers.map((seller) => <SellerCard key={seller.seller_key} seller={seller} />)}
      </div>
    </section>
  );
}

function SellerCard({ seller }: { seller: MonitoringSellerSummary }) {
  const basePath = sellerProfilePath(seller.seller_key) ?? "/monitoring/tasks";
  const href = withQuery(basePath, {
    finding: seller.latest_result_id,
    status: seller.open_listing_count > 0 ? null : "all",
  });
  const returned = seller.returned_listing_count > 0;

  return (
    <article className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
      returned ? "border-red-200 ring-1 ring-red-100" : "border-stone-200"
    }`}>
      <div className="flex gap-4 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-stone-100 text-stone-300">
          {seller.sample_image_url ? (
            <img
              src={seller.sample_image_url}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          ) : <Store size={24} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link to={href} className="block truncate text-base font-black text-stone-950 hover:text-blue-700 hover:underline">
                {seller.seller_name}
              </Link>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                <span className="truncate">{monitoringPlatformLabel(seller.domain)}</span>
                {seller.profile_url && (
                  <a
                    href={seller.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="shrink-0 text-stone-400 hover:text-blue-700"
                    aria-label="Open marketplace seller profile"
                  >
                    <ExternalLink size={11} aria-hidden />
                  </a>
                )}
              </div>
            </div>
            {returned && (
              <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-red-700">
                Returned
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
            {seller.rating != null && <span>★ {seller.rating.toFixed(1)}</span>}
            {seller.sales != null && <span>{seller.sales.toLocaleString()} sales</span>}
            <span className="inline-flex items-center gap-1"><Clock3 size={11} /> {formatAgo(seller.latest_found_at) ?? "recently"}</span>
          </div>
        </div>
      </div>

      {returned && (
        <div className="border-y border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-800">
          <span className="font-black">{seller.returned_listing_count}</span>{" "}
          {seller.returned_listing_count === 1 ? "open listing was" : "open listings were"} found after a previous takedown.
        </div>
      )}

      <div className="grid grid-cols-3 divide-x divide-stone-100 border-b border-stone-100">
        <CardMetric icon={<ShoppingBag size={13} />} label="Open" value={seller.open_listing_count.toLocaleString()} />
        <CardMetric icon={<ShieldCheck size={13} />} label="Takedowns" value={seller.prior_enforcement_count.toLocaleString()} alert={returned} />
        <CardMetric label="Exposure" value={formatMoney(seller.monitored_market_usd, "USD")} />
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-[11px] text-stone-500" title={seller.ip_names.join(", ")}>
          {seller.affected_ip_count === 1
            ? seller.ip_names[0] ?? "1 affected IP"
            : `${seller.affected_ip_count} affected IPs`}
        </p>
        <Link to={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-blue-700 hover:underline">
          Review listings <ArrowRight size={12} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function CardMetric({
  icon,
  label,
  value,
  alert = false,
}: {
  icon?: ReactNode;
  label: string;
  value: string;
  alert?: boolean;
}) {
  return (
    <div className="min-w-0 px-3 py-3 text-center">
      <div className="flex items-center justify-center gap-1 text-[9px] font-bold uppercase tracking-wide text-stone-400">
        {icon}{label}
      </div>
      <div className={`mt-0.5 truncate text-sm font-black tabular-nums ${alert ? "text-red-700" : "text-stone-900"}`}>
        {value}
      </div>
    </div>
  );
}

function SellerGridSkeleton() {
  return (
    <div className="grid animate-pulse gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-64 rounded-2xl border border-stone-100 bg-stone-100" />
      ))}
    </div>
  );
}
