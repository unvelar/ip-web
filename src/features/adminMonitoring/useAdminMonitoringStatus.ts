import { useCallback, useEffect, useState } from "react";
import { getAdminMonitoringStatus, type AdminMonitoringStatus } from "../../api";

const POLL_INTERVAL_MS = 15_000;

export type AdminMonitoringWindow = 1 | 6 | 24 | 72 | 168;

export function useAdminMonitoringStatus() {
  const [status, setStatus] = useState<AdminMonitoringStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState<AdminMonitoringWindow>(24);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const next = await getAdminMonitoringStatus({ windowHours, signal });
      if (signal?.aborted) return;
      setStatus(next);
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load monitoring status");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [windowHours]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let inFlight = false;

    const poll = async () => {
      if (stopped || inFlight) return;
      if (document.visibilityState === "hidden") {
        timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
        return;
      }
      inFlight = true;
      controller = new AbortController();
      await refresh(controller.signal);
      inFlight = false;
      if (!stopped) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (timer !== undefined) window.clearTimeout(timer);
        controller?.abort();
      } else {
        if (timer !== undefined) window.clearTimeout(timer);
        void poll();
      }
    };

    void poll();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [refresh]);

  return { status, loading, refreshing, error, windowHours, setWindowHours, refresh };
}
