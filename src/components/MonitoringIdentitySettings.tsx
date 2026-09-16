import { Fingerprint, Pencil } from "lucide-react";
import { IpSettingsHeading } from "./IpSettingsPrimitives";
import { useState } from "react";
import { updateTrademark, type MonitoringIdentity, type Trademark } from "../api";

const emptyIdentity: MonitoringIdentity = { aliases: [], brands: [], categories: [] };
const fields = [
  { key: "aliases", label: "Alternative product names", help: "Names for this same product. A brand or category must also match.", placeholder: "Cuoio Bianco" },
  { key: "brands", label: "Brand names", help: "Brand names can appear before or after the product name.", placeholder: "Erbario Toscano" },
  { key: "categories", label: "Product category terms", help: "Specific category terms in the languages your listings use.", placeholder: "perfume, profumo, eau de parfum" },
] as const;

export default function MonitoringIdentitySettings({ ip, onSaved }: { ip: Trademark; onSaved: (ip: Trademark) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ aliases: "", brands: "", categories: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const identity = ip.monitoring_identity ?? emptyIdentity;

  function edit() {
    setDraft({ aliases: identity.aliases.join(", "), brands: identity.brands.join(", "), categories: identity.categories.join(", ") });
    setError("");
    setEditing(true);
  }

  async function save() {
    const splitTerms = (value: string) => [...new Set(value.split(/[,\n]/).map((term) => term.trim()).filter(Boolean))];
    const next: MonitoringIdentity = { aliases: splitTerms(draft.aliases), brands: splitTerms(draft.brands), categories: splitTerms(draft.categories) };
    if (fields.some(({ key }) => next[key].length > 30 || next[key].some((term) => term.length > 120))) {
      setError("Use up to 30 terms per field, with no more than 120 characters per term.");
      return;
    }
    if (fields.some(({ key }) => next[key].some((term) => term.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "").length < 4))) {
      setError("Use at least four letters or numbers per term so matching stays specific.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { trademark } = await updateTrademark(ip.id, { monitoring_identity: next });
      if (!trademark.monitoring_identity) throw new Error("The server does not support matching settings yet. Your changes were not saved.");
      onSaved(trademark);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save matching names.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-4" aria-labelledby="matching-names-heading">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div id="matching-names-heading"><IpSettingsHeading icon={Fingerprint} title="Matching names" description="Other names for this product. Images still confirm the match." /></div>
        </div>
        {!editing && <button type="button" onClick={edit} className="ip-button inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 hover:text-stone-950"><Pencil size={13} aria-hidden="true" />Edit</button>}
      </div>
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="space-y-4">
          {fields.map(({ key, label, help, placeholder }) => (
            <div key={key}>
              <label htmlFor={`identity-${key}`} className="block text-xs font-medium text-stone-700">{label}</label>
              <input id={`identity-${key}`} value={draft[key]} disabled={saving}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                placeholder={placeholder} className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-400" />
              <p className="mt-1 text-xs text-stone-500">{help} Separate terms with commas.</p>
            </div>
          ))}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save matching names"}</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg px-3 py-2 text-xs text-stone-600">Cancel</button>
          </div>
        </form>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {fields.map(({ key, label }) => <div key={key}>
            <dt className="text-xs text-stone-500">{label}</dt>
            <dd className="mt-1 text-sm text-stone-800 break-words">{identity[key].join(", ") || "Not set"}</dd>
          </div>)}
        </dl>
      )}
    </section>
  );
}
