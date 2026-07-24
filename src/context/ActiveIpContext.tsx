import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { listTrademarks, type Trademark } from "../api";
import { useAuth } from "./AuthContext";

interface ActiveIpContextValue {
  ips: Trademark[];
  activeIpId: string | null;
  activeIp: Trademark | null;
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
  const [ips, setIps] = useState<Trademark[]>([]);
  const [activeIpId, setActiveIpId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const registryRouteKey = location.pathname.startsWith("/ips")
    ? location.pathname
    : "";

  useEffect(() => {
    if (!actingTenantId) {
      setIps([]);
      setActiveIpId(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    void listTrademarks()
      .then(({ trademarks }) => {
        if (!alive) return;
        const nextIps = [...trademarks].sort((left, right) =>
          left.name.localeCompare(right.name)
        );
        const available = new Set(nextIps.map((ip) => ip.id));
        const urlIpId = new URLSearchParams(window.location.search).get("ip_id");
        const storedIpId = readStoredIp(actingTenantId);

        setIps(nextIps);
        setActiveIpId((current) => {
          const nextActiveIpId =
            (urlIpId && available.has(urlIpId) ? urlIpId : null) ??
            (current && available.has(current) ? current : null) ??
            (storedIpId && available.has(storedIpId) ? storedIpId : null) ??
            nextIps[0]?.id ??
            null;
          persistIp(actingTenantId, nextActiveIpId);
          return nextActiveIpId;
        });
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
    };
  }, [actingTenantId, registryRouteKey]);

  const selectIp = useCallback((ipId: string) => {
    if (!actingTenantId || !ips.some((ip) => ip.id === ipId)) return;
    setActiveIpId(ipId);
    persistIp(actingTenantId, ipId);
  }, [actingTenantId, ips]);

  const activeIp = useMemo(
    () => ips.find((ip) => ip.id === activeIpId) ?? null,
    [activeIpId, ips],
  );

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
