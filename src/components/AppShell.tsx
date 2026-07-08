import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  Library,
  Radar,
  ShieldCheck,
  Settings as SettingsIcon,
  Shield,
  ChevronDown,
  ListTodo,
  Plus,
  Menu,
  X,
  Building2,
  GitBranch,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import BrandMark from "./BrandMark";
import {
  getIpReviewsAttentionCount,
  getMonitoringFindingsCount,
  listTenants,
  tenantLabel,
  type Tenant,
} from "../api";
import { CURRENT_BUILD_SHA, CURRENT_BUILD_TIME, buildAgo } from "../lib/buildInfo";

/** Inbox badge polling cadence. Cheap server-side aggregation + small payload,
 *  but no need to refetch every few seconds — the badge is a glanceable
 *  notification, not a live counter. */
const INBOX_POLL_MS = 120_000;

const MON_OPEN_KEY = "appshell.mon.open";
const CLE_OPEN_KEY = "appshell.cle.open";
const TENANTS_CHANGED_EVENT = "unvelar:tenants-changed";

/**
 * Application shell — left sidebar (lg+) / off-canvas drawer (below lg) +
 * `<Outlet/>` main pane. Every signed-in route renders inside this so the
 * navigation, user menu, and notification badges are owned in one place.
 *
 * Sidebar layout (top → bottom):
 *   Dashboard
 *   Monitoring
 *     ↳ Tasks        (badge = open monitoring findings)
 *     ↳ Settings     (manage which IPs + URLs to crawl)
 *   Clearance
 *     ↳ Tasks        (badge = clearance reviews needing attention)
 *     ↳ New          (launch the clearance wizard)
 *
 * IPs lives on the desktop topbar, not the sidebar — managing the IP
 * registry is an occasional task, not day-to-day triage, so it shouldn't
 * compete for sidebar real estate.
 */
