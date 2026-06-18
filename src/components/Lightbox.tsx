import { useEffect } from "react";

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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6 cursor-zoom-out"
      onClick={onClose}
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
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-light w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10"
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );
}
