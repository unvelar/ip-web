import { Link } from "react-router-dom";
import { useEffect, useId, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { updateTrademark, type ProtectedTerm, type Trademark } from "../api";
import { getProtectedTermsReport, type ProtectedTermsReport } from "../api/registry";
import { IpSettingsHeading } from "./IpSettingsPrimitives";

export default function ProtectedTermsSettings({ ip, onSaved }: { ip: Trademark; onSaved: (ip: Trademark) => void }) {
  const heading = useId();
  const [draft, setDraft] = useState<ProtectedTerm[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<ProtectedTermsReport | null>(null);
  const terms = ip.protected_terms ?? [];
  useEffect(() => {
    if (!terms.length) return;
    let active = true;
    getProtectedTermsReport(ip.id).then((value) => { if (active) setReport(value); }).catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [ip.id, ip.protected_terms_revision, terms.length]);

  function change(id: string, patch: Partial<ProtectedTerm>) {
    setDraft((current) => current?.map((term) => term.id === id ? { ...term, ...patch } : term) ?? null);
  }
  function add() {
    setDraft((current) => [...(current ?? terms), { id: crypto.randomUUID(), phrase: "", variants: [], context: "" }]);
    setError("");
  }
  async function save() {
    if (!draft) return;
    const next = draft.map((term) => ({ ...term, phrase: term.phrase.trim(), context: term.context.trim(), variants: [...new Set(term.variants.map((v) => v.trim()).filter(Boolean))] }));
    const keys = next.map((term) => term.phrase.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim());
    if (keys.some((key) => !key) || new Set(keys).size !== keys.length || next.some((term) => term.variants.length > 10)) {
      setError("Give each term a distinct name. Use up to 10 variants per term.");
      return;
    }
    if (next.some((term) => term.variants.some((variant) => variant.length > 120 || !/[\p{L}\p{N}]/u.test(variant)))) {
      setError("Each variant must contain a name or phrase of at most 120 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { trademark } = await updateTrademark(ip.id, { protected_terms: next });
      if (!trademark.protected_terms || trademark.protected_terms.length !== next.length || next.some((term, i) => { const saved = trademark.protected_terms?.[i]; return !saved || saved.id !== term.id || saved.phrase !== term.phrase || saved.context !== term.context || saved.variants.join("\n") !== term.variants.join("\n"); })) {
        throw new Error("Protected terms were not saved. The server may need updating.");
      }
      onSaved(trademark);
      setDraft(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save protected terms."); }
    finally { setSaving(false); }
  }
  return <section id="protected-terms" aria-labelledby={heading} className="rounded-xl border border-stone-200 bg-white p-4 space-y-4 scroll-mt-20">
    <div className="flex items-start justify-between gap-3">
      <div id={heading}><IpSettingsHeading icon={ShieldCheck} title="Protected terms" description="Check how protected names and phrases are used in listing titles and descriptions." /></div>
      {draft === null && <button type="button" className="ip-button shrink-0" onClick={() => { setDraft(terms.length ? terms.map((term) => ({ ...term, variants: [...term.variants] })) : [{ id: crypto.randomUUID(), phrase: "", variants: [], context: "" }]); setError(""); }}>{terms.length ? "Edit" : "Configure"}</button>}
    </div>
    <p className="text-sm leading-relaxed text-stone-600">These terms are also searched alongside your keywords. A mention alone does not flag a listing. We consider compatibility, resale and what the item actually depicts. Reference images are optional. Changes apply to new scans.</p>
    {draft === null ? <div className="space-y-3">
      {terms.length ? terms.map((term) => <div key={term.id} className="rounded-lg border border-stone-100 px-3 py-2">
        <p className="text-sm font-semibold text-stone-900 break-words">{term.phrase}</p>
        {term.variants.length > 0 && <p className="mt-1 text-xs text-stone-500">Variants: {term.variants.join(", ")}</p>}
        {term.context && <p className="mt-1 text-xs text-stone-600 break-words">{term.context}</p>}
        <Link className="mt-2 inline-block text-xs text-stone-600 underline" to={`/monitoring/tasks?ip_id=${ip.id}&match_basis=text&protected_term_id=${term.id}`}>View findings for this term</Link>
      </div>) : <p className="rounded-lg bg-stone-50 px-3 py-3 text-sm text-stone-500">No protected terms configured. Add names or phrases you want to monitor. Keep broad product categories in keywords.</p>}
    </div> : <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      {draft.map((term, index) => <fieldset key={term.id} disabled={saving} className="space-y-3 rounded-lg border border-stone-200 p-3">
        <legend className="px-1 text-xs font-semibold text-stone-500">Term {index + 1}</legend>
        <div className="flex items-end gap-2"><label className="flex-1 text-xs font-medium text-stone-700">Protected name or phrase
          <input value={term.phrase} maxLength={120} required onChange={(e) => change(term.id, { phrase: e.target.value })} placeholder="Brand, character or collection name" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
        </label><button type="button" aria-label={`Remove term ${index + 1}`} onClick={() => setDraft(draft.filter((item) => item.id !== term.id))} className="rounded-lg p-2.5 text-stone-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={16} /></button></div>
        <label className="block text-xs font-medium text-stone-700">Variants, optional
          <input value={term.variants.join(",")} onChange={(e) => change(term.id, { variants: e.target.value.split(",") })} placeholder="Separate spellings or translations with commas" className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-medium text-stone-700">Context, optional
          <textarea value={term.context} maxLength={500} rows={2} onChange={(e) => change(term.id, { context: e.target.value })} placeholder="Describe what the name refers to and any legitimate uses to consider." className="mt-1 w-full resize-y rounded-lg border border-stone-200 px-3 py-2 text-sm" />
        </label>
      </fieldset>)}
      <button type="button" disabled={saving || draft.length >= 30} onClick={add} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-700 disabled:opacity-50"><Plus size={15} />Add protected term</button>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-2"><button type="submit" disabled={saving} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save protected terms"}</button><button type="button" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg px-3 py-2 text-sm text-stone-600">Cancel</button></div>
    </form>}
    {terms.length > 0 && <p className="rounded-lg bg-stone-50 px-3 py-3 text-xs leading-relaxed text-stone-600">Compatibility references can be legitimate. We check whether the item being sold reproduces protected names or designs. Branding on a background object alone is not evidence against the item.</p>}
    {report && terms.length > 0 && <div className="border-t border-stone-100 pt-3 text-xs text-stone-500">
      <p className="font-medium text-stone-700">Last 30 days</p>
      <p className="mt-1">{report.additional_listings} additional listings found through text · {report.overlapping_listings} also found visually</p>
      <p className="mt-1">{report.assessed} assessed · {report.pending} awaiting checks · {report.unclear} unclear · {report.unavailable} unavailable or failed</p>
    </div>}
  </section>;
}
