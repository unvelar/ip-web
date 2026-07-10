import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, DollarSign, Globe2, SearchCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import BrandMark from "../components/BrandMark";
import { getPublicBrandSumup, type PublicBrandSumup } from "../api";

const fmtNumber = new Intl.NumberFormat("en-US");
const fmtUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const TOOLTIP_STYLE = {
  fontSize: 12,
  border: "1px solid #e7e5e4",
  borderRadius: 8,
} as const;

export default function BrandSumup() {
  const { tenantName = "", ipName = "" } = useParams();
  const [data, setData] = useState<PublicBrandSumup | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getPublicBrandSumup(tenantName, ipName)
      .then((sumup) => {
        if (!alive) return;
        setData(sumup);
        setErr("");
      })
      .catch((e) => {
        if (!alive) return;
        setData(null);
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tenantName, ipName]);

  if (loading) return <BrandSumupShell><BrandSumupSkeleton /></BrandSumupShell>;

  if (err || !data) {
    return (
      <BrandSumupShell>
        <div className="max-w-2xl mx-auto px-6 py-24 text-center">
          <h1 className="text-3xl font-black text-stone-950">Summary not found</h1>
          <p className="mt-3 text-sm text-stone-500">
            This public brand summary is unavailable or the link no longer matches a monitored IP.
          </p>
          {err && (
            <p className="mt-4 text-xs text-stone-400">
              {err}
            </p>
          )}
        </div>
      </BrandSumupShell>
    );
  }

  return (
    <BrandSumupShell>
      <Hero data={data} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
        <KpiGrid data={data} />
        <ValueSummary data={data} />
        {data.totals.analyzed_count === 0 ? (
          <EmptyState />
        ) : (
          <WebsiteBreakdown websites={data.websites} />
        )}
      </main>
    </BrandSumupShell>
  );
}

function BrandSumupShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Go to Unvelar home">
            <BrandMark className="w-8 h-8" />
            <div className="text-sm font-black">Unvelar</div>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}

