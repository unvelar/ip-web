import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  deleteAdminImage,
  deleteAdminIp,
  getAdminIp,
  patchAdminIp,
  uploadAdminImages,
  type AdminIpDetail,
  type AdminIpImage,
} from "../api";
import { Check, FileText, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { AdminPage, AdminSectionHeading } from "../components/admin/AdminPage";
import ImageUploader from "../components/ImageUploader";

const SOURCE_LABELS: Record<string, string> = {
  tenant_trademark: "Tenant",
  euipo_trademark: "EUIPO",
  wipo_design: "WIPO",
  giantbomb: "Giantbomb",
};

export default function AdminIpDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const catalogState: unknown = location.state?.catalogUrl;
  const catalogUrl = typeof catalogState === "string" && /^\/admin\/ips(?:\?|$)/.test(catalogState) ? catalogState : "/admin/ips";
  const [showAllImages, setShowAllImages] = useState(false);

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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setDeletingImageId(null);
    }
  }

  async function handleDeleteIp() {
    if (!id || !data) return;
    if (!confirm(`Remove IP "${data.name ?? id}" from monitoring? Owned reference images will be deleted. Existing cases and findings will be kept.`)) return;
    setDeletingAll(true);
    setError("");
    try {
      await deleteAdminIp(id);
      navigate(catalogUrl);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !data) {
    return (
      <AdminPage section="catalog" title="IP details" description="Reference images and matching details." back={{ to: catalogUrl, label: "IP catalog" }}>
        <div className="admin-card admin-empty">
          {loading ? <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Loading IP</> : <><p role="alert">{error || "IP not found."}</p><button type="button" className="admin-button" onClick={() => void load()}>Try again</button></>}
        </div>
      </AdminPage>
    );
  }

  const indexedCount = data.images.filter((i) => i.indexed).length;
  const captionChanged = caption.trim() !== (data.caption_text ?? "").trim();

  return (
    <AdminPage section="catalog" title={data.name || "Unnamed IP"} description={`${SOURCE_LABELS[data.source] ?? data.source}${data.entity_type ? ` · ${data.entity_type}` : ""}`}
      image={data.images[0]?.url}
      back={{ to: catalogUrl, label: "IP catalog" }}
      meta={<><span><ImageIcon size={13} aria-hidden="true" />{data.images.length} reference{data.images.length === 1 ? "" : "s"}</span><span><Check size={13} aria-hidden="true" />{indexedCount} indexed</span>{data.aliases.length > 0 && <span>Also known as {data.aliases.join(", ")}</span>}</>}
    >
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded-xl">{error}</div>
      )}

      <section className="admin-card admin-card-padded admin-reference-section" aria-label="Reference images">
        <AdminSectionHeading icon={ImageIcon} title="Reference images" description="Add different views to improve visual matching. New images are indexed after upload." aside={`${data.images.length} image${data.images.length === 1 ? "" : "s"}`} />
        <ImageUploader onUpload={handleUpload} uploading={uploading} />
        {data.images.length === 0 ? (
          <p className="text-sm text-stone-400 py-8 text-center">No reference images yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(showAllImages ? data.images : data.images.slice(0, 6)).map((img) => (
              <div
                key={img.key}
                className="group relative bg-white border border-stone-200 rounded-xl overflow-hidden"
              >
                <div className="aspect-square bg-stone-50 flex items-center justify-center">
                  <img src={img.url} alt="IP reference" loading="lazy" className="w-full h-full object-contain" />
                </div>
                <div className="p-2 text-xs">
                  <StatusBadge img={img} />
                </div>
                {img.image_id && (
                  <button
                    onClick={() => handleDeleteImage(img)}
                    disabled={deletingImageId === img.image_id}
                    className="admin-icon-button admin-image-delete absolute top-2 right-2 text-red-600"
                    aria-label="Delete reference image"
                  >
                    {deletingImageId === img.image_id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {data.images.length > 6 && <button type="button" className="admin-button self-start" aria-expanded={showAllImages} onClick={() => setShowAllImages((value) => !value)}>{showAllImages ? "Show fewer images" : `Show all ${data.images.length} images`}</button>}
      </section>

      {/* Details: description / guidelines / caption */}
      <section className="admin-card admin-card-padded" aria-label="Matching details">
        <AdminSectionHeading icon={FileText} title="Matching details" description="Describe this IP and the rules used when reviewing matches." />
        <div className="admin-detail-fields">
          <div>
            <label htmlFor="admin-ip-description" className="block text-sm font-medium text-stone-700 mb-1.5">Description</label>
            <textarea
              id="admin-ip-description"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
              rows={2}
              placeholder="Short description of the IP."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
          </div>
          <div>
            <label htmlFor="admin-ip-guidelines" className="block text-sm font-medium text-stone-700 mb-1.5">Guidelines</label>
            <textarea
              id="admin-ip-guidelines"
              value={guidelines}
              onChange={(e) => { setGuidelines(e.target.value); setDirty(true); }}
              rows={3}
              placeholder="Plain-English rules checked on every submission (tenant IPs)."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
          </div>
          <div>
            <label htmlFor="admin-ip-caption" className="block text-sm font-medium text-stone-700 mb-1.5">
              Caption{" "}
              <span className="font-normal text-stone-400">
                Used for text matching. Saving updates the search index.
              </span>
            </label>
            <textarea
              id="admin-ip-caption"
              value={caption}
              onChange={(e) => { setCaption(e.target.value); setDirty(true); }}
              rows={4}
              placeholder="No caption indexed yet."
              className="w-full px-4 py-2.5 border border-stone-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
            {captionChanged && (
              <p className="text-xs text-amber-600 mt-1">
                Saving this caption will update text matching.
              </p>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="admin-button admin-button-primary self-start"
          >
            {saving ? "Saving..." : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </section>
      <div className="admin-danger">
        <AdminSectionHeading icon={Trash2} title="Remove this IP" description="Stops monitoring and removes owned references. Existing cases and findings are kept." />
        <button type="button" onClick={handleDeleteIp} disabled={deletingAll} className="admin-button admin-button-danger"><Trash2 size={14} aria-hidden="true" />{deletingAll ? "Removing…" : "Remove IP"}</button>
      </div>
    </AdminPage>
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
