import { useState, useRef, type DragEvent } from "react";

interface Props {
  onUpload: (files: File[]) => void;
  uploading?: boolean;
  accept?: string;
  multiple?: boolean;
  label?: string;
}

export default function ImageUploader({ onUpload, uploading, accept = "image/*", multiple = true, label = "Drop images here or click to browse" }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) onUpload(files);
  }

  function handleChange() {
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length) onUpload(files);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
        dragOver ? "border-red-400 bg-red-50/50" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
      } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      <div className="space-y-2">
        <div className="text-stone-300 text-3xl">&#x2191;</div>
        <p className="text-sm text-stone-500 font-medium">{uploading ? "Uploading..." : label}</p>
        <p className="text-xs text-stone-400">PNG, JPG, WebP, SVG up to 50MB</p>
      </div>
    </div>
  );
}