function Hero({ data }: { data: PublicBrandSumup }) {
  const confirmed = confirmedUsd(data.totals);
  const potential = potentialUsd(data.totals);

  return (
    <section className="bg-white border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.65fr)] lg:items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-bold text-red-700">
              {data.tenant.name}
            </div>
            <h1 className="mt-3 text-4xl sm:text-5xl font-black text-stone-950 leading-none">
              {data.ip.name}
            </h1>
            <p className="mt-4 max-w-2xl text-sm sm:text-base text-stone-600 leading-7">
              Public result summary from marketplace monitoring and triage.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-stone-500">
              <span className="inline-flex items-center h-7 px-3 rounded-md bg-stone-100 border border-stone-200">
                {data.websites.length} websites
              </span>
              <span className="inline-flex items-center h-7 px-3 rounded-md bg-stone-100 border border-stone-200">
                Generated {formatDateTime(data.generated_at)}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 sm:p-6">
            <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-stone-400">
              Confirmed exposure
            </div>
            <div className="mt-2 text-4xl sm:text-5xl font-black text-stone-950 tabular-nums">
              {fmtUsd.format(confirmed)}
            </div>
            <div className="mt-2 text-sm font-semibold text-stone-500 tabular-nums">
              of {fmtUsd.format(potential)} potential exposure
            </div>
            <Link
              to="/monitor/start"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 sm:w-auto"
            >
              Start your scan
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function KpiGrid({ data }: { data: PublicBrandSumup }) {
  const kpis = [
    {
      label: "Analyzed",
      value: fmtNumber.format(data.totals.analyzed_count),
      icon: SearchCheck,
      tone: "text-stone-950",
    },
    {
      label: "To take down",
      value: fmtNumber.format(data.totals.to_takedown_count),
      icon: ShieldCheck,
      tone: "text-red-700",
    },
    {
      label: "Potential",
      value: fmtNumber.format(potentialCount(data.totals)),
      icon: ShieldAlert,
      tone: "text-amber-700",
    },
    {
      label: "Infringement rate",
      value: `${formatPercent(data.totals.infringement_percentage)}`,
      icon: Globe2,
      tone: "text-blue-700",
    },
  ];

  return (
    <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <div key={kpi.label} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-stone-400">
                {kpi.label}
              </div>
              <Icon className="w-4 h-4 text-stone-400" aria-hidden="true" />
            </div>
            <div className={`mt-4 text-3xl font-black tabular-nums ${kpi.tone}`}>
              {kpi.value}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ValueSummary({ data }: { data: PublicBrandSumup }) {
  const confirmed = confirmedUsd(data.totals);
  const potential = potentialUsd(data.totals);
  const unconfirmed = Math.max(potential - confirmed, 0);
  const potentialListings = potentialCount(data.totals);
  const chartData = [{ label: "Exposure", confirmed, awaiting: unconfirmed }];
  const chartDescription = `${fmtUsd.format(confirmed)} confirmed exposure and ${fmtUsd.format(unconfirmed)} awaiting confirmation, out of ${fmtUsd.format(potential)} total potential exposure.`;
  const showConfirmedLabel = potential > 0 && confirmed / potential >= 0.15;
  const showAwaitingLabel = potential > 0 && unconfirmed / potential >= 0.15;

  return (
    <section className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] font-bold text-stone-400">
              Exposure breakdown
            </div>
            <h2 className="mt-2 text-xl sm:text-2xl font-black text-stone-950 tabular-nums">
              {fmtUsd.format(potential)} potential exposure
            </h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">
              Estimated listing value split by review outcome.
            </p>
          </div>
          <DollarSign className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
        </div>

        {potential > 0 ? (
          <div className="mt-6" role="img" aria-label={chartDescription}>
            <div className="h-24 w-full" aria-hidden="true">
              <ResponsiveContainer>
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 0, bottom: 8, left: 0 }}>
                  <XAxis type="number" hide domain={[0, potential]} />
                  <YAxis type="category" dataKey="label" hide />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    cursor={{ fill: "#f5f5f4" }}
                    formatter={(value, name) => [
                      fmtUsd.format(Number(value)),
                      name === "confirmed" ? "Confirmed exposure" : "Awaiting confirmation",
                    ]}
                  />
                  <Bar
                    dataKey="confirmed"
                    stackId="exposure"
                    fill="#b91c1c"
                    radius={unconfirmed > 0 ? [8, 0, 0, 8] : [8, 8, 8, 8]}
                    isAnimationActive={false}
                  >
                    {showConfirmedLabel && (
                      <LabelList
                        dataKey="confirmed"
                        position="center"
                        fill="#ffffff"
                        fontSize={12}
                        fontWeight={700}
                        formatter={(value: number | string) => fmtUsd.format(Number(value))}
                      />
                    )}
                  </Bar>
                  {unconfirmed > 0 && (
                    <Bar
                      dataKey="awaiting"
                      stackId="exposure"
                      fill="#d97706"
                      radius={[0, 8, 8, 0]}
                      isAnimationActive={false}
                    >
                      {showAwaitingLabel && (
                        <LabelList
                          dataKey="awaiting"
                          position="center"
                          fill="#ffffff"
                          fontSize={12}
                          fontWeight={700}
                          formatter={(value: number | string) => fmtUsd.format(Number(value))}
                        />
                      )}
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ExposureLegend
                color="bg-red-700"
                label="Confirmed exposure"
                value={fmtUsd.format(confirmed)}
                detail={`${fmtNumber.format(data.totals.to_takedown_count)} listings marked for takedown`}
              />
              <ExposureLegend
                color="bg-amber-600"
                label="Awaiting confirmation"
                value={fmtUsd.format(unconfirmed)}
                detail={`${fmtNumber.format(Math.max(potentialListings - data.totals.to_takedown_count, 0))} pending or review-stage listings`}
              />
            </div>
          </div>
        ) : (
          <p className="mt-6 rounded-lg bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
            No estimated exposure value is available yet.
          </p>
        )}
      </div>
    </section>
  );
}

function ExposureLegend({
  color,
  label,
  value,
  detail,
}: {
  color: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-stone-200 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${color}`} aria-hidden="true" />
        <div className="text-[11px] uppercase tracking-[0.12em] font-bold text-stone-500">
          {label}
        </div>
      </div>
      <div className="mt-2 text-xl font-black text-stone-950 tabular-nums">{value}</div>
      <div className="mt-1 text-xs leading-5 text-stone-500">{detail}</div>
    </div>
  );
}

function WebsiteBreakdown({ websites }: { websites: PublicBrandSumup["websites"] }) {
  const sorted = useMemo(
    () => [...websites].sort((a, b) => {
      if (b.to_takedown_count !== a.to_takedown_count) {
        return b.to_takedown_count - a.to_takedown_count;
      }
      return b.analyzed_count - a.analyzed_count;
    }),
    [websites],
  );

  return (
    <section className="rounded-lg border border-stone-200 bg-white overflow-hidden">
      <div className="px-4 sm:px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-stone-950">Website breakdown</h2>
          <p className="mt-1 text-xs text-stone-500">
            Takedowns and potential exposure by marketplace.
          </p>
        </div>
        <Globe2 className="w-5 h-5 text-stone-400 shrink-0" aria-hidden="true" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 text-left text-[11px] uppercase tracking-[0.12em] text-stone-400">
              <th className="px-4 sm:px-5 py-3 font-bold">Website</th>
              <th className="px-4 py-3 font-bold text-right">Analyzed</th>
              <th className="px-4 py-3 font-bold text-right">To take down</th>
              <th className="px-4 py-3 font-bold text-right">Potential</th>
              <th className="px-4 py-3 font-bold">Infringement</th>
              <th className="px-4 sm:px-5 py-3 font-bold text-right">Value</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((site) => {
              const confirmed = confirmedUsd(site);
              const potential = potentialUsd(site);
              const sitePotentialCount = potentialCount(site);
              return (
                <tr key={site.domain} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 sm:px-5 py-4 font-semibold text-stone-900 whitespace-nowrap">
                    {site.domain}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums text-stone-700">
                    {fmtNumber.format(site.analyzed_count)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums font-bold text-red-700">
                    {fmtNumber.format(site.to_takedown_count)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums font-semibold text-amber-700">
                    {fmtNumber.format(sitePotentialCount)}
                  </td>
                  <td className="px-4 py-4 min-w-56">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 rounded bg-stone-100 overflow-hidden">
                        <div
                          className="h-full rounded bg-red-700"
                          style={{ width: `${Math.min(site.infringement_percentage, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs leading-5 tabular-nums">
                        <div className="font-bold text-stone-700">
                          {formatPercent(site.infringement_percentage)}
                        </div>
                        <div className="text-stone-400">
                          {formatPercent(site.potential_infringement_percentage ?? site.infringement_percentage)} potential
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-5 py-4 text-right tabular-nums">
                    <div className="font-semibold text-stone-900">{fmtUsd.format(confirmed)}</div>
                    <div className="mt-1 text-xs font-semibold text-stone-400">
                      of {fmtUsd.format(potential)}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="rounded-lg border border-stone-200 bg-white px-6 py-16 text-center">
      <SearchCheck className="w-8 h-8 mx-auto text-stone-300" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-black text-stone-950">No analyzed listings yet</h2>
      <p className="mt-2 text-sm text-stone-500">
        Monitoring is set up, but there are not enough analyzed marketplace results to summarize.
      </p>
    </section>
  );
}

function BrandSumupSkeleton() {
  return (
    <div>
      <section className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 animate-pulse">
          <div className="h-3 w-48 rounded bg-stone-200" />
          <div className="mt-4 h-12 w-72 max-w-full rounded bg-stone-200" />
          <div className="mt-5 h-4 w-96 max-w-full rounded bg-stone-100" />
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-pulse">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-lg bg-stone-100" />
          ))}
        </div>
        <div className="h-96 rounded-lg bg-stone-100" />
      </main>
    </div>
  );
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BrandSumupValueFields = {
  to_takedown_count: number;
  potential_count?: number;
  estimated_value_usd: number;
  confirmed_value_usd?: number;
  potential_value_usd?: number;
};

function confirmedUsd(values: BrandSumupValueFields): number {
  return values.confirmed_value_usd ?? values.estimated_value_usd;
}

function potentialUsd(values: BrandSumupValueFields): number {
  return Math.max(confirmedUsd(values), values.potential_value_usd ?? confirmedUsd(values));
}

function potentialCount(values: BrandSumupValueFields): number {
  return Math.max(values.potential_count ?? values.to_takedown_count, values.to_takedown_count);
}
