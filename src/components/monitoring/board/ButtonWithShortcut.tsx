function ShortcutKey({ value, dark = false }: { value: string; dark?: boolean }) {
  return (
    <kbd
      className={
        `inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 text-[10px] font-bold leading-none ${
          dark
            ? "border-white/40 bg-white/20 text-white"
            : "border-stone-300 bg-stone-100 text-stone-600"
        }`
      }
    >
      {value}
    </kbd>
  );
}

export function ButtonWithShortcut({
  label,
  shortcut,
  dark = false,
}: {
  label: string;
  shortcut: string;
  dark?: boolean;
}) {
  return (
    <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
      <ShortcutKey value={shortcut} dark={dark} />
      <span>{label}</span>
    </span>
  );
}
