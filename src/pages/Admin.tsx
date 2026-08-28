import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Clock3, Inbox, Server } from "lucide-react";
import {
  ADMIN_SOURCES,
  getComputeRuntimeSettings,
  patchComputeRuntimeSettings,
  searchAdminIps,
  type AdminIpSummary,
  type ComputeRuntimeSettingsRecord,
} from "../api";

const SOURCE_LABELS: Record<string, string> = {
  tenant_trademark: "Tenant",
  euipo_trademark: "EUIPO",
  wipo_design: "WIPO",
  giantbomb: "Giantbomb",
  anilist: "Anilist",
};

const PAGE_SIZE = 50;

export default function Admin() {
  const [ips, setIps] = useState<AdminIpSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [compute, setCompute] = useState<ComputeRuntimeSettingsRecord | null>(null);
  const [computeLoading, setComputeLoading] = useState(true);
  const [computeError, setComputeError] = useState("");
  const [computeNotice, setComputeNotice] = useState("");
  const [minimumPods, setMinimumPods] = useState(1);
  const [savingWindow, setSavingWindow] = useState<number | "cancel" | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getComputeRuntimeSettings()
      .then((record) => {
        if (cancelled) return;
        setCompute(record);
        setMinimumPods(Math.max(1, record.settings.minimumPods ?? 1));
      })
      .catch((e: unknown) => {
        if (!cancelled) setComputeError(e instanceof Error ? e.message : "Could not load RunPod settings");
      })
      .finally(() => {
        if (!cancelled) setComputeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(handle);
  }, []);

  useEffect(() => {
    // Debounce the text query so each keystroke doesn't hit the API.
    const handle = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await searchAdminIps({
          source: source || undefined,
          q: query.trim() || undefined,
          limit: PAGE_SIZE,
          offset,
        });
        setIps(res.ips);
        setTotal(res.total);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [source, query, offset]);

  const minimumUntil = compute?.settings.minimumPodsUntil ?? null;
  const configuredMinimum = compute?.settings.minimumPods ?? 0;
  const maximumPods = compute?.settings.maxPods ?? 0;
  const minimumActive = configuredMinimum > 0
    && minimumUntil !== null
    && Date.parse(minimumUntil) > now;

  async function saveMinimumWindow(durationHours: 4 | 8 | 24) {
    if (!compute) return;
    setSavingWindow(durationHours);
    setComputeError("");
    setComputeNotice("");
    try {
      const updated = await patchComputeRuntimeSettings(compute.version, {
        minimumPods,
      }, durationHours);
      setCompute(updated);
      setNow(Date.now());
      setComputeNotice(
        `${minimumPods} pod${minimumPods === 1 ? "" : "s"} requested for ${durationHours} hours.`,
      );
    } catch (e: unknown) {
      setComputeError(e instanceof Error ? e.message : "Could not update RunPod capacity");
    } finally {
      setSavingWindow(null);
    }
  }

  async function cancelMinimumWindow() {
    if (!compute) return;
    setSavingWindow("cancel");
    setComputeError("");
    setComputeNotice("");
    try {
      const updated = await patchComputeRuntimeSettings(compute.version, {
        minimumPods: 0,
        minimumPodsUntil: null,
      });
      setCompute(updated);
      setNow(Date.now());
      setComputeNotice("Minimum capacity ended; queue-driven scaling resumed.");
    } catch (e: unknown) {
      setComputeError(e instanceof Error ? e.message : "Could not end RunPod capacity window");
    } finally {
      setSavingWindow(null);
    }
  }

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setOffset(0);
  }, [source, query]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">Admin · IP Catalog</h1>
          <p className="mt-1 text-sm text-stone-500">
            Search every IP across all catalogs. Open one to manage its reference images and caption.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/tenants"
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800"
          >
            <Building2 size={15} />
            Tenants
          </Link>
          <Link
            to="/admin/intakes"
            className="inline-flex items-center justify-center gap-2 h-9 px-3 rounded-md border border-stone-200 bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50"
          >
            <Inbox size={15} />
            Public intakes
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm shadow-stone-100">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white">
              <Server size={18} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-stone-900">RunPod warm capacity</h2>
                {minimumActive ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-stone-500">
                    Queue-driven
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-xl text-sm text-stone-500">
                Keep a minimum number of GPU pods online for a fixed window. Autoscaling can still add more when the queue needs them.
              </p>
              {minimumActive && minimumUntil && (
                <p
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"
                  role="status"
                  aria-live="polite"
                >
                  <Clock3 size={13} />
                  At least {configuredMinimum} pod{configuredMinimum === 1 ? "" : "s"} until {formatCapacityDeadline(minimumUntil)}
                  {` · ${formatRemaining(Date.parse(minimumUntil) - now)} remaining`}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-xs font-semibold text-stone-600">
              Minimum pods
              <select
                value={minimumPods}
                onChange={(event) => setMinimumPods(Number(event.target.value))}
                disabled={computeLoading || !compute || maximumPods < 1 || savingWindow !== null}
                className="h-11 min-w-28 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-900 disabled:opacity-50"
              >
                {maximumPods < 1
                  ? <option value={1}>Unavailable</option>
                  : Array.from({ length: maximumPods }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              {([4, 8, 24] as const).map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => void saveMinimumWindow(hours)}
                  aria-label={`Keep at least ${minimumPods} pod${minimumPods === 1 ? "" : "s"} warm for ${hours} hours`}
                  disabled={computeLoading || !compute || maximumPods < 1 || savingWindow !== null}
                  className="h-11 rounded-lg bg-stone-900 px-3 text-xs font-bold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingWindow === hours ? "Saving…" : `${hours}h`}
                </button>
              ))}
              {minimumActive && (
                <button
                  type="button"
                  onClick={() => void cancelMinimumWindow()}
                  disabled={savingWindow !== null}
                  className="h-11 rounded-lg border border-stone-200 bg-white px-3 text-xs font-bold text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                >
                  {savingWindow === "cancel" ? "Ending…" : "End early"}
                </button>
              )}
            </div>
          </div>
        </div>
        {computeError && <p className="mt-3 text-xs font-medium text-red-700" role="alert">{computeError}</p>}
        {computeNotice && (
          <p className="mt-3 text-xs font-medium text-emerald-700" role="status" aria-live="polite">
            {computeNotice}
          </p>
        )}
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or alias…"
          className="flex-1 px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all"
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="px-4 py-2.5 border border-stone-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all"
        >
          <option value="">All sources</option>
          {ADMIN_SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s] ?? s}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-stone-500">
        {loading ? "Searching…" : `${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
      </p>

      {/* Results */}
      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : ips.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-stone-500 text-sm">No IPs match.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {ips.map((ip) => (
            <Link
              key={ip.id}
              to={`/admin/ips/${encodeURIComponent(ip.id)}`}
              className="group bg-white rounded-xl border border-stone-200 px-5 py-4 hover:border-stone-300 hover:shadow-md hover:shadow-stone-100 transition-all flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <h3 className="font-bold text-stone-900 group-hover:text-red-700 transition-colors truncate">
                  {ip.name || "(unnamed)"}
                </h3>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-500">
                  <span className="inline-block text-[10px] font-semibold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                    {SOURCE_LABELS[ip.source] ?? ip.source}
                  </span>
                  {ip.entity_type && <span className="text-stone-400">{ip.entity_type}</span>}
                  <span className="text-stone-300">·</span>
                  <span>
                    {ip.image_count} image{ip.image_count !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {ip.has_caption && (
                  <span className="inline-block text-[10px] font-semibold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                    caption
                  </span>
                )}
                <StatusBadge ip={ip} />
                <span className="text-stone-300 group-hover:text-stone-500 transition-colors">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-all"
          >
            ← Prev
          </button>
          <span className="text-xs text-stone-500">
            Page {page} of {pages}
          </span>
          <button
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={page >= pages}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-40 transition-all"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function formatCapacityDeadline(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRemaining(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function StatusBadge({ ip }: { ip: AdminIpSummary }) {
  if (ip.centroid_ready) {
    return (
      <span className="inline-block text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
        Indexed
      </span>
    );
  }
  if (ip.indexed_count > 0) {
    return (
      <span className="inline-block text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">
        Partial
      </span>
    );
  }
  return (
    <span className="inline-block text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">
      Pending
    </span>
  );
}
