import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
} from "../api";
import { useJobPoller } from "../hooks/useJobPoller";
import ImageUploader from "../components/ImageUploader";
import { PlatformSelector } from "../components/monitoring/PlatformSelector";
import { useAuth } from "../context/AuthContext";
import { COUNTRIES, countryLabel } from "../lib/countries";
import { consumeCommittedKeywords, mergeKeywords } from "../lib/keywords";
import { suggestOnboardingIp } from "../lib/onboarding";
import { startMonitoringSources } from "../lib/startMonitoringSources";

type OnboardingStep = 1 | 2 | 3 | 4 | "complete";

interface TransitionState {
  title: string;
  detail: string;
  kind?: "monitoring";
}

const STEP_LABELS = ["Your brand", "References", "Search terms", "Websites"];
const TRANSITION_DELAY_MS = 900;

/**
 * Focused four-step onboarding at /ips/new. Only one task is visible at a
 * time. Asset indexing continues in the background and is never a navigation
 * gate; the user only needs a successfully uploaded reference.
 */
export default function RegistryWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const onboardingSuggestion = searchParams.get("onboarding") === "1"
    ? suggestOnboardingIp(user?.email)
    : null;
  const onboardingDomain = onboardingSuggestion?.domain ?? null;
  const [trademark, setTrademark] = useState<Trademark | null>(null);
  const [createdInThisFlow, setCreatedInThisFlow] = useState(false);
  const [images, setImages] = useState<TrademarkImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importingWebsiteReference, setImportingWebsiteReference] = useState(false);
  const [indexJobId, setIndexJobId] = useState<string | null>(null);

  const [name, setName] = useState(() => onboardingSuggestion?.name ?? "");
  const [submittingName, setSubmittingName] = useState(false);

  const [description, setDescription] = useState("");
  const [brandProfile, setBrandProfile] = useState<OnboardingBrandProfile | null>(null);
  const [brandProfileLoading, setBrandProfileLoading] = useState(Boolean(onboardingDomain));
  const [brandLogoFailed, setBrandLogoFailed] = useState(false);
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [transition, setTransition] = useState<TransitionState | null>(null);

  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [pickedCountry, setPickedCountry] = useState("");
  const [startingMonitoring, setStartingMonitoring] = useState(false);
  const [monitoringCompleted, setMonitoringCompleted] = useState(0);
  const [monitoringSourcesStarted, setMonitoringSourcesStarted] = useState(0);
  const [monitoringChecksQueued, setMonitoringChecksQueued] = useState(0);

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
        setName((current) =>
          current === onboardingSuggestion?.name
            ? profile.name
            : current,
        );
      })
      .finally(() => {
        if (active) setBrandProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onboardingDomain, onboardingSuggestion?.name]);

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

  async function importWebsiteReferenceIfAvailable(
    tm: Trademark,
    currentImages: TrademarkImage[],
  ): Promise<void> {
    if (
      currentImages.length > 0 ||
      !onboardingSuggestion ||
      !brandProfile?.reference_image_url
    ) {
      return;
    }

    setImportingWebsiteReference(true);
    try {
      const imported = await importOnboardingWebsiteReference(tm.id);
      if (imported.job_id) setIndexJobId(imported.job_id);
      if (imported.imported) {
        const data = await getTrademark(tm.id);
        setTrademark(data.trademark);
        setImages(data.images);
      }
    } finally {
      setImportingWebsiteReference(false);
    }
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
      const { trademark: tm } = await createTrademark(normalizedName);
      setName(normalizedName);
      setTrademark(tm);
      setCreatedInThisFlow(true);
      setImages([]);
      if (brandProfile) {
        setDescription(brandProfile.summary);
        setKeywords(
          brandProfile.monitoring_keywords?.length
            ? brandProfile.monitoring_keywords
            : [normalizedName],
        );
      } else if (onboardingSuggestion && keywords.length === 0) {
        setKeywords([normalizedName]);
      }
      void importWebsiteReferenceIfAvailable(tm, []).catch(() => {
        // The suggested reference is helpful, but never blocks onboarding.
      });
      return true;
    } catch (e) {
      if (options.reuseExistingOnConflict && isApiError(e, 409)) {
        try {
          const expectedSlug = publicSlugForName(normalizedName);
          const { trademarks } = await listTrademarks();
          const existing = trademarks.find(
            (candidate) => candidate.public_slug === expectedSlug,
          );
          if (existing) {
            const data = await getTrademark(existing.id);
            setName(data.trademark.name);
            setTrademark(data.trademark);
            setCreatedInThisFlow(false);
            setImages(data.images);
            setDescription(
              data.trademark.description?.trim() || brandProfile?.summary || "",
            );
            setKeywords(
              data.trademark.keywords.length > 0
                ? data.trademark.keywords
                : brandProfile?.monitoring_keywords?.length
                  ? brandProfile.monitoring_keywords
                  : [data.trademark.name],
            );
            void importWebsiteReferenceIfAvailable(data.trademark, data.images).catch(() => {
              // The user can upload another reference while this runs.
            });
            return true;
          }
        } catch {
          // Preserve the original conflict when the existing IP cannot be loaded.
        }
      }
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setSubmittingName(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setTransition({
      title: "Creating your brand workspace",
      detail: "Preparing a private place for your references.",
    });
    const [created] = await Promise.all([
      createIp(name),
      delay(TRANSITION_DELAY_MS),
    ]);
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
    const next = mergeKeywords(keywords, keywordDraft);
    if (next.length === keywords.length) {
      setKeywordDraft("");
      return;
    }
    setKeywords(next);
    setKeywordDraft("");
  }

  function handleKeywordDraftChange(value: string) {
    const next = consumeCommittedKeywords(keywords, value);
    setKeywords(next.keywords);
    setKeywordDraft(next.draft);
  }

  function removeKeyword(idx: number) {
    setKeywords(keywords.filter((_, i) => i !== idx));
  }

  async function handleDetailsContinue() {
    if (!trademark) return;
    setFinishing(true);
    setError("");
    setTransition({
      title: "Preparing your monitoring setup",
      detail: "Turning your brand details into focused searches.",
    });
    try {
      const [{ trademark: updated }] = await Promise.all([
        updateTrademark(trademark.id, {
          description: description.trim(),
          keywords,
        }),
        delay(TRANSITION_DELAY_MS),
      ]);
      setTrademark(updated);
      setCurrentStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

    const [{ started, failures, checksQueued }] = await Promise.all([
      startMonitoringSources(
        platforms,
        (source) => addIpMonitoringPlatform(trademark.id, source, pickedCountry || null),
        (completed) => setMonitoringCompleted(completed),
      ),
      delay(TRANSITION_DELAY_MS),
    ]);

    setMonitoringSourcesStarted((current) => current + started.length);
    setMonitoringChecksQueued((current) => current + checksQueued);

    if (failures.length === 0) {
      setTransition(null);
      setStartingMonitoring(false);
      navigate(`/monitoring/first-scan?ip_id=${encodeURIComponent(trademark.id)}`, { replace: true });
      return;
    }

    const failedSources = failures.map((failure) => failure.source);
    const startedCount = started.length;
    setPlatforms(failedSources);
    setError(
      `${startedCount > 0 ? `Monitoring started on ${startedCount} website${startedCount === 1 ? "" : "s"}. ` : ""}` +
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
    if (!confirm("Cancel and delete the in-progress IP?")) return;
    try {
      await deleteTrademark(trademark.id);
    } catch {
      // ignore — user may have deleted manually
    }
    navigate("/ips");
  }

  const activeStep = currentStep === "complete" ? 4 : currentStep;

  return (
    <div className="mx-auto min-h-[calc(100vh-5rem)] max-w-4xl px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/ips" className="text-xs text-stone-400 hover:text-stone-600">
            ← Intellectual Properties
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">
            Set up brand monitoring
          </h1>
        </div>
        <button
          onClick={handleCancel}
          className="text-sm text-stone-500 hover:text-red-600"
        >
          Cancel
        </button>
      </div>

      <OnboardingProgress current={activeStep} complete={currentStep === "complete"} />

      {error && (
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="mt-6">
        {transition ? (
          <ProcessingStep
            title={transition.title}
            detail={transition.detail}
            progress={
              transition.kind === "monitoring" && platforms.length > 0
                ? `${monitoringCompleted} of ${platforms.length} websites connected`
                : undefined
            }
          />
        ) : currentStep === 1 && brandProfileLoading ? (
          <ProcessingStep
            title="Getting to know your brand"
            detail={`Checking ${onboardingDomain} for its official identity and product range.`}
          />
        ) : currentStep === 1 ? (
          <StepPanel
            step={1}
            title={brandProfile ? "Is this your brand?" : "What should we protect?"}
            description={brandProfile
              ? "We used your work email to find a likely match."
              : "Start with your main brand, logo, character, or product design."}
          >
            {brandProfile ? (
          <BrandConfirmationCard
            profile={brandProfile}
            logoFailed={brandLogoFailed}
            confirming={submittingName}
            onLogoError={() => setBrandLogoFailed(true)}
            onConfirm={() => void handleConfirmBrand()}
            onReject={() => {
              setBrandProfile(null);
              setName("");
            }}
          />
            ) : (
            <form onSubmit={handleCreate} className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-stone-700">Brand or IP name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Brand, product line, or registered design"
                  className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
                autoFocus
              />
              </label>
              <div className="flex justify-end">
              <button
                type="submit"
                  disabled={submittingName || !name.trim()}
                  className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
              >
                  Continue
              </button>
              </div>
            </form>
            )}
          </StepPanel>
        ) : currentStep === 2 ? (
          <StepPanel
            step={2}
            title="Add visual references"
            description="Add the logos, packaging, or product images that make your brand recognisable."
          >
            <div className="space-y-4">
              {importingWebsiteReference && (
                <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
                  We’re adding the official brand image in the background. You can upload more now.
                </div>
              )}
              <ImageUploader onUpload={handleUpload} uploading={uploading} compact />
              <ImageGrid images={images} onDelete={handleDeleteImage} />
              <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-stone-500">
                  {images.length === 0
                    ? "Add at least one reference to continue."
                    : `${images.length} reference${images.length === 1 ? "" : "s"} added. We’ll prepare ${images.length === 1 ? "it" : "them"} in the background.`}
                </p>
                <button
                  type="button"
                  onClick={() => void handleAssetsContinue()}
                  disabled={images.length === 0 || uploading}
                  className="shrink-0 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </div>
          </StepPanel>
        ) : currentStep === 3 ? (
          <StepPanel
            step={3}
            title="Review what we’ll look for"
            description="We’ve drafted focused searches from your brand. Adjust anything that doesn’t feel right."
          >
            <div className="space-y-4">
            <div>
                <label className="mb-2 block text-sm font-semibold text-stone-700">
                  Brand description <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <textarea
                value={description}
                  onChange={(e) => setDescription(e.target.value)}
                rows={2}
                  placeholder="What makes this brand distinctive?"
                  className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
              />
            </div>
            <div>
                <label className="mb-1 block text-sm font-semibold text-stone-700">
                  Searches to run
              </label>
                <p className="mb-3 text-xs leading-5 text-stone-500">
                  Specific brand-and-product combinations work best. You can change these later.
              </p>
                <div className="mb-3 flex flex-wrap gap-2">
                {keywords.length === 0 && (
                  <span className="text-xs text-stone-400">No keywords yet.</span>
                )}
                {keywords.map((k, idx) => (
                  <span
                    key={`${idx}-${k}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-800"
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
                  onChange={(e) => handleKeywordDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyword();
                    }
                  }}
                  placeholder="PUMA running shoes, Mandarina Duck luggage"
                    className="min-w-0 flex-1 rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
                />
                <button
                  onClick={addKeyword}
                  disabled={!keywordDraft.trim()}
                    className="rounded-xl bg-stone-100 px-4 py-3 text-xs font-semibold text-stone-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
              <div className="flex items-center justify-between border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-lg px-2 py-2 text-sm font-semibold text-stone-500 hover:text-stone-800"
                >
                  Back
                </button>
            <button
                  type="button"
                  onClick={() => void handleDetailsContinue()}
              disabled={finishing || keywords.length === 0}
                  className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
                  Choose websites
            </button>
          </div>
            </div>
          </StepPanel>
        ) : currentStep === 4 ? (
          <StepPanel
            step={4}
            title="Where should we look?"
            description={`Choose the websites where ${trademark?.name ?? "your brand"} is most likely to appear.`}
          >
            <div className="space-y-5">
            <PlatformSelector
              value={platforms}
              onChange={setPlatforms}
              disabled={startingMonitoring}
            />

            <div className="space-y-1">
                <label htmlFor="onboarding-monitor-country" className="block text-sm font-semibold text-stone-700">
                Target country <span className="font-normal text-stone-400">(optional)</span>
              </label>
              <select
                id="onboarding-monitor-country"
                value={pickedCountry}
                onChange={(event) => setPickedCountry(event.target.value)}
                disabled={startingMonitoring}
                  className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 disabled:opacity-50"
              >
                <option value="">Anywhere</option>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {countryLabel(country.code)}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-stone-400">
                Uses the selected country’s marketplace view when supported.
              </p>
            </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="rounded-lg px-2 py-2 text-sm font-semibold text-stone-500 hover:text-stone-800"
                >
                  Back
                </button>
              <button
                type="button"
                onClick={() => void handleStartMonitoring()}
                disabled={platforms.length === 0 || startingMonitoring}
                  className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
              >
                  Start monitoring
              </button>
            </div>
          </div>
          </StepPanel>
        ) : (
          <CompletionStep
            brandName={trademark?.name ?? "Your brand"}
            searches={monitoringChecksQueued}
            websites={monitoringSourcesStarted}
            onViewMonitoring={() => navigate(`/monitoring/first-scan?ip_id=${encodeURIComponent(trademark!.id)}`)}
            onDashboard={() => navigate("/dashboard")}
          />
        )}
      </div>
    </div>
  );
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

function BrandConfirmationCard({
  profile,
  logoFailed,
  confirming,
  onLogoError,
  onConfirm,
  onReject,
}: {
  profile: OnboardingBrandProfile;
  logoFailed: boolean;
  confirming: boolean;
  onLogoError: () => void;
  onConfirm: () => void;
  onReject: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        <div className="flex h-24 w-full shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 p-3 sm:w-40">
          {profile.logo_url && !logoFailed ? (
            <img
              src={profile.logo_url}
              alt={`${profile.name} logo`}
              className="max-h-full max-w-full object-contain"
              loading="eager"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={onLogoError}
            />
          ) : (
            <span className="text-2xl font-black text-stone-400">
              {profile.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Brand match
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-stone-900">
            We found {profile.name}
          </h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">{profile.summary}</p>
          {profile.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.categories.map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600"
                >
                  {category}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-stone-700">
            {profile.has_online_store ? "Official online store detected" : "Official domain detected"}
          </p>
          <p className="text-[11px] text-stone-400">{profile.domain}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReject}
            disabled={confirming}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700"
          >
            Not my brand
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60"
          >
            {confirming ? "Creating your IP…" : "Yes, this is my brand"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingProgress({ current, complete }: { current: number; complete: boolean }) {
  return (
    <ol aria-label="Onboarding progress" className="mt-6 grid grid-cols-4 gap-2">
      {STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const done = complete || step < current;
        const active = !complete && step === current;
        return (
          <li key={label} aria-current={active ? "step" : undefined}>
            <div className={`h-1 rounded-full ${done ? "bg-emerald-500" : active ? "bg-stone-900" : "bg-stone-200"}`} />
            <div className={`mt-2 text-[11px] font-semibold ${active ? "text-stone-900" : done ? "text-emerald-700" : "text-stone-400"}`}>
              <span className="sm:hidden">{step}</span>
              <span className="hidden sm:inline">{done ? "✓ " : `${step}. `}{label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepPanel({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-6 py-5 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-stone-400">Step {step} of 4</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-900">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500">{description}</p>
      </div>
      <div className="px-6 py-5 sm:px-8 sm:py-6">{children}</div>
    </section>
  );
}

function ProcessingStep({
  title,
  detail,
  progress,
}: {
  title: string;
  detail: string;
  progress?: string;
}) {
  return (
    <section className="flex min-h-[390px] flex-col items-center justify-center rounded-3xl border border-stone-200 bg-white px-6 text-center shadow-sm">
      <div className="relative flex h-16 w-16 items-center justify-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-stone-100 border-t-stone-800" />
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-stone-900" />
      </div>
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Unvelar is working</p>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-stone-900">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-stone-500">{detail}</p>
      {progress && <p className="mt-5 rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600">{progress}</p>}
    </section>
  );
}

function CompletionStep({
  brandName,
  searches,
  websites,
  onViewMonitoring,
  onDashboard,
}: {
  brandName: string;
  searches: number;
  websites: number;
  onViewMonitoring: () => void;
  onDashboard: () => void;
}) {
  return (
    <section className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-emerald-200 bg-white px-6 text-center shadow-sm">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-black text-emerald-700">✓</div>
      <p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Monitoring is active</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-stone-900">We’re watching {brandName}</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-stone-500">
        Your first {searches === 1 ? "search is" : `${searches} searches are`} running across {websites} website{websites === 1 ? "" : "s"}. We’ll keep checking automatically.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onViewMonitoring} className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800">
          View monitoring
        </button>
        <button type="button" onClick={onDashboard} className="rounded-xl border border-stone-200 bg-white px-5 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">
          Go to dashboard
        </button>
      </div>
    </section>
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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
    <div className="flex flex-wrap gap-3">
      {images.map((img) => (
        <div key={img.id} className="group relative h-24 w-24">
          <img
            src={img.url}
            alt=""
            className="h-full w-full rounded-xl border border-stone-200 bg-stone-50 p-2 object-contain"
          />
          <button
            onClick={() => onDelete(img.id)}
            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-stone-500 hover:text-red-600 hover:bg-white border border-stone-200 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove image"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
