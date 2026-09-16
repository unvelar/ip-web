import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, ChevronRight, FileText, Fingerprint, Library, Loader2, Search } from "lucide-react";
import { ADMIN_SOURCES, searchAdminIps, type AdminIpSummary } from "../api";
import { AdminPage } from "../components/admin/AdminPage";

const SOURCE_LABELS: Record<string, string> = {
  tenant_trademark: "Tenant",
  euipo_trademark: "EUIPO",
  wipo_design: "WIPO",
  giantbomb: "Giantbomb",
};
const PAGE_SIZE = 50;

export default function AdminCatalog() {
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const sourceParam = params.get("source") ?? "";
  const source = ADMIN_SOURCES.find((item) => item === sourceParam) ?? "";
  const pageParam = Number(params.get("page") ?? 1);
  const page = Number.isSafeInteger(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const [ips, setIps] = useState<AdminIpSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    const handle = window.setTimeout(async () => {
      try {
        const result = await searchAdminIps({ source: source || undefined, q: query.trim() || undefined, limit: PAGE_SIZE, offset });
        if (cancelled) return;
        setIps(result.ips);
        setTotal(result.total);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the IP catalog.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(handle); };
  }, [query, source, offset, retry]);

  function updateFilter(key: "q" | "source", value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value); else next.delete(key);
      next.delete("page");
      return next;
    }, { replace: true });
  }

  function changePage(nextPage: number) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage > 1) next.set("page", String(nextPage)); else next.delete("page");
      return next;
    });
    document.getElementById("admin-catalog")?.scrollIntoView({ block: "start" });
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const catalogUrl = `/admin/ips${params.size ? `?${params.toString()}` : ""}`;

  return (
    <AdminPage section="catalog" title="IP catalog" description="Search all catalogs and manage each IP's reference images and matching details.">
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} aria-hidden="true" />
          <input type="search" aria-label="Search IP catalog" placeholder="Search by name or alias…" value={query} onChange={(event) => updateFilter("q", event.target.value)} />
        </label>
        <select aria-label="Catalog source" value={source} onChange={(event) => updateFilter("source", event.target.value)}>
          <option value="">All sources</option>
          {ADMIN_SOURCES.map((item) => <option key={item} value={item}>{SOURCE_LABELS[item] ?? item}</option>)}
        </select>
      </div>

      <section id="admin-catalog" className="admin-card overflow-hidden" aria-label="IP catalog results" aria-busy={loading}>
        <div className="admin-list-heading">
          <h2 className="flex items-center gap-2"><Library size={15} aria-hidden="true" />Intellectual properties</h2>
          <span role="status">{loading ? "Searching…" : error ? "Unavailable" : `${total.toLocaleString()} result${total === 1 ? "" : "s"}`}</span>
        </div>
        {loading ? (
          <div className="admin-empty"><Loader2 size={20} className="animate-spin" aria-hidden="true" />Loading catalog</div>
        ) : error ? (
          <div className="admin-empty"><p role="alert">{error}</p><button type="button" className="admin-button" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>
        ) : ips.length === 0 ? (
          <div className="admin-empty"><Search size={22} aria-hidden="true" /><strong>No IPs match these filters</strong><p>Try another name or choose a different source.</p></div>
        ) : (
          <div>
            {ips.map((ip) => (
              <Link key={ip.id} to={`/admin/ips/${encodeURIComponent(ip.id)}`} state={{ catalogUrl }} className="admin-catalog-row">
                <div className="admin-row-icon"><Fingerprint size={18} aria-hidden="true" /></div>
                <div className="admin-row-copy">
                  <h3>{ip.name || "Unnamed IP"}</h3>
                  <div className="admin-row-meta"><span>{SOURCE_LABELS[ip.source] ?? ip.source}</span>{ip.entity_type && <span>{ip.entity_type}</span>}<span>{ip.image_count} image{ip.image_count === 1 ? "" : "s"}</span></div>
                </div>
                <div className="admin-row-status">
                  {ip.has_caption && <span className="admin-caption-label text-stone-400 inline-flex items-center gap-1"><FileText size={12} aria-hidden="true" />Caption</span>}
                  <span className="admin-status" data-tone={ip.centroid_ready ? "success" : ip.indexed_count > 0 ? "warning" : undefined}>
                    {ip.centroid_ready && <Check size={12} aria-hidden="true" />}{ip.centroid_ready ? "Indexed" : ip.indexed_count > 0 ? "Partial" : "Pending"}
                  </span>
                  <ChevronRight size={15} className="text-stone-400" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        )}
        {!error && pages > 1 && (
          <div className="admin-pagination">
            <button type="button" className="admin-button" disabled={loading || page === 1} onClick={() => changePage(page - 1)}><ArrowLeft size={13} aria-hidden="true" />Previous</button>
            <span>Page {page.toLocaleString()} of {pages.toLocaleString()}</span>
            <button type="button" className="admin-button" disabled={loading || page >= pages} onClick={() => changePage(page + 1)}>Next<ArrowRight size={13} aria-hidden="true" /></button>
          </div>
        )}
      </section>
    </AdminPage>
  );
}
