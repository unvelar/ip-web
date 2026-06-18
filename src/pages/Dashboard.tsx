import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getDashboardGroups, type DashboardGroups } from "../api";

type Days = 7 | 30 | 90;
type Ip = DashboardGroups["ips"][number];

// On-brand, visually-distinct colors. IPs are colored by their finding-sorted
// index (the order the API returns), so the same IP is the same color in every
// chart. Cycles if there are more IPs than colors.
const IP_COLORS = [
  "#b91c1c", "#ea580c", "#d97706", "#65a30d", "#0891b2",
  "#4f46e5", "#7c3aed", "#db2777", "#0f766e", "#a16207",
];

/** Fallback KPIs so a missing `kpis` field can't crash the tiles. */
const EMPTY_KPIS: DashboardGroups["kpis"] = {
  to_triage: 0,
  in_progress: 0,
  enforced_30d: 0,
  high_risk: 0,
  ips_monitored: 0,
  platforms_monitored: 0,
  total_unlicensed_market_usd: 0,
};

/**
 * Tenant dashboard — always grouped by IP. One round-trip to
 * /api/monitoring/dashboard/groups; every breakdown is colored by IP, so a
 * shared color map (built from the finding-sorted `ips` roster) threads through
 * the pie, the stacked charts, and the sellers table.
 */
