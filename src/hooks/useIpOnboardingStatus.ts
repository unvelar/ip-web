import { useCallback, useEffect, useRef, useState } from "react";
import {
  getIpOnboardingStatus,
  type IpOnboardingStatus,
} from "../api";
import { withRequestTimeout } from "../lib/requestTimeout";

const POLL_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 8_000;

export function useIpOnboardingStatus(ipId: string | null | undefined) {
  const [status, setStatus] = useState<IpOnboardingStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(ipId));
  const [error, setError] = useState("");
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (!ipId) {
      requestSequence.current += 1;
      setStatus(null);
      setLoading(false);
      setError("");
      return;
    }
    const sequence = ++requestSequence.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (!silent) setLoading(true);
    try {
      const response = await withRequestTimeout(
        (requestSignal) => getIpOnboardingStatus(ipId, requestSignal),
        {
          signal: controller.signal,
          timeoutMs: REQUEST_TIMEOUT_MS,
          timeoutMessage: "Monitoring status request timed out",
        },
      );
      if (requestSequence.current !== sequence) return;
      setStatus(response.status);
      setError("");
    } catch (cause) {
      if (requestSequence.current !== sequence) return;
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestSequence.current === sequence) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [ipId]);

  useEffect(() => {
    requestSequence.current += 1;
    setStatus(null);
    setError("");
    setLoading(Boolean(ipId));
    if (!ipId) return;

    void refresh();
    const timer = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => {
      requestSequence.current += 1;
      activeRequest.current?.abort();
      activeRequest.current = null;
      window.clearInterval(timer);
    };
  }, [ipId, refresh]);

  return { status, loading, error, refresh };
}
