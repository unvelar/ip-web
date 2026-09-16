import { useCallback, useEffect, useRef, useState } from "react";
import PublicSummarySettings from "../components/PublicSummarySettings";
import { IpSettingsHeading, IpSetupProgress } from "../components/IpSettingsPrimitives";
import "./RegistryDetail.css";
import IpSettingsNav from "../components/IpSettingsNav";
import { ipSettingsSection } from "../lib/ipSettingsNavigation";
import MonitoringIdentitySettings from "../components/MonitoringIdentitySettings";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, Copy, ExternalLink, FileText, Fingerprint, Globe2, ImageIcon, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import {
  isApiError,
  getTrademark,
  deleteTrademark,
  updateTrademark,
  uploadTrademarkImages,
  deleteTrademarkImage,
  listIpLicenses,
  addIpLicense,
  deleteIpLicense,
  listAllowedProductImages,
  deleteAllowedProductImage,
  type Trademark,
  type TrademarkImage,
  type IpLicense,
  type IpAllowedProductImage,
} from "../api";
import { useJobPoller } from "../hooks/useJobPoller";
import { useIpOnboardingStatus } from "../hooks/useIpOnboardingStatus";
import ImageUploader from "../components/ImageUploader";
import { PlatformsPanel } from "../components/monitoring/PlatformsPanel";
import { KeywordLearningPanel } from "../components/monitoring/KeywordLearningPanel";
import IpTakedownSigner from "../components/IpTakedownSigner";
import { consumeCommittedKeywords, mergeKeywords } from "../lib/keywords";
import { publicSummaryUrlForIp } from "../lib/publicSummary";

function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function RegistryDetail() {
  const { id } = useParams<{ id: string }>();
  return id ? <RegistryDetailContent key={id} id={id} /> : <p role="alert">IP not found</p>;
}

