import type { ReactNode } from "react";
import { ExternalLink, MapPin, PackageOpen, ShieldAlert, ShieldCheck, ShoppingBag, Star, Store } from "lucide-react";
import type { MonitoringSellerProfilePage } from "../../api";
import { formatAgo, formatMoney } from "../../components/monitoring/board/utils";
import { monitoringPlatformLabel } from "../../lib/platforms";
import { SellerSales } from "./SellerSales";

export function SellerProfileHeader({ profile }: { profile: MonitoringSellerProfilePage }) {
  const { seller, summary } = profile;
  const notVerified = summary.blocked_listings + summary.unknown_availability;
  return (
    <div className="space-y-6 mb-6">
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
                  {monitoringPlatformLabel(seller.domain)}
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
                <SellerSales count={seller.sales} observation={seller.sales_observation} />
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

      {summary.returned_listing_count > 0 && (
        <section className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-950">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
            <ShieldAlert size={18} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-black">This seller returned after a previous takedown</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-red-800">
              {summary.returned_listing_count === 1
                ? "One open listing was found after an earlier takedown."
                : `${summary.returned_listing_count} open listings were found after earlier takedowns.`}
              {summary.last_prior_takedown_at
                ? ` The latest preceding takedown was ${formatAgo(summary.last_prior_takedown_at) ?? "previously"}.`
                : ""}
              {" "}Review the current listings on their own evidence.
            </p>
          </div>
        </section>
      )}

    </div>
  );
}

function Metric({ label, value, icon, alert = false }: { label: string; value: string; icon?: ReactNode; alert?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-4">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-stone-400">{icon}{label}</div>
      <div className={`mt-1 truncate text-lg font-black tabular-nums ${alert ? "text-red-700" : "text-stone-900"}`}>{value}</div>
    </div>
  );
}
