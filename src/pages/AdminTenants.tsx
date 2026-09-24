import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
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
import { listTenantMonitoringSummaries, type TenantMonitoringSummary } from "../api/tenantMonitoring";
import { TenantMonitoringStats } from "../features/adminMonitoring/TenantMonitoringStats";

import "./AdminTenants.css";

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
  const [monitoring, setMonitoring] = useState<Map<string, TenantMonitoringSummary>>(new Map());
  const [monitoringLoading, setMonitoringLoading] = useState(true);
  const [monitoringError, setMonitoringError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (tenants.length === 0) return;
    const controller = new AbortController();
    setMonitoring(new Map());
    setMonitoringLoading(true);
    setMonitoringError("");
    void listTenantMonitoringSummaries(controller.signal).then((summaries) => {
      if (controller.signal.aborted) return;
      const byTenant = new Map(summaries.map((summary) => [summary.tenant_id, summary]));
      setMonitoring(byTenant);
      if (tenants.some((tenant) => !byTenant.has(tenant.id))) {
        setMonitoringError("Monitoring details are unavailable for some tenants. Refresh to retry.");
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setMonitoringError("Monitoring details could not be loaded. Refresh to retry.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setMonitoringLoading(false);
    });
    return () => controller.abort();
  }, [tenants]);

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
    <div className="tenant-page">
      <header className="tenant-page-header">
        <Link to="/admin" className="tenant-breadcrumb">Admin</Link>
        <h1>Tenants</h1>
        <p>Workspaces and their monitoring activity.</p>
      </header>

      {error && <div role="alert" className="tenant-notice tenant-notice-error">{error}</div>}
      {success && <div role="status" className="tenant-notice">{success}</div>}

      <section className="tenant-roster" aria-label="Tenants">
        <div className="tenant-toolbar">
          <label className="tenant-search">
            <Search size={15} aria-hidden="true" />
            <input aria-label="Search tenants" value={query}
              onChange={(event) => setQuery(event.target.value)} placeholder="Search tenants…" />
          </label>
          <span className="tenant-count">
            {loading ? "Loading…" : query.trim()
              ? `${filtered.length.toLocaleString()} of ${tenants.length.toLocaleString()}`
              : `${tenants.length.toLocaleString()} tenants`}
          </span>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="tenant-icon-button" title="Refresh tenants" aria-label="Refresh tenants">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {monitoringError && <div role="status" className="tenant-monitoring-notice">{monitoringError}</div>}

        <div className="tenant-columns" aria-hidden="true">
          <span>Workspace</span>
          <div className="tenant-monitoring-columns"><span>Tasks <small>(completed / total)</small></span><span>Last monitoring</span></div>
          <span />
        </div>

        {loading ? (
          <div className="tenant-empty" role="status"><Loader2 size={18} className="animate-spin" /><span>Loading tenants…</span></div>
        ) : filtered.length === 0 ? (
          <div className="tenant-empty">{query.trim() ? "No tenants match your search." : "No tenants yet."}</div>
        ) : (
          <ul className="tenant-rows">
            {filtered.map((tenant) => (
              <li key={tenant.id} className="tenant-row">
                <div className="tenant-identity">
                  <h2 title={`${tenantLabel(tenant)} · ${tenant.id}`}>{tenantLabel(tenant)}</h2>
                  <div className="tenant-metadata">
                    {(tenant.public_slug || tenant.email_domain) && (
                      <span title={tenant.email_domain ?? undefined}>{tenant.public_slug ? `/${tenant.public_slug}` : tenant.email_domain}</span>
                    )}
                    <span className="tenant-created">Joined {formatDate(tenant.created_at)}</span>
                  </div>
                </div>
                <TenantMonitoringStats summary={monitoring.get(tenant.id)} loading={monitoringLoading} />
                <button type="button" disabled={Boolean(deletingId)}
                  onClick={() => void handleRemove(tenant)}
                  title={`Delete ${tenantLabel(tenant)}`} aria-label={`Delete ${tenantLabel(tenant)}`}
                  className="tenant-icon-button tenant-delete">
                  {deletingId === tenant.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="tenant-tools">
        <details className="tenant-disclosure">
          <summary><Plus size={15} /><span>Create tenant</span><ChevronDown size={14} className="tenant-disclosure-chevron" /></summary>
          <form onSubmit={(event) => void handleCreate(event)} className="tenant-create-form">
            <label><span>Tenant name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label>
            <button type="submit" disabled={!name.trim() || creating} className="tenant-create-button">
              {creating && <Loader2 size={14} className="animate-spin" />}Create tenant
            </button>
          </form>
        </details>
        <details className="tenant-disclosure">
          <summary><span>Simulate successful login</span><ChevronDown size={14} className="tenant-disclosure-chevron" /></summary>
          <div className="tenant-login-panel">
            <SimulatedLoginPanel onError={setError} onStarted={async () => {
              await load();
              window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
            }} />
          </div>
        </details>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }).format(new Date(value));
}