function RegistryDetailContent({ id }: { id: string }) {
  const navigate = useNavigate();
  const { hash } = useLocation();
  const section = ipSettingsSection(hash);
  const [ip, setIp] = useState<Trademark | null>(null);
  const [showAllImages, setShowAllImages] = useState(false);
  const [images, setImages] = useState<TrademarkImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [indexJobId, setIndexJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [savingDesc, setSavingDesc] = useState(false);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [copiedPublicLink, setCopiedPublicLink] = useState(false);
  const keywordSaveSeq = useRef(0);

  const { job: indexJob, error: indexingError } = useJobPoller(indexJobId);
  const {
    status: onboardingStatus,
    loading: onboardingLoading,
    error: onboardingError,
    refresh: refreshOnboarding,
  } = useIpOnboardingStatus(id);

  useEffect(() => {
    if (loading || !hash) return;
    const frame = window.requestAnimationFrame(() => {
      const target = ["#overview", "#search", "#protection"].includes(hash)
        ? document.querySelector(".ip-settings-page")
        : document.getElementById(hash.slice(1));
      target?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash, loading]);

  async function saveKeywords(next: string[]) {
    if (!ip) return;
    const seq = ++keywordSaveSeq.current;
    const previous = ip;
    setIp({ ...ip, keywords: next });
    try {
      const { trademark } = await updateTrademark(ip.id, { keywords: next });
      if (seq === keywordSaveSeq.current) {
        setIp(trademark);
        void refreshOnboarding(true);
      }
    } catch (e: unknown) {
      if (seq === keywordSaveSeq.current) setIp(previous);
      setError(errorMessage(e));
    }
  }

  function addKeyword() {
    if (!ip || !keywordDraft.trim()) return;
    const next = mergeKeywords(ip.keywords ?? [], keywordDraft);
    if (next.length === (ip.keywords ?? []).length) {
      setKeywordDraft("");
      return;
    }
    setKeywordDraft("");
    void saveKeywords(next);
  }

  function handleKeywordDraftChange(value: string) {
    if (!ip) return;
    const next = consumeCommittedKeywords(ip.keywords ?? [], value);
    setKeywordDraft(next.draft);
    if (next.keywords.length !== (ip.keywords ?? []).length) {
      void saveKeywords(next.keywords);
    }
  }

  function removeKeyword(idx: number) {
    if (!ip) return;
    const next = (ip.keywords ?? []).filter((_, i) => i !== idx);
    void saveKeywords(next);
  }

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoadError("");
    setNotFound(false);
    try {
      const data = await getTrademark(id, controller.signal);
      if (controller.signal.aborted) return;
      setIp(data.trademark);
      setImages(data.images);
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (isApiError(caught, 404)) {
        setNotFound(true);
        setIp(null);
      } else setLoadError(errorMessage(caught));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  useEffect(() => {
    if (indexJob?.status === "completed" || indexJob?.status === "failed") {
      void load();
      void refreshOnboarding(true);
      if (indexJob.status === "completed") setIndexJobId(null);
    }
  }, [indexJob?.status, load, refreshOnboarding]);

  async function handleUpload(files: File[]) {
    if (!id) return;
    setUploading(true);
    setError("");
    try {
      const { job_id } = await uploadTrademarkImages(id, files);
      setIndexJobId(job_id);
      void load();
      void refreshOnboarding(true);
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!id) return;
    try {
      await deleteTrademarkImage(id, imageId);
      void load();
      void refreshOnboarding(true);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleDelete() {
    if (!id || deleting || !confirm("Remove this IP from monitoring and delete its reference images? Existing cases and findings will be kept.")) return;
    setDeleting(true);
    setError("");
    try {
      await deleteTrademark(id);
      navigate("/ips");
    } catch (e: unknown) {
      setError(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  async function copyPublicSummaryLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPublicLink(true);
      setTimeout(() => setCopiedPublicLink(false), 1600);
    } catch (e: unknown) {
      setError(errorMessage(e));
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-16 flex justify-center">
        <div className="w-6 h-6 border-2 border-stone-900 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (notFound) return <p role="alert" className="text-red-600 p-8">IP not found</p>;
  if (!ip) return (
    <div role="alert" className="m-8 rounded-xl bg-red-50 p-5 text-red-700">
      <p>Unable to load this IP. {loadError}</p>
      <button type="button" onClick={() => { setLoading(true); void load(); }} className="mt-3 font-semibold underline">Try again</button>
    </div>
  );

  const publicSummaryUrl = publicSummaryUrlForIp(ip);

  return (
    <div className="ip-settings-page">
      <Link to="/ips" className="ip-back"><ArrowLeft size={14} aria-hidden="true" /> All intellectual properties</Link>
      <header className="ip-page-header">
        <div className="ip-identity">
          <div className="ip-avatar">{images[0] ? <img src={images[0].url} alt="" /> : <Fingerprint size={28} aria-hidden="true" />}</div>
          <div><p className="ip-eyebrow">IP settings</p><h1>{ip.name}</h1>
            <div className="ip-meta"><span><ImageIcon size={13} aria-hidden="true" />{images.length} reference{images.length === 1 ? "" : "s"}</span><span><Search size={13} aria-hidden="true" />{ip.keywords?.length ?? 0} keywords</span></div>
          </div>
        </div>
        <Link className="ip-button" to={`/monitoring/first-scan?ip_id=${ip.id}`}>View monitoring<ArrowUpRight size={14} aria-hidden="true" /></Link>
      </header>
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-5 py-4"
        >
          {error}
        </div>
      )}

      <div className="ip-settings-layout">
        <IpSettingsNav />
        <div className="ip-settings-body">
        <section hidden={section !== "overview"} id="overview" className="ip-settings-pane" aria-label="Overview">
          <IpSetupProgress status={onboardingStatus} loading={onboardingLoading} error={onboardingError} ipId={ip.id} />
          <div className="ip-publication">
            <PublicSummarySettings ip={ip} onSaved={(public_summary_enabled) => { setIp((current) => current ? { ...current, public_summary_enabled } : current); setCopiedPublicLink(false); }} />
            {publicSummaryUrl && <div className="ip-share-actions"><span className="ip-share-url"><Globe2 size={14} aria-hidden="true" />{ip.tenant_public_slug}/{ip.public_slug}</span><button type="button" className="ip-button" onClick={() => void copyPublicSummaryLink(publicSummaryUrl)}>{copiedPublicLink ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copiedPublicLink ? "Copied" : "Copy link"}</button><a className="ip-icon-button" href={publicSummaryUrl} target="_blank" rel="noreferrer" aria-label="Open public summary" title="Open public summary"><ExternalLink size={15} aria-hidden="true" /></a></div>}
          </div>
      {/* Description — inline editable */}
      <div className="border border-stone-200 rounded-xl bg-white p-4">
        <div className="flex items-center justify-between mb-1">
          <IpSettingsHeading icon={FileText} title="Description" />
          {!editingDesc && (
            <button
              onClick={() => { setDescDraft(ip.description || ""); setEditingDesc(true); }}
              className="ip-button"
            >
              <Pencil size={13} aria-hidden="true" />{ip.description ? "Edit" : "Add"}
            </button>
          )}
        </div>
        {editingDesc ? (
          <div className="space-y-2">
            <textarea
              aria-label="IP description"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              rows={2}
              autoFocus
              placeholder="e.g. Egg-shaped smartphone case with smooth organic curves and matte pastel finish"
              className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-600 transition-all resize-y"
            />
            <p className="text-xs text-stone-400">
              Used to recognize the design during clearance.
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
                  } catch (e: unknown) {
                    setError(errorMessage(e));
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
          <p className="text-sm text-stone-500">
            Describe the shape and details that make this IP distinctive.
          </p>
        )}</div>

      {loadError && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
        <p>Unable to refresh this IP. {loadError}</p>
        <button type="button" onClick={() => void load()} className="mt-2 font-semibold underline">Try again</button>
      </div>}
      {/* Index job status */}
      {indexingError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{indexingError}. Retrying automatically.</p>}
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

      <div id="reference-images" className="ip-reference-section">
      <IpSettingsHeading icon={ImageIcon} title="Reference images" description="The visual source of truth for matching." aside={`${images.length} images`} />
      <ImageUploader
        compact
        onUpload={handleUpload}
        uploading={uploading}
        label="Add reference images"
      />

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(showAllImages ? images : images.slice(0, 6)).map((img) => (
            <div key={img.id} className="relative group rounded-xl border border-stone-200 overflow-hidden bg-stone-50">
              <img src={img.url} alt="IP reference" loading="lazy" className="w-full aspect-square object-contain" />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteImage(img.id); }}
                  className="bg-white/90 text-red-500 rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold hover:bg-red-50 border border-stone-200 shadow-sm"
                  aria-label="Delete reference image" title="Delete image"
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/90 backdrop-blur-sm px-3 py-1.5 text-xs font-medium">
                {img.status === "indexed" ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check size={12} aria-hidden="true" />Indexed</span>
                ) : img.status === "failed" ? (
                  <span className="inline-flex items-center gap-1.5 text-red-600"><CircleAlert size={12} aria-hidden="true" />Failed</span>
                ) : (
                  <span className="text-stone-400">Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length > 6 && <button type="button" className="ip-button" onClick={() => setShowAllImages((shown) => !shown)} aria-expanded={showAllImages}>{showAllImages ? "Show fewer images" : `Show all ${images.length} images`}</button>}
      </div>
        </section>
        <section hidden={section !== "monitoring"} id="search" className="ip-settings-pane" aria-label="Monitoring">
          <div className="ip-pane-intro"><h2>Monitoring</h2><p>Choose what to look for and where to find it.</p></div>
      <div id="keywords">
      <div className="border border-stone-200 rounded-xl bg-white p-4 space-y-3">
        <div>
          <IpSettingsHeading icon={Search} title="Search keywords" description="The words we use to find your products." />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(ip.keywords ?? []).length === 0 ? (
            <span className="text-xs text-stone-400 italic">
              Add your first search term.
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
                  aria-label={`Remove keyword ${k}`} title="Remove keyword"
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            aria-label="New monitoring keyword"
            value={keywordDraft}
            onChange={(e) => handleKeywordDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addKeyword();
              }
            }}
            placeholder="Brand, product name…"
            className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 text-xs"
          />
          <button
            onClick={addKeyword}
            disabled={!keywordDraft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" /><span>Add</span>
          </button>
        </div>
      </div>

      </div>
      <div id="matching-names"><MonitoringIdentitySettings key={ip.id} ip={ip} onSaved={(updated) => setIp((current) => current ? { ...current, ...updated } : current)} /></div>

      <details className="ip-disclosure" id="keyword-learning"><summary><Sparkles size={17} aria-hidden="true" /><span>Keyword suggestions<small>Review phrases discovered in your results</small></span><Plus size={16} className="ip-disclosure-plus" aria-hidden="true" /></summary>
      <KeywordLearningPanel
        ipId={ip.id}
        onKeywordsChanged={(keywords) => {
          setIp((current) => (current ? { ...current, keywords } : current));
          void refreshOnboarding(true);
        }}
      />
      </details>
      {/* Monitoring — watched platforms + findings board */}
      <div id="monitoring" className="scroll-mt-20">
        <MonitoringSection
          ip={ip}
          onFrequencyChanged={(monitoring_frequency) =>
            setIp((current) => (current ? { ...current, monitoring_frequency } : current))
          }
        />
      </div>

        </section>
        <section hidden={section !== "protection"} id="protection" className="ip-settings-pane" aria-label="Protection">
          <div className="ip-pane-intro"><h2>Protection</h2><p>Manage trusted sellers, exceptions, and takedown details.</p></div>
      {/* Licenses — authorised sellers per domain */}
      <LicensesSection ipId={ip.id} />

      {/* Allowed product images — reviewer-selected visual exceptions */}
      <AllowedProductImagesSection ipId={ip.id} />

      {/* Takedown signer — per-IP rights-holder + signatory details */}
      <IpTakedownSigner ipId={ip.id} />

          <div className="ip-danger"><div><IpSettingsHeading icon={Trash2} title="Remove this IP" description="Stops monitoring and removes reference images. Existing cases and findings are kept." /></div><button className="ip-button ip-button-danger" onClick={handleDelete} disabled={deleting}><Trash2 size={14} aria-hidden="true" />{deleting ? "Removing…" : "Remove IP"}</button></div>
        </section>
        </div>
      </div>
    </div>
  );
}

function allowedByLabel(item: IpAllowedProductImage) {
  return item.allowed_by_display_name || item.allowed_by_email || "Unknown user";
}

function allowedDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AllowedProductImagesSection({ ipId }: { ipId: string }) {
  const [items, setItems] = useState<IpAllowedProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    listAllowedProductImages(ipId)
      .then(({ allowed_product_images }) => {
        if (!cancelled) setItems(allowed_product_images);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ipId]);

  async function remove(item: IpAllowedProductImage) {
    if (deletingId !== null) return;
    if (!confirm("Remove this allowed product image?")) return;
    setDeletingId(item.id);
    setErr("");
    try {
      await deleteAllowedProductImage(ipId, item.id);
      setItems((prev) => prev.filter((p) => p.id !== item.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div id="allowed-product-images" className="rounded-xl border border-stone-200 bg-white px-5 py-4 space-y-3">
      <div>
        <IpSettingsHeading icon={ImageIcon} title="Allowed images" description="Visual exceptions approved from your monitoring findings." />
      </div>

      {err && <div className="text-xs text-red-600">{err}</div>}

      {loading ? (
        <div className="text-xs text-stone-400 py-2">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-stone-400 italic">
          No allowed product images yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((item) => {
            const by = allowedByLabel(item);
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg border border-stone-100 bg-stone-50/60 p-2.5"
              >
                {item.image_url ? (
                  <a
                    href={item.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-white"
                    title="Open image"
                  >
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-stone-200 bg-white px-2 text-center text-[10px] text-stone-400">
                    No image
                  </div>
                )}

                <div className="min-w-0 flex-1 space-y-1 text-xs">
                  <div className="font-semibold text-stone-800">
                    Allowed {allowedDateLabel(item.allowed_at)}
                  </div>
                  {item.source_page_url ? (
                    <a
                      href={item.source_page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-blue-700 hover:underline"
                      title={item.source_page_url}
                    >
                      Source listing
                    </a>
                  ) : (
                    <div className="text-stone-400">No source listing</div>
                  )}
                  <div className="truncate text-stone-400" title={by}>
                    By {by}
                  </div>
                  {item.reason_notes && (
                    <p className="line-clamp-2 text-stone-500" title={item.reason_notes}>
                      {item.reason_notes}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void remove(item)}
                  disabled={deletingId !== null}
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-stone-200 bg-white text-stone-400 hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Remove allowed product image"
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">Remove allowed product image</span>
                </button>
              </div>
            );
          })}
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
        <IpSettingsHeading icon={ShieldCheck} title="Licensed sellers" description="Listings from matching sellers are automatically dismissed." />
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

// IP-centric monitoring: which platforms are wired to this IP. Findings live
// exclusively on the global /findings board (no duplication).
function MonitoringSection({
  ip,
  onFrequencyChanged,
}: {
  ip: Trademark;
  onFrequencyChanged: (frequency: Trademark["monitoring_frequency"]) => void;
}) {
  return (
    <PlatformsPanel
      ipId={ip.id}
      keywords={ip.keywords}
      monitoringFrequency={ip.monitoring_frequency}
      onMonitoringFrequencyChanged={onFrequencyChanged}
    />
  );
}
