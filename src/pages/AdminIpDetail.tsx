import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  deleteAdminImage,
  deleteAdminIp,
  getAdminIp,
  patchAdminIp,
  uploadAdminImages,
  type AdminIpDetail,
  type AdminIpImage,
} from "../api";
import ImageUploader from "../components/ImageUploader";

const SOURCE_LABELS: Record<string, string> = {
  tenant_trademark: "Tenant",
  euipo_trademark: "EUIPO",
  wipo_design: "WIPO",
  giantbomb: "Giantbomb",
  anilist: "Anilist",
};

export default function AdminIpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AdminIpDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [error, setError] = useState("");

  const [description, setDescription] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  async function load() {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const detail = await getAdminIp(id);
      setData(detail);
      setDescription(detail.description ?? "");
      setGuidelines(detail.guidelines ?? "");
      setCaption(detail.caption_text ?? "");
      setDirty(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleUpload(files: File[]) {
    if (!id) return;
    setUploading(true);
    setError("");
    try {
      await uploadAdminImages(id, files);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(img: AdminIpImage) {
    if (!id || !img.image_id) return;
    if (!confirm("Delete this reference image? The centroid will be recomputed from the rest.")) return;
    setDeletingImageId(img.image_id);
    setError("");
    try {
      await deleteAdminImage(id, img.image_id);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleDeleteIp() {
    if (!id || !data) return;
    if (!confirm(`Delete IP "${data.name ?? id}"? This cannot be undone.`)) return;
    setDeletingAll(true);
    setError("");
    try {
      await deleteAdminIp(id);
      navigate("/admin");
    } catch (e: any) {
      setError(e.message);
      setDeletingAll(false);
    }
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);
    setError("");
    try {
      await patchAdminIp(id, {
        description: description.trim() || null,
        guidelines: guidelines.trim() || null,
        caption_text: caption.trim() || null,
      });
      setDirty(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <p className="text-sm text-stone-500">Not found.</p>
      </div>
    );
  }

  const indexedCount = data.images.filter((i) => i.indexed).length;
  const captionChanged = caption.trim() !== (data.caption_text ?? "").trim();

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Breadcrumb + header */}
      <div className="space-y-2">
        <Link to="/admin" className="text-sm text-stone-500 hover:text-stone-900 transition-colors">
          ← All IPs
        </Link>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-stone-900 tracking-tight">{data.name || "(unnamed)"}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-stone-500">
              <span className="inline-block text-[10px] font-semibold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded uppercase tracking-wide">
                {SOURCE_LABELS[data.source] ?? data.source}
              </span>
              {data.entity_type && <span>{data.entity_type}</span>}
              <span className="text-stone-300">·</span>
              <span>
                {data.images.length} reference{data.images.length !== 1 ? "s" : ""}
                {indexedCount > 0 && <> · {indexedCount} indexed</>}
              </span>
            </div>
            {data.aliases.length > 0 && (
              <p className="mt-1 text-xs text-stone-400">aliases: {data.aliases.join(", ")}</p>
            )}
          </div>
          <button
            onClick={handleDeleteIp}
            disabled={deletingAll}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 transition-all"
          >
            {deletingAll ? "Deleting..." : "Delete IP"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      {/* Upload */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-900">Add reference images</h2>
        <p className="text-xs text-stone-500">
          New poses improve multi-pose retrieval. Embedding + centroid recompute run async after upload.
        </p>
        <ImageUploader onUpload={handleUpload} uploading={uploading} />
      </section>

      {/* Image grid */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-900">References ({data.images.length})</h2>
        {data.images.length === 0 ? (
          <p className="text-sm text-stone-400 py-8 text-center">No reference images yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {data.images.map((img) => (
              <div
                key={img.key}
                className="group relative bg-white border border-stone-200 rounded-xl overflow-hidden hover:shadow-md transition-all"
              >
                <div className="aspect-square bg-stone-50 flex items-center justify-center">
                  <img src={img.url} alt={img.key} className="w-full h-full object-contain" />
                </div>
                <div className="p-2 text-xs">
                  <StatusBadge img={img} />
                </div>
                {img.image_id && (
                  <button
                    onClick={() => handleDeleteImage(img)}
                    disabled={deletingImageId === img.image_id}
                    className="absolute top-2 right-2 px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded opacity-0 group-hover:opacity-100 hover:bg-red-700 disabled:opacity-100 disabled:bg-stone-400 transition-all"
                  >
                    {deletingImageId === img.image_id ? "..." : "Delete"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Details: description / guidelines / caption */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-stone-900">Details</h2>
        <div className="bg-white rounded-2xl border border-stone-200 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              rows={2}
              placeholder="Short description of the IP."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">Guidelines</label>
            <textarea
              value={guidelines}
              onChange={(e) => { setGuidelines(e.target.value); setDirty(true); }}
              rows={3}
              placeholder="Plain-English rules checked on every submission (tenant IPs)."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Caption{" "}
              <span className="font-normal text-stone-400">
                — the text the caption embedding is built from. Editing re-embeds it (async).
              </span>
            </label>
            <textarea
              value={caption}
              onChange={(e) => { setCaption(e.target.value); setDirty(true); }}
              rows={4}
              placeholder="No caption indexed yet."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
            {captionChanged && (
              <p className="text-xs text-amber-600 mt-1">
                Caption changed — saving re-embeds it for caption-based retrieval.
              </p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-5 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 disabled:opacity-50 transition-all"
          >
            {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ img }: { img: AdminIpImage }) {
  if (img.indexed || img.status === "indexed") {
    return <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">indexed</span>;
  }
  if (img.status === "pending") {
    return <span className="inline-block text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">pending</span>;
  }
  return <span className="inline-block text-[10px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">{img.status || "pending"}</span>;
}
