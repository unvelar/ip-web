import { CheckCircle2, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ProductSemanticCategory, ProductSemanticColor } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";
import type { SemanticCorrectionTarget } from "./clusterDomain";
import { NEW_PRODUCT_TYPE_VALUE, productTypeLabelFromKey } from "./clusterDomain";

export function SemanticCorrectionDialog({
  target,
  categories,
  colors,
  saving,
  onClose,
  onSave,
  onReset,
}: {
  target: SemanticCorrectionTarget;
  categories: ProductSemanticCategory[];
  colors: ProductSemanticColor[];
  saving: boolean;
  onClose: () => void;
  onSave: (values: {
    correctedCategoryKey: string | null;
    newProductType: {
      label: string;
      supportsColorVariants: boolean;
    } | null;
    correctedVariantColors: string[];
    note: string;
    propagateToSimilar: boolean;
  }) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  const currentCategoryKey = target.group.semantic_definition?.category_key ?? "";
  const sourceCategoryKey = target.profile.semantic_source_category_key ?? currentCategoryKey;
  const groupVariantColor = target.group.semantic_definition?.variant_color;
  const currentVariantColors = [...new Set(
    (target.profile.semantic_variant_colors ?? (
      groupVariantColor
        ? [{ color: groupVariantColor, confidence: 1, evidence_image_positions: [] }]
        : []
    ))
      .map(({ color }) => color.trim().toLowerCase())
      .filter(Boolean),
  )].sort();
  const [correctedCategoryKey, setCorrectedCategoryKey] = useState(currentCategoryKey);
  const [newProductTypeLabel, setNewProductTypeLabel] = useState("");
  const [newTypeSupportsColorVariants, setNewTypeSupportsColorVariants] = useState(false);
  const [correctedVariantColors, setCorrectedVariantColors] = useState<string[]>(
    currentVariantColors,
  );
  const [note, setNote] = useState("");
  const [propagateToSimilar, setPropagateToSimilar] = useState(true);
  const currentCategory = categories.find(
    (category) => category.key === currentCategoryKey,
  ) ?? {
    key: currentCategoryKey,
    label: target.profile.semantic_source_category_key === currentCategoryKey
      ? target.profile.semantic_source_category_label ?? productTypeLabelFromKey(currentCategoryKey)
      : productTypeLabelFromKey(currentCategoryKey),
    supports_color_variants: currentVariantColors.length > 0,
  };
  const availableCategories = categories.some(
    (category) => category.key === currentCategoryKey,
  ) ? categories : [currentCategory, ...categories];
  const creatingProductType = correctedCategoryKey === NEW_PRODUCT_TYPE_VALUE;
  const selectedCategory = availableCategories.find(
    (category) => category.key === correctedCategoryKey,
  ) ?? null;
  const supportsColorVariants = creatingProductType
    ? newTypeSupportsColorVariants
    : selectedCategory?.supports_color_variants === true;
  const effectiveCorrectedColors = supportsColorVariants
    ? correctedVariantColors
    : [];
  const normalizedNewProductTypeLabel = newProductTypeLabel.trim().replace(/\s+/g, " ");
  const classificationChanged = creatingProductType
    ? normalizedNewProductTypeLabel.length >= 2
    : correctedCategoryKey !== currentCategoryKey ||
      effectiveCorrectedColors.length !== currentVariantColors.length ||
      effectiveCorrectedColors.some((color, index) => color !== currentVariantColors[index]);
  const colorLabels = new Map(colors.map((color) => [color.key, color.label]));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || saving) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="semantic-correction-title"
        className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-violet-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-700">
              Reviewer correction
            </p>
            <h2 id="semantic-correction-title" className="mt-1 text-lg font-black text-stone-950">
              Correct classification
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-stone-700">
              {profileTitle(target.profile)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close classification correction"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-600">
          <p>
            Current group: <strong className="text-stone-900">{target.group.display_name}</strong>
          </p>
          <p className="mt-1">
            Current colors: <strong className="text-stone-900">{
              currentVariantColors.length > 0
                ? currentVariantColors.map((color) => colorLabels.get(color) ?? color).join(", ")
                : "No color subgroup"
            }</strong>
          </p>
          {target.profile.semantic_correction_id && (
            <p className="mt-1">
              Classifier result: <strong className="text-stone-900">{
                target.profile.semantic_source_category_label ?? sourceCategoryKey
              }</strong>
            </p>
          )}
        </div>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!correctedCategoryKey || !classificationChanged || saving) return;
            void Promise.resolve(onSave({
              correctedCategoryKey: creatingProductType ? null : correctedCategoryKey,
              newProductType: creatingProductType
                ? {
                  label: normalizedNewProductTypeLabel,
                  supportsColorVariants: newTypeSupportsColorVariants,
                }
                : null,
              correctedVariantColors: effectiveCorrectedColors,
              note,
              propagateToSimilar,
            })).catch(() => undefined);
          }}
        >
          <label className="block text-xs font-bold text-stone-800" htmlFor="corrected-product-type">
            Product type
          </label>
          <select
            id="corrected-product-type"
            value={correctedCategoryKey}
            disabled={saving}
            onChange={(event) => {
              const nextCategoryKey = event.target.value;
              setCorrectedCategoryKey(nextCategoryKey);
              const nextSupportsColorVariants = nextCategoryKey === NEW_PRODUCT_TYPE_VALUE
                ? newTypeSupportsColorVariants
                : availableCategories.find((category) => category.key === nextCategoryKey)
                  ?.supports_color_variants === true;
              if (!nextSupportsColorVariants) {
                setCorrectedVariantColors([]);
              }
            }}
            className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
          >
            {availableCategories.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
            <option value={NEW_PRODUCT_TYPE_VALUE}>Other — specify a new type…</option>
          </select>

          {creatingProductType && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <label
                className="block text-xs font-bold text-violet-950"
                htmlFor="new-product-type-label"
              >
                New product type
              </label>
              <input
                id="new-product-type-label"
                type="text"
                value={newProductTypeLabel}
                minLength={2}
                maxLength={120}
                required
                autoFocus
                disabled={saving}
                onChange={(event) => setNewProductTypeLabel(event.target.value)}
                placeholder="For example: Video game"
                className="mt-1.5 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-violet-800">
                This becomes an active product type for this IP and can be reused by future classifications.
              </p>
              <label className="mt-3 flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={newTypeSupportsColorVariants}
                  disabled={saving}
                  onChange={(event) => {
                    setNewTypeSupportsColorVariants(event.target.checked);
                    if (!event.target.checked) setCorrectedVariantColors([]);
                  }}
                  className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-700"
                />
                <span>
                  <span className="block text-xs font-bold text-violet-950">
                    Color is a useful variant for this type
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-violet-800">
                    Leave this off for media, fragrances, and products where packaging color is incidental.
                  </span>
                </span>
              </label>
            </div>
          )}

          <fieldset className="mt-4">
            <legend className="text-xs font-bold text-stone-800">Color groups</legend>
            {supportsColorVariants ? (
              <>
                <p className="mt-1 text-[11px] leading-relaxed text-stone-500">
                  Select every marketed color variant that should apply. Color groups may overlap.
                </p>
                <button
                  type="button"
                  aria-pressed={correctedVariantColors.length === 0}
                  disabled={saving}
                  onClick={() => setCorrectedVariantColors([])}
                  className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                    correctedVariantColors.length === 0
                      ? "border-violet-400 bg-violet-50 text-violet-950"
                      : "border-stone-200 bg-white text-stone-700 hover:border-violet-300"
                  }`}
                >
                  <span className="block text-xs font-bold">No color subgroup</span>
                  <span className="mt-0.5 block text-[11px]">
                    Keep this listing only in the generic product-type group.
                  </span>
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {colors.map((color) => {
                    const checked = correctedVariantColors.includes(color.key);
                    return (
                      <label
                        key={color.key}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
                          checked
                            ? "border-violet-400 bg-violet-50 text-violet-950"
                            : "border-stone-200 bg-white text-stone-700 hover:border-violet-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={saving}
                          onChange={(event) => {
                            setCorrectedVariantColors((current) => event.target.checked
                              ? [...new Set([...current, color.key])].sort()
                              : current.filter((key) => key !== color.key));
                          }}
                          className="h-3.5 w-3.5 rounded border-violet-300 text-violet-700"
                        />
                        {color.label}
                      </label>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="mt-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 text-[11px] text-stone-600">
                {creatingProductType
                  ? "This new product type will not create color subgroups."
                  : "This product type does not create color subgroups."}
              </p>
            )}
          </fieldset>

          <label className="mt-4 block text-xs font-bold text-stone-800" htmlFor="semantic-correction-note">
            Note <span className="font-normal text-stone-500">(optional)</span>
          </label>
          <textarea
            id="semantic-correction-note"
            value={note}
            maxLength={1000}
            rows={3}
            disabled={saving}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why is the current classification wrong?"
            className="mt-1.5 w-full resize-none rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
          />

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-3">
            <input
              type="checkbox"
              checked={propagateToSimilar}
              disabled={saving}
              onChange={(event) => setPropagateToSimilar(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-700"
            />
            <span>
              <span className="block text-xs font-bold text-violet-950">
                Reconsider visually similar listings
              </span>
              <span className="mt-0.5 block text-[11px] leading-relaxed text-violet-800">
                Strong visual matches are queued using this correction as a trusted example. Their types and colors are still decided from their own text and images.
              </span>
            </span>
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <div>
              {target.profile.semantic_correction_id && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void Promise.resolve(onReset()).catch(() => undefined)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                >
                  <RotateCcw size={13} />
                  Use classifier result
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || !correctedCategoryKey || !classificationChanged}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-40"
              >
                <CheckCircle2 size={14} />
                {saving ? "Updating…" : "Update classification"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
