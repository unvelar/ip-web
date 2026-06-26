import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import {
  createTenant,
  deleteTenant,
  listTenants,
  tenantLabel,
  type Tenant,
  type TenantUsageStats,
} from "../api";

const TENANTS_CHANGED_EVENT = "unvelar:tenants-changed";

const ZERO_USAGE: TenantUsageStats = {
  accounts: 0,
  ips: 0,
  ip_images: 0,
  cases: 0,
  case_comments: 0,
  jobs: 0,
  monitored_domains: 0,
  reverse_search_runs: 0,
  monitor_candidates: 0,
  monitor_audit: 0,
  ip_reviews: 0,
  takedown_requests: 0,
  visual_match_feedback: 0,
  api_keys: 0,
  ip_licenses: 0,
  cleared_listings: 0,
  allowed_product_images: 0,
  monitoring_campaigns: 0,
  monitoring_campaign_findings: 0,
  public_intakes: 0,
};

const PRIMARY_USAGE: Array<[keyof TenantUsageStats, string]> = [
  ["accounts", "accounts"],
  ["ips", "IPs"],
  ["cases", "cases"],
  ["jobs", "jobs"],
  ["monitored_domains", "monitors"],
  ["ip_reviews", "reviews"],
];

export default function AdminTenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((tenant) => {
      const haystack = [
        tenant.name,
        tenant.email_domain,
        tenant.public_slug,
        tenant.owner_workos_user_id,
        tenant.id,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [query, tenants]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await listTenants({ includeUsage: true });
      setTenants(res.tenants);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const tenantName = name.trim();
    if (!tenantName || creating) return;
    setCreating(true);
    setError("");
    try {
      await createTenant(tenantName);
      setName("");
      await load();
      window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRemove(tenant: Tenant) {
    if (deletingId) return;
    const label = tenantLabel(tenant);
    const total = usageTotal(tenant);
    if (total > 0) {
      const confirmation = window.prompt(
        `Delete ${label} and all related tenant data? This will permanently remove ${formatUsageCount(total)} across accounts, IPs, monitors, jobs, cases, and related records.\n\nType DELETE to continue.`,
      );
      if (confirmation !== "DELETE") return;
    } else if (!window.confirm(`Remove empty tenant ${label}? This cannot be undone.`)) {
      return;
    }
    setDeletingId(tenant.id);
    setError("");
    try {
      await deleteTenant(tenant.id);
      await load();
      window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/admin" className="text-xs font-semibold text-stone-400 hover:text-stone-700">
            Admin
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
            Tenants
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="h-9 w-9 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4">
        <form onSubmit={(event) => void handleCreate(event)} className="flex flex-col gap-3 sm:flex-row">
          <label className="flex-1">
            <span className="block text-xs font-bold text-stone-500 mb-1.5">Tenant name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              className="h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
            />
          </label>
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="sm:self-end h-10 px-4 rounded-md bg-stone-900 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-45"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Create
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white overflow-hidden">
        <div className="border-b border-stone-200 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-bold text-stone-500">
            {loading ? "Loading" : `${filtered.length.toLocaleString()} of ${tenants.length.toLocaleString()} tenants`}
          </div>
          <label className="relative sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tenants"
              className="h-9 w-full rounded-md border border-stone-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
            />
          </label>
        </div>

        {loading ? (
          <div className="h-56 flex items-center justify-center text-stone-400">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-56 flex items-center justify-center text-sm text-stone-400">
            No tenants
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {filtered.map((tenant) => {
              return (
                <div key={tenant.id} className="px-4 py-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="shrink-0 text-stone-400" />
                      <h2 className="font-bold text-stone-900 truncate">{tenantLabel(tenant)}</h2>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      {tenant.public_slug && <span>/{tenant.public_slug}</span>}
                      {tenant.email_domain && <span>{tenant.email_domain}</span>}
                      <span>{formatDate(tenant.created_at)}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-stone-400 truncate">{tenant.id}</div>
                  </div>

                  <UsageSummary tenant={tenant} />

                  <button
                    type="button"
                    disabled={Boolean(deletingId)}
                    onClick={() => void handleRemove(tenant)}
                    title="Delete tenant and all related tenant data"
                    className="h-9 px-3 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-2 border border-red-200 text-red-700 bg-white hover:bg-red-50 disabled:opacity-45 disabled:cursor-wait transition-colors"
                  >
                    {deletingId === tenant.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function UsageSummary({ tenant }: { tenant: Tenant }) {
  const usage = tenant.usage ?? ZERO_USAGE;
  const total = usageTotal(tenant);
  if (total === 0) {
    return (
      <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
        <CheckCircle2 size={15} />
        Empty
      </div>
    );
  }

  const shown = PRIMARY_USAGE.reduce((sum, [key]) => sum + usage[key], 0);
  const other = Math.max(0, total - shown);

  return (
    <div className="flex flex-wrap gap-1.5">
      {PRIMARY_USAGE.map(([key, label]) => (
        usage[key] > 0 ? <UsagePill key={key} label={label} count={usage[key]} /> : null
      ))}
      {other > 0 && <UsagePill label="other" count={other} />}
      <span
        className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
        title="Remove is available only after usage is zero"
      >
        <AlertTriangle size={13} />
        {total.toLocaleString()} total
      </span>
    </div>
  );
}

function UsagePill({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-600">
      {count.toLocaleString()} {label}
    </span>
  );
}

function usageTotal(tenant: Tenant) {
  if (typeof tenant.usage_total === "number") return tenant.usage_total;
  const usage = tenant.usage ?? ZERO_USAGE;
  return Object.values(usage).reduce((sum, value) => sum + value, 0);
}

function formatUsageCount(value: number) {
  return `${value.toLocaleString()} related record${value === 1 ? "" : "s"}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
