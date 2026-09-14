import { useEffect, useRef } from "react";

export default function Lightbox({
  src,
  alt,
  caption,
  onClose,
}: {
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    dialog.showModal();
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
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
      aria-label={caption || alt || "Image preview"}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent open:flex items-center justify-center p-6 cursor-zoom-out backdrop:bg-black/80"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div
        className="max-w-4xl max-h-full flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-full max-h-[80vh] rounded-xl shadow-2xl"
        />
        {caption && (
          <div className="text-white/80 text-sm font-medium bg-black/40 px-4 py-1.5 rounded-full">
            {caption}
          </div>
        )}
      </div>
      <button
        type="button"
        ref={closeButtonRef}
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-light w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Close"
      >
        ×
      </button>
    </dialog>
  );
}
