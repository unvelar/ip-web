import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getTrademark,
  deleteTrademark,
  updateTrademark,
  uploadTrademarkImages,
  deleteTrademarkImage,
  listIpLicenses,
  addIpLicense,
  deleteIpLicense,
  type Trademark,
  type TrademarkImage,
  type IpLicense,
} from "../api";
import { useJobPoller } from "../hooks/useJobPoller";
import ImageUploader from "../components/ImageUploader";
import { PlatformsPanel } from "../components/monitoring/PlatformsPanel";
import IpTakedownSigner from "../components/IpTakedownSigner";

export default function RegistryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ip, setIp] = useState<Trademark | null>(null);
  const [images, setImages] = useState<TrademarkImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [indexJobId, setIndexJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");

  const indexJob = useJobPoller(indexJobId);

  async function addKeyword() {
    if (!ip || !keywordDraft.trim()) return;
    const k = keywordDraft.trim();
    const existing = ip.keywords ?? [];
    if (existing.some((e) => e.toLowerCase() === k.toLowerCase())) {
      setKeywordDraft("");
      return;
    }
    try {
      const { trademark } = await updateTrademark(ip.id, {
        keywords: [...existing, k],
      });
      setIp(trademark);
      setKeywordDraft("");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function removeKeyword(idx: number) {
    if (!ip) return;
    const next = (ip.keywords ?? []).filter((_, i) => i !== idx);
    try {
      const { trademark } = await updateTrademark(ip.id, { keywords: next });
      setIp(trademark);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function load() {
    if (!id) return;
    try {
      const data = await getTrademark(id);
      setIp(data.trademark);
      setImages(data.images);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (indexJob?.status === "completed" || indexJob?.status === "failed") {
      load();
      if (indexJob.status === "completed") setIndexJobId(null);
    }
  }, [indexJob?.status]);

  async function handleUpload(files: File[]) {
    if (!id) return;
    setUploading(true);
    setError("");
    try {
      const { job_id } = await uploadTrademarkImages(id, files);
      setIndexJobId(job_id);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!id) return;
    await deleteTrademarkImage(id, imageId);
    load();
  }

  async function handleDelete() {
    if (!id || !confirm("Delete this IP and all its images?")) return;
    await deleteTrademark(id);
    navigate("/ips");
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 flex justify-center">
        <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!ip) return <p className="text-red-600 p-8">IP not found</p>;

  const pendingImages = images.filter((i) => i.status === "pending");

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight">{ip.name}</h1>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <span className="text-stone-400">{images.length} reference image{images.length !== 1 ? "s" : ""}</span>
            {ip.centroid_dino ? (
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">Indexed</span>
            ) : pendingImages.length > 0 ? (
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full">
                {pendingImages.length} pending
              </span>
            ) : (
              <span className="text-xs font-semibold text-stone-400 bg-stone-50 px-2.5 py-0.5 rounded-full">No images</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            className="px-4 py-2 text-sm text-red-500 border border-red-100 rounded-xl hover:bg-red-50 transition-all"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Description — inline editable */}
      <div className="border border-stone-200 rounded-xl bg-white p-4">
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Description</label>
          {!editingDesc && (
            <button
              onClick={() => { setDescDraft(ip.description || ""); setEditingDesc(true); }}
              className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
            >
              {ip.description ? "Edit" : "Add"}
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder="e.g. Egg-shaped smartphone case with smooth organic curves and matte pastel finish"
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
            <p className="text-xs text-stone-400">
              Describe the design concept, shape, and distinguishing features. Used for concept-level matching during clearance.
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={savingDesc}
                onClick={async () => {
                  setSavingDesc(true);
                  try {
                    const { trademark } = await updateTrademark(id!, { description: descDraft.trim() || undefined });
                    setIp(trademark);
                    setEditingDesc(false);
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setSavingDesc(false);
                  }
                }}
                className="px-3 py-1.5 bg-stone-900 text-white text-xs font-semibold rounded-lg hover:bg-stone-800 disabled:opacity-50 transition-all"
              >
                {savingDesc ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setEditingDesc(false)}
                className="px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : ip.description ? (
          <p className="text-sm text-stone-600">{ip.description}</p>
        ) : (
          <p className="text-sm text-stone-400 italic">
            No description — add one to improve concept-level matching during clearance.
          </p>
        )}</div>

      {/* Monitoring keywords */}
      <div className="border border-stone-200 rounded-xl bg-white p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">
            Monitoring keywords
          </label>
          <p className="text-xs text-stone-500 mt-0.5">
            Used by monitoring to scrape linked sites. Add precise search terms
            (e.g. “pikachu plush”) — generic words like “cartoon” surface noise.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(ip.keywords ?? []).length === 0 ? (
            <span className="text-xs text-stone-400 italic">
              No keywords yet — add them below.
            </span>
          ) : (
            (ip.keywords ?? []).map((k, idx) => (
              <span
                key={`${idx}-${k}`}
                className="inline-flex items-center gap-1 bg-stone-100 text-stone-800 px-3 py-1 rounded-full text-xs"
              >
                {k}
                <button
                  onClick={() => removeKeyword(idx)}
                  className="text-stone-400 hover:text-red-600 font-bold"
                  title="Remove"
                >
                  ×
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addKeyword();
              }
            }}
            placeholder="Add a keyword"
            className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 text-xs"
          />
          <button
            onClick={addKeyword}
            disabled={!keywordDraft.trim()}
            className="px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>

      {/* Licenses — authorised sellers per domain */}
      <LicensesSection ipId={ip.id} />

      {/* Monitoring — watched platforms + findings board */}
      <MonitoringSection ip={ip} />

      {/* Takedown signer — per-IP rights-holder + signatory details */}
      <IpTakedownSigner ipId={ip.id} />

      {/* Index job status */}
      {indexJob && indexJob.status !== "completed" && (
        <div className={`rounded-xl px-5 py-4 text-sm ${
          indexJob.status === "failed"
            ? "bg-red-50 text-red-700 border border-red-100"
            : "bg-blue-50 text-blue-700 border border-blue-100"
        }`}>
          {indexJob.status === "failed"
            ? `Indexing failed: ${indexJob.error}`
            : (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Indexing reference images...
              </div>
            )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-5 py-4">
          {error}
        </div>
      )}

      {/* Upload */}
      <ImageUploader
        onUpload={handleUpload}
        uploading={uploading}
        label="Drop reference images here or click to browse"
      />

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
              <img src={img.url} alt="" className="w-full aspect-square object-cover" />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                  className="bg-white/90 text-red-500 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold hover:bg-red-50 border border-stone-200 shadow-sm"
                  title="Delete image"
                >
                  x
                </button>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium">
                {img.status === "indexed" ? (
                  <span className="text-emerald-600">Indexed</span>
                ) : img.status === "failed" ? (
                  <span className="text-red-500">Failed</span>
                ) : (
                  <span className="text-stone-400">Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// Authorised sellers per domain for this IP. A monitoring finding whose
// VLM-extracted seller matches a license (by name or shop URL) is auto-dismissed.
function LicensesSection({ ipId }: { ipId: string }) {
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
        <label className="text-xs font-medium text-stone-400 uppercase tracking-wider">Licenses</label>
        <p className="text-xs text-stone-500 mt-0.5">
          Authorised sellers per domain. A monitoring finding whose seller matches
          a license (by name or shop URL) is auto-dismissed as licensed.
        </p>
      </div>

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
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex flex-col">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Domain</span>
          <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="etsy.com" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-36" />
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Seller name</span>
          <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="ThaliasCrafts" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-44" />
        </div>
        <div className="flex flex-col flex-1 min-w-[12rem]">
          <span className="text-[10px] text-stone-400 uppercase tracking-wide">Shop URL (optional)</span>
          <input value={sellerUrl} onChange={(e) => setSellerUrl(e.target.value)} placeholder="https://www.etsy.com/shop/ThaliasCrafts" className="px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs w-full" />
        </div>
        <button onClick={add} disabled={!canAdd || saving} className="px-3 py-1.5 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50">
          {saving ? "Adding…" : "Add license"}
        </button>
      </div>
      <p className="text-[11px] text-stone-400">
        Tip: the quickest way is the <span className="font-medium">“License this seller”</span> button on a monitoring finding — it pre-fills these from the listing.
      </p>
    </div>
  );
}

// IP-centric monitoring: which platforms are wired to this IP. Findings live
// exclusively on the global /findings board (no duplication).
function MonitoringSection({ ip }: { ip: Trademark }) {
  return (
    <PlatformsPanel ipId={ip.id} keywords={ip.keywords} />
  );
}
