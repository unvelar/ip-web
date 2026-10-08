import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { listTrademarkSelectors, type TrademarkSelector } from "../api/registry";
import { useAuth } from "./AuthContext";

interface ActiveIpContextValue {
  ips: TrademarkSelector[];
  activeIpId: string | null;
  activeIp: TrademarkSelector | null;
  loading: boolean;
  error: string | null;
  selectIp: (ipId: string) => void;
}

const ActiveIpContext = createContext<ActiveIpContextValue | null>(null);
const ACTIVE_IP_STORAGE_PREFIX = "unvelar.active-ip";

function storageKey(tenantId: string) {
  return `${ACTIVE_IP_STORAGE_PREFIX}.${tenantId}`;
}

function readStoredIp(tenantId: string): string | null {
  try {
    return localStorage.getItem(storageKey(tenantId));
  } catch {
    return null;
  }
}

function persistIp(tenantId: string, ipId: string | null) {
  try {
    if (ipId) localStorage.setItem(storageKey(tenantId), ipId);
    else localStorage.removeItem(storageKey(tenantId));
  } catch {
    // Storage can be unavailable in private browsing. The in-memory selection
    // remains usable for the current session.
  }
}

export function ActiveIpProvider({ children }: { children: ReactNode }) {
  const { actingTenantId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<{ tenantId: string | null; ips: TrademarkSelector[] }>({ tenantId: null, ips: [] });
  const [rememberedIpId, setRememberedIpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const registryRouteKey = location.pathname.startsWith("/ips")
    ? location.pathname
    : "";

  useEffect(() => {
    let alive = true;

    if (!actingTenantId) {
      queueMicrotask(() => {
        if (!alive) return;
        setCatalog({ tenantId: null, ips: [] });
        setRememberedIpId(null);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      if (!alive) return;
      setRememberedIpId(readStoredIp(actingTenantId));
      setLoading(true);
      setError(null);
    });

    void listTrademarkSelectors(controller.signal)
      .then(({ ips: selectorIps }) => {
        if (!alive) return;
        const nextIps = [...selectorIps].sort((left, right) =>
          Number(Boolean(right.scope_kind)) - Number(Boolean(left.scope_kind))
          || Number(right.monitoring_enabled) - Number(left.monitoring_enabled)
          || Number(left.scope_kind === "product") - Number(right.scope_kind === "product")
          || left.name.localeCompare(right.name));
        setCatalog({ tenantId: actingTenantId, ips: nextIps });
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        setError(caught instanceof Error ? caught.message : "Unable to load IPs");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [actingTenantId, registryRouteKey]);

  const ips = useMemo(() => catalog.tenantId === actingTenantId ? catalog.ips : [], [actingTenantId, catalog]);
  const requestedIpId = new URLSearchParams(location.search).get("ip_id");
  const resolveIp = useCallback((id: string | null) => ips.find(ip => ip.id === id)
    ?? ips.find(ip => ip.historical_ips.some(earlier => earlier.id === id)), [ips]);
  const activeIp = resolveIp(requestedIpId) ?? resolveIp(rememberedIpId) ?? ips[0] ?? null;
  const activeIpId = activeIp?.id ?? null;

  // The URL owns scoped navigation, including browser history and old aliases.
  useEffect(() => {
    if (loading || !actingTenantId || !activeIpId) return;
    persistIp(actingTenantId, activeIpId);
    const params = new URLSearchParams(location.search);
    const scopedPage = location.pathname === "/dashboard"
      || (location.pathname.startsWith("/monitoring/") && !location.pathname.startsWith("/monitoring/setup"));
    if (!scopedPage || params.get("scope") === "all" || requestedIpId === activeIpId) return;
    params.set("ip_id", activeIpId);
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [activeIpId, actingTenantId, loading, location.hash, location.pathname, location.search, navigate, requestedIpId]);

  const selectIp = useCallback((ipId: string) => {
    const selected = resolveIp(ipId);
    if (!actingTenantId || !selected) return;
    setRememberedIpId(selected.id);
    persistIp(actingTenantId, selected.id);
    const params = new URLSearchParams(location.search);
    params.set("ip_id", selected.id);
    for (const key of ["scope", "cursor", "source_id", "product_group_id", "catalog_product_id", "seller", "finding", "campaign_batch"]) params.delete(key);
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash });
  }, [actingTenantId, location.hash, location.pathname, location.search, navigate, resolveIp]);

  const value = useMemo<ActiveIpContextValue>(() => ({
    ips,
    activeIpId,
    activeIp,
    loading,
    error,
    selectIp,
  }), [activeIp, activeIpId, error, ips, loading, selectIp]);

  return (
    <ActiveIpContext.Provider value={value}>
      {children}
    </ActiveIpContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useActiveIp() {
  const context = useContext(ActiveIpContext);
  if (!context) throw new Error("useActiveIp must be used within ActiveIpProvider");
  return context;
}
