import { useEffect, useRef, useState } from "react";
import { getMonitoringFinding, type IpReviewFinding } from "../../api";
import { ManagedFindingInspector } from "../../components/monitoring/board/ManagedFindingInspector";
import { APP_SHELL_OVERLAY_TOP } from "../../components/appShellLayout";
import { useOutsideDismiss } from "../../hooks/useOutsideDismiss";

/** Resolve bookmarked findings outside the loaded page, then use the shared inspector. */
export function SellerFindingPanel({ findingId, finding, ipId, onClose, onResolved, onFindingChange }: {
  findingId: string;
  finding?: IpReviewFinding;
  ipId?: string;
  onClose: () => void;
  onResolved: () => void;
  onFindingChange: () => void;
}) {
  const loadingPanelRef = useRef<HTMLElement>(null);
  useOutsideDismiss(loadingPanelRef, onClose);
  const [loadedFinding, setLoadedFinding] = useState<IpReviewFinding | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (finding) return;
    let active = true;
    void getMonitoringFinding(findingId).then((response) => {
      if (active) setLoadedFinding(response.finding);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : "Unable to load this listing.");
    });
    return () => { active = false; };
  }, [findingId, finding, attempt]);

  const current = finding ?? loadedFinding;
  if (current) return (
    <ManagedFindingInspector
      finding={current}
      ipId={current.ip_id ?? ipId}
      showIp
      onClose={onClose}
      onResolved={onResolved}
      onFindingChange={onFindingChange}
      showRelatedItems={false}
    />
  );

  return (
    <aside ref={loadingPanelRef} role="dialog" aria-label="Finding details" aria-modal="false"
      className="fixed right-0 bottom-0 z-40 w-full border-l border-stone-200 bg-white p-6 shadow-2xl sm:w-[min(92vw,48rem)]"
      style={{ top: APP_SHELL_OVERLAY_TOP }}>
      <button type="button" onClick={onClose} aria-label="Close finding details" className="mb-4 text-sm underline">Close</button>
      {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }} className="mt-3 text-sm underline">Try again</button></div>
        : <p role="status">Loading listing…</p>}
    </aside>
  );
}
