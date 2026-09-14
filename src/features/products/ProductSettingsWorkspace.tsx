import { ArrowLeft, Settings2 } from "lucide-react";
import type { PersistedProductGroup } from "../../api/products";
import { productName } from "./labDomain";
import { ProductGroupSettings } from "./ProductGroupSettings";

export function ProductSettingsWorkspace({
  group,
  ipId,
  onBack,
  onReview,
  onGroupChange,
  onRefresh,
}: {
  group: PersistedProductGroup;
  ipId: string;
  onBack: () => void;
  onReview: () => void;
  onGroupChange: (
    update: (current: PersistedProductGroup) => PersistedProductGroup,
  ) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[1040px]">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-7">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 inline-flex items-center gap-1 text-[10px] font-medium text-stone-400 hover:text-stone-700 lg:hidden"
          >
            <ArrowLeft size={12} />
            Product groups
          </button>
          <div className="flex items-center gap-2">
            <Settings2 size={15} className="shrink-0 text-stone-500" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-stone-900">Group settings</p>
              <p className="truncate text-[10px] text-stone-400">{productName(group)}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onReview}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-stone-200 bg-white px-2.5 text-[10px] font-semibold text-stone-700 hover:bg-stone-50 hover:text-stone-950"
        >
          <ArrowLeft size={12} />
          Review queue
        </button>
      </div>
      <div className="px-4 py-4 sm:px-7">
        <ProductGroupSettings
          group={group}
          ipId={ipId}
          onGroupChange={onGroupChange}
          onRefresh={onRefresh}
        />
      </div>
    </div>
  );
}
