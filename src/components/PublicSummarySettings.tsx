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
    <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-3" aria-labelledby="public-summary-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="public-summary-heading" className="text-sm font-semibold text-stone-900">Public brand summary</h2>
          <p id="public-summary-description" className="mt-1 max-w-xl text-xs leading-5 text-stone-500">
            Publish this IP's monitoring results, takedown counts, and estimated infringement values.
            Anyone with the link can view the summary without signing in. Off by default.
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
      <p role="status" className={`text-xs font-medium ${published ? "text-emerald-700" : "text-stone-500"}`}>
        {saving
          ? published ? "Unpublishing..." : "Publishing..."
          : !available
            ? "Publication settings are temporarily unavailable. Please try again shortly."
            : published
              ? "Published. Turn off to disable access through the public link."
              : "Not published. Enable to create a public summary link."}
      </p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