export default function Dashboard() {
  const [days, setDays] = useState<Days>(30);
  const [data, setData] = useState<DashboardGroups | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getDashboardGroups(days)
      .then((d) => { if (alive) { setData(d); setErr(""); } })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [days]);

  const colors = useMemo(() => {
    const m = new Map<string, string>();
    (data?.ips ?? []).forEach((ip, i) => m.set(ip.ip_id, IP_COLORS[i % IP_COLORS.length]));
    return m;
  }, [data]);

  if (err) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {err}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <DashboardSkeleton />
      </div>
    );
  }

  // Defensive defaults — tolerate a partial/older API response shape rather
  // than crashing the whole page on a missing field.
  const ips = data.ips ?? [];
  const kpis = data.kpis ?? EMPTY_KPIS;
  const empty = ips.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">
            Last {days} days of monitoring activity · grouped by IP.
          </p>
        </div>
        <RangeToggle days={days} onChange={setDays} />
      </div>

      {empty ? (
        <div className="rounded-2xl border border-stone-200 bg-white px-6 py-16 text-center">
          <p className="text-base font-semibold text-stone-700">
            No IPs are being monitored yet
          </p>
          <p className="mt-1 text-sm text-stone-500">
            Watch your first intellectual property to start gathering findings.
          </p>
          <Link
            to="/monitoring/new"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-full bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
          >
            Monitor an IP →
          </Link>
        </div>
      ) : (
        <>
          <UnlicensedMarketHero totalUsd={kpis.total_unlicensed_market_usd ?? 0} />
          <KpiRow kpis={kpis} />
          <FindingsOverTimeCard timeseries={data.timeseries ?? []} ips={ips} colors={colors} />
          <MarketCard marketByCountry={data.marketByCountry ?? []} ips={ips} colors={colors} />
          <div className="grid lg:grid-cols-2 gap-4">
            <StackedDimensionCard
              title="Top platforms"
              subtitle="Findings per marketplace, colored by IP."
              items={(data.platforms ?? []).map((p) => ({ label: p.domain, counts: p.counts }))}
              ips={ips}
              colors={colors}
            />
            <StackedDimensionCard
              title="Countries"
              subtitle="Where listings ship from, colored by IP."
              items={(data.countries ?? []).map((c) => ({ label: c.country || "Unknown", counts: c.counts }))}
              ips={ips}
              colors={colors}
            />
          </div>
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <IpSharePie ips={ips} colors={colors} />
            </div>
            <div className="lg:col-span-2">
              <SellersCard sellers={data.sellers ?? []} ips={ips} colors={colors} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RangeToggle({ days, onChange }: { days: Days; onChange: (d: Days) => void }) {
  const opts: Days[] = [7, 30, 90];
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
      {opts.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
            days === d ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

/** Compact USD formatter for the hero + per-IP figures. "1234567" → "$1.2M". */
const fmtUsdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function UnlicensedMarketHero({ totalUsd }: { totalUsd: number }) {
  return (
    <div className="rounded-2xl bg-white border border-stone-200 px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold text-stone-500">
          Active Monitored Infringements
        </div>
        <p className="text-xs text-stone-400 mt-0.5 max-w-md">
          Sum of price × quantity across open infringement findings.
          Excludes dismissed and already-enforced cases.
        </p>
      </div>
      <div className="text-4xl sm:text-5xl font-black tabular-nums leading-none text-stone-900">
        {fmtUsdCompact.format(totalUsd || 0)}
      </div>
    </div>
  );
}

function KpiRow({ kpis }: { kpis: DashboardGroups["kpis"] }) {
  const tiles: Array<{ label: string; value: number; to: string | null; accent?: string }> = [
    { label: "To triage", value: kpis.to_triage, to: "/monitoring/tasks?status=pending", accent: "text-stone-900" },
    { label: "In progress", value: kpis.in_progress, to: "/monitoring/tasks?status=takedown_sent", accent: "text-amber-700" },
    { label: "Enforced (30d)", value: kpis.enforced_30d, to: "/monitoring/tasks?status=enforced", accent: "text-emerald-700" },
    { label: "High risk", value: kpis.high_risk, to: "/monitoring/tasks", accent: "text-red-700" },
    { label: "IPs monitored", value: kpis.ips_monitored, to: "/monitoring/settings" },
    { label: "Platforms monitored", value: kpis.platforms_monitored, to: "/monitoring/settings" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <KpiTile key={t.label} {...t} />
      ))}
    </div>
  );
}

function KpiTile({
  label,
  value,
  to,
  accent = "text-stone-900",
}: {
  label: string;
  value: number;
  to: string | null;
  accent?: string;
}) {
  const inner = (
    <>
      <div className={`text-2xl font-black tabular-nums ${accent}`}>{value}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-stone-400 mt-1">
        {label}
      </div>
    </>
  );
  const cls = "rounded-2xl border border-stone-200 bg-white px-4 py-4 transition-colors";
  return to ? (
    <Link to={to} className={`${cls} hover:border-stone-300 hover:bg-stone-50 block`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
      <div>
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
        {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

/** Shared tooltip chrome for the recharts cards. */
const TOOLTIP_STYLE = {
  fontSize: 12,
  border: "1px solid #e7e5e4",
  borderRadius: 8,
} as const;

/** Render one stacked <Bar> per IP — shared by every IP-colored chart. Missing
 *  ip keys in a row render as 0, so each bar only shows where that IP has data. */
function ipBars(ips: Ip[], colors: Map<string, string>) {
  return ips.map((ip) => (
    <Bar
      key={ip.ip_id}
      dataKey={ip.ip_id}
      stackId="ip"
      name={ip.ip_name ?? "Unnamed IP"}
      fill={colors.get(ip.ip_id) ?? "#a8a29e"}
    />
  ));
}

/** Active links over time, one line per IP. Each line is the count of links
 *  still live as of that day, so it rises as findings arrive and falls as
 *  takedowns get enforced. */
function FindingsOverTimeCard({
  timeseries,
  ips,
  colors,
}: {
  timeseries: DashboardGroups["timeseries"];
  ips: Ip[];
  colors: Map<string, string>;
}) {
  const data = useMemo(
    () => timeseries.map((t) => ({ label: shortDay(t.day), ...t.counts })),
    [timeseries],
  );
  const empty = data.length === 0;
  return (
    <CardShell title="Active links over time" subtitle="Live links per IP — grows with new findings, falls as takedowns are enforced.">
      {empty ? (
        <p className="text-xs text-stone-400 py-12 text-center">No findings yet in this window.</p>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -10 }}>
              <CartesianGrid stroke="#f4f4f4" />
              <XAxis dataKey="label" stroke="#a8a29e" tick={{ fontSize: 11 }} />
              <YAxis stroke="#a8a29e" tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {ipLines(ips, colors)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  );
}

/** Render one <Line> per IP for the active-links chart. Missing ip keys in a
 *  row render as a gap; the dense per-day series from the API avoids those. */
function ipLines(ips: Ip[], colors: Map<string, string>) {
  return ips.map((ip) => (
    <Line
      key={ip.ip_id}
      type="monotone"
      dataKey={ip.ip_id}
      name={ip.ip_name ?? "Unnamed IP"}
      stroke={colors.get(ip.ip_id) ?? "#a8a29e"}
      strokeWidth={2}
      dot={false}
      isAnimationActive={false}
    />
  ));
}

/** A horizontal stacked-bar card for a category dimension (platforms /
 *  countries), one bar per category, segmented by IP color. */
function StackedDimensionCard({
  title,
  subtitle,
  items,
  ips,
  colors,
}: {
  title: string;
  subtitle: string;
  items: Array<{ label: string; counts: Record<string, number> }>;
  ips: Ip[];
  colors: Map<string, string>;
}) {
  const data = useMemo(
    () => items.map((it) => ({ label: it.label, ...it.counts })),
    [items],
  );
  return (
    <CardShell title={title} subtitle={subtitle}>
      {data.length === 0 ? (
        <p className="text-xs text-stone-400 py-8 text-center">No data yet.</p>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 10 }}>
              <CartesianGrid stroke="#f4f4f4" />
              <XAxis type="number" stroke="#a8a29e" tick={{ fontSize: 11 }} allowDecimals={false} />
              <YAxis type="category" dataKey="label" stroke="#a8a29e" tick={{ fontSize: 11 }} width={110} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              {ipBars(ips, colors)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  );
}

/** Unlicensed $ market as horizontal bars, with a Country/IP toggle. The IP
 *  view reads each IP's own `unlicensed_market_usd` (one bar per IP, its own
 *  color); the country view stacks the per-country money by IP. Same shape and
 *  colors as the findings breakdowns, but valued in USD. */
function MarketCard({
  marketByCountry,
  ips,
  colors,
}: {
  marketByCountry: DashboardGroups["marketByCountry"];
  ips: Ip[];
  colors: Map<string, string>;
}) {
  const [view, setView] = useState<"ip" | "country">("ip");

  const data = useMemo(() => {
    if (view === "country") {
      return marketByCountry.map((c) => ({ label: c.country || "Unknown", ...c.counts }));
    }
    // By IP: one bar per IP, keyed by its own id so ipBars colors it correctly.
    return ips
      .filter((ip) => (ip.unlicensed_market_usd ?? 0) > 0)
      .map((ip) => ({ label: ip.ip_name ?? "Unnamed IP", [ip.ip_id]: ip.unlicensed_market_usd }));
  }, [view, marketByCountry, ips]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-stone-900">Unlicensed market</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            Estimated open-infringement value, by {view === "ip" ? "IP" : "shipping country"}.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 shrink-0">
          {(["ip", "country"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                view === v ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900"
              }`}
            >
              {v === "ip" ? "By IP" : "By country"}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="text-xs text-stone-400 py-8 text-center">No market value yet.</p>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 10 }}>
              <CartesianGrid stroke="#f4f4f4" />
              <XAxis
                type="number"
                stroke="#a8a29e"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => fmtUsdCompact.format(Number(v))}
              />
              <YAxis type="category" dataKey="label" stroke="#a8a29e" tick={{ fontSize: 11 }} width={110} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, n: string) => [fmtUsdCompact.format(Number(v)), n]}
              />
              {ipBars(ips, colors)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/** Donut of each IP's share of open findings — top 8 + an "Other" bucket. The
 *  slice colors match the bars (shared color map). */
function IpSharePie({ ips, colors }: { ips: Ip[]; colors: Map<string, string> }) {
  const data = useMemo(() => {
    const top = ips.slice(0, 8).map((ip) => ({
      id: ip.ip_id,
      name: ip.ip_name ?? "Unnamed IP",
      findings: ip.findings,
    }));
    const rest = ips.slice(8);
    const other = rest.reduce((s, ip) => s + ip.findings, 0);
    const out = top.filter((d) => d.findings > 0);
    if (other > 0) out.push({ id: "__other", name: `Other (${rest.length})`, findings: other });
    return out;
  }, [ips]);

  return (
    <CardShell title="Findings by IP" subtitle="Share of open findings across monitored IPs.">
      {data.length === 0 ? (
        <p className="text-xs text-stone-400 py-8 text-center">No findings yet.</p>
      ) : (
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="findings" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={92} paddingAngle={1}>
                {data.map((d) => (
                  <Cell key={d.id} fill={d.id === "__other" ? "#d6d3d1" : colors.get(d.id) ?? "#a8a29e"} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [`${v} findings`, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  );
}

/** Top sellers as a table — keeps rating/sales, with a colored IP chip so the
 *  grouping reads at a glance. Each row links to that seller filtered to its IP.
 *  An IP chip-filter scopes the table so a smaller IP isn't buried by the
 *  dominant one. */
function SellersCard({
  sellers,
  ips,
  colors,
}: {
  sellers: DashboardGroups["sellers"];
  ips: Ip[];
  colors: Map<string, string>;
}) {
  const [ipFilter, setIpFilter] = useState<string | null>(null);

  // IPs that actually have sellers, kept in the roster's finding-sorted order.
  const filterableIps = useMemo(
    () => ips.filter((ip) => sellers.some((s) => s.ip_id === ip.ip_id)),
    [ips, sellers],
  );

  // If the active filter's IP drops out of the data, fall back to "All".
  const activeFilter = ipFilter && filterableIps.some((ip) => ip.ip_id === ipFilter) ? ipFilter : null;

  const rows = useMemo(() => {
    const sorted = [...sellers].sort((a, b) => b.findings - a.findings);
    return (activeFilter ? sorted.filter((s) => s.ip_id === activeFilter) : sorted).slice(0, 12);
  }, [sellers, activeFilter]);

  return (
    <CardShell title="Top sellers" subtitle="Most-flagged sellers; filter by IP to surface a smaller one.">
      {filterableIps.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <SellerFilterChip active={activeFilter === null} onClick={() => setIpFilter(null)} label="All IPs" />
          {filterableIps.map((ip) => (
            <SellerFilterChip
              key={ip.ip_id}
              active={activeFilter === ip.ip_id}
              onClick={() => setIpFilter(ip.ip_id)}
              label={ip.ip_name ?? "Unnamed IP"}
              color={colors.get(ip.ip_id)}
            />
          ))}
        </div>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-stone-400 py-8 text-center">No seller data yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-400 border-b border-stone-100">
                <th className="py-2 pr-3 font-semibold">Seller</th>
                <th className="py-2 pr-3 font-semibold">Platform</th>
                <th className="py-2 pr-3 font-semibold">IP</th>
                <th className="py-2 pr-3 font-semibold text-right">Findings</th>
                <th className="py-2 pr-3 font-semibold text-right">Rating</th>
                <th className="py-2 font-semibold text-right">Sales</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const target = sellerLink(s.seller_name, s.domain, s.ip_id);
                return (
                  <tr key={`${s.seller_name}-${s.domain}-${s.ip_id}-${i}`} className="border-b border-stone-50 last:border-0 hover:bg-stone-50 transition-colors">
                    <td className="py-2 pr-3 font-medium text-stone-800 truncate max-w-[12rem]">
                      {target ? (
                        <Link to={target} className="hover:underline">{s.seller_name}</Link>
                      ) : (
                        <span className="text-stone-400">unknown</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-stone-500">{s.domain}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ background: colors.get(s.ip_id) ?? "#a8a29e" }}
                        />
                        <span className="text-stone-600 truncate max-w-[8rem]" title={s.ip_name ?? undefined}>
                          {s.ip_name ?? "—"}
                        </span>
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold text-stone-900">
                      {s.findings}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-stone-600">
                      {s.rating != null ? s.rating.toFixed(1) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums text-stone-600">
                      {s.sales != null ? s.sales.toLocaleString() : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </CardShell>
  );
}

/** A pill toggle for the sellers IP filter — optional color dot mirrors the
 *  chart colors. */
function SellerFilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
        active
          ? "bg-stone-900 text-white border-stone-900"
          : "bg-white text-stone-600 border-stone-200 hover:border-stone-300"
      }`}
    >
      {color && (
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ background: active ? "#fff" : color }}
        />
      )}
      <span className="truncate max-w-[9rem]">{label}</span>
    </button>
  );
}

/** Build the Tasks deep-link for a seller row. Returns null for blank seller
 *  names so the row falls back to "unknown" text. Threads the row's IP through
 *  as `ip_id`. */
function sellerLink(
  seller: string | null,
  domain: string | null,
  ipId: string | null,
): string | null {
  if (!seller) return null;
  const p = new URLSearchParams();
  p.set("seller", seller);
  if (domain) p.set("platform", domain);
  if (ipId) p.set("ip_id", ipId);
  return `/monitoring/tasks?${p.toString()}`;
}

function shortDay(iso: string): string {
  // iso looks like "2026-05-28" or a full ISO timestamp.
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-40 bg-stone-200 rounded" />
      <div className="h-20 rounded-2xl bg-stone-100" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-stone-100" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-stone-100" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-2xl bg-stone-100" />
        <div className="h-72 rounded-2xl bg-stone-100" />
      </div>
    </div>
  );
}
