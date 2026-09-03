import { useCallback, useEffect, useState } from "react";
import {
  getAdminMonitoringOverview,
  getAdminMonitoringRun,
  type AdminMonitoringOverview,
  type AdminMonitoringRunDetail,
  type AdminMonitoringRunFilter,
} from "../../api";

const POLL_INTERVAL_MS = 5_000;

export type AdminMonitoringWindow = 1 | 6 | 24 | 72 | 168;

export function useAdminMonitoringFeed() {
  const [overview, setOverview] = useState<AdminMonitoringOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [status, setStatus] = useState<AdminMonitoringRunFilter>("all");
  const [windowHours, setWindowHours] = useState<AdminMonitoringWindow>(24);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const next = await getAdminMonitoringOverview({
        windowHours,
        status,
        query: debouncedQuery || undefined,
        limit,
        signal,
      });
      if (signal?.aborted) return;
      setOverview(next);
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load monitoring operations");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [debouncedQuery, limit, status, windowHours]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.visibilityState === "hidden") {
        if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      controller = new AbortController();
      await refresh(controller.signal);
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [refresh]);

  return {
    overview,
    loading,
    refreshing,
    error,
    query,
    setQuery,
    status,
    setStatus,
    windowHours,
    setWindowHours,
    limit,
    setLimit,
    refresh,
  };
}

export function useAdminMonitoringRunDetail(runId: string | null) {
  const [detail, setDetail] = useState<AdminMonitoringRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!runId) return;
    setRefreshing(true);
    try {
      const next = await getAdminMonitoringRun(runId, signal);
      if (signal?.aborted) return;
      setDetail(next);
      setError(null);
    } catch (caught) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load run details");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [runId]);

  useEffect(() => {
    setDetail(null);
    setError(null);
    if (!runId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let stopped = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const poll = async () => {
      if (document.visibilityState === "hidden") {
        if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      controller = new AbortController();
      await refresh(controller.signal);
      if (!stopped) timer = window.setTimeout(poll, POLL_INTERVAL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [refresh, runId]);

  return { detail, loading, refreshing, error, refresh };
}
