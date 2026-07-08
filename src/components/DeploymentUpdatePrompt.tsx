import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { CURRENT_BUILD_SHA, CURRENT_BUILD_TIME, buildAgo, isReleaseBuild } from "../lib/buildInfo";

const CHECK_INTERVAL_MS = 5 * 60_000;
const DISMISSED_SHA_KEY = "unvelar.dismissedBuildSha";

interface BuildMetadata {
  sha?: unknown;
  time?: unknown;
}

interface LatestBuild {
  sha: string;
  time: string;
}

export default function DeploymentUpdatePrompt() {
  const { pathname, search, hash } = useLocation();
  const [latest, setLatest] = useState<LatestBuild | null>(null);
  const [dismissedSha, setDismissedSha] = useState(() => loadDismissedSha());
  const checkingRef = useRef(false);
  const routeKey = `${pathname}${search}${hash}`;

  const checkForUpdate = useCallback(async () => {
    if (!isReleaseBuild() || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const url = `${import.meta.env.BASE_URL}build.json?v=${Date.now()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const metadata = (await res.json()) as BuildMetadata;
      const sha = typeof metadata.sha === "string" ? metadata.sha.trim() : "";
      const time = typeof metadata.time === "string" ? metadata.time : "";
      if (!isNewerRemoteBuild(sha, time)) {
        setLatest(null);
        return;
      }
      setLatest({ sha, time });
    } catch {
      // Non-fatal: stale-build detection should never break the app shell.
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();
    const intervalId = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [checkForUpdate]);

  useEffect(() => {
    void checkForUpdate();
  }, [checkForUpdate, routeKey]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void checkForUpdate();
    }

    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkForUpdate]);

  if (!latest || latest.sha === dismissedSha) return null;

  const latestShort = latest.sha.slice(0, 7);
  const rel = latest.time ? buildAgo(latest.time) : "";

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] flex justify-center pointer-events-none sm:justify-end">
      <div className="pointer-events-auto flex max-w-sm items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 shadow-lg shadow-stone-900/10">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-stone-900">New version available</div>
          <div className="truncate text-xs text-stone-500">
            Build {latestShort}{rel && ` · ${rel}`}
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-stone-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
        >
          <RefreshCw size={13} />
          Reload
        </button>
        <button
          type="button"
          onClick={() => {
            setDismissedSha(latest.sha);
            saveDismissedSha(latest.sha);
          }}
          className="grid size-7 shrink-0 place-items-center rounded-md text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          aria-label="Dismiss update notice"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

function loadDismissedSha(): string | null {
  try {
    return localStorage.getItem(DISMISSED_SHA_KEY);
  } catch {
    return null;
  }
}

function saveDismissedSha(sha: string) {
  try {
    localStorage.setItem(DISMISSED_SHA_KEY, sha);
  } catch {
    // Ignore storage failures; the prompt can reappear on the next check.
  }
}

function isNewerRemoteBuild(remoteSha: string, remoteTime: string): boolean {
  if (!remoteSha || remoteSha === CURRENT_BUILD_SHA) return false;
  if (!remoteTime || !CURRENT_BUILD_TIME) return true;

  const remoteMs = new Date(remoteTime).getTime();
  const currentMs = new Date(CURRENT_BUILD_TIME).getTime();
  if (!Number.isFinite(remoteMs) || !Number.isFinite(currentMs)) return true;

  return remoteMs > currentMs;
}
