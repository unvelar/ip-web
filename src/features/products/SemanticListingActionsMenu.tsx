import { Eye, MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProductClusterProfile } from "../../api/products";
import { profileTitle } from "../../components/product-clusters/productClusterGraphUtils";

export function SemanticListingActionsMenu({
  profile,
  editDisabled,
  onView,
  onEdit,
}: {
  profile: ProductClusterProfile;
  editDisabled: boolean;
  onView: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const title = profileTitle(profile);

  useEffect(() => {
    if (!open) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function runAction(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-20">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Open actions for ${title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={profile.semantic_correction_id
          ? "Listing actions — reviewer corrected"
          : "Listing actions"}
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex h-7 w-7 items-center justify-center rounded-full border bg-white/95 shadow-sm transition hover:bg-stone-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 ${
          profile.semantic_correction_id
            ? "border-emerald-300 text-emerald-800"
            : "border-stone-200 text-stone-700"
        }`}
      >
        <MoreHorizontal size={15} aria-hidden="true" />
        {profile.semantic_correction_id && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-2 w-2 rounded-full border border-white bg-emerald-500"
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={`Actions for ${title}`}
          className="absolute right-0 mt-1 w-28 overflow-hidden rounded-lg border border-stone-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(onView)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-stone-700 transition hover:bg-stone-100 focus:bg-stone-100 focus:outline-none"
          >
            <Eye size={13} aria-hidden="true" />
            View
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={editDisabled}
            onClick={() => runAction(onEdit)}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-semibold text-stone-700 transition hover:bg-violet-50 hover:text-violet-800 focus:bg-violet-50 focus:text-violet-800 focus:outline-none disabled:cursor-wait disabled:opacity-50"
          >
            <Pencil size={13} aria-hidden="true" />
            Edit
          </button>
        </div>
      )}
    </div>
  );
}
