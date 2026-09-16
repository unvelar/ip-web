import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  LogIn,
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
} from "../api";
import { useAuth } from "../context/AuthContext";
import { SimulatedLoginPanel } from "../features/auth/SimulatedLoginPanel";

import { AdminPage, AdminSectionHeading } from "../components/admin/AdminPage";

const TENANTS_CHANGED_EVENT = "unvelar:tenants-changed";

export default function AdminTenants() {
  const { user, logout, actingTenantId, switchTenant } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
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
    setSuccess("");
    try {
      const res = await listTenants();
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
    setSuccess("");
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
    const deletesHomeTenant = tenant.id === user?.tenant_id;
    const deletesActingTenant = tenant.id === actingTenantId;
    const sessionWarning = deletesHomeTenant
      ? "\n\nThis tenant owns your current admin account. You will be signed out after deletion."
      : deletesActingTenant
        ? "\n\nYou are currently operating as this tenant. You will return to your home tenant after deletion."
      : "";
    const confirmation = window.prompt(
      `Delete ${label}? This will permanently remove this tenant and all related tenant data, including accounts, IPs, monitors, jobs, cases, and related records.${sessionWarning}\n\nType DELETE to continue.`,
    );
    if (confirmation !== "DELETE") return;
    setDeletingId(tenant.id);
    setError("");
    setSuccess("");
    try {
      await deleteTenant(tenant.id);
      // The DELETE response is authoritative. Remove the row immediately
      // instead of reloading with a session that may have just been deleted.
      setTenants((current) => current.filter((item) => item.id !== tenant.id));
      if (deletesHomeTenant) {
        await logout();
        return;
      }
      if (deletesActingTenant && user) {
        switchTenant(user.tenant_id, "/admin/tenants");
        return;
      }
      window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
      setSuccess(`Deleted ${label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId("");
    }
  }

  return (
    <AdminPage section="tenants" title="Tenants" description="Manage workspaces and review tenant accounts."
      actions={<button type="button" onClick={() => void load()} disabled={loading} className="admin-button" aria-label="Refresh tenants"><RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />Refresh</button>}
    >
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      <section className="admin-card overflow-hidden">
        <div className="admin-card-header admin-toolbar">
          <div className="flex-1 text-xs text-stone-500">
            {loading ? "Loading" : `${filtered.length.toLocaleString()} of ${tenants.length.toLocaleString()} tenants`}
          </div>
          <label className="relative sm:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tenants"
              aria-label="Search tenants"
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
                <div key={tenant.id} className="px-4 py-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="shrink-0 text-stone-400" />
                      <h2 className="text-sm font-semibold text-stone-900 truncate">{tenantLabel(tenant)}</h2>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
                      {tenant.public_slug && <span>/{tenant.public_slug}</span>}
                      {tenant.email_domain && <span>{tenant.email_domain}</span>}
                      <span>{formatDate(tenant.created_at)}</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-stone-400 truncate">{tenant.id}</div>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(deletingId)}
                    onClick={() => void handleRemove(tenant)}
                    title="Delete tenant and all related tenant data"
                    className="admin-button admin-button-danger justify-self-start"
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
      <details className="admin-disclosure">
        <summary><Plus size={17} aria-hidden="true" /><span>Create tenant<small>Add a workspace for a new customer</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <section>
          <AdminSectionHeading title="New tenant" description="Create a workspace with its own IPs and monitoring." />
          <form onSubmit={(event) => void handleCreate(event)} className="mt-4 flex flex-col gap-3 sm:flex-row">
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
      </details>
      <details className="admin-disclosure">
        <summary><LogIn size={17} aria-hidden="true" /><span>Simulate successful login<small>Open a customer's onboarding flow in a separate tab</small></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <SimulatedLoginPanel
          onError={setError}
          onStarted={async () => {
            await load();
            window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
          }}
        />
      </details>
    </AdminPage>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
