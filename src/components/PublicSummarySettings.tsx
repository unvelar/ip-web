import { Globe2, LockKeyhole, LoaderCircle, CircleAlert } from "lucide-react";
import { useState } from "react";
import { updateTrademark, type Trademark } from "../api";

export default function PublicSummarySettings({
  ip,
  onSaved,
}: {
  ip: Trademark;
  onSaved: (enabled: boolean) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const available = typeof ip.public_summary_enabled === "boolean";
  const published = ip.public_summary_enabled === true;

  async function togglePublication() {
    if (saving || !available) return;
    const enabled = !published;
    setSaving(true);
    setError("");
    try {
      const { trademark } = await updateTrademark(ip.id, { public_summary_enabled: enabled });
      if (trademark.public_summary_enabled !== enabled) {
        throw new Error("Could not confirm the publication setting was saved. Refresh and try again.");
      }
      onSaved(enabled);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the publication setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4" aria-labelledby="public-summary-heading">
      <div className="ip-publication-header">
        <span className="ip-publication-symbol" data-published={published}>{!available ? <CircleAlert size={18} aria-hidden="true" /> : published ? <Globe2 size={19} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}</span>
        <div className="ip-publication-copy">
          <h2 id="public-summary-heading">Public brand summary</h2>
          <p role="status" className="ip-publication-status">
            {saving && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
            {saving ? published ? "Unpublishing…" : "Publishing…" : !available ? "Publication status unavailable" : published ? "Published" : "Not published"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-label="Publish public brand summary"
          aria-describedby="public-summary-description"
          aria-checked={published}
          disabled={saving || !available}
          onClick={() => void togglePublication()}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${published ? "bg-stone-900" : "bg-stone-200"}`}
        >
          <span aria-hidden="true" className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${published ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      <p id="public-summary-description" className="ip-publication-help">Anyone with the link can see monitoring results, takedown counts, and infringement estimates.</p>
      {!available && <p className="ip-publication-help">Publication settings are temporarily unavailable. Please try again shortly.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
