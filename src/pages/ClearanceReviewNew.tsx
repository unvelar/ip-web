import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createIpReview, type IpReviewContext } from "../api";
import ImageUploader from "../components/ImageUploader";

/**
 * Guided clearance review — the new legal-grade workflow entry point.
 *
 * Five steps modeled on RegistryWizard.tsx's WizardCard pattern. Captures
 * the context Andrés' feedback asked for: asset details, intended use,
 * territories, commercial categories, optional inspiration board.
 *
 * On submit the API creates an ip_review row + a clearance_review worker
 * job; we navigate to the detail page and poll there.
 */

const ASSET_TYPES: Array<{ value: string; label: string }> = [
  // Values map to worker/lib/region_type.py RegionType (the segmenter
  // routes rights via region type, so keep these in sync).
  { value: "character", label: "Character / mascot" },
  { value: "graphic-logo", label: "Logo or graphic mark" },
  { value: "wordmark", label: "Word mark / brand name" },
  { value: "product", label: "Product or accessory" },
  { value: "packaging", label: "Packaging" },
  { value: "mixed", label: "Mixed / other" },
];

const TERRITORIES: Array<{ code: string; label: string }> = [
  { code: "EU", label: "European Union" },
  { code: "US", label: "United States" },
  { code: "UK", label: "United Kingdom" },
  { code: "JP", label: "Japan" },
  { code: "CN", label: "China" },
  { code: "CA", label: "Canada" },
  { code: "AU", label: "Australia" },
  { code: "BR", label: "Brazil" },
  { code: "IN", label: "India" },
  { code: "KR", label: "South Korea" },
  { code: "MX", label: "Mexico" },
  { code: "GLOBAL", label: "Worldwide" },
];

const CATEGORIES = [
  "Games", "Film/TV", "Music", "Apparel", "Toys", "Print",
  "Software", "Beverages", "Food", "Cosmetics", "Sports", "Other",
];

const MAX_INSPIRATION = 12;

export default function ClearanceReviewNew() {
  const navigate = useNavigate();
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetPreview, setAssetPreview] = useState<string>("");

  const [assetType, setAssetType] = useState<string>("");
  const [intendedUse, setIntendedUse] = useState("");
  const [placement, setPlacement] = useState<"central" | "incidental" | "">("");

  const [territories, setTerritories] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [inspiration, setInspiration] = useState<File[]>([]);
  const [title, setTitle] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!assetFile) {
      setAssetPreview("");
      return;
    }
    const url = URL.createObjectURL(assetFile);
    setAssetPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [assetFile]);

  const step1Done = !!assetFile;
  const step2Done = step1Done && !!assetType;
  const step3Done = step2Done; // territories + categories optional, but card still unlocks step 4
  const step4Done = step3Done; // inspiration board optional
  const canSubmit = step1Done && step2Done && !!title.trim() && !submitting;

  function toggle(arr: string[], v: string): string[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function handleInspirationUpload(files: File[]) {
    setInspiration((prev) => [...prev, ...files].slice(0, MAX_INSPIRATION));
  }

  const territoryLabel = useMemo(() => {
    if (territories.length === 0) return "All jurisdictions";
    return territories.join(", ");
  }, [territories]);

  async function handleSubmit() {
    if (!assetFile || !title.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const ctx: IpReviewContext = {
        title: title.trim(),
        mode: "clearance",
        asset_type: assetType || undefined,
        intended_use: intendedUse.trim() || undefined,
        asset_placement: placement || undefined,
        territories: territories.length > 0 ? territories : undefined,
        product_categories: categories.length > 0 ? categories : undefined,
      };
      const { id } = await createIpReview(assetFile, ctx, inspiration);
      navigate(`/ip-reviews/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">New clearance review</h1>
        <p className="text-xs text-stone-400 mt-0.5">
          Guided IP review for assets you're creating. Output is a legal-grade
          report split by copyright, trademark, design right, and publicity risk.
        </p>
      </div>

      {/* --- Step 1 --- */}
      <WizardCard step={1} title="What are you reviewing?" done={step1Done} active={!step1Done}>
        {assetPreview ? (
          <div className="flex items-start gap-4">
            <img
              src={assetPreview}
              alt=""
              className="w-32 h-32 rounded-xl object-cover border border-stone-200"
            />
            <div className="flex-1 space-y-1.5">
              <div className="text-sm font-medium text-stone-700">
                {assetFile?.name}
              </div>
              <button
                onClick={() => setAssetFile(null)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Replace
              </button>
            </div>
          </div>
        ) : (
          <ImageUploader
            multiple={false}
            label="Drop the asset under review"
            onUpload={(files) => setAssetFile(files[0] ?? null)}
          />
        )}
      </WizardCard>

      {/* --- Step 2 --- */}
      <WizardCard
        step={2}
        title="Asset details"
        done={step2Done}
        active={step1Done && !step2Done}
        disabled={!step1Done}
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">
              What kind of asset?
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ASSET_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setAssetType(t.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    assetType === t.value
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">
              Is this asset central to the work or incidental / background?{" "}
              <span className="font-normal text-stone-400">(optional)</span>
            </div>
            <div className="flex gap-1.5">
              {(["central", "incidental"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPlacement(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    placement === p
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {p === "central" ? "Central" : "Incidental / background"}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={intendedUse}
            onChange={(e) => setIntendedUse(e.target.value)}
            rows={2}
            placeholder="Where will it be used? Film, game, ad, merchandise, social, packaging…"
            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
          />
        </div>
      </WizardCard>

      {/* --- Step 3 --- */}
      <WizardCard
        step={3}
        title="Where & what (territories and categories)"
        done={step3Done}
        active={step2Done && !step3Done}
        disabled={!step2Done}
      >
        <div className="space-y-3">
          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">
              Which territories matter? (Leave empty for all)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TERRITORIES.map((t) => (
                <button
                  key={t.code}
                  onClick={() => setTerritories((arr) => toggle(arr, t.code))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    territories.includes(t.code)
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {t.code}
                </button>
              ))}
            </div>
            <div className="text-[11px] text-stone-400 mt-1.5">
              Scope: {territoryLabel}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-stone-700 mb-1.5">
              Product / service category
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategories((arr) => toggle(arr, c))}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    categories.includes(c)
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </WizardCard>

      {/* --- Step 4 --- */}
      <WizardCard
        step={4}
        title="Inspiration board (optional)"
        done={step4Done}
        active={step3Done && !step4Done}
        disabled={!step3Done}
      >
        <div className="space-y-3">
          <p className="text-xs text-stone-500">
            Was this asset inspired by anything? Drop the references here so
            the review can call out similarity to specific influences.
          </p>
          {inspiration.length < MAX_INSPIRATION && (
            <ImageUploader
              label={`Drop up to ${MAX_INSPIRATION - inspiration.length} more reference images`}
              onUpload={handleInspirationUpload}
            />
          )}
          {inspiration.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {inspiration.map((f, i) => (
                <div key={i} className="relative group">
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-full aspect-square object-cover rounded-lg border border-stone-200"
                  />
                  <button
                    onClick={() =>
                      setInspiration((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 text-stone-500 hover:text-red-600 border border-stone-200 text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </WizardCard>

      {/* --- Step 5 --- */}
      <WizardCard
        step={5}
        title="Name this review"
        done={false}
        active={step4Done}
        disabled={!step4Done}
      >
        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "Box art for project Atlas — v1"'
            className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm"
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-4 py-2 rounded-lg bg-stone-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Run review"}
          </button>
        </div>
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
