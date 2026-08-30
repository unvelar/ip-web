import type { ReactNode } from "react";
import type { OnboardingBrandProfile, TrademarkImage } from "../../api";

const STEP_LABELS = ["Your brand", "References", "Search terms", "Websites"];

export function OnboardingProgress({ current }: { current: number }) {
  return (
    <ol aria-label="Onboarding progress" className="mt-6 grid grid-cols-4 gap-2">
      {STEP_LABELS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
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

export function StepPanel({
  step,
  title,
  description,
  children,
}: {
  step: number;
  title: string;
  description: string;
  children: ReactNode;
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

export function ProcessingStep({
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

export function BrandConfirmationCard({
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
            <span className="text-2xl font-black text-stone-400">{profile.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Brand match
          </div>
          <h3 className="mt-1 text-lg font-black tracking-tight text-stone-900">We found {profile.name}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600">{profile.summary}</p>
          {profile.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.categories.map((category) => (
                <span key={category} className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600">{category}</span>
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
          <button type="button" onClick={onReject} disabled={confirming} className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-100 hover:text-stone-700">Not my brand</button>
          <button type="button" onClick={onConfirm} disabled={confirming} className="rounded-lg bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:cursor-wait disabled:opacity-60">
            {confirming ? "Creating your IP…" : "Yes, this is my brand"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImageGrid({ images, onDelete }: { images: TrademarkImage[]; onDelete: (id: string) => void }) {
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {images.map((image) => (
        <div key={image.id} className="group relative h-24 w-24">
          <img src={image.url} alt="" className="h-full w-full rounded-xl border border-stone-200 bg-stone-50 p-2 object-contain" />
          <button
            type="button"
            onClick={() => onDelete(image.id)}
            className="absolute right-1 top-1 h-6 w-6 rounded-full border border-stone-200 bg-white/90 text-xs font-bold text-stone-500 opacity-0 transition-opacity hover:bg-white hover:text-red-600 group-hover:opacity-100"
            title="Remove image"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
