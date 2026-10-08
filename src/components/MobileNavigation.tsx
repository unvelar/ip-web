import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** A native modal keeps focus and touch scrolling inside the mobile menu. */
export default function MobileNavigation({ children, onClose }: {
  children: ReactNode;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="shell-navigation-dialog"
      aria-label="Workspace navigation"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="shell-mobile-drawer relative h-full shadow-xl flex flex-col"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a[href]")) onClose();
        }}
      >
        <button ref={closeRef} type="button" onClick={onClose}
          className="shell-navigation-close absolute top-2 right-2 rounded-md hover:bg-stone-100 text-stone-600 z-10"
          aria-label="Close navigation">
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
