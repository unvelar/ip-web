import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  createTrademark,
  deleteTrademark,
  deleteTrademarkImage,
  getTrademark,
  updateTrademark,
  uploadTrademarkImages,
  type Trademark,
  type TrademarkImage,
} from "../api";
import { useJobPoller } from "../hooks/useJobPoller";
import ImageUploader from "../components/ImageUploader";

/**
 * Four-step IP-creation wizard at /ips/new.
 *
 * Step 1: Name → creates the IP, returns id.
 * Step 2: Upload assets → kicks an index job, waits for "indexed".
 * Step 3: Description (optional) + manual monitoring keywords → "Finish" saves
 *         and navigates to /ips/:id.
 *
 * Each card unlocks when the previous step is satisfied. Cancel deletes the
 * in-progress IP so we don't leave half-built rows in the registry.
 */
export default function RegistryWizard() {
  const navigate = useNavigate();
  const [trademark, setTrademark] = useState<Trademark | null>(null);
  const [images, setImages] = useState<TrademarkImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [indexJobId, setIndexJobId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [submittingName, setSubmittingName] = useState(false);

  const [description, setDescription] = useState("");

  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [finishing, setFinishing] = useState(false);

  const [error, setError] = useState("");

  const indexJob = useJobPoller(indexJobId);

  // Refresh IP on index-job completion so image statuses flip to "indexed".
  useEffect(() => {
    if (!trademark) return;
    if (indexJob?.status === "completed" || indexJob?.status === "failed") {
      void refreshTrademark();
      if (indexJob.status === "completed") setIndexJobId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexJob?.status]);

  async function refreshTrademark(): Promise<Trademark | null> {
    if (!trademark) return null;
    try {
      const data = await getTrademark(trademark.id);
      setTrademark(data.trademark);
      setImages(data.images);
      return data.trademark;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || trademark) return;
    setSubmittingName(true);
    setError("");
    try {
      const { trademark: tm } = await createTrademark(name.trim());
      setTrademark(tm);
      setImages([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingName(false);
    }
  }

  async function handleUpload(files: File[]) {
    if (!trademark) return;
    setUploading(true);
    setError("");
    try {
      const { job_id } = await uploadTrademarkImages(trademark.id, files);
      setIndexJobId(job_id);
      await refreshTrademark();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!trademark) return;
    try {
      await deleteTrademarkImage(trademark.id, imageId);
      await refreshTrademark();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function addKeyword() {
    const k = keywordDraft.trim();
    if (!k) return;
    if (keywords.some((existing) => existing.toLowerCase() === k.toLowerCase())) {
      setKeywordDraft("");
      return;
    }
    setKeywords([...keywords, k]);
    setKeywordDraft("");
  }

  function removeKeyword(idx: number) {
    setKeywords(keywords.filter((_, i) => i !== idx));
  }

  async function handleFinish() {
    if (!trademark) return;
    setFinishing(true);
    setError("");
    try {
      await updateTrademark(trademark.id, {
        description: description.trim(),
        keywords,
      });
      navigate(`/ips/${trademark.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFinishing(false);
    }
  }

  async function handleCancel() {
    if (!trademark) {
      navigate("/ips");
      return;
    }
    if (!confirm("Cancel and delete the in-progress IP?")) return;
    try {
      await deleteTrademark(trademark.id);
    } catch {
      // ignore — user may have deleted manually
    }
    navigate("/ips");
  }

  const indexedCount = images.filter((i) => i.status === "indexed").length;
  const indexing = indexJob?.status === "in_progress" || indexJob?.status === "pending";

  const step1Done = trademark !== null;
  const step2Done = step1Done && images.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/ips" className="text-xs text-stone-400 hover:text-stone-600">
            ← Intellectual Properties
          </Link>
          <h1 className="text-2xl font-black text-stone-900 tracking-tight mt-1">
            New IP
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Three steps. Each one unlocks the next.
          </p>
        </div>
        <button
          onClick={handleCancel}
          className="text-sm text-stone-500 hover:text-red-600"
        >
          Cancel
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-5 py-4">
          {error}
        </div>
      )}

      {/* --- Step 1: Name --- */}
      <WizardCard step={1} title="Name your IP" done={step1Done} active={!step1Done}>
        <form onSubmit={handleCreate} className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Mickey Mouse"
            disabled={step1Done}
            className="flex-1 px-3 py-2 rounded-lg border border-stone-200 text-sm disabled:bg-stone-50"
            autoFocus
          />
          <button
            type="submit"
            disabled={step1Done || submittingName || !name.trim()}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold disabled:opacity-50"
          >
            {submittingName ? "…" : step1Done ? "Created" : "Create"}
          </button>
        </form>
      </WizardCard>

      {/* --- Step 2: Upload assets --- */}
      <WizardCard
        step={2}
        title="Upload reference assets"
        done={step2Done}
        active={step1Done && !step2Done}
        disabled={!step1Done}
      >
        {!step1Done ? (
          <p className="text-sm text-stone-400">Create the IP first.</p>
        ) : (
          <div className="space-y-3">
            <ImageUploader onUpload={handleUpload} uploading={uploading} />
            <ImageGrid images={images} onDelete={handleDeleteImage} />
            <div className="text-xs text-stone-500">
              {images.length === 0 && "Upload at least one image."}
              {indexing && images.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-blue-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Indexing {images.length} image(s)…
                </span>
              )}
              {!indexing && images.length > 0 && (
                <span>
                  {indexedCount}/{images.length} indexed.{" "}
                  {indexedCount > 0 ? "Continue to the next step." : ""}
                </span>
              )}
            </div>
          </div>
        )}
      </WizardCard>

      {/* --- Step 3: Describe & add keywords (manual) --- */}
      <WizardCard
        step={3}
        title="Describe & add monitoring keywords"
        done={false}
        active={step2Done}
        disabled={!step2Done}
      >
        {!step2Done ? (
          <p className="text-sm text-stone-400">Upload at least one image first.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">
                Description <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Free-text description — iconic traits, era, medium. Saved for reference."
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-500 mb-1">
                Monitoring keywords
              </label>
              <p className="text-xs text-stone-400 mb-2">
                Specific search terms used to find this IP on monitored sites
                (e.g. “pikachu plush”, “mario hat”). Use precise terms — generic
                words like “cartoon” surface noise.
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                {keywords.length === 0 && (
                  <span className="text-xs text-stone-400">No keywords yet.</span>
                )}
                {keywords.map((k, idx) => (
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
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={keywordDraft}
                  onChange={(e) => setKeywordDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="Type a keyword and press Enter"
                  className="flex-1 px-3 py-2 rounded-lg border border-stone-200 text-sm"
                />
                <button
                  onClick={addKeyword}
                  disabled={!keywordDraft.trim()}
                  className="px-3 py-2 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
            <button
              onClick={handleFinish}
              disabled={finishing || keywords.length === 0}
              className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold disabled:opacity-50"
            >
              {finishing ? "Saving…" : "Finish"}
            </button>
          </div>
        )}
      </WizardCard>
    </div>
  );
}

function WizardCard({
  step,
  title,
  done,
  active,
  disabled,
  children,
}: {
  step: number;
  title: string;
  done: boolean;
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-5 space-y-3 transition-colors ${
        done
          ? "border-emerald-200 bg-emerald-50/40"
          : active
            ? "border-stone-300 bg-white"
            : "border-stone-200 bg-stone-50/60"
      } ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            done
              ? "bg-emerald-600 text-white"
              : active
                ? "bg-stone-900 text-white"
                : "bg-stone-200 text-stone-500"
          }`}
        >
          {done ? "✓" : step}
        </span>
        <h2 className="text-sm font-bold text-stone-900">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ImageGrid({
  images,
  onDelete,
}: {
  images: TrademarkImage[];
  onDelete: (id: string) => void;
}) {
  if (images.length === 0) return null;
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
      {images.map((img) => (
        <div key={img.id} className="relative group">
          <img
            src={img.url}
            alt=""
            className="w-full aspect-square object-cover rounded-lg border border-stone-200"
          />
          <button
            onClick={() => onDelete(img.id)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-stone-500 hover:text-red-600 hover:bg-white border border-stone-200 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove image"
          >
            ×
          </button>
          {img.status !== "indexed" && (
            <span className="absolute bottom-1 left-1 text-[9px] font-semibold uppercase tracking-wider bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
              {img.status}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

