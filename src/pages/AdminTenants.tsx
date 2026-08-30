import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ExternalLink,
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
  isApiError,
  listTenants,
  simulateSuccessfulLogin,
  tenantLabel,
  type Tenant,
} from "../api";
import { useAuth } from "../context/AuthContext";

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
  const [simulatedEmail, setSimulatedEmail] = useState("");
  const [simulatingLogin, setSimulatingLogin] = useState(false);

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

  async function handleSimulatedLogin(event: React.FormEvent) {
    event.preventDefault();
    const email = simulatedEmail.trim();
    if (!email || simulatingLogin) return;

    const simulatedWindow = window.open("about:blank", "_blank");
    if (!simulatedWindow) {
      setError("Allow pop-ups for Unvelar to open the simulated login tab.");
      return;
    }
    simulatedWindow.opener = null;
    renderSimulatedLoginWindow(simulatedWindow, {
      title: "Preparing onboarding",
      message: `Signing in as ${email} and setting up the onboarding flow.`,
    });
    setSimulatingLogin(true);
    setError("");
    try {
      const result = await simulateSuccessfulLogin(email);
      const launchUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
      launchUrl.searchParams.set("simulated_login", "1");
      launchUrl.searchParams.set("token", result.token);
      launchUrl.searchParams.set("next", result.start_path);
      simulatedWindow.location.replace(launchUrl.toString());
      setSimulatedEmail(result.user.email);
      await load();
      window.dispatchEvent(new Event(TENANTS_CHANGED_EVENT));
    } catch (err) {
      const sessionExpired = isApiError(err, 401);
      const message = sessionExpired
        ? "Your admin session is no longer valid. Sign in again in the admin tab, then retry."
        : "The simulated login could not be started. Return to the admin tab to review the error and retry.";
      renderSimulatedLoginWindow(simulatedWindow, {
        title: "Simulation could not start",
        message,
        error: true,
      });
      setError(
        sessionExpired
          ? "Your admin session expired. Reload this page and sign in again, then retry the simulation."
          : err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSimulatingLogin(false);
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
          disabled={loading}
          className="h-9 w-9 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 inline-flex items-center justify-center disabled:opacity-45"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

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

      <section className="rounded-lg border border-red-200 bg-red-50/40 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-9 w-9 shrink-0 rounded-md bg-white text-red-700 border border-red-100 inline-flex items-center justify-center">
            <LogIn size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-black text-stone-900">Simulate successful login</h2>
            <p className="mt-1 text-xs leading-5 text-stone-600">
              Enter the email WorkOS would return after login. Unvelar applies the same email-domain tenant routing and opens onboarding signed in as that user. Your admin session stays active in this tab.
            </p>
            <form onSubmit={(event) => void handleSimulatedLogin(event)} className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={simulatedEmail}
                onChange={(event) => setSimulatedEmail(event.target.value)}
                placeholder="demo@nike.com"
                className="h-10 min-w-0 flex-1 rounded-md border border-stone-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600"
              />
              <button
                type="submit"
                disabled={!simulatedEmail.trim() || simulatingLogin}
                className="h-10 px-4 rounded-md bg-red-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 hover:bg-red-800 disabled:opacity-45"
              >
                {simulatingLogin ? <Loader2 size={16} className="animate-spin" /> : <ExternalLink size={16} />}
                Simulate login
              </button>
            </form>
          </div>
        </div>
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
                <div key={tenant.id} className="px-4 py-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
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

function renderSimulatedLoginWindow(
  target: Window,
  state: { title: string; message: string; error?: boolean },
) {
  if (target.closed) return;
  try {
    const document = target.document;
    document.title = state.title;
    document.documentElement.style.background = "#faf8f5";
    document.body.replaceChildren();
    Object.assign(document.body.style, {
      margin: "0",
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      color: "#1c1917",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    });

    const card = document.createElement("main");
    Object.assign(card.style, {
      width: "min(440px, calc(100vw - 48px))",
      padding: "32px",
      border: `1px solid ${state.error ? "#fecaca" : "#e7e5e4"}`,
      borderRadius: "20px",
      background: "#ffffff",
      boxShadow: "0 16px 48px rgba(28, 25, 23, 0.08)",
      textAlign: "center",
    });

    const mark = document.createElement("div");
    mark.textContent = state.error ? "!" : "U";
    Object.assign(mark.style, {
      width: "48px",
      height: "48px",
      margin: "0 auto 20px",
      display: "grid",
      placeItems: "center",
      borderRadius: "14px",
      background: state.error ? "#fef2f2" : "#dc2626",
      color: state.error ? "#b91c1c" : "#ffffff",
      fontSize: "22px",
      fontWeight: "800",
    });

    const heading = document.createElement("h1");
    heading.textContent = state.title;
    Object.assign(heading.style, {
      margin: "0",
      fontSize: "24px",
      lineHeight: "1.2",
    });

    const copy = document.createElement("p");
    copy.textContent = state.message;
    Object.assign(copy.style, {
      margin: "12px 0 0",
      color: "#78716c",
      fontSize: "14px",
      lineHeight: "1.6",
    });

    card.append(mark, heading, copy);
    document.body.append(card);
  } catch {
    // The tab may have navigated or been closed while the request completed.
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}
