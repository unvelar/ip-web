import type { ProductGroupView } from "./clusterDomain";

export function ProductGroupViewToggle({
  view,
  onChange,
}: {
  view: ProductGroupView;
  onChange: (view: ProductGroupView) => void;
}) {
  const showingTriage = view === "triage";
  return (
    <div
      className="inline-flex rounded-lg border border-stone-200 bg-white p-1 shadow-sm"
      role="group"
      aria-label="Product group listing view"
    >
      <button
        type="button"
        aria-pressed={showingTriage}
        onClick={() => onChange("triage")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          showingTriage
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
      >
        Needs triage
      </button>
      <button
        type="button"
        aria-pressed={!showingTriage}
        onClick={() => onChange("all")}
        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          !showingTriage
            ? "bg-stone-900 text-white"
            : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        }`}
      >
        All product groups
      </button>
    </div>
  );
}
