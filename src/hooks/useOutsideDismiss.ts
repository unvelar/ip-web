import { useEffect, type RefObject } from "react";

/** Keep portaled confirmation dialogs interactive while a non-modal panel is open. */
export function useOutsideDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void, ignoreSelector?: string) {
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const panel = ref.current;
      if (!panel || event.button !== 0 || event.composedPath().includes(panel)) return;
      if (ignoreSelector && event.target instanceof Element && event.target.closest(ignoreSelector)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      onClose();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [ref, onClose, ignoreSelector]);
}
