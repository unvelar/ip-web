import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  addIpMonitoringPlatform,
  createTrademark,
  deleteTrademark,
  deleteTrademarkImage,
  getOnboardingBrandProfile,
  getTrademark,
  importOnboardingWebsiteReference,
  isApiError,
  listTrademarks,
  updateTrademark,
  uploadTrademarkImages,
  type OnboardingBrandProfile,
  type Trademark,
  type TrademarkImage,
} from "../../api";
import { useAuth } from "../../context/AuthContext";
import { useJobPoller } from "../../hooks/useJobPoller";
import { consumeCommittedKeywords, mergeKeywords } from "../../lib/keywords";
import { buildMonitoringKeywords, suggestOnboardingIp } from "../../lib/onboarding";
import { startMonitoringSources } from "../../lib/startMonitoringSources";

export type OnboardingStep = 1 | 2 | 3 | 4;

export interface OnboardingTransition {
  title: string;
  detail: string;
  kind?: "monitoring";
}

const TRANSITION_DELAY_MS = 900;

export function useRegistryWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const onboardingSuggestion = useMemo(
    () => searchParams.get("onboarding") === "1" ? suggestOnboardingIp(user?.email) : null,
    [searchParams, user?.email],
  );
  const onboardingDomain = onboardingSuggestion?.domain ?? null;

  const [trademark, setTrademark] = useState<Trademark | null>(null);
  const [createdInThisFlow, setCreatedInThisFlow] = useState(false);
  const [images, setImages] = useState<TrademarkImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importingWebsiteReference, setImportingWebsiteReference] = useState(false);
  const [websiteReferenceImportError, setWebsiteReferenceImportError] = useState("");
  const [indexJobId, setIndexJobId] = useState<string | null>(null);
  const [name, setName] = useState(() => onboardingSuggestion?.name ?? "");
  const [submittingName, setSubmittingName] = useState(false);
  const [description, setDescription] = useState("");
  const [brandNames, setBrandNames] = useState<string[]>([]);
  const [brandNameDraft, setBrandNameDraft] = useState("");
  const [productTerms, setProductTerms] = useState<string[]>([]);
  const [brandProfile, setBrandProfile] = useState<OnboardingBrandProfile | null>(null);
  const [brandProfileLoading, setBrandProfileLoading] = useState(Boolean(onboardingDomain));
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [transition, setTransition] = useState<OnboardingTransition | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [pickedCountry, setPickedCountry] = useState("");
  const [startingMonitoring, setStartingMonitoring] = useState(false);
  const [monitoringCompleted, setMonitoringCompleted] = useState(0);
  const [error, setError] = useState("");
  const indexJob = useJobPoller(indexJobId);

  useEffect(() => {
    if (!onboardingDomain) return;
    let active = true;
    void Promise.all([
      getOnboardingBrandProfile().catch(() => ({ profile: null })),
      delay(TRANSITION_DELAY_MS),
    ])
      .then(([{ profile }]) => {
        if (!active || !profile) return;
        setBrandProfile(profile);
        setBrandLogoFailed(false);
        setBrandNames(profile.brand_names?.length ? profile.brand_names : [profile.name]);
        setProductTerms(profile.product_terms ?? []);
        setName((current) => current === onboardingSuggestion?.name ? profile.name : current);
      })
      .finally(() => {
        if (active) setBrandProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onboardingDomain, onboardingSuggestion?.name]);

  useEffect(() => {
    if (!trademark) return;
    if (indexJob?.status === "completed" || indexJob?.status === "failed") {
      void refreshTrademark();
      if (indexJob.status === "completed") setIndexJobId(null);
    }
    // refreshTrademark intentionally reads the latest trademark from this flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indexJob?.status]);

  async function refreshTrademark(): Promise<Trademark | null> {
    if (!trademark) return null;
    try {
      const data = await getTrademark(trademark.id);
      setTrademark(data.trademark);
      setImages(data.images);
      return data.trademark;
    } catch (caught) {
      setError(errorMessage(caught));
      return null;
    }
  }

  async function importWebsiteReferenceIfAvailable(
    ip: Trademark,
    currentImages: TrademarkImage[],
  ): Promise<void> {
    if (currentImages.length > 0 || !onboardingSuggestion || !brandProfile?.reference_image_url) return;

    setImportingWebsiteReference(true);
    setWebsiteReferenceImportError("");
    try {
      const imported = await importOnboardingWebsiteReference(ip.id);
      if (!imported.imported) {
        setWebsiteReferenceImportError(
          imported.reason === "image_unavailable"
            ? "We found the official image, but it was not suitable to add automatically."
            : "We couldn’t add the official image automatically.",
        );
        return;
      }
      if (imported.job_id) setIndexJobId(imported.job_id);
      const data = await getTrademark(ip.id);
      setTrademark(data.trademark);
      setImages(data.images);
    } catch {
      setWebsiteReferenceImportError("We couldn’t add the official image automatically.");
    } finally {
      setImportingWebsiteReference(false);
    }
  }

  async function handleRetryWebsiteReference() {
    if (!trademark || importingWebsiteReference) return;
    await importWebsiteReferenceIfAvailable(trademark, images);
  }

  async function createIp(
    ipName: string,
    options: { reuseExistingOnConflict?: boolean } = {},
  ): Promise<boolean> {
    const normalizedName = ipName.trim();
    if (!normalizedName || trademark || submittingName) return false;
    setSubmittingName(true);
    setError("");
    try {
      const { trademark: created } = await createTrademark(normalizedName);
      setName(normalizedName);
      setTrademark(created);
      setCreatedInThisFlow(true);
      setImages([]);
      applyInitialBrandDetails(normalizedName);
      void importWebsiteReferenceIfAvailable(created, []).catch(() => undefined);
      return true;
    } catch (caught) {
      if (options.reuseExistingOnConflict && isApiError(caught, 409)) {
        const existing = await loadExistingIp(normalizedName);
        if (existing) return true;
      }
      setError(errorMessage(caught));
      return false;
    } finally {
      setSubmittingName(false);
    }
  }

  function applyInitialBrandDetails(ipName: string) {
    if (brandProfile) {
      setDescription(brandProfile.summary);
      setKeywords(brandProfile.monitoring_keywords?.length ? brandProfile.monitoring_keywords : [ipName]);
    } else {
      setBrandNames([ipName]);
      if (keywords.length === 0) setKeywords([ipName]);
    }
  }

  function handleRejectBrand() {
    setBrandProfile(null);
    setName("");
    setBrandNames([]);
    setProductTerms([]);
    setKeywords([]);
  }

  async function loadExistingIp(ipName: string): Promise<Trademark | null> {
    try {
      const expectedSlug = publicSlugForName(ipName);
      const { trademarks } = await listTrademarks();
      const existing = trademarks.find((candidate) => candidate.public_slug === expectedSlug);
      if (!existing) return null;
      const data = await getTrademark(existing.id);
      setName(data.trademark.name);
      setTrademark(data.trademark);
      setCreatedInThisFlow(false);
      setImages(data.images);
      setDescription(data.trademark.description?.trim() || brandProfile?.summary || "");
      setBrandNames(
        brandProfile?.brand_names?.length ? brandProfile.brand_names : [data.trademark.name],
      );
      setKeywords(
        data.trademark.keywords.length > 0
          ? data.trademark.keywords
          : brandProfile?.monitoring_keywords?.length
            ? brandProfile.monitoring_keywords
            : [data.trademark.name],
      );
      void importWebsiteReferenceIfAvailable(data.trademark, data.images).catch(() => undefined);
      return data.trademark;
    } catch {
      return null;
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setTransition({ title: "Creating your brand workspace", detail: "Preparing a private place for your references." });
    const [created] = await Promise.all([createIp(name), delay(TRANSITION_DELAY_MS)]);
    setTransition(null);
    if (created) setCurrentStep(2);
  }

  async function handleConfirmBrand() {
    if (!brandProfile) return;
    setTransition({
      title: `Preparing ${brandProfile.name}`,
      detail: "Creating your workspace and collecting the official brand reference.",
    });
    const [created] = await Promise.all([
      createIp(brandProfile.name, { reuseExistingOnConflict: true }),
      delay(TRANSITION_DELAY_MS),
    ]);
    setTransition(null);
    if (created) setCurrentStep(2);
  }

  async function handleUpload(files: File[]) {
    if (!trademark) return;
    setUploading(true);
    setError("");
    try {
      const { job_id } = await uploadTrademarkImages(trademark.id, files);
      setIndexJobId(job_id);
      await refreshTrademark();
      setWebsiteReferenceImportError("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteImage(imageId: string) {
    if (!trademark) return;
    try {
      await deleteTrademarkImage(trademark.id, imageId);
      await refreshTrademark();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  function addKeyword() {
    const next = mergeKeywords(keywords, keywordDraft);
    setKeywords(next);
    setKeywordDraft("");
  }

  function handleKeywordDraftChange(value: string) {
    const next = consumeCommittedKeywords(keywords, value);
    setKeywords(next.keywords);
    setKeywordDraft(next.draft);
  }

  function removeKeyword(index: number) {
    setKeywords(keywords.filter((_, itemIndex) => itemIndex !== index));
  }

  function addBrandName() {
    const candidate = brandNameDraft.replace(/\s+/g, " ").trim();
    if (!candidate) return;
    if (brandNames.some((brandName) => brandName.toLocaleLowerCase() === candidate.toLocaleLowerCase())) {
      setBrandNameDraft("");
      return;
    }
    const next = [...brandNames, candidate].slice(0, 5);
    setBrandNames(next);
    setBrandNameDraft("");
    if (productTerms.length > 0) setKeywords(buildMonitoringKeywords(next, productTerms));
  }

  function removeBrandName(index: number) {
    if (index === 0) return;
    const next = brandNames.filter((_, itemIndex) => itemIndex !== index);
    setBrandNames(next);
    if (productTerms.length > 0) setKeywords(buildMonitoringKeywords(next, productTerms));
  }

  async function handleDetailsContinue() {
    if (!trademark) return;
    setFinishing(true);
    setError("");
    setTransition({ title: "Preparing your monitoring setup", detail: "Turning your brand details into focused searches." });
    try {
      const [{ trademark: updated }] = await Promise.all([
        updateTrademark(trademark.id, { description: description.trim(), keywords }),
        delay(TRANSITION_DELAY_MS),
      ]);
      setTrademark(updated);
      setCurrentStep(4);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setTransition(null);
      setFinishing(false);
    }
  }

  async function handleAssetsContinue() {
    if (images.length === 0) return;
    setTransition({
      title: "Learning your visual identity",
      detail: "Your references are saved. Visual processing will continue quietly in the background.",
    });
    await delay(TRANSITION_DELAY_MS);
    setTransition(null);
    setCurrentStep(3);
  }

  async function handleStartMonitoring() {
    if (!trademark || platforms.length === 0 || startingMonitoring) return;
    setStartingMonitoring(true);
    setMonitoringCompleted(0);
    setError("");
    setTransition({
      title: "Starting your first brand check",
      detail: "Connecting your selected websites and queuing the first searches.",
      kind: "monitoring",
    });

    const [{ started, failures }] = await Promise.all([
      startMonitoringSources(
        platforms,
        (source) => addIpMonitoringPlatform(trademark.id, source, pickedCountry || null),
        (completed) => setMonitoringCompleted(completed),
      ),
      delay(TRANSITION_DELAY_MS),
    ]);

    if (failures.length === 0) {
      navigate(`/monitoring/first-scan?ip_id=${encodeURIComponent(trademark.id)}`, { replace: true });
      return;
    }

    setPlatforms(failures.map((failure) => failure.source));
    setError(
      `${started.length > 0 ? `Monitoring started on ${started.length} website${started.length === 1 ? "" : "s"}. ` : ""}` +
      `Could not start ${failures.map((failure) => `${failure.source}: ${failure.error}`).join("; ")}`,
    );
    setStartingMonitoring(false);
    setMonitoringCompleted(0);
    setTransition(null);
  }

  async function handleCancel() {
    if (!trademark || !createdInThisFlow) {
      navigate("/ips");
      return;
    }
    if (!window.confirm("Cancel and delete the in-progress IP?")) return;
    try {
      await deleteTrademark(trademark.id);
    } catch {
      // The IP may already have been removed in another tab.
    }
    navigate("/ips");
  }

  return {
    trademark,
    images,
    uploading,
    importingWebsiteReference,
    websiteReferenceImportError,
    name,
    setName,
    submittingName,
    description,
    setDescription,
    brandNames,
    brandNameDraft,
    setBrandNameDraft,
    canEditBrandNames: productTerms.length > 0,
    brandProfile,
    brandProfileLoading,
    brandLogoFailed,
    setBrandLogoFailed,
    currentStep,
    setCurrentStep,
    transition,
    keywords,
    keywordDraft,
    finishing,
    platforms,
    setPlatforms,
    pickedCountry,
    setPickedCountry,
    startingMonitoring,
    monitoringCompleted,
    error,
    onboardingDomain,
    handleCreate,
    handleConfirmBrand,
    handleRejectBrand,
    handleUpload,
    handleRetryWebsiteReference,
    handleDeleteImage,
    addKeyword,
    handleKeywordDraftChange,
    removeKeyword,
    addBrandName,
    removeBrandName,
    handleDetailsContinue,
    handleAssetsContinue,
    handleStartMonitoring,
    handleCancel,
  };
}

function publicSlugForName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 96)
    .replace(/-+$/g, "") || "ip";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
