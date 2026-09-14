import { Check, ChevronRight } from "lucide-react";
import type { PersistedProductGroup } from "../../api/products";
import { priceRange, productName, productStatus, representativeImage } from "./labDomain";

export function ProductRow({
  group,
  index,
  listingCount,
  depth = 0,
  selected,
  mergeState,
  mergeDisabled,
  onSelect,
  onToggleMerge,
}: {
  group: PersistedProductGroup;
  index: number;
  listingCount: number;
  depth?: number;
  selected: boolean;
  mergeState: "source" | "selected" | "available" | null;
  mergeDisabled: boolean;
  onSelect: () => void;
  onToggleMerge: () => void;
}) {
  const image = representativeImage(group);
  const status = productStatus(group);
  const prices = priceRange(group);
  const mergeSelected = mergeState === "source" || mergeState === "selected";
  const rowSelected = mergeState ? mergeSelected : selected;
  const rowTone = mergeState === "source"
    ? "bg-violet-100/90 ring-1 ring-inset ring-violet-300"
    : mergeState === "selected"
      ? "bg-violet-50 ring-1 ring-inset ring-violet-200"
      : mergeState === "available"
        ? "bg-transparent hover:bg-violet-50/70"
        : selected
          ? "bg-stone-100/90"
          : "bg-transparent hover:bg-stone-50";

  return (
    <button
      type="button"
      role="option"
      aria-selected={rowSelected}
      aria-disabled={mergeState === "source" || mergeDisabled || undefined}
      disabled={mergeDisabled}
      onClick={mergeState ? onToggleMerge : onSelect}
      className={`group flex w-full items-center gap-3 border-b border-stone-200/70 px-4 py-3 text-left transition focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:cursor-wait disabled:opacity-60 sm:px-6 lg:px-4 ${
        mergeState ? "focus-visible:ring-violet-400" : "focus-visible:ring-stone-400"
      } ${rowTone}`}
      style={{ paddingLeft: 16 + Math.min(depth, 5) * 14 }}
    >
      {mergeState && (
        <span className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${
          mergeSelected
            ? "border-violet-700 bg-violet-700 text-white"
            : "border-stone-300 bg-white text-transparent group-hover:border-violet-400"
        }`} aria-hidden="true">
          <Check size={11} />
        </span>
      )}
      <div className="size-12 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-100">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <span className="grid h-full place-items-center text-[14px] font-semibold text-stone-400">
            {productName(group, index).slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.01em] text-stone-900">
            {productName(group, index)}
          </h2>
          {mergeState === "source" ? (
            <span className="shrink-0 rounded bg-violet-700 px-1.5 py-0.5 text-[9px] font-semibold text-white">
              Starting product
            </span>
          ) : mergeState === "selected" ? (
            <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-800">
              Same product
            </span>
          ) : mergeState ? null : (
            <ChevronRight
              size={14}
              className={`shrink-0 transition ${selected ? "text-stone-600" : "text-stone-300 group-hover:text-stone-500"}`}
              aria-hidden="true"
            />
          )}
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-2 text-[10px] text-stone-500">
          <span className={`inline-flex min-w-0 items-center gap-1.5 font-medium ${status.textClass}`}>
            <span className={`size-1.5 shrink-0 rounded-full ${status.dotClass}`} />
            <span className="truncate">{status.label}</span>
          </span>
          <span className="text-stone-300">·</span>
          <span className="truncate">{listingCount} {listingCount === 1 ? "listing" : "listings"}</span>
          {prices && (
            <span className="hidden items-center gap-2 sm:inline-flex">
              <span className="text-stone-300">·</span>
              <span className="truncate font-mono text-[9px] text-stone-600">{prices}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