export default function AppShell() {
  const { user, logout, actingTenantId, isActingAsOther, switchTenant } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);

  // Load the tenant roster once for the admin "operate as any tenant" switcher.
  useEffect(() => {
    if (user?.role !== "admin") {
      setTenants([]);
      return;
    }
    let alive = true;
    async function refreshTenants() {
      try {
        const res = await listTenants();
        if (alive) setTenants(res.tenants);
      } catch {
        // Non-fatal: the switcher just stays at the prior value.
      }
    }
    void refreshTenants();
    window.addEventListener(TENANTS_CHANGED_EVENT, refreshTenants);
    return () => {
      alive = false;
      window.removeEventListener(TENANTS_CHANGED_EVENT, refreshTenants);
    };
  }, [user]);

  const actingTenant = tenants.find((t) => t.id === actingTenantId) ?? null;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [clearanceCount, setClearanceCount] = useState(0);
  const [monitoringCount, setMonitoringCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Per-group expanded/collapsed state. Persist, but auto-expand whenever
  // the active path belongs to a child route of that group.
  const monPathActive =
    pathname.startsWith("/monitoring") ||
    pathname === "/monitors" ||
    pathname.startsWith("/monitors/") ||
    pathname === "/findings" ||
    pathname.startsWith("/findings/");
  const clePathActive =
    pathname.startsWith("/clearance") ||
    pathname.startsWith("/ip-reviews/");
  const adminPathActive = pathname === "/admin" || pathname.startsWith("/admin/");

  const [monOpen, setMonOpen] = useState<boolean>(() => loadOpen(MON_OPEN_KEY));
  const [cleOpen, setCleOpen] = useState<boolean>(() => loadOpen(CLE_OPEN_KEY));
  useEffect(() => {
    if (monPathActive && !monOpen) setMonOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monPathActive]);
  useEffect(() => {
    if (clePathActive && !cleOpen) setCleOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clePathActive]);
  useEffect(() => {
    try { localStorage.setItem(MON_OPEN_KEY, monOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [monOpen]);
  useEffect(() => {
    try { localStorage.setItem(CLE_OPEN_KEY, cleOpen ? "1" : "0"); } catch { /* ignore */ }
  }, [cleOpen]);

  // Poll the per-group badge counts while the user is signed in. Refetch on
  // path change too — when the lawyer locks a decision or triages a finding
  // and navigates back, the badge updates without waiting a tick.
  useEffect(() => {
    if (!user) {
      setClearanceCount(0);
      setMonitoringCount(0);
      return;
    }
    if (adminPathActive) return;
    let alive = true;
    async function refresh() {
      try {
        const [{ count: clearanceCount }, { count: monitoringCount }] = await Promise.all([
          getIpReviewsAttentionCount(),
          getMonitoringFindingsCount(),
        ]);
        if (!alive) return;
        setClearanceCount(clearanceCount);
        setMonitoringCount(monitoringCount);
      } catch {
        // Non-fatal — badges just stay at the prior value.
      }
    }
    void refresh();
    const t = setInterval(refresh, INBOX_POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [user, pathname, adminPathActive]);

  // Close mobile drawer on navigation.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  function isActive(to: string) {
    return pathname === to || pathname.startsWith(`${to}/`);
  }

  const sidebar = (
    <aside className="h-full flex flex-col bg-cream border-r border-stone-200/60">
      {/* Logo + brand */}
      <div className="px-5 pt-5 pb-4">
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="h-7 w-7 shrink-0" />
          <span className="text-sm font-bold tracking-tight text-stone-900">Unvelar</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 overflow-y-auto">
        <NavItem
          to="/dashboard"
          icon={<Home size={18} />}
          label="Dashboard"
          active={pathname === "/dashboard"}
        />

        <NavGroup
          label="Monitoring"
          icon={<Radar size={14} />}
          open={monOpen}
          onToggle={() => setMonOpen((v) => !v)}
        >
          <NavItem
            to="/monitoring/tasks"
            icon={<ListTodo size={18} />}
            label="Tasks"
            active={isActive("/monitoring/tasks") || pathname === "/findings" || pathname.startsWith("/findings/")}
            badge={monitoringCount}
          />
          <NavItem
            to="/monitoring/campaigns"
            icon={<GitBranch size={18} />}
            label="Campaigns"
            active={isActive("/monitoring/campaigns")}
          />
          <NavItem
            to="/monitoring/new"
            icon={<Plus size={18} />}
            label="New"
            active={isActive("/monitoring/new")}
          />
          <NavItem
            to="/monitoring/settings"
            icon={<SettingsIcon size={18} />}
            label="Settings"
            active={isActive("/monitoring/settings") || isActive("/monitors")}
          />
        </NavGroup>

        <NavGroup
          label="Clearance"
          icon={<ShieldCheck size={14} />}
          open={cleOpen}
          onToggle={() => setCleOpen((v) => !v)}
        >
          <NavItem
            to="/clearance/tasks"
            icon={<ListTodo size={18} />}
            label="Tasks"
            active={isActive("/clearance/tasks")}
            badge={clearanceCount}
          />
          <NavItem
            to="/clearance/new"
            icon={<Plus size={18} />}
            label="New"
            active={isActive("/clearance/new") || pathname.startsWith("/ip-reviews/new")}
          />
        </NavGroup>
      </nav>

      {/* Footer: settings + admin + user menu */}
      <div className="px-3 pb-3 pt-2 border-t border-stone-200/60 space-y-0.5">
        <NavItem
          to="/settings"
          icon={<SettingsIcon size={18} />}
          label="Settings"
          active={isActive("/settings")}
        />
        {user?.role === "admin" && (
          <NavItem
            to="/admin"
            icon={<Shield size={18} />}
            label="Admin"
            active={isActive("/admin")}
          />
        )}
        {user && (
          <UserMenu
            user={user}
            tenants={tenants}
            actingTenantId={actingTenantId}
            isActingAsOther={isActingAsOther}
            onSwitchTenant={switchTenant}
            onLogout={async () => {
              const redirected = await logout();
              if (!redirected) navigate("/");
            }}
          />
        )}
      </div>
    </aside>
  );

  return (
    <div className="min-h-dvh bg-cream text-stone-900 font-[Inter,system-ui,sans-serif] lg:fixed lg:inset-0 lg:overflow-hidden">
      {/* Mobile topbar */}
      <div className="lg:hidden sticky top-0 z-30 bg-cream/90 backdrop-blur-md border-b border-stone-200/60 h-12 flex items-center px-3 gap-3">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-md hover:bg-stone-100 text-stone-700"
          aria-label="Open navigation"
        >
          <Menu size={18} />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <BrandMark className="h-6 w-6 shrink-0" />
          <span className="text-sm font-bold tracking-tight">Unvelar</span>
        </Link>
        <div className="ml-auto">
          <TopbarIpsLink active={isActive("/ips")} />
        </div>
      </div>

      <div className="flex lg:h-full">
        {/* Desktop sidebar */}
        <div className="hidden lg:block lg:w-64 lg:h-full lg:sticky lg:top-0 lg:shrink-0">
          {sidebar}
        </div>

        {/* Off-canvas drawer (mobile) */}
        {drawerOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="absolute inset-0 bg-stone-900/40"
              onClick={() => setDrawerOpen(false)}
              aria-hidden
            />
            <div className="relative w-64 h-full bg-cream shadow-xl flex flex-col">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute top-3 right-3 p-2 rounded-md hover:bg-stone-100 text-stone-600 z-10"
                aria-label="Close navigation"
              >
                <X size={18} />
              </button>
              {sidebar}
            </div>
          </div>
        )}

        {/* Main */}
        <main className="flex-1 min-w-0 lg:h-full lg:overflow-y-auto lg:overscroll-contain">
          {isActingAsOther && (
            <ActingTenantBanner
              label={actingTenant ? tenantLabel(actingTenant) : (actingTenantId ?? "")}
              onReturn={() => user && switchTenant(user.tenant_id)}
            />
          )}
          {/* Desktop topbar — only IPs lives here; it's an infrequent
              admin-y action, kept out of the day-to-day sidebar. */}
          <div className="hidden lg:flex sticky top-0 z-20 bg-cream/90 backdrop-blur-md border-b border-stone-200/60 h-12 items-center justify-end px-6">
            <TopbarIpsLink active={isActive("/ips")} />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function TopbarIpsLink({ active }: { active: boolean }) {
  const cls = active
    ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-stone-900 text-white shadow-sm"
    : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border border-stone-300 bg-white text-stone-900 shadow-sm hover:bg-stone-50 hover:border-stone-400";
  return (
    <Link to="/ips" className={cls}>
      <Library size={16} />
      <span>My IPs</span>
    </Link>
  );
}

function NavItem({
  to,
  icon,
  label,
  active,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
}) {
  const base =
    "group flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors";
  const cls = active
    ? `${base} bg-stone-100 text-stone-900 font-semibold`
    : `${base} hover:bg-stone-50 text-stone-700`;
  return (
    <Link to={to} className={cls}>
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          title={`${badge} item${badge === 1 ? "" : "s"}`}
          className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-red-600 text-white text-[10px] font-bold leading-none"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavGroup({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 hover:text-stone-600 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

/** localStorage open/closed state loader — keeps the sidebar group state
 *  consistent across reloads. Defaults to open. */
function loadOpen(key: string): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

/** Sticky strip shown while an admin operates on a tenant other than their own,
 *  so the impersonation is never silent. */
function ActingTenantBanner({ label, onReturn }: { label: string; onReturn: () => void }) {
  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 px-4 py-1.5 bg-amber-100 border-b border-amber-300 text-amber-900 text-xs">
      <Building2 size={14} className="shrink-0" />
      <span className="min-w-0 truncate">
        Acting as <span className="font-semibold">{label}</span>
      </span>
      <button
        type="button"
        onClick={onReturn}
        className="ml-auto shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950"
      >
        Return to your tenant
      </button>
    </div>
  );
}

function UserMenu({
  user,
  tenants,
  actingTenantId,
  isActingAsOther,
  onSwitchTenant,
  onLogout,
}: {
  user: {
    email: string | null;
    display_name: string | null;
    picture_url: string | null;
    role?: "user" | "admin";
  };
  tenants: Tenant[];
  actingTenantId: string | null;
  isActingAsOther: boolean;
  onSwitchTenant: (tenantId: string) => void;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "admin";

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative pt-2 mt-2 border-t border-stone-200/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-stone-100 transition-colors"
        title={user.email ?? user.display_name ?? ""}
      >
        <Avatar pictureUrl={user.picture_url} name={user.display_name ?? user.email} size={28} />
        <span className="flex-1 min-w-0 text-left text-sm font-medium text-stone-800 truncate">
          {user.display_name || user.email || "Account"}
        </span>
        <ChevronDown
          size={12}
          className={`text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 right-0 bg-white border border-stone-200 rounded-xl shadow-lg shadow-stone-200/50 overflow-hidden z-50">
          <div className="px-3 py-2.5 border-b border-stone-100">
            <div className="text-sm font-bold text-stone-900 truncate">
              {user.display_name || "Signed in"}
            </div>
            {user.email && (
              <div className="text-xs text-stone-500 truncate">{user.email}</div>
            )}
          </div>
          {isAdmin && (
            <div className="px-3 py-2.5 border-b border-stone-100">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-stone-500 mb-1">
                <Building2 size={12} /> Operate as tenant
              </label>
              <select
                value={actingTenantId ?? ""}
                onChange={(e) => onSwitchTenant(e.target.value)}
                className={`w-full text-sm rounded-lg border px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-stone-300 ${
                  isActingAsOther ? "border-amber-400 text-amber-900" : "border-stone-300 text-stone-800"
                }`}
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tenantLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={async () => {
              setOpen(false);
              await onLogout();
            }}
            className="w-full text-left px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Sign out
          </button>
          <BuildBadge />
        </div>
      )}
    </div>
  );
}

function BuildBadge() {
  // Injected by the GH Actions deploy workflow. Locally these are undefined,
  // so the badge renders as "dev".
  if (!CURRENT_BUILD_SHA) {
    return (
      <div className="px-3 py-1.5 text-[10px] text-stone-400 border-t border-stone-100">
        Build: dev
      </div>
    );
  }
  const short = CURRENT_BUILD_SHA.slice(0, 7);
  const rel = CURRENT_BUILD_TIME ? buildAgo(CURRENT_BUILD_TIME) : "";
  const full = CURRENT_BUILD_TIME
    ? `${CURRENT_BUILD_SHA} · built ${CURRENT_BUILD_TIME}`
    : CURRENT_BUILD_SHA;
  return (
    <div
      className="px-3 py-1.5 text-[10px] text-stone-400 border-t border-stone-100 font-mono"
      title={full}
    >
      Build {short}{rel && ` · ${rel}`}
    </div>
  );
}
