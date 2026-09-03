import { Link } from "react-router-dom";
import ImageUploader from "../components/ImageUploader";
import { PlatformSelector } from "../components/monitoring/PlatformSelector";
import { COUNTRIES, countryLabel } from "../lib/countries";
import {
  BrandNameVariants,
  BrandConfirmationCard,
  ImageGrid,
  OnboardingProgress,
  ProcessingStep,
  StepPanel,
} from "../features/onboarding/OnboardingUi";
import { useRegistryWizard } from "../features/onboarding/useRegistryWizard";

/** Four focused tasks; the flow owns orchestration while reusable components own presentation. */
export default function RegistryWizard() {
  const flow = useRegistryWizard();

  return (
    <div className="mx-auto min-h-[calc(100vh-5rem)] max-w-4xl px-6 py-8 sm:py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/ips" className="text-xs text-stone-400 hover:text-stone-600">← Intellectual Properties</Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-stone-900">Set up brand monitoring</h1>
        </div>
        <button type="button" onClick={() => void flow.handleCancel()} className="text-sm text-stone-500 hover:text-red-600">Cancel</button>
      </div>

      <OnboardingProgress current={flow.currentStep} />

      {flow.error && (
        <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600">{flow.error}</div>
      )}

      <div className="mt-6">
        {flow.transition ? (
          <ProcessingStep
            title={flow.transition.title}
            detail={flow.transition.detail}
            progress={flow.transition.kind === "monitoring" && flow.platforms.length > 0
              ? `${flow.monitoringCompleted} of ${flow.platforms.length} websites connected`
              : undefined}
          />
        ) : flow.currentStep === 1 && flow.brandProfileLoading ? (
          <ProcessingStep title="Getting to know your brand" detail={`Checking ${flow.onboardingDomain} for its official identity and product range.`} />
        ) : flow.currentStep === 1 ? (
          <BrandStep flow={flow} />
        ) : flow.currentStep === 2 ? (
          <ReferencesStep flow={flow} />
        ) : flow.currentStep === 3 ? (
          <SearchTermsStep flow={flow} />
        ) : (
          <WebsitesStep flow={flow} />
        )}
      </div>
    </div>
  );
}

type OnboardingFlow = ReturnType<typeof useRegistryWizard>;

function BrandStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <StepPanel
      step={1}
      title={flow.brandProfile ? "Is this your brand?" : "What should we protect?"}
      description={flow.brandProfile
        ? "We used your work email to find a likely match."
        : "Start with your main brand, logo, character, or product design."}
    >
      {flow.brandProfile ? (
        <BrandConfirmationCard
          profile={flow.brandProfile}
          logoFailed={flow.brandLogoFailed}
          confirming={flow.submittingName}
          onLogoError={() => flow.setBrandLogoFailed(true)}
          onConfirm={() => void flow.handleConfirmBrand()}
          onReject={flow.handleRejectBrand}
        />
      ) : (
        <form onSubmit={flow.handleCreate} className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-stone-700">Brand or IP name</span>
            <input
              value={flow.name}
              onChange={(event) => flow.setName(event.target.value)}
              placeholder="Brand, product line, or registered design"
              className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
              autoFocus
            />
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={flow.submittingName || !flow.name.trim()} className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">Continue</button>
          </div>
        </form>
      )}
    </StepPanel>
  );
}

function ReferencesStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <StepPanel step={2} title="Add visual references" description="Add the logos, packaging, or product images that make your brand recognisable.">
      <div className="space-y-4">
        {flow.importingWebsiteReference && (
          <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-blue-500" />
            We’re adding the official brand image in the background. You can upload more now.
          </div>
        )}
        {flow.websiteReferenceImportError && flow.images.length === 0 && !flow.importingWebsiteReference && (
          <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{flow.websiteReferenceImportError} You can retry or upload another reference.</span>
            <button
              type="button"
              onClick={() => void flow.handleRetryWebsiteReference()}
              className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Try again
            </button>
          </div>
        )}
        <ImageUploader onUpload={flow.handleUpload} uploading={flow.uploading} compact />
        <ImageGrid images={flow.images} onDelete={(id) => void flow.handleDeleteImage(id)} />
        <div className="flex flex-col gap-3 border-t border-stone-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-500">
            {flow.images.length === 0
              ? "Add at least one reference to continue."
              : `${flow.images.length} reference${flow.images.length === 1 ? "" : "s"} added. We’ll prepare ${flow.images.length === 1 ? "it" : "them"} in the background.`}
          </p>
          <button type="button" onClick={() => void flow.handleAssetsContinue()} disabled={flow.images.length === 0 || flow.uploading} className="shrink-0 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">Continue</button>
        </div>
      </div>
    </StepPanel>
  );
}

function SearchTermsStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <StepPanel step={3} title="Review what we’ll look for" description="We’ve drafted focused searches from your brand. Adjust anything that doesn’t feel right.">
      <div className="space-y-4">
        <BrandNameVariants
          names={flow.brandNames}
          draft={flow.brandNameDraft}
          editable={flow.canEditBrandNames}
          onDraftChange={flow.setBrandNameDraft}
          onAdd={flow.addBrandName}
          onRemove={flow.removeBrandName}
        />
        <div>
          <label className="mb-2 block text-sm font-semibold text-stone-700">Brand description <span className="font-normal text-stone-400">(optional)</span></label>
          <textarea value={flow.description} onChange={(event) => flow.setDescription(event.target.value)} rows={2} placeholder="What makes this brand distinctive?" className="w-full rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-stone-700">Searches to run</label>
          <p className="mb-3 text-xs leading-5 text-stone-500">Specific brand-and-product combinations work best. You can change these later.</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {flow.keywords.length === 0 && <span className="text-xs text-stone-400">No keywords yet.</span>}
            {flow.keywords.map((keyword, index) => (
              <span key={`${index}-${keyword}`} className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-xs text-stone-800">
                {keyword}
                <button type="button" onClick={() => flow.removeKeyword(index)} className="font-bold text-stone-400 hover:text-red-600" title="Remove">×</button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={flow.keywordDraft}
              onChange={(event) => flow.handleKeywordDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  flow.addKeyword();
                }
              }}
              placeholder="PUMA running shoes, Mandarina Duck luggage"
              className="min-w-0 flex-1 rounded-xl border border-stone-200 px-4 py-3 text-sm outline-none transition focus:border-stone-400 focus:ring-4 focus:ring-stone-100"
            />
            <button type="button" onClick={flow.addKeyword} disabled={!flow.keywordDraft.trim()} className="rounded-xl bg-stone-100 px-4 py-3 text-xs font-semibold text-stone-700 disabled:opacity-50">Add</button>
          </div>
        </div>
        <StepActions onBack={() => flow.setCurrentStep(2)} onContinue={() => void flow.handleDetailsContinue()} continueLabel="Choose websites" disabled={flow.finishing || flow.keywords.length === 0} />
      </div>
    </StepPanel>
  );
}

function WebsitesStep({ flow }: { flow: OnboardingFlow }) {
  return (
    <StepPanel step={4} title="Where should we look?" description={`Choose the websites where ${flow.trademark?.name ?? "your brand"} is most likely to appear.`}>
      <div className="space-y-5">
        <PlatformSelector value={flow.platforms} onChange={flow.setPlatforms} disabled={flow.startingMonitoring} />
        <div className="space-y-1">
          <label htmlFor="onboarding-monitor-country" className="block text-sm font-semibold text-stone-700">Target country <span className="font-normal text-stone-400">(optional)</span></label>
          <select id="onboarding-monitor-country" value={flow.pickedCountry} onChange={(event) => flow.setPickedCountry(event.target.value)} disabled={flow.startingMonitoring} className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 disabled:opacity-50">
            <option value="">Anywhere</option>
            {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{countryLabel(country.code)}</option>)}
          </select>
          <p className="text-[11px] text-stone-400">Uses the selected country’s marketplace view when supported.</p>
        </div>
        <StepActions onBack={() => flow.setCurrentStep(3)} onContinue={() => void flow.handleStartMonitoring()} continueLabel="Start monitoring" disabled={flow.platforms.length === 0 || flow.startingMonitoring} />
      </div>
    </StepPanel>
  );
}

function StepActions({ onBack, onContinue, continueLabel, disabled }: { onBack: () => void; onContinue: () => void; continueLabel: string; disabled: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-stone-100 pt-4">
      <button type="button" onClick={onBack} className="rounded-lg px-2 py-2 text-sm font-semibold text-stone-500 hover:text-stone-800">Back</button>
      <button type="button" onClick={onContinue} disabled={disabled} className="rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-50">{continueLabel}</button>
    </div>
  );
}
