import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, LoaderCircle, X } from "lucide-react";
import { submitListingLink } from "../api/findingActions";
import { isApiError } from "../api/transport";
import { useActiveIp } from "../context/ActiveIpContext";
import { useAuth } from "../context/AuthContext";
import { listingReportUrl } from "../lib/listingReportUrl";
import "./SubmitListingLink.css";

export function SubmitListingLink({ onSubmitted }: { onSubmitted: () => void }) {
  const { activeIp, loading } = useActiveIp();
  const { actingTenantId } = useAuth();
  if (!activeIp || loading) return null;
  return <Submission key={`${actingTenantId}:${activeIp.id}`} ipId={activeIp.id} ipName={activeIp.name} onSubmitted={onSubmitted} />;
}

export function MonitoringQueueHeader({ onSubmitted }: { onSubmitted: () => void }) {
  const { activeIp } = useActiveIp();
  if (!activeIp) return null;
  return <header className="monitoring-queue-heading">
    <div><h2>Review queue</h2><p>Potential matches for {activeIp.name}</p></div>
    <SubmitListingLink onSubmitted={onSubmitted} />
  </header>;
}

function Submission({ ipId, ipName, onSubmitted }: { ipId: string; ipName: string; onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="submit-listing-trigger" onClick={() => setOpen(true)}><Plus size={14} aria-hidden />Report listing</button>
    {open && <SubmissionDialog ipId={ipId} ipName={ipName} onSubmitted={onSubmitted} onClose={() => setOpen(false)} />}
  </>;
}

function SubmissionDialog({ ipId, ipName, onSubmitted, onClose }: { ipId: string; ipName: string; onSubmitted: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const titleId = useId(), descriptionId = useId(), inputId = useId(), errorId = useId();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ result_id: string; created: boolean } | null>(null);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    input.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    let normalized: string;
    try { normalized = listingReportUrl(url); }
    catch (caught) { setError((caught as Error).message); return; }
    setBusy(true);
    try {
      const result = await submitListingLink(ipId, normalized);
      if (!mounted.current) return;
      setReceipt(result);
      onSubmitted();
    } catch (caught) {
      if (!mounted.current) return;
      setError(isApiError(caught, 404)
        ? "Link submission is unavailable for this brand or product. Your link has been kept."
        : caught instanceof Error ? caught.message : "Could not submit this link. Please try again.");
    } finally { if (mounted.current) setBusy(false); }
  }

  return <dialog ref={dialog} className="submit-listing-dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { if (busy) event.preventDefault(); else onClose(); }}>
    <div className="submit-listing-heading">
      <h2 id={titleId}>{receipt ? receipt.created ? "Listing added" : "Listing already added" : "Report a listing"}</h2>
      <button type="button" className="submit-listing-close" aria-label="Close submission" disabled={busy} onClick={onClose}><X size={18} /></button>
    </div>
    {receipt ? <div className="submit-listing-receipt">
      <Check size={24} aria-hidden />
      <p id={descriptionId}>{receipt.created
        ? "Your link is queued for scraping and analysis. You can open the task to follow its progress."
        : "This listing already has a task for this brand or product. Open it to see its current status."}</p>
      <p className="submit-listing-scope">{ipName}</p>
      <div className="submit-listing-actions">
        <button type="button" onClick={() => { setReceipt(null); setUrl(""); setError(""); }}>Report another</button>
        <Link className="submit-listing-primary" to={`/monitoring/tasks/${encodeURIComponent(receipt.result_id)}?ip_id=${encodeURIComponent(ipId)}`} onClick={onClose}>Open task</Link>
      </div>
    </div> : <form onSubmit={event => void submit(event)} noValidate>
      <p id={descriptionId}>Add a listing to review for <strong>{ipName}</strong>.</p>
      <label htmlFor={inputId}>Listing URL</label>
      <input ref={input} id={inputId} type="url" inputMode="url" autoComplete="off" spellCheck={false} maxLength={4096}
        placeholder="https://marketplace.com/listing/…" value={url} disabled={busy} aria-invalid={!!error} aria-describedby={error ? errorId : undefined}
        onChange={event => { setUrl(event.target.value); setError(""); }} />
      <p className="submit-listing-hint">We’ll collect the listing details and prepare it for review.</p>
      {error && <p id={errorId} role="alert" className="submit-listing-error">{error}</p>}
      <div className="submit-listing-actions">
        <button type="button" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="submit-listing-primary" disabled={busy || !url.trim()}>{busy && <LoaderCircle size={14} className="animate-spin" aria-hidden />}{busy ? "Reporting…" : "Report listing"}</button>
      </div>
    </form>}
  </dialog>;
}
