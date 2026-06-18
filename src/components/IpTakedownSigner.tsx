import { useEffect, useState } from "react";
import {
  getIpTakedownProfile,
  updateIpTakedownProfile,
  type TakedownProfile,
} from "../api";

// Per-IP signer details that populate every takedown notice for this IP
// (rights-holder legal name + contact + authorized signatory). Platforms like
// Etsy require these fields, so the takedown composer flags them as missing
// until set. Scoped per-IP so one tenant can manage IPs owned by different
// companies, each signing under its own name.
const PROFILE_FIELDS: Array<{
  key: keyof TakedownProfile;
  label: string;
  placeholder: string;
  multiline?: boolean;
}> = [
  { key: "legal_name", label: "Rights-holder legal name", placeholder: "Acme Inc." },
  { key: "organization", label: "Organization (optional)", placeholder: "Acme IP Holdings" },
  { key: "address", label: "Address", placeholder: "123 Main St, City, Country", multiline: true },
  { key: "phone", label: "Telephone", placeholder: "+1 555 010 0000" },
  { key: "contact_email", label: "Contact email", placeholder: "ip@acme.com" },
  { key: "signatory_name", label: "Authorized signatory", placeholder: "Jane Doe" },
  { key: "signatory_title", label: "Signatory title (optional)", placeholder: "IP Counsel" },
];

const EMPTY_PROFILE: TakedownProfile = {
  legal_name: "", organization: "", address: "", phone: "",
  contact_email: "", signatory_name: "", signatory_title: "",
};

export default function IpTakedownSigner({ ipId }: { ipId: string }) {
  const [form, setForm] = useState<TakedownProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getIpTakedownProfile(ipId)
      .then(({ profile }) => alive && profile && setForm({ ...EMPTY_PROFILE, ...profile }))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ipId]);

  function set(key: keyof TakedownProfile, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { profile } = await updateIpTakedownProfile(ipId, form);
      setForm({ ...EMPTY_PROFILE, ...profile });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-black text-stone-900 tracking-tight">Takedown signer</h2>
        <p className="mt-1 text-sm text-stone-500">
          Fills in every takedown notice for this IP. Platforms require the
          rights-holder's name, contact details, and an authorized signatory.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex justify-center">
          <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <form onSubmit={save} className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROFILE_FIELDS.map((f) => (
              <div key={f.key} className={f.multiline ? "sm:col-span-2" : undefined}>
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                  {f.label}
                </label>
                {f.multiline ? (
                  <textarea
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    rows={2}
                    className="mt-1 w-full px-4 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-400 resize-y"
                  />
                ) : (
                  <input
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    placeholder={f.placeholder}
                    className="mt-1 w-full px-4 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:border-stone-400"
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs font-semibold text-emerald-600">Saved</span>}
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving ? "Saving…" : "Save signer"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
