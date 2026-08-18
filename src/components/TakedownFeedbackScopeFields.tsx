import type { TakedownFeedbackAssociationScope } from "../api";

export function TakedownFeedbackScopeFields({
  idPrefix,
  scopes,
  onChange,
  disabled = false,
}: {
  idPrefix: string;
  scopes: TakedownFeedbackAssociationScope[];
  onChange: (scopes: TakedownFeedbackAssociationScope[]) => void;
  disabled?: boolean;
}) {
  function toggle(scope: TakedownFeedbackAssociationScope, checked: boolean) {
    const next = checked
      ? Array.from(new Set([...scopes, scope]))
      : scopes.filter((candidate) => candidate !== scope);
    onChange(next);
  }

  return (
    <fieldset className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
      <legend className="px-1 text-xs font-semibold text-stone-800">
        Use this note for future recommendations
      </legend>
      <div className="mt-0.5 space-y-2.5">
        <label className="flex items-start gap-2.5">
          <input
            id={`${idPrefix}-visual-similarity`}
            type="checkbox"
            checked={scopes.includes("visual_similarity")}
            onChange={(event) => toggle("visual_similarity", event.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span>
            <span className="block text-xs font-semibold text-stone-800">
              Similar-looking listings
            </span>
            <span className="block text-[11px] leading-4 text-stone-500">
              Adds visual resemblance as supporting context. It never triggers a takedown by itself.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5">
          <input
            id={`${idPrefix}-product-category`}
            type="checkbox"
            checked={scopes.includes("product_category")}
            onChange={(event) => toggle("product_category", event.target.checked)}
            disabled={disabled}
            className="mt-0.5 h-4 w-4 rounded border-stone-300"
          />
          <span>
            <span className="block text-xs font-semibold text-stone-800">
              Same product category <span className="font-normal text-stone-500">(broader)</span>
            </span>
            <span className="block text-[11px] leading-4 text-stone-500">
              Reuses the policy for the same classified category. The new listing must still show the issue; identity, licensing, and resale are checked.
            </span>
          </span>
        </label>
      </div>
      {scopes.length === 0 && (
        <p className="mt-2 text-[11px] text-red-600">
          Select at least one future-use scope.
        </p>
      )}
      <p className="mt-2 border-t border-stone-200 pt-2 text-[11px] leading-4 text-stone-500">
        The note stays linked to this takedown and is never sent to the marketplace. Matches only change recommendations; they never submit an action.
      </p>
    </fieldset>
  );
}
