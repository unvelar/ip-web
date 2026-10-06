import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { listIpLicenses, addIpLicense, deleteIpLicense, type IpLicense } from "../api/reviews";
import { IpSettingsHeading } from "./IpSettingsPrimitives";

// Authorised sellers per domain for this IP. A monitoring finding whose
// VLM-extracted seller matches a license (by name or shop URL) is auto-dismissed.
export default function LicensedSellersSection({ ipId }: { ipId: string }) {
  const [licenses, setLicenses] = useState<IpLicense[]>([]);
  const [domain, setDomain] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerUrl, setSellerUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const { licenses } = await listIpLicenses(ipId);
      setLicenses(licenses);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ipId]);

  const canAdd = !!domain.trim() && (!!sellerName.trim() || !!sellerUrl.trim());

  async function add() {
    if (!canAdd || saving) return;
    setSaving(true);
    setErr("");
    try {
      await addIpLicense(ipId, {
        domain: domain.trim(),
        seller_name: sellerName.trim() || null,
        seller_url: sellerUrl.trim() || null,
      });
      setDomain("");
      setSellerName("");
      setSellerUrl("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await deleteIpLicense(ipId, id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-5 py-4 space-y-3">
      <div>
        <IpSettingsHeading icon={ShieldCheck} title="Authorized sellers" description="Listings from matching sellers are automatically dismissed." />
      </div>

      <Link to="/monitoring/setup#authorized-sellers" className="text-sm text-blue-700 underline">Manage authorizations by brand or tenant →</Link>

      {err && <div className="text-xs text-red-600">{err}</div>}

      {licenses.length === 0 ? (
        <div className="text-xs text-stone-400 italic">No licenses yet.</div>
      ) : (
        <div className="divide-y divide-stone-100 border border-stone-100 rounded-lg">
          {licenses.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="font-mono text-stone-500 shrink-0">{l.domain}</span>
              <span className="flex-1 min-w-0 truncate">
                {l.seller_name && <span className="font-medium text-stone-800">{l.seller_name}</span>}
                {l.seller_url && (
                  <a href={l.seller_url} target="_blank" rel="noreferrer" className="ml-1.5 text-blue-700 hover:underline">
                    {l.seller_url}
                  </a>
                )}
              </span>
              <button
                onClick={() => remove(l.id)}
                className="text-stone-400 hover:text-red-600 font-bold shrink-0"
                title="Revoke authorization"
                aria-label={`Revoke authorization for ${l.seller_name ?? l.seller_url}`}
              >
                Revoke authorization
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Domain</span>
          <input aria-label="License domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="etsy.com" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-36" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Seller name</span>
          <input aria-label="Licensed seller name" value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="ThaliasCrafts" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-44" />
        </div>
        <div className="flex flex-col flex-1 min-w-[12rem]">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Shop URL (optional)</span>
          <input aria-label="Licensed shop URL" value={sellerUrl} onChange={(e) => setSellerUrl(e.target.value)} placeholder="https://www.etsy.com/shop/ThaliasCrafts" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-full" />
        </div>
        <button onClick={add} disabled={!canAdd || saving} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50">
          {saving ? "Adding…" : "Add license"}
        </button>
      </div>
      <p className="text-[11px] text-stone-400">
        Tip: the quickest way is the <span className="font-medium">“Mark as licensed seller”</span> button on a monitoring finding — it pre-fills these from the listing.
      </p>
    </div>
  );
}

