import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ADMIN_SOURCES,
  searchAdminIps,
  type AdminIpSummary,
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

  const [source, setSource] = useState<string>("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);

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
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [source, query, offset]);

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    setOffset(0);
  }, [source, query]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-black text-stone-900 tracking-tight">Admin · IP Catalog</h1>
        <p className="mt-1 text-sm text-stone-500">
          Search every IP across all catalogs. Open one to manage its reference images and caption.
        </p>
      </div>

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
